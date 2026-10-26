import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { bad, bool, now, readJson, str } from "../lib";
import { emit, getChannelAccess, getServerMember, has, P } from "../perms";
import { activateRingingCall } from "./calls";
import { badgesFor, decorate } from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const voice = new Hono<Ctx>();

async function voiceChannel(db: D1Database, user: SessionUser, channelId: string) {
  const access = await getChannelAccess(db, user, channelId);
  if (!access) return null;
  // Direct messages and group DMs double as private call rooms: membership is
  // already enforced above, so any non-server conversation can host a call.
  if (!access.channel.server_id) return access;
  if (access.channel.type !== "voice") return null;
  if (!has(access.permissions, P.VOICE_CONNECT)) return null;
  return access;
}

async function announceVoice(db: D1Database, access: { serverId: string | null }, channelId: string) {
  if (access.serverId) {
    await emit(db, "server", access.serverId, "voice.state", { channelId });
    return;
  }
  const members = await db.prepare("SELECT user_id FROM dm_members WHERE channel_id = ?").bind(channelId).all<{ user_id: string }>();
  for (const member of members.results) await emit(db, "user", member.user_id, "voice.state", { channelId });
}

async function participants(db: D1Database, channelId: string) {
  const rows = await db
    .prepare(
      `SELECT vs.*, u.username, u.display_name, u.avatar_id, u.accent_color, u.is_owner, u.plus_until, u.plus_decoration
       FROM voice_states vs JOIN users u ON u.id = vs.user_id WHERE vs.channel_id = ?`,
    )
    .bind(channelId)
    .all<Record<string, unknown>>();
  const badgeMap = await badgesFor(
    db,
    rows.results.map((r) => String(r.user_id)),
  );
  return rows.results.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarId: r.avatar_id,
    accentColor: r.accent_color,
    muted: !!r.muted,
    deafened: !!r.deafened,
    video: !!r.video,
    screen: !!r.screen,
    joinedAt: r.joined_at,
    badges: badgeMap.get(String(r.user_id)) ?? [],
    isOwner: !!r.is_owner,
    plusActive: !!(r.is_owner || (r.plus_until && Number(r.plus_until) > now())),
  }));
}

voice.get("/voice/:channelId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await voiceChannel(db, me, c.req.param("channelId"));
  if (!access) return c.json({ error: "Voice channel not found" }, 404);
  await db.prepare("DELETE FROM voice_states WHERE updated_at < ?").bind(now() - 120_000).run();
  return c.json({ participants: await participants(db, access.channel.id) });
});

voice.post("/voice/:channelId/join", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await voiceChannel(db, me, c.req.param("channelId"));
  if (!access) return c.json({ error: "Voice channel not found" }, 404);
  if (!has(access.permissions, P.VOICE_SPEAK) && !has(access.permissions, P.ADMINISTRATOR)) {
    // Listen-only is allowed with connect; speak is enforced on the client by muting.
  }
  await db.prepare("DELETE FROM voice_states WHERE updated_at < ?").bind(now() - 120_000).run();
  await db.prepare("DELETE FROM voice_states WHERE user_id = ?").bind(me.id).run();
  const body = await readJson<Record<string, unknown>>(c);
  await db
    .prepare(
      "INSERT INTO voice_states (channel_id, user_id, joined_at, muted, deafened, video, screen, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
    )
    .bind(access.channel.id, me.id, now(), bool(body.muted) ? 1 : 0, bool(body.deafened) ? 1 : 0, now())
    .run();
  await announceVoice(db, access, access.channel.id);
  // If a call is ringing in this conversation, being in the room together means
  // it is live — both clients move off the ringing screen immediately.
  await activateRingingCall(db, access.channel.id, me.id);
  return c.json({ participants: await participants(db, access.channel.id), channel: access.channel });
});

voice.post("/voice/leave", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const channelId = str(body.channelId, 64);
  const state = channelId
    ? await db.prepare("SELECT * FROM voice_states WHERE channel_id = ? AND user_id = ?").bind(channelId, me.id).first<{ channel_id: string }>()
    : await db.prepare("SELECT * FROM voice_states WHERE user_id = ?").bind(me.id).first<{ channel_id: string }>();
  if (!state) return c.json({ ok: true });
  await db.prepare("DELETE FROM voice_states WHERE channel_id = ? AND user_id = ?").bind(state.channel_id, me.id).run();
  const access = await getChannelAccess(db, me, state.channel_id);
  if (access) await announceVoice(db, access, state.channel_id);
  return c.json({ ok: true });
});

voice.patch("/voice/:channelId/state", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.param("channelId");
  const existing = await db
    .prepare("SELECT * FROM voice_states WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, me.id)
    .first<Record<string, unknown>>();
  if (!existing) return c.json({ error: "You are not connected to that voice channel." }, 404);
  const body = await readJson<Record<string, unknown>>(c);
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const key of ["muted", "deafened", "video", "screen"] as const) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      args.push(bool(body[key]) ? 1 : 0);
    }
  }
  sets.push("updated_at = ?");
  args.push(now(), channelId, me.id);
  await db.prepare(`UPDATE voice_states SET ${sets.join(", ")} WHERE channel_id = ? AND user_id = ?`).bind(...args).run();
  const access = await getChannelAccess(db, me, channelId);
  if (access) await announceVoice(db, access, channelId);
  return c.json({ ok: true });
});

voice.post("/voice/signal", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const channelId = str(body.channelId, 64);
  const to = str(body.to, 64);
  const type = str(body.type, 16);
  if (!["offer", "answer", "ice", "renegotiate", "leave"].includes(type)) return bad(c, "Unknown signal type.");
  if (!channelId || !to) return bad(c, "Missing signal target.");
  const access = await getChannelAccess(db, me, channelId);
  if (!access || (!access.isDm && access.channel.type !== "voice")) {
    return c.json({ error: "Not in that call." }, 403);
  }
  const mine = await db
    .prepare("SELECT 1 FROM voice_states WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, me.id)
    .first();
  const theirs = await db
    .prepare("SELECT 1 FROM voice_states WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, to)
    .first();
  if (!mine || !theirs) return c.json({ error: "Both users must be in the voice channel." }, 403);
  await emit(db, "user", to, "voice.signal", {
    channelId,
    from: me.id,
    fromName: me.display_name || me.username,
    type,
    payload: body.payload ?? null,
  });
  return c.json({ ok: true });
});

voice.get("/voice/server/:serverId/participants", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const serverId = c.req.param("serverId");
  const member = await getServerMember(db, serverId, me.id);
  if (!member && me.is_owner !== 1) return c.json({ error: "Not a member" }, 403);
  const rows = await db
    .prepare(
      `SELECT vs.channel_id, vs.user_id, vs.muted, vs.deafened, vs.video, vs.screen, u.username, u.display_name, u.avatar_id
       FROM voice_states vs JOIN users u ON u.id = vs.user_id JOIN channels ch ON ch.id = vs.channel_id
       WHERE ch.server_id = ?`,
    )
    .bind(serverId)
    .all<Record<string, unknown>>();
  return c.json({
    states: rows.results.map((r) => ({
      channelId: r.channel_id,
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarId: r.avatar_id,
      muted: !!r.muted,
      deafened: !!r.deafened,
      video: !!r.video,
      screen: !!r.screen,
      badges: [],
    })),
  });
});

export { decorate };
