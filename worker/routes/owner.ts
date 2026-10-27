import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { BADGE_ARTS, getConfig, setConfig } from "../db";
import { bad, bool, clamp, now, num, readJson, str, uid } from "../lib";
import { audit, emit, notify } from "../perms";
import { badgesFor, decorate } from "../service";
import { reviewClaim } from "./quests";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const owner = new Hono<Ctx>();

owner.use("*", async (c, next) => {
  const me = c.get("user");
  if (me.is_owner !== 1) return c.json({ error: "Owner access only." }, 403);
  await next();
});

const PLATFORM_ROLES = new Set(["user", "moderator", "manager", "admin", "support", "events", "founder"]);
const BADGE_ART_KEYS = new Set<string>(BADGE_ARTS);

// Platform roles carry their matching badge automatically. The owner badge is never touched here.
const ROLE_BADGES: Record<string, string> = {
  moderator: "moderator",
  manager: "manager",
  admin: "admin",
  support: "support",
  events: "events",
  founder: "founder",
};

async function syncRoleBadge(db: D1Database, userId: string, role: string, actorId: string | null) {
  const managed = Object.values(ROLE_BADGES);
  await db
    .prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_slug IN (${managed.map(() => "?").join(",")})`)
    .bind(userId, ...managed)
    .run();
  const slug = ROLE_BADGES[role];
  if (!slug) return;
  await db
    .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, ?, ?, ?)")
    .bind(userId, slug, actorId, now())
    .run();
}

// Deleting a server removes every row that hangs off it. Shared by the owner
// console and by account removal, which disposes of a member's servers.
async function purgeServer(db: D1Database, serverId: string) {
  const channels = await db.prepare("SELECT id FROM channels WHERE server_id = ?").bind(serverId).all<{ id: string }>();
  for (const ch of channels.results) {
    await db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(ch.id).run();
    await db.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(ch.id).run();
    await db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(ch.id).run();
    await db.prepare("DELETE FROM channel_overwrites WHERE channel_id = ?").bind(ch.id).run();
    await db.prepare("DELETE FROM voice_states WHERE channel_id = ?").bind(ch.id).run();
  }
  for (const sql of [
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
    "DELETE FROM servers WHERE id = ?",
  ]) {
    await db.prepare(sql).bind(serverId).run();
  }
}

owner.get("/overview", async (c) => {
  const db = c.env.DB;
  const one = async (sql: string, ...args: unknown[]) =>
    (await db.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;
  const counts = {
    users: await one("SELECT COUNT(*) as n FROM users"),
    activeToday: await one("SELECT COUNT(*) as n FROM users WHERE last_seen_at > ?", now() - 24 * 60 * 60 * 1000),
    servers: await one("SELECT COUNT(*) as n FROM servers"),
    channels: await one("SELECT COUNT(*) as n FROM channels WHERE server_id IS NOT NULL"),
    messages: await one("SELECT COUNT(*) as n FROM messages WHERE deleted_at IS NULL"),
    messagesToday: await one("SELECT COUNT(*) as n FROM messages WHERE created_at > ?", now() - 24 * 60 * 60 * 1000),
    openReports: await one("SELECT COUNT(*) as n FROM reports WHERE status IN ('open','reviewing')"),
    openAppeals: await one("SELECT COUNT(*) as n FROM appeals WHERE status = 'open'"),
    pendingApplications: await one("SELECT COUNT(*) as n FROM staff_applications WHERE status = 'pending'"),
    plusMembers: await one("SELECT COUNT(*) as n FROM users WHERE plus_until > ?", now()),
    bannedUsers: await one("SELECT COUNT(*) as n FROM users WHERE platform_banned = 1"),
  };
  const recentUsers = await db
    .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 6")
    .all<Record<string, unknown>>();
  const topServers = await db
    .prepare(
      `SELECT s.id, s.name, s.icon_id, (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) as members
       FROM servers s ORDER BY members DESC LIMIT 6`,
    )
    .all<Record<string, unknown>>();
  const recentAudit = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name, s.name as server_name FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN servers s ON s.id = a.server_id
       ORDER BY a.created_at DESC LIMIT 12`,
    )
    .all<Record<string, unknown>>();
  const badges = await badgesFor(db, recentUsers.results.map((u) => String(u.id)));
  return c.json({
    counts,
    recentUsers: recentUsers.results.map((u) => decorate(u, badges.get(String(u.id)) ?? [])),
    topServers: topServers.results.map((s) => ({
      id: s.id,
      name: s.name,
      iconId: s.icon_id,
      memberCount: s.members,
    })),
    recentAudit: recentAudit.results.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.display_name || a.username || "System",
      serverName: a.server_name,
      createdAt: a.created_at,
      meta: a.meta,
    })),
  });
});

owner.get("/analytics", async (c) => {
  const db = c.env.DB;
  const days = clamp(num(c.req.query("days"), 14), 7, 30);
  const since = now() - days * 24 * 60 * 60 * 1000;
  const messages = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as day, COUNT(*) as n FROM messages
       WHERE created_at > ? AND deleted_at IS NULL GROUP BY day ORDER BY day`,
    )
    .bind(since)
    .all<{ day: string; n: number }>();
  const users = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as day, COUNT(*) as n FROM users
       WHERE created_at > ? GROUP BY day ORDER BY day`,
    )
    .bind(since)
    .all<{ day: string; n: number }>();
  const channels = await db
    .prepare(
      `SELECT c.name, c.id, s.name as server, COUNT(m.id) as n FROM channels c
       JOIN servers s ON s.id = c.server_id LEFT JOIN messages m ON m.channel_id = c.id AND m.created_at > ?
       WHERE c.type = 'text' GROUP BY c.id ORDER BY n DESC LIMIT 8`,
    )
    .bind(since)
    .all<{ name: string; id: string; server: string; n: number }>();
  return c.json({
    messages: messages.results,
    users: users.results,
    topChannels: channels.results,
  });
});

owner.get("/users", async (c) => {
  const db = c.env.DB;
  const q = (c.req.query("q") || "").trim().slice(0, 60);
  const limit = clamp(num(c.req.query("limit"), 40), 1, 100);
  const offset = clamp(num(c.req.query("offset"), 0), 0, 10_000);
  const rows = await db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM server_members sm WHERE sm.user_id = u.id) as server_count FROM users u
       ${q ? "WHERE u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?" : ""}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []), limit, offset)
    .all<Record<string, unknown>>();
  const badgeMap = await badgesFor(db, rows.results.map((r) => String(r.id)));
  return c.json({
    users: rows.results.map((r) => ({
      ...decorate(r, badgeMap.get(String(r.id)) ?? []),
      email: r.email,
      platformRole: r.platform_role,
      serverCount: r.server_count,
      banned: !!r.platform_banned,
      banReason: r.platform_ban_reason,
    })),
  });
});

owner.patch("/users/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const targetId = c.req.param("id");
  const target = await db.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<Record<string, unknown>>();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.is_owner && target.id !== me.id)
    return c.json({ error: "The owner account is protected and cannot be modified." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  if ("isOwner" in body || "owner" in body || body.platformRole === "owner")
    return c.json({ error: "Owner status cannot be granted through the API." }, 403);

  const sets: string[] = [];
  const args: unknown[] = [];
  let nextRole: string | null = null;
  if (body.platformRole !== undefined) {
    const role = str(body.platformRole, 20);
    if (!PLATFORM_ROLES.has(role)) return bad(c, "Invalid platform role.");
    if (target.id === me.id) return bad(c, "You cannot change your own platform role.");
    nextRole = role;
    sets.push("platform_role = ?");
    args.push(role);
    await audit(db, {
      actorId: me.id,
      action: "staff.role.update",
      targetType: "user",
      targetId,
      meta: { role },
    });
  }
  if (body.banned !== undefined) {
    if (target.id === me.id) return bad(c, "You cannot suspend your own account.");
    const banned = body.banned === true || body.banned === 1;
    sets.push("platform_banned = ?");
    args.push(banned ? 1 : 0);
    sets.push("platform_ban_reason = ?");
    args.push(banned ? str(body.banReason, 300) || "Platform rules violation" : null);
    if (banned) await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
    await audit(db, {
      actorId: me.id,
      action: banned ? "platform.user.ban" : "platform.user.unban",
      targetType: "user",
      targetId,
      meta: { reason: str(body.banReason, 300) },
    });
    await notify(db, {
      userId: targetId,
      kind: "platform",
      title: banned ? "Your ZUNO account was suspended" : "Your ZUNO account was restored",
      body: banned ? str(body.banReason, 300) || "Platform rules violation" : "Welcome back. Please follow the community guidelines.",
    });
    await emit(db, "user", targetId, "account.update", { banned });
  }
  if (body.plusMonths !== undefined) {
    const months = clamp(num(body.plusMonths, 0), 0, 12);
    if (months > 0) {
      const currentUntil = Number(target.plus_until ?? 0);
      const base = currentUntil > now() ? currentUntil : now();
      const until = base + months * 30 * 24 * 60 * 60 * 1000;
      sets.push("plus_until = ?");
      args.push(until);
      await db
        .prepare(
          `INSERT INTO plus_subscriptions (user_id, provider, status, source, current_period_end, updated_at)
           VALUES (?, 'complimentary', 'active', 'complimentary', ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET status = 'active', source = 'complimentary', current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
        )
        .bind(targetId, until, now())
        .run();
      await db
        .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, 'plus', ?, ?)")
        .bind(targetId, me.id, now())
        .run();
      await notify(db, {
        userId: targetId,
        kind: "plus",
        title: "Complimentary ZUNO PLUS applied",
        body: `${months} month${months === 1 ? "" : "s"} of PLUS was applied to your account by the ZUNO team.`,
      });
      await emit(db, "user", targetId, "plus.update", { active: true, until });
      await audit(db, {
        actorId: me.id,
        action: "plus.grant.complimentary",
        targetType: "user",
        targetId,
        meta: { months },
      });
    }
  }
  if (!sets.length) return bad(c, "Nothing to update.");
  args.push(targetId);
  await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  if (nextRole) await syncRoleBadge(db, targetId, nextRole, me.id);
  const updated = await db.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<Record<string, unknown>>();
  return c.json({ user: decorate(updated!, (await badgesFor(db, [targetId])).get(targetId) ?? []) });
});

// Permanently removes an account. The owner account is untouchable, staff cannot
// remove themselves, and everything the member owned goes with them.
owner.delete("/users/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const targetId = c.req.param("id");
  const target = await db.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<Record<string, unknown>>();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.is_owner === 1) return c.json({ error: "The owner account can never be deleted." }, 403);
  if (targetId === me.id) return bad(c, "You cannot remove your own account.");

  // Servers the member owned disappear with the account.
  const owned = await db.prepare("SELECT id FROM servers WHERE owner_id = ?").bind(targetId).all<{ id: string }>();
  for (const server of owned.results) await purgeServer(db, server.id);

  // Uploads: drop the stored objects first, then the rows.
  const uploads = await db.prepare("SELECT key FROM files WHERE owner_id = ?").bind(targetId).all<{ key: string }>();
  if (c.env.FILES) {
    for (const file of uploads.results) {
      try {
        await c.env.FILES.delete(file.key);
      } catch {
        /* object may already be gone */
      }
    }
  }

  // Conversations they were part of: group DMs keep their other members, while a
  // 1:1 thread that has nobody left is removed so no ghost chat stays behind.
  const dmChannels = await db
    .prepare(
      `SELECT c.id, c.type FROM channels c JOIN dm_members dm ON dm.channel_id = c.id
       WHERE dm.user_id = ? AND c.type IN ('dm','group')`,
    )
    .bind(targetId)
    .all<{ id: string; type: string }>();

  const direct = [
    "DELETE FROM files WHERE owner_id = ?",
    "DELETE FROM sessions WHERE user_id = ?",
    "DELETE FROM user_badges WHERE user_id = ?",
    "DELETE FROM server_members WHERE user_id = ?",
    "DELETE FROM member_roles WHERE user_id = ?",
    "DELETE FROM dm_members WHERE user_id = ?",
    "DELETE FROM reactions WHERE user_id = ?",
    "DELETE FROM read_states WHERE user_id = ?",
    "DELETE FROM blocks WHERE user_id = ? OR blocked_id = ?",
    "DELETE FROM friendships WHERE user_id = ? OR friend_id = ?",
    "DELETE FROM friend_requests WHERE from_user = ? OR to_user = ?",
    "DELETE FROM notifications WHERE user_id = ?",
    "DELETE FROM voice_states WHERE user_id = ?",
    "DELETE FROM plus_subscriptions WHERE user_id = ?",
    "DELETE FROM server_folders WHERE user_id = ?",
    "DELETE FROM server_layout WHERE user_id = ?",
    "DELETE FROM announcements WHERE author_id = ? AND scope = 'platform'",
  ];
  for (const sql of direct) {
    const twice = (sql.match(/\?/g) ?? []).length === 2;
    await db.prepare(sql).bind(...(twice ? [targetId, targetId] : [targetId])).run();
  }

  for (const channel of dmChannels.results) {
    const id = channel.id;
    const left = await db.prepare("SELECT COUNT(*) as n FROM dm_members WHERE channel_id = ?").bind(id).first<{ n: number }>();
    const survivors = left?.n ?? 0;
    // A one-to-one thread needs both people; a group chat survives while anyone is left.
    if (channel.type === "dm" ? survivors >= 2 : survivors > 0) continue;
    await db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(id).run();
    await db.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(id).run();
    await db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(id).run();
    await db.prepare("DELETE FROM read_states WHERE channel_id = ?").bind(id).run();
    await db.prepare("DELETE FROM channels WHERE id = ?").bind(id).run();
  }

  // Their chat history becomes "message deleted", so replies and threads stay intact.
  await db
    .prepare("UPDATE messages SET content = '', sticker = NULL, gif_url = NULL, deleted_at = ? WHERE author_id = ? AND deleted_at IS NULL")
    .bind(now(), targetId)
    .run();

  await db.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();

  await audit(db, {
    actorId: me.id,
    action: "platform.user.delete",
    targetType: "user",
    targetId,
    meta: {
      username: target.username,
      email: target.email,
      servers: owned.results.length,
      uploads: uploads.results.length,
    },
  });
  return c.json({ ok: true, serversRemoved: owned.results.length });
});

owner.post("/users/:id/badges", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const targetId = c.req.param("id");
  const body = await readJson<Record<string, unknown>>(c);
  const slug = str(body.slug, 40);
  const grant = body.grant !== false;
  const badge = await db
    .prepare("SELECT * FROM badges WHERE slug = ?")
    .bind(slug)
    .first<{ slug: string; automatic: number; name: string; unique_flag: number }>();
  if (!badge) return c.json({ error: "Unknown badge." }, 404);
  if (badge.slug === "owner")
    return c.json({ error: "The ZUNO OWNER badge is tied to owner status and cannot be assigned manually." }, 403);
  const target = await db.prepare("SELECT id, is_owner FROM users WHERE id = ?").bind(targetId).first<{ id: string; is_owner: number }>();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (grant) {
    if (badge.automatic === 1 && badge.slug === "plus")
      return c.json({ error: "The PLUS badge is granted automatically with an active membership." }, 400);
    if (badge.unique_flag === 1) {
      const holder = await db
        .prepare("SELECT user_id FROM user_badges WHERE badge_slug = ?")
        .bind(slug)
        .first<{ user_id: string }>();
      if (holder && holder.user_id !== targetId)
        return c.json({ error: `${badge.name} is a 1 of 1 badge and already belongs to another member.` }, 409);
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, ?, ?, ?)",
      )
      .bind(targetId, slug, me.id, now())
      .run();
    await notify(db, {
      userId: targetId,
      kind: "badge",
      title: `You earned the ${badge.name} badge`,
      body: "It now appears on your profile, messages and member cards.",
    });
  } else {
    await db.prepare("DELETE FROM user_badges WHERE user_id = ? AND badge_slug = ?").bind(targetId, slug).run();
  }
  await audit(db, {
    actorId: me.id,
    action: grant ? "badge.grant" : "badge.revoke",
    targetType: "user",
    targetId,
    meta: { badge: slug },
  });
  await emit(db, "user", targetId, "badge.update", { slug, grant });
  return c.json({ ok: true, badges: (await badgesFor(db, [targetId])).get(targetId) ?? [] });
});

owner.post("/badges", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 40);
  if (!name) return bad(c, "Give the badge a name.");
  const art = str(body.art, 24);
  if (!BADGE_ART_KEYS.has(art)) return bad(c, "Pick a badge artwork.");
  const color = str(body.color, 9);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return bad(c, "Invalid colour.");
  const unique = body.unique === true;
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "badge";
  const slug = `custom-${base}-${uid().slice(0, 4)}`;
  await db
    .prepare(
      "INSERT INTO badges (slug, name, description, color, glyph, art, unique_flag, premium, automatic, sort) VALUES (?, ?, ?, ?, 'sparkles', ?, ?, 0, 0, 20)",
    )
    .bind(slug, name, str(body.description, 200) || null, color, art, unique ? 1 : 0)
    .run();
  await audit(db, { actorId: me.id, action: "badge.create", targetType: "badge", targetId: slug, meta: { name, art, unique } });
  const created = await db.prepare("SELECT * FROM badges WHERE slug = ?").bind(slug).first<Record<string, unknown>>();
  return c.json({ badge: { ...created, assigned: 0 } });
});

owner.get("/badges", async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare("SELECT * FROM badges ORDER BY sort DESC").all<Record<string, unknown>>();
  const assigned = await db
    .prepare("SELECT badge_slug, COUNT(*) as n FROM user_badges GROUP BY badge_slug")
    .all<{ badge_slug: string; n: number }>();
  const counts = new Map(assigned.results.map((r) => [r.badge_slug, r.n]));
  return c.json({
    badges: rows.results.map((b) => ({ ...b, assigned: counts.get(String(b.slug)) ?? 0 })),
  });
});

owner.patch("/badges/:slug", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const slug = c.req.param("slug");
  const badge = await db.prepare("SELECT * FROM badges WHERE slug = ?").bind(slug).first<Record<string, unknown>>();
  if (!badge) return c.json({ error: "Badge not found." }, 404);
  const body = await readJson<Record<string, unknown>>(c);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined) {
    const name = str(body.name, 40);
    if (!name) return bad(c, "Badge needs a name.");
    sets.push("name = ?");
    args.push(name);
  }
  if (body.description !== undefined) {
    sets.push("description = ?");
    args.push(str(body.description, 200) || null);
  }
  if (body.color !== undefined) {
    const color = str(body.color, 9);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return bad(c, "Invalid colour.");
    sets.push("color = ?");
    args.push(color);
  }
  if (body.art !== undefined) {
    const art = str(body.art, 24);
    if (!BADGE_ART_KEYS.has(art)) return bad(c, "Unknown badge artwork.");
    sets.push("art = ?");
    args.push(art);
  }
  if (body.sort !== undefined) {
    sets.push("sort = ?");
    args.push(clamp(num(body.sort, Number(badge.sort)), 0, 1000));
  }
  if (body.premium !== undefined) {
    sets.push("premium = ?");
    args.push(body.premium ? 1 : 0);
  }
  if (!sets.length) return bad(c, "Nothing to update.");
  args.push(slug);
  await db.prepare(`UPDATE badges SET ${sets.join(", ")} WHERE slug = ?`).bind(...args).run();
  await audit(db, { actorId: me.id, action: "badge.update", targetType: "badge", targetId: slug });
  return c.json({ ok: true });
});

owner.get("/reports", async (c) => {
  const db = c.env.DB;
  const status = c.req.query("status");
  const rows = await db
    .prepare(
      `SELECT r.*, rep.username as reporter_username, tgt.username as target_username, tgt.display_name as target_display,
        s.name as server_name FROM reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id LEFT JOIN users tgt ON tgt.id = r.target_user_id
       LEFT JOIN servers s ON s.id = r.server_id
       ${status ? "WHERE r.status = ?" : ""} ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(...(status ? [status] : []))
    .all<Record<string, unknown>>();
  return c.json({
    reports: rows.results.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
      reporterId: r.reporter_id,
      reporterName: r.reporter_username,
      targetId: r.target_user_id,
      targetName: r.target_display || r.target_username,
      serverId: r.server_id,
      serverName: r.server_name,
      messageId: r.message_id,
      resolution: r.resolution,
    })),
  });
});

owner.patch("/reports/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const status = str(body.status, 20);
  if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) return bad(c, "Invalid report status.");
  const report = await db.prepare("SELECT * FROM reports WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!report) return c.json({ error: "Report not found" }, 404);
  await db
    .prepare("UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
    .bind(status, str(body.resolution, 500) || null, me.id, now(), report.id)
    .run();
  await notify(db, {
    userId: String(report.reporter_id),
    kind: "report",
    title: "Your report was reviewed",
    body: `Status: ${status}. ${str(body.resolution, 300)}`.trim(),
  });
  await audit(db, {
    actorId: me.id,
    action: "report.review",
    targetType: "report",
    targetId: String(report.id),
    meta: { status, resolution: str(body.resolution, 300) },
  });
  return c.json({ ok: true });
});

owner.get("/appeals", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name, u.platform_banned FROM appeals a
       JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 100`,
    )
    .all<Record<string, unknown>>();
  return c.json({
    appeals: rows.results.map((a) => ({
      id: a.id,
      reason: a.reason,
      status: a.status,
      createdAt: a.created_at,
      userId: a.user_id,
      username: a.username,
      displayName: a.display_name,
      banned: !!a.platform_banned,
      reviewNote: a.review_note,
    })),
  });
});

owner.patch("/appeals/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const status = str(body.status, 20);
  if (!["approved", "denied", "open"].includes(status)) return bad(c, "Invalid appeal status.");
  const appeal = await db.prepare("SELECT * FROM appeals WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!appeal) return c.json({ error: "Appeal not found" }, 404);
  const note = str(body.note, 600);
  await db
    .prepare("UPDATE appeals SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .bind(status, note || null, me.id, now(), appeal.id)
    .run();
  if (status === "approved") {
    await db.prepare("UPDATE users SET platform_banned = 0, platform_ban_reason = NULL WHERE id = ?").bind(appeal.user_id).run();
  }
  await notify(db, {
    userId: String(appeal.user_id),
    kind: "appeal",
    title: `Appeal ${status}`,
    body: note || (status === "approved" ? "Your account has been restored." : "Your appeal was reviewed."),
  });
  await audit(db, {
    actorId: me.id,
    action: "appeal.review",
    targetType: "appeal",
    targetId: String(appeal.id),
    meta: { status },
  });
  return c.json({ ok: true });
});

owner.get("/applications", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT sa.*, u.username, u.display_name, u.platform_role FROM staff_applications sa
       JOIN users u ON u.id = sa.user_id WHERE sa.status = 'pending' ORDER BY sa.created_at DESC LIMIT 100`,
    )
    .all<Record<string, unknown>>();
  return c.json({
    applications: rows.results.map((a) => ({
      id: a.id,
      position: a.position,
      why: a.why,
      experience: a.experience,
      status: a.status,
      createdAt: a.created_at,
      userId: a.user_id,
      username: a.username,
      displayName: a.display_name,
      platformRole: a.platform_role,
      reviewNote: a.review_note,
    })),
  });
});

owner.patch("/applications/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const status = str(body.status, 20);
  if (!["accepted", "denied", "pending"].includes(status)) return bad(c, "Invalid application status.");
  const app = await db.prepare("SELECT * FROM staff_applications WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!app) return c.json({ error: "Application not found" }, 404);
  if (app.status !== "pending") return c.json({ error: "This application has already been reviewed." }, 409);
  const note = str(body.note, 600);
  const grantRole = str(body.platformRole, 20);
  await db
    .prepare("UPDATE staff_applications SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .bind(status, note || null, me.id, now(), app.id)
    .run();
  if (status === "accepted" && PLATFORM_ROLES.has(grantRole) && grantRole !== "user") {
    await db.prepare("UPDATE users SET platform_role = ? WHERE id = ?").bind(grantRole, app.user_id).run();
    await syncRoleBadge(db, String(app.user_id), grantRole, me.id);
  }
  await notify(db, {
    userId: String(app.user_id),
    kind: "staff",
    title: `Staff application ${status}`,
    body: note || "The ZUNO team reviewed your application.",
  });
  await emit(db, "user", String(app.user_id), "account.update", {});
  await audit(db, {
    actorId: me.id,
    action: "staff.application.review",
    targetType: "application",
    targetId: String(app.id),
    meta: { status, role: grantRole },
  });
  return c.json({ ok: true });
});

owner.get("/servers", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT s.*, u.username as owner_username,
        (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) as members,
        (SELECT COUNT(*) FROM messages msg JOIN channels ch ON ch.id = msg.channel_id WHERE ch.server_id = s.id) as messages
       FROM servers s LEFT JOIN users u ON u.id = s.owner_id ORDER BY s.created_at DESC LIMIT 100`,
    )
    .all<Record<string, unknown>>();
  return c.json({
    servers: rows.results.map((s) => ({
      id: s.id,
      name: s.name,
      iconId: s.icon_id,
      ownerId: s.owner_id,
      ownerName: s.owner_username,
      isPublic: !!s.is_public,
      memberCount: s.members,
      messageCount: s.messages,
      createdAt: s.created_at,
    })),
  });
});

owner.delete("/servers/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!server) return c.json({ error: "Server not found" }, 404);
  await purgeServer(db, String(server.id));
  await audit(db, {
    actorId: me.id,
    action: "platform.server.delete",
    targetType: "server",
    targetId: String(server.id),
    meta: { name: server.name },
  });
  return c.json({ ok: true });
});

owner.get("/audit", async (c) => {
  const db = c.env.DB;
  const q = (c.req.query("q") || "").trim().slice(0, 60);
  const rows = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name, s.name as server_name FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN servers s ON s.id = a.server_id
       ${q ? "WHERE a.action LIKE ? OR u.username LIKE ? OR s.name LIKE ?" : ""}
       ORDER BY a.created_at DESC LIMIT 150`,
    )
    .bind(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []))
    .all<Record<string, unknown>>();
  return c.json({
    entries: rows.results.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.display_name || a.username || "System",
      serverName: a.server_name,
      targetType: a.target_type,
      targetId: a.target_id,
      meta: a.meta,
      createdAt: a.created_at,
    })),
  });
});

owner.post("/announcements", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const title = str(body.title, 120);
  const text = str(body.body, 3000);
  if (!title || !text) return bad(c, "Announcement needs a title and body.");
  const id = uid();
  await db
    .prepare("INSERT INTO announcements (id, scope, server_id, author_id, title, body, created_at) VALUES (?, 'platform', NULL, ?, ?, ?, ?)")
    .bind(id, me.id, title, text, now())
    .run();
  const users = await db.prepare("SELECT id FROM users WHERE id != ? LIMIT 500").bind(me.id).all<{ id: string }>();
  for (const u of users.results) {
    await notify(db, {
      userId: u.id,
      kind: "announcement",
      title: `ZUNO: ${title}`,
      body: text.slice(0, 160),
      actorId: me.id,
    });
    await emit(db, "user", u.id, "announcement", { id });
  }
  await audit(db, { actorId: me.id, action: "platform.announcement", targetType: "announcement", targetId: id, meta: { title } });
  return c.json({ ok: true, id });
});

owner.get("/announcements", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name, s.name as server_name FROM announcements a
       LEFT JOIN users u ON u.id = a.author_id LEFT JOIN servers s ON s.id = a.server_id
       ORDER BY a.created_at DESC LIMIT 50`,
    )
    .all<Record<string, unknown>>();
  return c.json({
    announcements: rows.results.map((a) => ({
      id: a.id,
      scope: a.scope,
      title: a.title,
      body: a.body,
      authorName: a.display_name || a.username,
      serverName: a.server_name,
      createdAt: a.created_at,
    })),
  });
});

owner.delete("/announcements/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  await db.prepare("DELETE FROM announcements WHERE id = ?").bind(c.req.param("id")).run();
  await audit(db, { actorId: me.id, action: "platform.announcement.delete", targetType: "announcement", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

owner.get("/config", async (c) => {
  return c.json({ config: await getConfig(c.env) });
});

owner.patch("/config", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const allowed = [
    "site_name",
    "tagline",
    "registration_open",
    "discovery_enabled",
    "maintenance_mode",
    "maintenance_message",
    "plus_price_label",
    "invite_only",
  ];
  const changed: string[] = [];
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    let value = String(body[key]);
    if (["registration_open", "discovery_enabled", "maintenance_mode", "invite_only"].includes(key)) {
      value = value === "true" || value === "1" ? "true" : "false";
    } else {
      value = value.slice(0, 400);
    }
    await setConfig(c.env, key, value);
    changed.push(key);
  }
  if (!changed.length) return bad(c, "Nothing to update.");
  await audit(db, { actorId: me.id, action: "platform.config.update", targetType: "config", meta: { changed } });
  return c.json({ ok: true, config: await getConfig(c.env) });
});

owner.get("/plus", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT p.*, u.username, u.display_name, u.email, u.is_owner FROM plus_subscriptions p JOIN users u ON u.id = p.user_id
       ORDER BY p.updated_at DESC LIMIT 100`,
    )
    .all<Record<string, unknown>>();
  return c.json({
    subscriptions: rows.results.map((p) => ({
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name,
      email: p.email,
      isOwner: p.is_owner === 1,
      provider: p.provider,
      status: p.status,
      source: p.source,
      currentPeriodEnd: p.current_period_end,
      updatedAt: p.updated_at,
    })),
  });
});

owner.delete("/plus/:userId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const userId = c.req.param("userId");
  if (userId === me.id) return bad(c, "You cannot revoke your own PLUS benefits.");
  await db.prepare("UPDATE users SET plus_until = ? WHERE id = ?").bind(now(), userId).run();
  await db.prepare("DELETE FROM plus_subscriptions WHERE user_id = ? AND source = 'complimentary'").bind(userId).run();
  await notify(db, {
    userId,
    kind: "plus",
    title: "ZUNO PLUS removed",
    body: "A team member removed the complimentary PLUS benefits from your account.",
  });
  await emit(db, "user", userId, "plus.update", { active: false });
  await audit(db, { actorId: me.id, action: "plus.revoke", targetType: "user", targetId: userId });
  return c.json({ ok: true });
});

owner.get("/staff", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT id, username, display_name, avatar_id, accent_color, platform_role, is_owner, plus_until, last_seen_at, created_at
       FROM users WHERE platform_role != 'user' OR is_owner = 1 ORDER BY is_owner DESC, platform_role`,
    )
    .all<Record<string, unknown>>();
  const badgeMap = await badgesFor(db, rows.results.map((r) => String(r.id)));
  return c.json({
    staff: rows.results.map((r) => decorate(r, badgeMap.get(String(r.id)) ?? [])),
  });
});

/* ------------------------------- QUESTS ------------------------------- */

const QUEST_CATEGORIES = new Set(["daily", "weekly", "beginner", "event"]);
const QUEST_DIFFICULTIES = new Set(["easy", "medium", "hard", "elite"]);
// Only methods the server can actually check on its own are offered.
const QUEST_VERIFICATIONS = new Set([
  "login",
  "group_membership",
  "community",
  "referral",
  "game_visit",
  "milestone",
  "manual",
]);

interface QuestInput {
  title: string;
  description: string;
  instructions: string;
  category: string;
  difficulty: string;
  xp: number;
  badge: string | null;
  verification: string;
  target: string;
  link: string;
  repeatable: number;
  cooldownHours: number;
  active: number;
  startsAt: number | null;
  endsAt: number | null;
  sort: number;
}

function readQuest(body: Record<string, unknown>): { values: QuestInput } | { error: string } {
  const title = str(body.title, 90);
  if (title.length < 3) return { error: "Give the quest a title (at least 3 characters)." };
  const category = str(body.category, 20) || "daily";
  if (!QUEST_CATEGORIES.has(category)) return { error: "Unknown quest category." };
  const difficulty = str(body.difficulty, 20) || "easy";
  if (!QUEST_DIFFICULTIES.has(difficulty)) return { error: "Unknown difficulty." };
  const verification = str(body.verification, 30) || "manual";
  if (!QUEST_VERIFICATIONS.has(verification)) return { error: "Unknown verification method." };
  const xp = clamp(num(body.xp, 50), 1, 5000);
  const link = str(body.link, 300);
  if (link && !/^https?:\/\//i.test(link)) return { error: "Quest links must start with http:// or https://." };
  const startsAt = body.startsAt === null || body.startsAt === undefined || body.startsAt === "" ? null : num(body.startsAt, 0) || null;
  const endsAt = body.endsAt === null || body.endsAt === undefined || body.endsAt === "" ? null : num(body.endsAt, 0) || null;
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "The end date must be after the start date." };
  const badge = str(body.badge, 40) || null;
  return {
    values: {
      title,
      description: str(body.description, 600),
      instructions: str(body.instructions, 1200),
      category,
      difficulty,
      xp,
      badge,
      verification,
      target: str(body.target, 120),
      link,
      repeatable: bool(body.repeatable) ? 1 : 0,
      cooldownHours: clamp(num(body.cooldownHours, 24), 1, 8760),
      active: body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
      startsAt,
      endsAt,
      sort: clamp(num(body.sort, 0), -1000, 1000),
    },
  };
}

owner.get("/quests", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT q.*,
         (SELECT COUNT(*) FROM quest_claims c WHERE c.quest_id = q.id AND c.status = 'verified') AS verified_count,
         (SELECT COUNT(*) FROM quest_claims c WHERE c.quest_id = q.id AND c.status = 'pending') AS pending_count,
         (SELECT COALESCE(SUM(c.xp_awarded), 0) FROM quest_claims c WHERE c.quest_id = q.id) AS xp_paid
       FROM quests q ORDER BY q.sort DESC, q.created_at DESC`,
    )
    .all<Record<string, unknown>>();
  const totals = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM quest_claims WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM quest_claims WHERE status = 'verified') AS verified,
         (SELECT COALESCE(SUM(amount), 0) FROM quest_xp) AS xp,
         (SELECT COUNT(*) FROM roblox_links WHERE verified_at IS NOT NULL) AS roblox,
         (SELECT COUNT(*) FROM referrals WHERE credited = 1) AS referrals`,
    )
    .first<Record<string, number>>();
  return c.json({
    quests: rows.results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      category: row.category,
      difficulty: row.difficulty,
      xp: row.xp,
      badge: row.badge_slug,
      verification: row.verification,
      target: row.target,
      link: row.link,
      repeatable: !!row.repeatable,
      cooldownHours: row.cooldown_hours,
      active: !!row.active,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      sort: row.sort,
      verifiedCount: row.verified_count ?? 0,
      pendingCount: row.pending_count ?? 0,
      xpPaid: row.xp_paid ?? 0,
    })),
    totals: {
      pending: totals?.pending ?? 0,
      verified: totals?.verified ?? 0,
      xp: totals?.xp ?? 0,
      robloxLinks: totals?.roblox ?? 0,
      referrals: totals?.referrals ?? 0,
    },
  });
});

owner.post("/quests", async (c) => {
  const me = c.get("user");
  const db = c.env.DB;
  const parsed = readQuest(await readJson<Record<string, unknown>>(c));
  if ("error" in parsed) return bad(c, parsed.error);
  const v = parsed.values;
  const id = `q_${uid().slice(0, 8)}`;
  const t = now();
  await db.prepare(
    `INSERT INTO quests (id, title, description, instructions, category, difficulty, xp, badge_slug, verification, target, link, repeatable, cooldown_hours, active, starts_at, ends_at, sort, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      v.title,
      v.description,
      v.instructions,
      v.category,
      v.difficulty,
      v.xp,
      v.badge,
      v.verification,
      v.target,
      v.link,
      v.repeatable,
      v.cooldownHours,
      v.active,
      v.startsAt,
      v.endsAt,
      v.sort,
      me.id,
      t,
      t,
    )
    .run();
  await audit(db, { actorId: me.id, action: "quest.create", targetType: "quest", targetId: id, meta: { title: v.title } });
  return c.json({ ok: true, id });
});

owner.patch("/quests/:id", async (c) => {
  const me = c.get("user");
  const db = c.env.DB;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM quests WHERE id = ?").bind(id).first();
  if (!existing) return bad(c, "That quest no longer exists.", 404);
  const parsed = readQuest(await readJson<Record<string, unknown>>(c));
  if ("error" in parsed) return bad(c, parsed.error);
  const v = parsed.values;
  await c.env.DB.prepare(
    `UPDATE quests SET title = ?, description = ?, instructions = ?, category = ?, difficulty = ?, xp = ?, badge_slug = ?,
       verification = ?, target = ?, link = ?, repeatable = ?, cooldown_hours = ?, active = ?, starts_at = ?, ends_at = ?, sort = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      v.title,
      v.description,
      v.instructions,
      v.category,
      v.difficulty,
      v.xp,
      v.badge,
      v.verification,
      v.target,
      v.link,
      v.repeatable,
      v.cooldownHours,
      v.active,
      v.startsAt,
      v.endsAt,
      v.sort,
      now(),
      id,
    )
    .run();
  await audit(db, { actorId: me.id, action: "quest.update", targetType: "quest", targetId: id, meta: { title: v.title } });
  return c.json({ ok: true, id });
});

owner.delete("/quests/:id", async (c) => {
  const me = c.get("user");
  const id = c.req.param("id");
  const db = c.env.DB;
  const quest = await db.prepare("SELECT title FROM quests WHERE id = ?").bind(id).first<{ title: string }>();
  if (!quest) return bad(c, "That quest no longer exists.", 404);
  await db.batch([
    db.prepare("DELETE FROM quest_claims WHERE quest_id = ?").bind(id),
    db.prepare("DELETE FROM quests WHERE id = ?").bind(id),
  ]);
  await audit(db, { actorId: me.id, action: "quest.delete", targetType: "quest", targetId: id, meta: { title: quest.title } });
  return c.json({ ok: true });
});

owner.get("/quests/reviews", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.quest_id, c.user_id, c.evidence, c.submitted_at, c.review_note,
            q.title AS quest_title, q.xp, q.category, u.username, u.display_name, u.avatar_id
     FROM quest_claims c
     JOIN quests q ON q.id = c.quest_id
     JOIN users u ON u.id = c.user_id
     WHERE c.status = 'pending' ORDER BY c.submitted_at ASC LIMIT 100`,
  ).all<Record<string, unknown>>();
  return c.json({
    reviews: rows.results.map((row) => ({
      id: row.id,
      questId: row.quest_id,
      questTitle: row.quest_title,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarId: row.avatar_id,
      evidence: row.evidence,
      note: row.review_note,
      xp: row.xp,
      submittedAt: row.submitted_at,
    })),
  });
});

owner.post("/quests/reviews/:id", async (c) => {
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const approve = str(body.action, 20) === "approve";
  const note = str(body.note, 300);
  const result = await reviewClaim(c.env, c.req.param("id"), me.id, approve, note);
  if (!result.ok) return bad(c, result.error, 409);
  await audit(c.env.DB, {
    actorId: me.id,
    action: approve ? "quest.approve" : "quest.reject",
    targetType: "quest_claim",
    targetId: c.req.param("id"),
  });
  return c.json({ ok: true, status: result.status });
});
