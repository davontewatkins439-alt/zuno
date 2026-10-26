import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { bad, now, uid } from "../lib";
import { getChannelAccess, has, P } from "../perms";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const files = new Hono<Ctx>();

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Map<string, string[]>([
  ["image/png", ["png"]],
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/webp", ["webp"]],
  ["image/gif", ["gif"]],
  ["image/avif", ["avif"]],
  ["application/pdf", ["pdf"]],
  ["text/plain", ["txt", "md", "log"]],
  ["application/zip", ["zip"]],
  ["audio/mpeg", ["mp3"]],
  ["video/mp4", ["mp4"]],
]);

const PUBLIC_PURPOSES = new Set(["avatar", "banner", "server_icon", "server_banner", "emoji", "sticker"]);

files.post("/upload", async (c) => {
  const me = c.get("user");
  if (!c.env.FILES) return c.json({ error: "File storage is not configured on this deployment." }, 501);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return bad(c, "Upload a file using multipart form data.");
  }
  const file = form.get("file");
  const purpose = String(form.get("purpose") || "attachment");
  if (!(file instanceof File)) return bad(c, "No file was uploaded.");
  if (file.size <= 0) return bad(c, "That file is empty.");
  if (file.size > MAX_BYTES) return bad(c, "Files are limited to 8 MB.");
  const type = file.type || "application/octet-stream";
  const extensions = ALLOWED.get(type);
  if (!extensions) return bad(c, `Unsupported file type: ${type}`);
  if (file.name.includes("..") || file.name.length > 200) return bad(c, "Invalid file name.");
  const ext = (file.name.split(".").pop() || extensions[0]).toLowerCase();
  if (!extensions.includes(ext)) return bad(c, "File extension does not match its type.");
  const allowedPurpose = ["avatar", "banner", "server_icon", "server_banner", "emoji", "attachment"].includes(purpose)
    ? purpose
    : "attachment";
  const id = uid();
  const key = `${allowedPurpose}/${id}.${ext}`;
  const bytes = await file.arrayBuffer();
  await c.env.FILES.put(key, bytes, {
    httpMetadata: {
      contentType: type,
      cacheControl: PUBLIC_PURPOSES.has(allowedPurpose) ? "public, max-age=31536000, immutable" : "private, max-age=3600",
    },
  });
  const visibility = PUBLIC_PURPOSES.has(allowedPurpose) ? "public" : "channel";
  await c.env.DB.prepare(
    "INSERT INTO files (id, owner_id, key, filename, content_type, size, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, me.id, key, file.name.slice(0, 180), type, file.size, visibility, now())
    .run();
  return c.json(
    {
      file: {
        id,
        filename: file.name,
        contentType: type,
        size: file.size,
        url: `/api/files/${id}`,
      },
    },
    201,
  );
});

files.get("/files/:id", async (c) => {
  const me = c.get("user");
  if (!c.env.FILES) return c.json({ error: "File storage is not configured." }, 501);
  const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; owner_id: string; key: string; filename: string; content_type: string; size: number; visibility: string }>();
  if (!row) return c.json({ error: "File not found" }, 404);
  let allowed = row.visibility === "public" || row.owner_id === me.id;
  if (!allowed) {
    const links = await c.env.DB.prepare(
      "SELECT m.channel_id FROM attachments a JOIN messages m ON m.id = a.message_id WHERE a.file_id = ? LIMIT 5",
    )
      .bind(row.id)
      .all<{ channel_id: string }>();
    for (const link of links.results) {
      const access = await getChannelAccess(c.env.DB, me, link.channel_id);
      if (access && has(access.permissions, P.VIEW_CHANNEL)) {
        allowed = true;
        break;
      }
    }
  }
  if (!allowed) return c.json({ error: "You do not have access to this file." }, 403);
  const object = await c.env.FILES.get(row.key);
  if (!object) return c.json({ error: "File missing from storage." }, 404);
  const headers = new Headers();
  headers.set("content-type", row.content_type);
  headers.set("content-length", String(row.size));
  headers.set("cache-control", row.visibility === "public" ? "private, max-age=86400" : "private, max-age=600");
  headers.set("x-content-type-options", "nosniff");
  const disposition = c.req.query("download") ? "attachment" : "inline";
  headers.set("content-disposition", `${disposition}; filename="${row.filename.replace(/"/g, "")}"`);
  return new Response(object.body, { headers });
});
