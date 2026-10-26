import { Hono } from "hono";
import type { Env, SessionUser } from "./env";
import { ensureSchema, getConfig } from "./db";
import { csrfGuard, getSessionToken, getUserFromRequest } from "./auth";
import { account } from "./routes/account";
import { servers } from "./routes/servers";
import { messages } from "./routes/messages";
import { files } from "./routes/files";
import { voice } from "./routes/voice";
import { calls } from "./routes/calls";
import { owner } from "./routes/owner";
import { plus } from "./routes/plus";
import { stream } from "./routes/stream";
import { windowsDownload } from "./download";

type AppType = { Bindings: Env; Variables: { user: SessionUser } };

const app = new Hono<AppType>();

let schemaReady: Promise<void> | null = null;
let configCache: { value: Record<string, string>; at: number } | null = null;

async function config(env: Env): Promise<Record<string, string>> {
  if (configCache && Date.now() - configCache.at < 10_000) return configCache.value;
  const value = await getConfig(env);
  configCache = { value, at: Date.now() };
  return value;
}

const PUBLIC_PATHS = ["/api/register", "/api/login", "/api/public/", "/api/invites/", "/api/plus/webhook"];
const BANNED_ALLOWED = ["/api/me", "/api/logout", "/api/appeals", "/api/presence", "/api/public/", "/api/invites/"];
const MAINTENANCE_ALLOWED = ["/api/me", "/api/login", "/api/register", "/api/logout", "/api/public/", "/api/plus/webhook"];

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

app.use("*", async (c, next) => {
  await next();
  // Static asset responses from the ASSETS binding have immutable headers, so
  // rebuild the response with a mutable header set before adding security ones.
  const original = c.res;
  const headers = new Headers(original.headers);
  if (!headers.has("x-content-type-options")) headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(self), microphone=(self), display-capture=(self)");
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    headers.set(
      "content-security-policy",
      // ipc-csp: the ZUNO desktop shell talks to its native layer over Tauri's
      // IPC endpoint; browsers ignore these extra sources.
      "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  }
  c.res = new Response(original.body, {
    status: original.status,
    statusText: original.statusText,
    headers,
  });
});

app.use("/api/*", csrfGuard);

app.use("/api/*", async (c, next) => {
  if (!schemaReady) {
    schemaReady = ensureSchema(c.env).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  await next();
});

app.get("/api/public/config", async (c) => {
  const cfg = await config(c.env);
  return c.json({
    siteName: cfg.site_name || "ZUNO",
    tagline: cfg.tagline || "Your city after dark.",
    registrationOpen: cfg.registration_open !== "false",
    maintenance: cfg.maintenance_mode === "true",
    maintenanceMessage: cfg.maintenance_message || "",
    discoveryEnabled: cfg.discovery_enabled !== "false",
    ownerConfigured: !!c.env.OWNER_EMAIL,
    demo: c.env.DEMO_SEED === "true",
    plusLabel: cfg.plus_price_label || "$4.99 / month",
  });
});

// Public: the visitor-facing download button asks which Windows build exists.
app.get("/api/public/download", async (c) => {
  const download = await windowsDownload(c.env);
  return c.json(
    { platform: "windows", ...download },
    { headers: { "cache-control": "public, max-age=300" } },
  );
});

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (matches(path, PUBLIC_PATHS)) return next();
  const user = await getUserFromRequest(c.env.DB, getSessionToken(c));
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const cfg = await config(c.env);
  if (cfg.maintenance_mode === "true" && user.is_owner !== 1 && !matches(path, MAINTENANCE_ALLOWED)) {
    return c.json({ error: cfg.maintenance_message || "ZUNO is under maintenance.", maintenance: true }, 503);
  }
  if (user.platform_banned === 1 && !matches(path, BANNED_ALLOWED)) {
    return c.json(
      { error: user.platform_ban_reason || "Your account is suspended.", banned: true },
      403,
    );
  }
  c.set("user", user);
  await next();
});

app.route("/api", account);
app.route("/api", messages);
app.route("/api", files);
app.route("/api", voice);
app.route("/api", calls);
app.route("/api", stream);
app.route("/api/servers", servers);
app.route("/api/owner", owner);
app.route("/api/plus", plus);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.get("*", async (c) => {
  if (!c.env.ASSETS) return c.text("ZUNO API is running. Build the client with `npm run build` to serve the app.", 200);
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = "/index.html";
    const index = await c.env.ASSETS.fetch(new Request(url.toString(), { headers: c.req.raw.headers }));
    return new Response(index.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  return res;
});

app.onError((err, c) => {
  console.error("ZUNO error:", err);
  if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

export default app;
