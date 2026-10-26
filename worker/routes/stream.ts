import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { now, num } from "../lib";
import { getChannelAccess, getServerMember, has, P } from "../perms";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const stream = new Hono<Ctx>();

interface LogRow {
  id: number;
  scope: string;
  ref_id: string;
  kind: string;
  data: string;
  created_at: number;
}

async function latestCursor(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) as id FROM event_log").first<{ id: number }>();
  return row?.id ?? 0;
}

async function collect(
  db: D1Database,
  me: SessionUser,
  channelId: string | null,
  serverId: string | null,
  cursor: number,
): Promise<LogRow[]> {
  const clauses = ["(scope = 'user' AND ref_id = ?)"];
  const filters: unknown[] = [me.id];
  if (channelId) {
    clauses.push("(scope = 'channel' AND ref_id = ?)");
    filters.push(channelId);
  }
  if (serverId) {
    clauses.push("(scope = 'server' AND ref_id = ?)");
    filters.push(serverId);
  }
  const rows = await db
    .prepare(`SELECT * FROM event_log WHERE id > ? AND (${clauses.join(" OR ")}) ORDER BY id ASC LIMIT 100`)
    .bind(cursor, ...filters)
    .all<LogRow>();
  return rows.results;
}

async function authorize(
  db: D1Database,
  me: SessionUser,
  channelId: string | null,
  serverId: string | null,
): Promise<{ channelId: string | null; serverId: string | null } | null> {
  if (channelId) {
    const access = await getChannelAccess(db, me, channelId);
    if (!access || !has(access.permissions, P.VIEW_CHANNEL)) return null;
    return { channelId: access.channel.id, serverId: access.serverId ?? serverId };
  }
  if (serverId) {
    const member = await getServerMember(db, serverId, me.id);
    if (!member && me.is_owner !== 1) return null;
    return { channelId, serverId };
  }
  return { channelId, serverId };
}

stream.get("/stream", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelParam = c.req.query("channel") || null;
  const serverParam = c.req.query("server") || null;
  const allowed = await authorize(db, me, channelParam, serverParam);
  if (!allowed) return c.json({ error: "No access to that stream." }, 403);
  let cursor = num(c.req.query("cursor"), -1);
  if (cursor < 0) cursor = await latestCursor(db);

  const encoder = new TextEncoder();
  const started = now();
  let closed = false;
  let lastPing = now();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        let payload = "";
        if (id !== undefined) payload += `id: ${id}\n`;
        payload += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      send("ready", { cursor, now: started });

      const abort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      c.req.raw.signal?.addEventListener("abort", abort);

      let tick = 0;
      while (!closed && now() - started < 5 * 60 * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (closed || c.req.raw.signal?.aborted) break;
        tick++;
        try {
          if (tick % 20 === 0) {
            const still = await authorize(db, me, allowed.channelId, allowed.serverId);
            if (!still) {
              send("access.revoked", { at: now() });
              abort();
              break;
            }
          }
          const rows = await collect(db, me, allowed.channelId, allowed.serverId, cursor);
          for (const row of rows) {
            let payload: unknown = {};
            try {
              payload = JSON.parse(row.data);
            } catch {
              payload = {};
            }
            send(row.kind, { scope: row.scope, refId: row.ref_id, payload }, row.id);
            cursor = Math.max(cursor, row.id);
          }
          if (now() - lastPing > 15_000) {
            lastPing = now();
            controller.enqueue(encoder.encode(`: ping ${now()}\n\n`));
          }
        } catch (err) {
          console.error("stream error", err);
          break;
        }
      }
      abort();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});

stream.get("/sync", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.query("channel") || null;
  const serverId = c.req.query("server") || null;
  const allowed = await authorize(db, me, channelId, serverId);
  if (!allowed) return c.json({ error: "No access to that stream." }, 403);
  const latest = await latestCursor(db);
  const cursor = num(c.req.query("cursor"), latest);
  const rows = await collect(db, me, allowed.channelId, allowed.serverId, cursor);
  const events = rows.map((row) => {
    let payload: unknown = {};
    try {
      payload = JSON.parse(row.data);
    } catch {
      payload = {};
    }
    return { id: row.id, scope: row.scope, refId: row.ref_id, kind: row.kind, payload };
  });
  return c.json({
    events,
    cursor: events.length ? events[events.length - 1].id : cursor,
    latest,
  });
});
