import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { bad, now, readJson, str, uid } from "../lib";
import { emit, notify } from "../perms";
import { badgesFor, decorate, userById } from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const calls = new Hono<Ctx>();

const RING_TTL = 60_000;

interface CallRow {
  id: string;
  channel_id: string;
  caller_id: string;
  kind: string;
  status: string;
  created_at: number;
  answered_at: number | null;
  ended_at: number | null;
}

async function dmAudience(db: D1Database, channelId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT user_id FROM dm_members WHERE channel_id = ?").bind(channelId).all<{ user_id: string }>();
  return rows.results.map((r) => r.user_id);
}

async function callPayload(db: D1Database, row: CallRow) {
  const caller = await userById(db, row.caller_id);
  const badges = await badgesFor(db, [row.caller_id]);
  const decorated = caller ? decorate(caller, badges.get(row.caller_id) ?? []) : null;
  return {
    id: row.id,
    channelId: row.channel_id,
    kind: row.kind,
    status: row.status,
    callerId: row.caller_id,
    caller: decorated,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  };
}

async function loadCall(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM calls WHERE id = ?").bind(id).first<CallRow>();
}

async function memberOf(db: D1Database, channelId: string, userId: string) {
  return db.prepare("SELECT channel_id FROM dm_members WHERE channel_id = ? AND user_id = ?").bind(channelId, userId).first();
}

async function dmChannel(db: D1Database, channelId: string) {
  return db
    .prepare("SELECT id, name FROM channels WHERE id = ? AND server_id IS NULL AND type IN ('dm', 'group')")
    .bind(channelId)
    .first<{ id: string; name: string }>();
}

async function broadcast(db: D1Database, channelId: string, kind: string, payload: Record<string, unknown>) {
  for (const userId of await dmAudience(db, channelId)) await emit(db, "user", userId, kind, payload);
}

/**
 * A call is genuinely live once the caller and someone else share the room, so
 * joining the conversation promotes a ringing call instead of leaving both
 * sides stuck on "Ringing…" when a client misses the ring event.
 */
export async function activateRingingCall(db: D1Database, channelId: string, joinerId: string): Promise<void> {
  const row = await db
    .prepare("SELECT * FROM calls WHERE channel_id = ? AND status = 'ringing' ORDER BY created_at DESC LIMIT 1")
    .bind(channelId)
    .first<CallRow>();
  if (!row || row.caller_id === joinerId) return;
  if (row.created_at < now() - RING_TTL) return;
  const callerPresent = await db
    .prepare("SELECT 1 FROM voice_states WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, row.caller_id)
    .first();
  if (!callerPresent) return;
  await db.prepare("UPDATE calls SET status = 'active', answered_at = ? WHERE id = ?").bind(now(), row.id).run();
  const updated = await loadCall(db, row.id);
  if (!updated) return;
  await broadcast(db, channelId, "call.active", { call: await callPayload(db, updated) });
}

calls.get("/calls/active", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db
    .prepare(
      `SELECT ca.* FROM calls ca JOIN dm_members dm ON dm.channel_id = ca.channel_id
       WHERE dm.user_id = ? AND ca.status IN ('ringing', 'active') AND ca.created_at > ?
       ORDER BY ca.created_at DESC LIMIT 1`,
    )
    .bind(me.id, now() - 10 * 60 * 1000)
    .first<CallRow>();
  if (!row) return c.json({ call: null });
  if (row.status === "ringing" && row.created_at < now() - RING_TTL) {
    await db.prepare("UPDATE calls SET status = 'missed', ended_at = ? WHERE id = ?").bind(now(), row.id).run();
    return c.json({ call: null });
  }
  return c.json({ call: await callPayload(db, row) });
});

calls.post("/calls", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const channelId = str(body.channelId, 64);
  const kind = str(body.kind, 10) === "video" ? "video" : "audio";
  if (!channelId) return bad(c, "Missing conversation.");
  if (!(await memberOf(db, channelId, me.id))) return c.json({ error: "You are not part of that conversation." }, 403);
  const channel = await dmChannel(db, channelId);
  if (!channel) return bad(c, "Calls are only available in direct messages.");

  const live = await db
    .prepare("SELECT * FROM calls WHERE channel_id = ? AND status IN ('ringing', 'active') ORDER BY created_at DESC LIMIT 1")
    .bind(channelId)
    .first<CallRow>();
  if (live && live.created_at > now() - 10 * 60 * 1000) {
    if (live.status === "active" || live.created_at > now() - RING_TTL) {
      return c.json({ error: "There is already a call running in this conversation.", code: "CALL_ACTIVE" }, 409);
    }
    await db.prepare("UPDATE calls SET status = 'missed', ended_at = ? WHERE id = ?").bind(now(), live.id).run();
  }

  const id = uid();
  const createdAt = now();
  await db
    .prepare("INSERT INTO calls (id, channel_id, caller_id, kind, status, created_at) VALUES (?, ?, ?, ?, 'ringing', ?)")
    .bind(id, channelId, me.id, kind, createdAt)
    .run();
  const row = (await loadCall(db, id))!;
  const payload = await callPayload(db, row);
  await broadcast(db, channelId, "call.ring", { call: payload });
  for (const userId of await dmAudience(db, channelId)) {
    if (userId === me.id) continue;
    await notify(db, {
      userId,
      kind: "call",
      title: `${me.display_name || me.username} is calling`,
      body: kind === "video" ? "Incoming video call" : "Incoming voice call",
      actorId: me.id,
      channelId,
    });
  }
  return c.json({ call: payload });
});

calls.post("/calls/:id/answer", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await loadCall(db, c.req.param("id"));
  if (!row) return c.json({ error: "That call has ended." }, 404);
  if (row.caller_id === me.id) return bad(c, "You cannot answer your own call.");
  if (!(await memberOf(db, row.channel_id, me.id))) return c.json({ error: "You are not part of that call." }, 403);
  // Answering joins the voice room first, and joining promotes a ringing call to
  // `active` (see activateRingingCall). So this request can legitimately arrive
  // after the status flipped — return the live call instead of a 409, which made
  // the client tear down the call it had just connected.
  if (row.status === "active") return c.json({ call: await callPayload(db, row) });
  if (row.status !== "ringing") return c.json({ error: "That call is no longer ringing." }, 409);
  if (row.created_at < now() - RING_TTL) {
    await db.prepare("UPDATE calls SET status = 'missed', ended_at = ? WHERE id = ?").bind(now(), row.id).run();
    return c.json({ error: "That call was missed." }, 409);
  }
  await db.prepare("UPDATE calls SET status = 'active', answered_at = ? WHERE id = ?").bind(now(), row.id).run();
  const updated = (await loadCall(db, row.id))!;
  const payload = await callPayload(db, updated);
  await broadcast(db, row.channel_id, "call.active", { call: payload });
  return c.json({ call: payload });
});

calls.post("/calls/:id/decline", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await loadCall(db, c.req.param("id"));
  if (!row) return c.json({ ok: true });
  if (!(await memberOf(db, row.channel_id, me.id))) return c.json({ error: "You are not part of that call." }, 403);
  if (row.status !== "ringing") return c.json({ ok: true });
  await db.prepare("UPDATE calls SET status = 'declined', ended_at = ? WHERE id = ?").bind(now(), row.id).run();
  await broadcast(db, row.channel_id, "call.declined", { callId: row.id, byId: me.id, byName: me.display_name || me.username });
  return c.json({ ok: true });
});

calls.post("/calls/:id/end", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await loadCall(db, c.req.param("id"));
  if (!row) return c.json({ ok: true });
  if (!(await memberOf(db, row.channel_id, me.id))) return c.json({ error: "You are not part of that call." }, 403);
  if (row.status === "ringing" || row.status === "active") {
    await db.prepare("UPDATE calls SET status = 'ended', ended_at = ? WHERE id = ?").bind(now(), row.id).run();
  }
  await db.prepare("DELETE FROM voice_states WHERE channel_id = ?").bind(row.channel_id).run();
  await broadcast(db, row.channel_id, "call.ended", { callId: row.id, channelId: row.channel_id, byId: me.id });
  return c.json({ ok: true });
});
