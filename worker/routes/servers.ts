import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { bad, bool, clamp, now, num, readJson, slug, str, uid } from "../lib";
import {
  ALL_PERMS,
  audit,
  computeServerPerms,
  DEFAULT_EVERYONE,
  emit,
  getServerMember,
  has,
  notify,
  P,
  PERMISSION_META,
} from "../perms";
import type { ChannelRow, Role, ServerRow } from "../perms";
import {
  badgesFor,
  channelUnread,
  decorate,
  myServers,
  serverMembership,
  serverSummary,
  userById,
} from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const servers = new Hono<Ctx>();

async function serverAccess(
  db: D1Database,
  user: SessionUser,
  serverId: string,
): Promise<{
  server: ServerRow;
  permissions: number;
  roles: Role[];
  memberRoleIds: string[];
  member: { nickname: string | null } | null;
} | null> {
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(serverId).first<ServerRow>();
  if (!server) return null;
  const member = await getServerMember(db, serverId, user.id);
  if (!member && user.is_owner !== 1) return null;
  const computed = await computeServerPerms(db, server, user.id, user.is_owner === 1);
  const memberRoleIds = (
    await db
      .prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(serverId, user.id)
      .all<{ role_id: string }>()
  ).results.map((r) => r.role_id);
  return {
    server,
    permissions: computed.permissions,
    roles: computed.roles,
    memberRoleIds,
    member: (member as unknown as { nickname: string | null }) ?? null,
  };
}

function highestPosition(roles: Role[], ids: string[]): number {
  return roles.filter((r) => ids.includes(r.id)).reduce((max, r) => Math.max(max, r.position), -1);
}

async function autoJoinPublic(db: D1Database, server: ServerRow, userId: string) {
  await db
    .prepare("INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(server.id, userId, now())
    .run();
  const general = await db
    .prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'text' ORDER BY position LIMIT 1")
    .bind(server.id)
    .first<{ id: string }>();
  if (general) {
    await db
      .prepare(
        "INSERT INTO messages (id, channel_id, author_id, content, system, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      )
      .bind(uid(), general.id, userId, `<@${userId}> joined the server.`, now())
      .run();
    await emit(db, "channel", general.id, "message.create", { system: true });
  }
  await emit(db, "server", server.id, "member.join", { userId });
}

/* ------------------------------- discovery ------------------------------ */

// Categories a community can list itself under in Discover.
const DISCOVER_CATEGORIES = new Set(["social", "gaming", "music", "creative", "community", "tools"]);
const TAG_BADGES = new Set(["gem", "bolt", "star", "shield", "spark", "flame"]);

servers.get("/discover", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const q = (c.req.query("q") || "").trim().slice(0, 60);
  const category = (c.req.query("category") || "featured").trim().slice(0, 30);
  const filters: string[] = ["s.is_public = 1"];
  const args: unknown[] = [];
  if (q) {
    filters.push("(s.name LIKE ? OR s.description LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (category !== "featured" && DISCOVER_CATEGORIES.has(category)) {
    filters.push("s.category = ?");
    args.push(category);
  }
  const rows = await db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
         (SELECT COUNT(*) FROM server_boosts b WHERE b.server_id = s.id) as boost_count
       FROM servers s WHERE ${filters.join(" AND ")}
       ORDER BY boost_count DESC, member_count DESC LIMIT 40`,
    )
    .bind(...args)
    .all<ServerRow & { member_count: number; boost_count: number }>();
  const myServerIds = new Set(
    (
      await db.prepare("SELECT server_id FROM server_members WHERE user_id = ?").bind(me.id).all<{ server_id: string }>()
    ).results.map((r) => r.server_id),
  );
  const out = [];
  for (const s of rows.results) {
    const online = await db
      .prepare(
        `SELECT COUNT(*) as n FROM server_members sm JOIN users u ON u.id = sm.user_id
         WHERE sm.server_id = ? AND u.last_seen_at > ? AND u.status != 'invisible'`,
      )
      .bind(s.id, now() - 5 * 60 * 1000)
      .first<{ n: number }>();
    const categories = await db
      .prepare("SELECT name FROM categories WHERE server_id = ? ORDER BY position LIMIT 4")
      .bind(s.id)
      .all<{ name: string }>();
    const previewChannels = await db
      .prepare("SELECT name, type FROM channels WHERE server_id = ? AND is_private = 0 AND type != 'thread' ORDER BY position LIMIT 6")
      .bind(s.id)
      .all<{ name: string; type: string }>();
    out.push({
      ...serverSummary(s),
      memberCount: s.member_count,
      onlineCount: online?.n ?? 0,
      joined: myServerIds.has(s.id),
      categories: categories.results.map((x) => x.name),
      channels: previewChannels.results,
      boostCount: s.boost_count ?? 0,
    });
  }
  return c.json({ servers: out, category });
});

servers.get("/mine", async (c) => {
  const me = c.get("user");
  return c.json({ servers: await myServers(c.env.DB, me.id, me.username) });
});

/* -------------------------------- create -------------------------------- */

servers.post("/", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 60);
  if (name.length < 2) return bad(c, "Server name must be at least 2 characters.");
  const count = await db
    .prepare("SELECT COUNT(*) as n FROM server_members WHERE user_id = ?")
    .bind(me.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 100) return bad(c, "You are in the maximum number of servers (100).");
  const created = now();
  const serverId = uid();
  let inviteCode = `${slug(name).slice(0, 24) || "zuno"}-${Math.random().toString(36).slice(2, 8)}`;
  const clash = await db.prepare("SELECT 1 FROM servers WHERE invite_code = ?").bind(inviteCode).first();
  if (clash) inviteCode = uid().slice(0, 12);
  await db
    .prepare(
      "INSERT INTO servers (id, name, owner_id, description, is_public, invite_code, welcome_message, rules, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      serverId,
      name,
      me.id,
      str(body.description, 300) || null,
      bool(body.isPublic) ? 1 : 0,
      inviteCode,
      str(body.welcomeMessage, 500) || `Welcome to ${name}, {user}.`,
      str(body.rules, 2000) || null,
      created,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO roles (id, server_id, name, color, permissions, position, is_everyone, created_at) VALUES (?, ?, '@everyone', '#8ea4c8', ?, 0, 1, ?)",
    )
    .bind(uid(), serverId, DEFAULT_EVERYONE, created)
    .run();
  const adminRoleId = uid();
  await db
    .prepare(
      "INSERT INTO roles (id, server_id, name, color, permissions, position, is_everyone, created_at) VALUES (?, ?, 'Founder', '#5fe3ff', ?, 10, 0, ?)",
    )
    .bind(adminRoleId, serverId, P.ADMINISTRATOR, created)
    .run();
  const catText = uid();
  const catVoice = uid();
  await db
    .prepare("INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, 'TEXT CHANNELS', 0), (?, ?, 'VOICE CHANNELS', 1)")
    .bind(catText, serverId, catVoice, serverId)
    .run();
  const generalId = uid();
  const voiceId = uid();
  await db
    .prepare(
      "INSERT INTO channels (id, server_id, category_id, name, type, topic, position, created_at) VALUES (?, ?, ?, 'general', 'text', ?, 0, ?)",
    )
    .bind(generalId, serverId, catText, "The start of something good.", created)
    .run();
  await db
    .prepare(
      "INSERT INTO channels (id, server_id, category_id, name, type, position, created_at) VALUES (?, ?, ?, 'General', 'voice', 1, ?)",
    )
    .bind(voiceId, serverId, catVoice, created)
    .run();
  await db
    .prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(serverId, me.id, created)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)")
    .bind(serverId, me.id, adminRoleId)
    .run();
  await db
    .prepare("INSERT INTO invites (code, server_id, created_by, created_at, uses) VALUES (?, ?, ?, ?, 0)")
    .bind(inviteCode, serverId, me.id, created)
    .run();
  await db
    .prepare(
      "INSERT INTO messages (id, channel_id, author_id, content, system, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(uid(), generalId, me.id, `${name} was created. Welcome!`, created)
    .run();
  await audit(db, {
    serverId,
    actorId: me.id,
    action: "server.create",
    targetType: "server",
    targetId: serverId,
    meta: { name },
  });
  await db
    .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, 'founder', ?, ?)")
    .bind(me.id, me.id, created)
    .run();
  return c.json({ server: { id: serverId, name, inviteCode } }, 201);
});

/* ------------------------------- detail --------------------------------- */

servers.get("/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  const { server, permissions, roles, memberRoleIds } = access;

  const cats = await db
    .prepare("SELECT * FROM categories WHERE server_id = ? ORDER BY position")
    .bind(server.id)
    .all<{ id: string; name: string; position: number }>();
  const allChannels = await db
    .prepare("SELECT * FROM channels WHERE server_id = ? ORDER BY position")
    .bind(server.id)
    .all<ChannelRow>();
  const { getChannelAccess } = await import("../perms");
  const visibleChannels: ChannelRow[] = [];
  for (const channel of allChannels.results) {
    if (channel.type === "thread") continue;
    const chAccess = has(permissions, P.ADMINISTRATOR)
      ? { permissions }
      : await getChannelAccess(db, me, channel.id);
    if (chAccess && has(chAccess.permissions, P.VIEW_CHANNEL)) visibleChannels.push(channel);
  }
  const channelsWithUnread = [];
  for (const channel of visibleChannels) {
    const unread = channel.type === "text" ? await channelUnread(db, me.id, channel) : 0;
    channelsWithUnread.push({ ...channel, unreadCount: unread });
  }
  const members = await db
    .prepare(
      `SELECT u.*, sm.nickname, sm.joined_at, sm.server_avatar_id, sm.server_bio FROM server_members sm
       JOIN users u ON u.id = sm.user_id WHERE sm.server_id = ? ORDER BY u.username LIMIT 200`,
    )
    .bind(server.id)
    .all<Record<string, unknown>>();
  const memberRoleRows = await db
    .prepare("SELECT user_id, role_id FROM member_roles WHERE server_id = ?")
    .bind(server.id)
    .all<{ user_id: string; role_id: string }>();
  const rolesByUser = new Map<string, string[]>();
  for (const row of memberRoleRows.results) {
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role_id);
    rolesByUser.set(row.user_id, list);
  }
  const badgeMap = await badgesFor(
    db,
    members.results.map((m) => String(m.id)),
  );
  const voice = await db
    .prepare(
      `SELECT vs.*, u.username, u.display_name, u.avatar_id, u.accent_color FROM voice_states vs
       JOIN users u ON u.id = vs.user_id
       JOIN channels ch ON ch.id = vs.channel_id WHERE ch.server_id = ?`,
    )
    .bind(server.id)
    .all<Record<string, unknown>>();
  const emojis = await db.prepare("SELECT * FROM emojis WHERE server_id = ? ORDER BY name").bind(server.id).all();
  const events = await db
    .prepare("SELECT * FROM server_events WHERE server_id = ? AND ends_at > ? ORDER BY starts_at")
    .bind(server.id, now())
    .all<Record<string, unknown>>();
  const announcements = await db
    .prepare("SELECT * FROM announcements WHERE server_id = ? ORDER BY created_at DESC LIMIT 5")
    .bind(server.id)
    .all();
  const online = members.results.filter(
    (m) => Number(m.last_seen_at) > now() - 5 * 60 * 1000 && m.status !== "invisible",
  ).length;
  const myRoles = roles.filter((r) => memberRoleIds.includes(r.id));
  const boostRows = await db
    .prepare(
      `SELECT b.user_id, b.created_at, u.username, u.display_name, u.avatar_id
       FROM server_boosts b JOIN users u ON u.id = b.user_id
       WHERE b.server_id = ? ORDER BY b.created_at ASC`,
    )
    .bind(server.id)
    .all<{ user_id: string; created_at: number; username: string; display_name: string | null; avatar_id: string | null }>();

  return c.json({
    server: serverSummary(server, {
      ownerId: server.owner_id,
      memberCount: members.results.length,
      onlineCount: online,
      welcomeMessage: server.welcome_message,
      rules: server.rules,
      inviteCode: has(permissions, P.CREATE_INVITES) ? server.invite_code : null,
      isOwner: server.owner_id === me.id,
    }),
    categories: cats.results,
    channels: channelsWithUnread,
    boosts: {
      count: boostRows.results.length,
      mine: boostRows.results.some((row) => row.user_id === me.id),
      goal: Number(server.boost_goal ?? 10) || 10,
      users: boostRows.results.map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name || row.username,
        avatarId: row.avatar_id,
        since: row.created_at,
      })),
    },
    roles: roles.map((r) => ({ ...r, memberCount: memberRoleRows.results.filter((x) => x.role_id === r.id).length })),
    myRoles: myRoles.map((r) => ({ id: r.id, name: r.name, color: r.color })),
    permissions,
    members: members.results.map((m) => ({
      ...decorate(m, badgeMap.get(String(m.id)) ?? []),
      nickname: m.nickname,
      joinedAt: m.joined_at,
      serverAvatarId: m.server_avatar_id,
      serverBio: m.server_bio,
      roleIds: rolesByUser.get(String(m.id)) ?? [],
      isServerOwner: m.id === server.owner_id,
    })),
    voiceStates: voice.results.map((v) => ({
      channelId: v.channel_id,
      userId: v.user_id,
      muted: !!v.muted,
      deafened: !!v.deafened,
      video: !!v.video,
      screen: !!v.screen,
      username: v.username,
      displayName: v.display_name,
      avatarId: v.avatar_id,
      accentColor: v.accent_color,
    })),
    emojis: emojis.results,
    events: events.results.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location,
      createdBy: e.created_by,
    })),
    announcements: announcements.results,
    permissionMeta: PERMISSION_META,
  });
});

servers.patch("/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_SERVER)) return c.json({ error: "Missing permission: Manage Server" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (name.length < 2) return bad(c, "Server name is too short.");
    sets.push("name = ?");
    args.push(name);
  }
  if (body.description !== undefined) {
    sets.push("description = ?");
    args.push(str(body.description, 300) || null);
  }
  if (body.isPublic !== undefined) {
    sets.push("is_public = ?");
    args.push(bool(body.isPublic) ? 1 : 0);
  }
  if (body.welcomeMessage !== undefined) {
    sets.push("welcome_message = ?");
    args.push(str(body.welcomeMessage, 500) || null);
  }
  if (body.rules !== undefined) {
    sets.push("rules = ?");
    args.push(str(body.rules, 4000) || null);
  }
  if (body.category !== undefined) {
    const category = str(body.category, 30) || "social";
    if (!DISCOVER_CATEGORIES.has(category)) return bad(c, "Unknown community category.");
    sets.push("category = ?");
    args.push(category);
  }
  if (body.tag !== undefined) {
    const tag = str(body.tag, 8).toUpperCase();
    if (tag && !/^[A-Z0-9]{2,4}$/.test(tag)) return bad(c, "A server tag is 2–4 letters or numbers.");
    if (tag) {
      const boosts = await db
        .prepare("SELECT COUNT(*) as n FROM server_boosts WHERE server_id = ?")
        .bind(access.server.id)
        .first<{ n: number }>();
      if ((boosts?.n ?? 0) < 1) return bad(c, "Reach at least 1 boost to unlock a server tag.", 403);
    }
    sets.push("tag = ?");
    args.push(tag || null);
  }
  if (body.tagBadge !== undefined) {
    const badge = str(body.tagBadge, 20);
    if (badge && !TAG_BADGES.has(badge)) return bad(c, "Unknown tag badge.");
    sets.push("tag_badge = ?");
    args.push(badge || null);
  }
  if (body.boostGoal !== undefined) {
    sets.push("boost_goal = ?");
    args.push(clamp(num(body.boostGoal, 10), 1, 100));
  }
  if (body.boostBar !== undefined) {
    sets.push("boost_bar = ?");
    args.push(bool(body.boostBar) ? 1 : 0);
  }
  if (body.iconId !== undefined) {
    const fileId = str(body.iconId, 64);
    if (fileId) {
      const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, me.id).first();
      if (!file) return bad(c, "Icon upload not found.");
    }
    sets.push("icon_id = ?");
    args.push(fileId || null);
  }
  if (body.bannerId !== undefined) {
    const fileId = str(body.bannerId, 64);
    if (fileId) {
      const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, me.id).first();
      if (!file) return bad(c, "Banner upload not found.");
    }
    sets.push("banner_id = ?");
    args.push(fileId || null);
  }
  if (!sets.length) return bad(c, "Nothing to update.");
  args.push(access.server.id);
  await db.prepare(`UPDATE servers SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "server.update",
    targetType: "server",
    targetId: access.server.id,
    meta: { fields: sets.map((s) => s.split(" = ")[0]) },
  });
  await emit(db, "server", access.server.id, "server.update", {});
  return c.json({ ok: true });
});

servers.delete("/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (access.server.owner_id !== me.id && me.is_owner !== 1)
    return c.json({ error: "Only the server owner can delete this server." }, 403);
  const serverId = access.server.id;
  const channels = await db.prepare("SELECT id FROM channels WHERE server_id = ?").bind(serverId).all<{ id: string }>();
  for (const ch of channels.results) {
    await db
      .prepare(
        "DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)",
      )
      .bind(ch.id)
      .run();
    await db.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(ch.id).run();
    await db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(ch.id).run();
    await db.prepare("DELETE FROM channel_overwrites WHERE channel_id = ?").bind(ch.id).run();
    await db.prepare("DELETE FROM read_states WHERE channel_id = ?").bind(ch.id).run();
    await db.prepare("DELETE FROM voice_states WHERE channel_id = ?").bind(ch.id).run();
  }
  const statements = [
    "DELETE FROM channels WHERE server_id = ?",
    "DELETE FROM categories WHERE server_id = ?",
    "DELETE FROM member_roles WHERE server_id = ?",
    "DELETE FROM server_members WHERE server_id = ?",
    "DELETE FROM roles WHERE server_id = ?",
    "DELETE FROM invites WHERE server_id = ?",
    "DELETE FROM bans WHERE server_id = ?",
    "DELETE FROM server_events WHERE server_id = ?",
    "DELETE FROM announcements WHERE server_id = ?",
    "DELETE FROM emojis WHERE server_id = ?",
    "DELETE FROM server_layout WHERE server_id = ?",
  ];
  for (const sql of statements) await db.prepare(sql).bind(serverId).run();
  await db.prepare("DELETE FROM servers WHERE id = ?").bind(serverId).run();
  await audit(db, {
    serverId: null,
    actorId: me.id,
    action: "server.delete",
    targetType: "server",
    targetId: serverId,
    meta: { name: access.server.name },
  });
  return c.json({ ok: true });
});

/* -------------------------------- boosts -------------------------------- */

const MAX_BOOSTS = 10;

async function boostState(db: D1Database, serverId: string, userId: string) {
  const count = await db
    .prepare("SELECT COUNT(*) as n FROM server_boosts WHERE server_id = ?")
    .bind(serverId)
    .first<{ n: number }>();
  const mine = await db
    .prepare("SELECT 1 as ok FROM server_boosts WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .first<{ ok: number }>();
  return { count: count?.n ?? 0, mine: !!mine };
}

servers.post("/:id/boost", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  const serverId = access.server.id;
  // Boosting is a ZUNO PLUS perk; the owner account always has PLUS.
  const plus = me.is_owner === 1 || (me.plus_until && me.plus_until > now());
  if (!plus) return c.json({ error: "Boosting is a ZUNO PLUS perk. Upgrade to boost communities." }, 403);

  const state = await boostState(db, serverId, me.id);
  if (state.mine) return bad(c, "You are already boosting this community.");
  if (state.count >= MAX_BOOSTS) return bad(c, "This community already has all 10 boosts.");

  await db
    .prepare("INSERT OR IGNORE INTO server_boosts (server_id, user_id, created_at) VALUES (?, ?, ?)")
    .bind(serverId, me.id, now())
    .run();
  await emit(db, "server", serverId, "server.boost", { userId: me.id });
  await audit(db, { serverId, actorId: me.id, action: "server.boost", targetType: "server", targetId: serverId });
  const next = await boostState(db, serverId, me.id);
  return c.json({ ok: true, count: next.count, mine: next.mine });
});

servers.delete("/:id/boost", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const serverId = c.req.param("id");
  await db.prepare("DELETE FROM server_boosts WHERE server_id = ? AND user_id = ?").bind(serverId, me.id).run();
  await emit(db, "server", serverId, "server.boost.remove", { userId: me.id });
  const next = await boostState(db, serverId, me.id);
  return c.json({ ok: true, count: next.count, mine: next.mine });
});

/* ------------------------------ membership ------------------------------ */

servers.post("/:id/join", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(c.req.param("id")).first<ServerRow>();
  if (!server) return c.json({ error: "Server not found" }, 404);
  const body = await readJson<Record<string, unknown>>(c);
  const code = str(body.code, 64);
  const already = await getServerMember(db, server.id, me.id);
  if (already) return c.json({ ok: true, already: true });
  if (!server.is_public && !code) return c.json({ error: "This server is invite-only." }, 403);
  if (code) {
    const invite = await db
      .prepare("SELECT * FROM invites WHERE code = ? AND server_id = ?")
      .bind(code, server.id)
      .first<Record<string, unknown>>();
    if (!invite) return c.json({ error: "Invalid invite code." }, 403);
    if (invite.expires_at && Number(invite.expires_at) < now()) return c.json({ error: "Invite expired." }, 403);
    if (invite.max_uses && Number(invite.uses) >= Number(invite.max_uses))
      return c.json({ error: "Invite has been used up." }, 403);
    await db.prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?").bind(code).run();
  }
  const banned = await db
    .prepare("SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(server.id, me.id)
    .first();
  if (banned) return c.json({ error: "You are banned from this server." }, 403);
  await autoJoinPublic(db, server, me.id);
  await audit(db, { serverId: server.id, actorId: me.id, action: "member.join", targetType: "user", targetId: me.id });
  return c.json({ ok: true, serverId: server.id });
});

servers.post("/:id/leave", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(c.req.param("id")).first<ServerRow>();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (server.owner_id === me.id) return bad(c, "Transfer ownership or delete the server instead of leaving.");
  await db.prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?").bind(server.id, me.id).run();
  await db.prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?").bind(server.id, me.id).run();
  await db.prepare("DELETE FROM voice_states WHERE user_id = ? AND channel_id IN (SELECT id FROM channels WHERE server_id = ?)")
    .bind(me.id, server.id)
    .run();
  await emit(db, "server", server.id, "member.leave", { userId: me.id });
  return c.json({ ok: true });
});

servers.post("/:id/transfer", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (access.server.owner_id !== me.id) return c.json({ error: "Only the owner can transfer ownership." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const targetId = str(body.userId, 64);
  const target = await getServerMember(db, access.server.id, targetId);
  if (!target) return bad(c, "That user is not a member.");
  await db.prepare("UPDATE servers SET owner_id = ? WHERE id = ?").bind(targetId, access.server.id).run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "server.transfer",
    targetType: "user",
    targetId,
  });
  await emit(db, "server", access.server.id, "server.update", {});
  return c.json({ ok: true });
});

/* -------------------------------- invites ------------------------------- */

servers.get("/:id/invites", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.CREATE_INVITES) && !has(access.permissions, P.MANAGE_SERVER))
    return c.json({ error: "Missing permission: Create Invites" }, 403);
  const rows = await db
    .prepare(
      `SELECT i.*, u.username FROM invites i JOIN users u ON u.id = i.created_by WHERE i.server_id = ? ORDER BY i.created_at DESC`,
    )
    .bind(access.server.id)
    .all<Record<string, unknown>>();
  return c.json({
    invites: rows.results.map((i) => ({
      code: i.code,
      uses: i.uses,
      maxUses: i.max_uses,
      expiresAt: i.expires_at,
      createdBy: i.username,
      createdAt: i.created_at,
    })),
  });
});

servers.post("/:id/invites", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.CREATE_INVITES)) return c.json({ error: "Missing permission: Create Invites" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const hours = clamp(num(body.expiresInHours, 24), 1, 720);
  const maxUses = body.maxUses ? clamp(num(body.maxUses, 0), 1, 1000) : null;
  const code = `${slug(access.server.name).slice(0, 20) || "zuno"}-${Math.random().toString(36).slice(2, 8)}`;
  await db
    .prepare("INSERT INTO invites (code, server_id, created_by, created_at, expires_at, max_uses, uses) VALUES (?, ?, ?, ?, ?, ?, 0)")
    .bind(code, access.server.id, me.id, now(), now() + hours * 60 * 60 * 1000, maxUses)
    .run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "server.invite.create",
    targetType: "invite",
    targetId: code,
  });
  return c.json({ invite: { code, expiresAt: now() + hours * 60 * 60 * 1000, maxUses } });
});

servers.delete("/:id/invites/:code", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_SERVER) && !has(access.permissions, P.CREATE_INVITES))
    return c.json({ error: "Missing permission" }, 403);
  await db
    .prepare("DELETE FROM invites WHERE code = ? AND server_id = ?")
    .bind(c.req.param("code"), access.server.id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------- channels ------------------------------- */

servers.post("/:id/channels", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission: Manage Channels" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const type = str(body.type, 10) === "voice" ? "voice" : "text";
  const rawName = str(body.name, 60);
  const name = type === "text" ? slug(rawName.replace(/\s+/g, "-")) : rawName;
  if (!name) return bad(c, "Channel needs a name.");
  let categoryId = str(body.categoryId, 64) || null;
  if (categoryId) {
    const cat = await db
      .prepare("SELECT id FROM categories WHERE id = ? AND server_id = ?")
      .bind(categoryId, access.server.id)
      .first();
    if (!cat) categoryId = null;
  }
  const max = await db
    .prepare("SELECT COALESCE(MAX(position), 0) as p FROM channels WHERE server_id = ?")
    .bind(access.server.id)
    .first<{ p: number }>();
  const id = uid();
  await db
    .prepare(
      "INSERT INTO channels (id, server_id, category_id, name, type, topic, position, is_private, slowmode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
    )
    .bind(id, access.server.id, categoryId, name, type, str(body.topic, 200) || null, (max?.p ?? 0) + 1, bool(body.isPrivate) ? 1 : 0, now())
    .run();
  if (bool(body.isPrivate)) {
    const everyone = access.roles.find((r) => r.is_everyone === 1);
    if (everyone) {
      await db
        .prepare(
          "INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES (?, 'role', ?, 0, ?)",
        )
        .bind(id, everyone.id, P.VIEW_CHANNEL)
        .run();
    }
  }
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "channel.create",
    targetType: "channel",
    targetId: id,
    meta: { name, type, private: bool(body.isPrivate) },
  });
  await emit(db, "server", access.server.id, "channel.create", { channelId: id });
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(id).first<ChannelRow>();
  return c.json({ channel }, 201);
});

servers.patch("/:id/channel-order", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission: Manage Channels" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = str(item.id, 64);
    if (!id) continue;
    const owned = await db
      .prepare("SELECT 1 FROM channels WHERE id = ? AND server_id = ?")
      .bind(id, access.server.id)
      .first();
    if (!owned) continue;
    const categoryId = str(item.categoryId, 64) || null;
    await db
      .prepare("UPDATE channels SET position = ?, category_id = ? WHERE id = ?")
      .bind(clamp(num(item.position, 0), 0, 500), categoryId, id)
      .run();
  }
  await emit(db, "server", access.server.id, "channel.update", {});
  return c.json({ ok: true });
});

servers.post("/:id/categories", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission: Manage Channels" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 40);
  if (!name) return bad(c, "Category needs a name.");
  const max = await db.prepare("SELECT COALESCE(MAX(position), 0) as p FROM categories WHERE server_id = ?").bind(access.server.id).first<{ p: number }>();
  const id = uid();
  await db
    .prepare("INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, ?, ?)")
    .bind(id, access.server.id, name, (max?.p ?? 0) + 1)
    .run();
  await emit(db, "server", access.server.id, "channel.update", {});
  return c.json({ category: { id, name, position: (max?.p ?? 0) + 1 } });
});

servers.patch("/categories/:catId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const cat = await db.prepare("SELECT * FROM categories WHERE id = ?").bind(c.req.param("catId")).first<{ id: string; server_id: string }>();
  if (!cat) return c.json({ error: "Category not found" }, 404);
  const access = await serverAccess(db, me, cat.server_id);
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 40);
  if (!name) return bad(c, "Category needs a name.");
  await db.prepare("UPDATE categories SET name = ? WHERE id = ?").bind(name, cat.id).run();
  await emit(db, "server", cat.server_id, "channel.update", {});
  return c.json({ ok: true });
});

servers.delete("/categories/:catId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const cat = await db.prepare("SELECT * FROM categories WHERE id = ?").bind(c.req.param("catId")).first<{ id: string; server_id: string }>();
  if (!cat) return c.json({ error: "Category not found" }, 404);
  const access = await serverAccess(db, me, cat.server_id);
  if (!access || !has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission" }, 403);
  await db.prepare("UPDATE channels SET category_id = NULL WHERE category_id = ?").bind(cat.id).run();
  await db.prepare("DELETE FROM categories WHERE id = ?").bind(cat.id).run();
  await emit(db, "server", cat.server_id, "channel.update", {});
  return c.json({ ok: true });
});

/* --------------------------------- roles -------------------------------- */

servers.post("/:id/roles", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_ROLES)) return c.json({ error: "Missing permission: Manage Roles" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 32);
  if (!name) return bad(c, "Role needs a name.");
  const color = /^#[0-9a-fA-F]{6}$/.test(str(body.color, 9)) ? str(body.color, 9) : "#8ea4c8";
  const requested = num(body.permissions, 0);
  const myHighest = highestPosition(access.roles, access.memberRoleIds);
  const maxAllowed = has(access.permissions, P.ADMINISTRATOR) || access.server.owner_id === me.id ? 2 ** 31 - 1 : myHighest;
  const permissions = has(access.permissions, P.ADMINISTRATOR)
    ? requested
    : requested & (ALL_PERMS ^ P.ADMINISTRATOR);
  const position = clamp(num(body.position, myHighest - 1), 0, Math.max(0, maxAllowed - 1));
  const id = uid();
  await db
    .prepare(
      "INSERT INTO roles (id, server_id, name, color, permissions, position, is_everyone, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
    )
    .bind(id, access.server.id, name, color, permissions, position, now())
    .run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "role.create",
    targetType: "role",
    targetId: id,
    meta: { name, permissions },
  });
  await emit(db, "server", access.server.id, "role.update", {});
  return c.json({ role: { id, name, color, permissions, position, is_everyone: 0 } });
});

servers.patch("/roles/:roleId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const role = await db.prepare("SELECT * FROM roles WHERE id = ?").bind(c.req.param("roleId")).first<Role>();
  if (!role) return c.json({ error: "Role not found" }, 404);
  const access = await serverAccess(db, me, role.server_id);
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!has(access.permissions, P.MANAGE_ROLES)) return c.json({ error: "Missing permission: Manage Roles" }, 403);
  const isAdmin = has(access.permissions, P.ADMINISTRATOR) || access.server.owner_id === me.id;
  const myHighest = highestPosition(access.roles, access.memberRoleIds);
  if (!isAdmin && role.position >= myHighest) return c.json({ error: "You cannot edit a role equal to or above your highest role." }, 403);
  if (role.is_everyone === 1 && !isAdmin) return c.json({ error: "Only admins can edit @everyone." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined && role.is_everyone === 0) {
    const name = str(body.name, 32);
    if (!name) return bad(c, "Role needs a name.");
    sets.push("name = ?");
    args.push(name);
  }
  if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(str(body.color, 9))) {
    sets.push("color = ?");
    args.push(str(body.color, 9));
  }
  if (body.permissions !== undefined) {
    let perms = num(body.permissions, role.permissions);
    if (!isAdmin) perms &= ALL_PERMS ^ P.ADMINISTRATOR;
    if (role.is_everyone === 1 && !isAdmin) perms = role.permissions;
    sets.push("permissions = ?");
    args.push(perms);
  }
  if (body.position !== undefined) {
    const pos = clamp(num(body.position, role.position), 0, isAdmin ? 100 : Math.max(0, myHighest - 1));
    sets.push("position = ?");
    args.push(pos);
  }
  if (!sets.length) return bad(c, "Nothing to update.");
  args.push(role.id);
  await db.prepare(`UPDATE roles SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  await audit(db, {
    serverId: role.server_id,
    actorId: me.id,
    action: "role.update",
    targetType: "role",
    targetId: role.id,
    meta: { permissions: num(body.permissions, role.permissions) },
  });
  await emit(db, "server", role.server_id, "role.update", {});
  return c.json({ ok: true });
});

servers.delete("/roles/:roleId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const role = await db.prepare("SELECT * FROM roles WHERE id = ?").bind(c.req.param("roleId")).first<Role>();
  if (!role) return c.json({ error: "Role not found" }, 404);
  const access = await serverAccess(db, me, role.server_id);
  if (!access || !has(access.permissions, P.MANAGE_ROLES)) return c.json({ error: "Missing permission" }, 403);
  if (role.is_everyone === 1) return bad(c, "The @everyone role cannot be deleted.");
  const isAdmin = has(access.permissions, P.ADMINISTRATOR) || access.server.owner_id === me.id;
  const myHighest = highestPosition(access.roles, access.memberRoleIds);
  if (!isAdmin && role.position >= myHighest) return c.json({ error: "Role hierarchy prevents this." }, 403);
  await db.prepare("DELETE FROM member_roles WHERE role_id = ?").bind(role.id).run();
  await db.prepare("DELETE FROM channel_overwrites WHERE target_type = 'role' AND target_id = ?").bind(role.id).run();
  await db.prepare("DELETE FROM roles WHERE id = ?").bind(role.id).run();
  await audit(db, {
    serverId: role.server_id,
    actorId: me.id,
    action: "role.delete",
    targetType: "role",
    targetId: role.id,
    meta: { name: role.name },
  });
  await emit(db, "server", role.server_id, "role.update", {});
  return c.json({ ok: true });
});

servers.put("/:id/members/:userId/roles", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_ROLES)) return c.json({ error: "Missing permission: Manage Roles" }, 403);
  const targetId = c.req.param("userId");
  const target = await getServerMember(db, access.server.id, targetId);
  if (!target) return c.json({ error: "Not a member" }, 404);
  if (targetId === access.server.owner_id && access.server.owner_id !== me.id)
    return c.json({ error: "You cannot change the server owner's roles." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const roleIds = Array.isArray(body.roleIds) ? body.roleIds.filter((r): r is string => typeof r === "string").slice(0, 50) : [];
  const isAdmin = has(access.permissions, P.ADMINISTRATOR) || access.server.owner_id === me.id;
  const myHighest = highestPosition(access.roles, access.memberRoleIds);
  const assignable = access.roles.filter((r) => r.is_everyone === 0 && roleIds.includes(r.id));
  if (!isAdmin && assignable.some((r) => r.position >= myHighest))
    return c.json({ error: "You cannot assign a role at or above your highest role." }, 403);
  await db.prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).run();
  for (const role of assignable) {
    await db
      .prepare("INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)")
      .bind(access.server.id, targetId, role.id)
      .run();
  }
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "member.roles.update",
    targetType: "user",
    targetId,
    meta: { roleIds: assignable.map((r) => r.name) },
  });
  await emit(db, "server", access.server.id, "member.update", { userId: targetId });
  return c.json({ ok: true });
});

servers.patch("/:id/members/me", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const member = await getServerMember(db, c.req.param("id"), me.id);
  if (!member) return c.json({ error: "Not a member" }, 404);
  const body = await readJson<Record<string, unknown>>(c);
  await db
    .prepare("UPDATE server_members SET nickname = ?, server_bio = ? WHERE server_id = ? AND user_id = ?")
    .bind(str(body.nickname, 32) || null, str(body.serverBio, 190) || null, c.req.param("id"), me.id)
    .run();
  await emit(db, "server", c.req.param("id"), "member.update", { userId: me.id });
  return c.json({ ok: true });
});

servers.delete("/:id/members/:userId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.KICK_MEMBERS)) return c.json({ error: "Missing permission: Kick Members" }, 403);
  const targetId = c.req.param("userId");
  if (targetId === access.server.owner_id) return c.json({ error: "You cannot kick the server owner." }, 403);
  if (targetId === me.id) return bad(c, "Use Leave Server instead.");
  const isAdmin = has(access.permissions, P.ADMINISTRATOR);
  const targetRoles = (
    await db.prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).all<{ role_id: string }>()
  ).results.map((r) => r.role_id);
  if (!isAdmin) {
    const myHighest = highestPosition(access.roles, access.memberRoleIds);
    if (highestPosition(access.roles, targetRoles) >= myHighest)
      return c.json({ error: "You cannot kick a member with an equal or higher role." }, 403);
  }
  await db.prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).run();
  await db.prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "member.kick",
    targetType: "user",
    targetId,
  });
  await emit(db, "server", access.server.id, "member.leave", { userId: targetId });
  await emit(db, "user", targetId, "server.kicked", { serverId: access.server.id });
  return c.json({ ok: true });
});

/* --------------------------------- bans --------------------------------- */

servers.get("/:id/bans", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.BAN_MEMBERS)) return c.json({ error: "Missing permission: Ban Members" }, 403);
  const rows = await db
    .prepare(
      `SELECT b.*, u.username, u.display_name FROM bans b JOIN users u ON u.id = b.user_id
       WHERE b.server_id = ? ORDER BY b.created_at DESC`,
    )
    .bind(access.server.id)
    .all<Record<string, unknown>>();
  return c.json({
    bans: rows.results.map((b) => ({
      userId: b.user_id,
      username: b.username,
      displayName: b.display_name,
      reason: b.reason,
      createdAt: b.created_at,
    })),
  });
});

servers.post("/:id/bans", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.BAN_MEMBERS)) return c.json({ error: "Missing permission: Ban Members" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const targetId = str(body.userId, 64);
  if (!targetId) return bad(c, "Choose a member to ban.");
  if (targetId === access.server.owner_id) return c.json({ error: "The server owner cannot be banned." }, 403);
  if (targetId === me.id) return bad(c, "You cannot ban yourself.");
  const target = await userById(db, targetId);
  if (!target) return c.json({ error: "User not found" }, 404);
  if (!has(access.permissions, P.ADMINISTRATOR)) {
    const targetRoles = (
      await db.prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).all<{ role_id: string }>()
    ).results.map((r) => r.role_id);
    const myHighest = highestPosition(access.roles, access.memberRoleIds);
    if (highestPosition(access.roles, targetRoles) >= myHighest)
      return c.json({ error: "You cannot ban a member with an equal or higher role." }, 403);
  }
  await db
    .prepare("INSERT OR REPLACE INTO bans (server_id, user_id, reason, banned_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(access.server.id, targetId, str(body.reason, 300) || null, me.id, now())
    .run();
  await db.prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).run();
  await db.prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?").bind(access.server.id, targetId).run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "member.ban",
    targetType: "user",
    targetId,
    meta: { reason: str(body.reason, 300) },
  });
  await emit(db, "server", access.server.id, "member.leave", { userId: targetId });
  await emit(db, "user", targetId, "server.banned", { serverId: access.server.id, reason: str(body.reason, 300) });
  return c.json({ ok: true });
});

servers.delete("/:id/bans/:userId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access || !has(access.permissions, P.BAN_MEMBERS)) return c.json({ error: "Missing permission" }, 403);
  await db
    .prepare("DELETE FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(access.server.id, c.req.param("userId"))
    .run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "member.unban",
    targetType: "user",
    targetId: c.req.param("userId"),
  });
  return c.json({ ok: true });
});

/* ------------------------------- audit log ------------------------------ */

servers.get("/:id/audit", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.VIEW_AUDIT)) return c.json({ error: "Missing permission: View Audit Log" }, 403);
  const rows = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.server_id = ? ORDER BY a.created_at DESC LIMIT 100`,
    )
    .bind(access.server.id)
    .all<Record<string, unknown>>();
  return c.json({
    entries: rows.results.map((a) => ({
      id: a.id,
      action: a.action,
      actorId: a.actor_id,
      actorName: a.display_name || a.username || "System",
      targetType: a.target_type,
      targetId: a.target_id,
      meta: a.meta,
      createdAt: a.created_at,
    })),
  });
});

/* --------------------------------- emoji -------------------------------- */

servers.post("/:id/emojis", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_EMOJIS)) return c.json({ error: "Missing permission: Manage Emojis" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const name = slug(str(body.name, 24).replace(/_/g, "-")).replace(/-/g, "_");
  const fileId = str(body.fileId, 64);
  if (!name || !fileId) return bad(c, "Emoji needs a name and an uploaded image.");
  const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, me.id).first();
  if (!file) return bad(c, "Upload not found.");
  const count = await db.prepare("SELECT COUNT(*) as n FROM emojis WHERE server_id = ?").bind(access.server.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 50) return bad(c, "Emoji limit reached (50).");
  try {
    const id = uid();
    await db
      .prepare("INSERT INTO emojis (id, server_id, name, file_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, access.server.id, name, fileId, me.id, now())
      .run();
    await emit(db, "server", access.server.id, "emoji.update", {});
    return c.json({ emoji: { id, name, fileId } });
  } catch {
    return bad(c, "That emoji name already exists.");
  }
});

servers.delete("/emojis/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const emoji = await db.prepare("SELECT * FROM emojis WHERE id = ?").bind(c.req.param("id")).first<{ id: string; server_id: string }>();
  if (!emoji) return c.json({ error: "Emoji not found" }, 404);
  const access = await serverAccess(db, me, emoji.server_id);
  if (!access || !has(access.permissions, P.MANAGE_EMOJIS)) return c.json({ error: "Missing permission" }, 403);
  await db.prepare("DELETE FROM emojis WHERE id = ?").bind(emoji.id).run();
  await emit(db, "server", emoji.server_id, "emoji.update", {});
  return c.json({ ok: true });
});

/* --------------------------------- events -------------------------------- */

servers.post("/:id/events", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_EVENTS)) return c.json({ error: "Missing permission: Manage Events" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 80);
  const startsAt = num(body.startsAt, 0);
  if (!name) return bad(c, "Event needs a name.");
  if (!startsAt || startsAt < now() - 60_000) return bad(c, "Choose a start time in the future.");
  const id = uid();
  await db
    .prepare(
      "INSERT INTO server_events (id, server_id, name, description, starts_at, ends_at, location, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      access.server.id,
      name,
      str(body.description, 600) || null,
      startsAt,
      body.endsAt ? num(body.endsAt, startsAt + 3600_000) : null,
      str(body.location, 80) || null,
      me.id,
      now(),
    )
    .run();
  await audit(db, {
    serverId: access.server.id,
    actorId: me.id,
    action: "event.create",
    targetType: "event",
    targetId: id,
    meta: { name },
  });
  await emit(db, "server", access.server.id, "event.update", {});
  return c.json({ event: { id, name, startsAt } }, 201);
});

servers.delete("/events/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const event = await db
    .prepare("SELECT * FROM server_events WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; server_id: string; created_by: string }>();
  if (!event) return c.json({ error: "Event not found" }, 404);
  const access = await serverAccess(db, me, event.server_id);
  if (!access || (!has(access.permissions, P.MANAGE_EVENTS) && event.created_by !== me.id))
    return c.json({ error: "Missing permission" }, 403);
  await db.prepare("DELETE FROM server_events WHERE id = ?").bind(event.id).run();
  await emit(db, "server", event.server_id, "event.update", {});
  return c.json({ ok: true });
});

/* ----------------------------- announcements ---------------------------- */

servers.post("/:id/announce", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  if (!has(access.permissions, P.MANAGE_SERVER)) return c.json({ error: "Missing permission: Manage Server" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const title = str(body.title, 100);
  const text = str(body.body, 2000);
  if (!title || !text) return bad(c, "Announcement needs a title and body.");
  const id = uid();
  await db
    .prepare("INSERT INTO announcements (id, scope, server_id, author_id, title, body, created_at) VALUES (?, 'server', ?, ?, ?, ?, ?)")
    .bind(id, access.server.id, me.id, title, text, now())
    .run();
  const channel = await db
    .prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'text' AND name IN ('announcements','announcement') LIMIT 1")
    .bind(access.server.id)
    .first<{ id: string }>();
  if (channel) {
    await db
      .prepare(
        "INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(uid(), channel.id, me.id, `📢 **${title}**\n${text}`, now())
      .run();
    await db.prepare("UPDATE channels SET last_message_at = ? WHERE id = ?").bind(now(), channel.id).run();
    await emit(db, "channel", channel.id, "message.create", { announcement: true });
  }
  const members = await db
    .prepare("SELECT user_id FROM server_members WHERE server_id = ? AND user_id != ?")
    .bind(access.server.id, me.id)
    .all<{ user_id: string }>();
  for (const m of members.results) {
    await notify(db, {
      userId: m.user_id,
      kind: "announcement",
      title: `${access.server.name}: ${title}`,
      body: text.slice(0, 140),
      actorId: me.id,
      serverId: access.server.id,
      channelId: channel?.id,
    });
    await emit(db, "user", m.user_id, "notification", { serverId: access.server.id });
  }
  await emit(db, "server", access.server.id, "announcement", { id });
  return c.json({ ok: true, id });
});

/* ------------------------------- permission meta ------------------------ */

servers.get("/:id/permissions", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await serverAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Server not found" }, 404);
  return c.json({
    permissions: access.permissions,
    meta: PERMISSION_META,
    myRoles: access.roles.filter((r) => access.memberRoleIds.includes(r.id)).map((r) => ({ id: r.id, name: r.name })),
  });
});

export { serverAccess, highestPosition };
