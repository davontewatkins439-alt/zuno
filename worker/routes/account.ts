import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { createSession, destroySession, hashPassword, rateLimit, verifyPassword } from "../auth";
import { getConfig } from "../db";
import { grantOwnerPlus } from "./plus";
import { accentFor, bad, clamp, effectiveStatus, jsonArray, now, parseIdList, readJson, str, uid } from "../lib";
import { audit, emit, notify, P } from "../perms";
import {
  badgesFor,
  channelUnread,
  decorate,
  getOrCreateDm,
  myDms,
  myServers,
  unreadTotals,
  userByEmail,
  userById,
  userByUsername,
} from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const account = new Hono<Ctx>();

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATUSES = new Set(["online", "idle", "dnd", "invisible"]);

function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0] || "local";
}

export async function mePayload(db: D1Database, user: Record<string, unknown>, env: Env) {
  const badgeMap = await badgesFor(db, [String(user.id)]);
  const servers = await myServers(db, String(user.id), String(user.username));
  const dms = await myDms(db, String(user.id));
  const totals = await unreadTotals(db, String(user.id));
  const folders = await db
    .prepare("SELECT id, name, color, position FROM server_folders WHERE user_id = ? ORDER BY position ASC")
    .bind(user.id)
    .all<{ id: string; name: string; color: string; position: number }>();
  const config = await getConfig(env);
  const plus = await db
    .prepare("SELECT * FROM plus_subscriptions WHERE user_id = ?")
    .bind(user.id)
    .first<Record<string, unknown>>();
  const announcements = await db
    .prepare(
      `SELECT a.*, u.username, u.display_name FROM announcements a JOIN users u ON u.id = a.author_id
       WHERE a.scope = 'platform' ORDER BY a.created_at DESC LIMIT 5`,
    )
    .all<Record<string, unknown>>();
  return {
    user: decorate(user, badgeMap.get(String(user.id)) ?? []),
    servers,
    dms: dms.filter((d) => !d.isRequest),
    requests: dms.filter((d) => d.isRequest),
    folders: folders.results,
    totals,
    plus: {
      configured: !!env.STRIPE_SECRET_KEY && !!env.STRIPE_PLUS_PRICE_ID,
      priceLabel: config.plus_price_label || "$4.99 / month",
      subscription: plus
        ? {
            provider: plus.provider,
            status: plus.status,
            source: plus.source,
            currentPeriodEnd: plus.current_period_end,
          }
        : null,
    },
    config: {
      siteName: config.site_name || "ZUNO",
      tagline: config.tagline || "Your city after dark.",
      registrationOpen: config.registration_open !== "false",
      discoveryEnabled: config.discovery_enabled !== "false",
      maintenance: config.maintenance_mode === "true",
      maintenanceMessage: config.maintenance_message || "",
      inviteOnly: config.invite_only === "true",
    },
    announcements: announcements.results.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      authorName: a.display_name || a.username,
      createdAt: a.created_at,
    })),
  };
}

async function grantBadge(db: D1Database, userId: string, slug: string, actorId: string | null) {
  await db
    .prepare(
      "INSERT INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, badge_slug) DO NOTHING",
    )
    .bind(userId, slug, actorId, now())
    .run();
}

account.post("/register", async (c) => {
  const db = c.env.DB;
  const body = await readJson<Record<string, unknown>>(c);
  const email = str(body.email, 160).toLowerCase();
  const username = str(body.username, 24);
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = str(body.displayName, 32);
  const config = await getConfig(c.env);
  if (config.registration_open === "false") return bad(c, "Registration is currently closed.", 403);
  if (!EMAIL_RE.test(email)) return bad(c, "Enter a valid email address.");
  if (!USERNAME_RE.test(username)) return bad(c, "Username must be 3-20 characters: letters, numbers, dot or underscore.");
  if (password.length < 8) return bad(c, "Password must be at least 8 characters.");
  if (password.length > 200) return bad(c, "Password is too long.");
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(db, `register:${ip}`, 20, 60 * 60 * 1000)))
    return bad(c, "Too many sign-ups from this network. Try again later.", 429);
  if (await userByEmail(db, email)) return bad(c, "An account with that email already exists.");
  if (await userByUsername(db, username)) return bad(c, "That username is taken.");

  const isOwnerEmail = !!c.env.OWNER_EMAIL && email === c.env.OWNER_EMAIL.toLowerCase();
  if (c.env.OWNER_EMAIL) {
    const ownerExists = await db.prepare("SELECT id FROM users WHERE is_owner = 1 LIMIT 1").first();
    if (ownerExists && isOwnerEmail) {
      return bad(c, "The owner account already exists for this deployment.");
    }
  }
  const id = uid();
  const created = now();
  await db
    .prepare(
      `INSERT INTO users (id, email, username, display_name, password_hash, accent_color, status, last_seen_at, created_at, is_owner, platform_role)
       VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      email,
      username.toLowerCase(),
      displayName || username,
      await hashPassword(password),
      accentFor(id),
      created,
      created,
      isOwnerEmail ? 1 : 0,
      isOwnerEmail ? "owner" : "user",
    )
    .run();
  if (isOwnerEmail) {
    await grantBadge(db, id, "owner", null);
    await grantBadge(db, id, "verified", null);
    await grantOwnerPlus(db, id);
  } else {
    const count = await db.prepare("SELECT COUNT(*) as n FROM users").first<{ n: number }>();
    if ((count?.n ?? 0) <= 100) await grantBadge(db, id, "early_supporter", null);
  }
  await createSession(c, id);
  await audit(db, { actorId: id, action: "user.register", targetType: "user", targetId: id });
  const user = await userById(db, id);
  return c.json({ ...(await mePayload(db, user!, c.env)), ownerConfigured: !!(c.env.OWNER_EMAIL || "").length });
});

account.post("/login", async (c) => {
  const db = c.env.DB;
  const body = await readJson<Record<string, unknown>>(c);
  const email = str(body.email, 160).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return bad(c, "Email and password are required.");
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(db, `login:${ip}:${email}`, 10, 10 * 60 * 1000)))
    return bad(c, "Too many attempts. Wait a few minutes and try again.", 429);
  const user = await userByEmail(db, email);
  const ok = user ? await verifyPassword(password, String(user.password_hash)) : false;
  if (!user || !ok) return bad(c, "Invalid email or password.", 401);

  // Owner identity is bound to the server-side OWNER_EMAIL variable, never to client input.
  // If the configured owner registered before that variable was set, reconcile on sign-in.
  const ownerEmail = (c.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (ownerEmail && email === ownerEmail && Number(user.is_owner) !== 1) {
    await db.prepare("UPDATE users SET is_owner = 1, platform_role = 'owner' WHERE id = ?").bind(user.id).run();
    await grantBadge(db, String(user.id), "owner", null);
    await grantBadge(db, String(user.id), "verified", null);
    await grantOwnerPlus(db, String(user.id));
    await audit(db, {
      actorId: String(user.id),
      action: "owner.reconcile",
      targetType: "user",
      targetId: String(user.id),
    });
    user.is_owner = 1;
    user.platform_role = "owner";
  }
  if (Number(user.is_owner) === 1 && !Number(user.plus_until)) {
    const until = await grantOwnerPlus(db, String(user.id));
    user.plus_until = until;
  }

  await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now(), user.id).run();
  await createSession(c, String(user.id));
  return c.json(await mePayload(db, user, c.env));
});

account.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

account.get("/me", async (c) => {
  const user = c.get("user");
  const row = await userById(c.env.DB, user.id);
  if (!row) return c.json({ error: "Session expired" }, 401);
  return c.json(await mePayload(c.env.DB, row, c.env));
});

account.patch("/me", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const updates: string[] = [];
  const args: unknown[] = [];
  const set = (col: string, value: unknown) => {
    updates.push(`${col} = ?`);
    args.push(value);
  };

  if (body.displayName !== undefined) {
    const dn = str(body.displayName, 32);
    if (dn.length < 1) return bad(c, "Display name cannot be empty.");
    set("display_name", dn);
  }
  if (body.bio !== undefined) set("bio", str(body.bio, 240) || null);
  if (body.customStatus !== undefined) set("custom_status", str(body.customStatus, 80) || null);
  if (body.status !== undefined) {
    const status = str(body.status, 12);
    if (!STATUSES.has(status)) return bad(c, "Invalid status.");
    set("status", status);
    set("last_seen_at", now());
  }
  if (body.accentColor !== undefined) {
    const accent = str(body.accentColor, 9);
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return bad(c, "Invalid accent colour.");
    set("accent_color", accent);
  }
  if (body.avatarId !== undefined) {
    const fileId = str(body.avatarId, 64);
    if (fileId) {
      const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, user.id).first();
      if (!file) return bad(c, "Avatar upload not found.");
    }
    set("avatar_id", fileId || null);
  }
  if (body.bannerId !== undefined) {
    const fileId = str(body.bannerId, 64);
    if (fileId) {
      const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, user.id).first();
      if (!file) return bad(c, "Banner upload not found.");
    }
    set("banner_id", fileId || null);
  }
  if (body.plusTheme !== undefined || body.plusDecoration !== undefined) {
    const active = user.plus_until && user.plus_until > now();
    if (!active) return bad(c, "ZUNO PLUS is required for profile themes.", 403);
    if (body.plusTheme !== undefined) set("plus_theme", str(body.plusTheme, 24) || null);
    if (body.plusDecoration !== undefined) set("plus_decoration", str(body.plusDecoration, 24) || null);
  }
  if (!updates.length) return bad(c, "Nothing to update.");
  args.push(user.id);
  await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  const row = await userById(db, user.id);
  return c.json({ user: decorate(row!, (await badgesFor(db, [user.id])).get(user.id) ?? []) });
});

account.post("/presence", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const status = str(body.status, 12);
  if (status && STATUSES.has(status)) {
    await db.prepare("UPDATE users SET last_seen_at = ?, status = ? WHERE id = ?").bind(now(), status, user.id).run();
  } else {
    await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now(), user.id).run();
  }
  const totals = await unreadTotals(db, user.id);
  return c.json({ ok: true, totals });
});

account.get("/users/search", async (c) => {
  const db = c.env.DB;
  const q = (c.req.query("q") || "").trim().slice(0, 40);
  if (q.length < 1) return c.json({ users: [] });
  const rows = await db
    .prepare(
      "SELECT * FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND platform_banned = 0 ORDER BY last_seen_at DESC LIMIT 12",
    )
    .bind(`%${q}%`, `%${q}%`)
    .all<Record<string, unknown>>();
  const badgeMap = await badgesFor(db, rows.results.map((r) => String(r.id)));
  return c.json({ users: rows.results.map((r) => decorate(r, badgeMap.get(String(r.id)) ?? [])) });
});

account.get("/users/:id", async (c) => {
  const db = c.env.DB;
  const viewer = c.get("user");
  const row = await userById(db, c.req.param("id"));
  if (!row) return c.json({ error: "User not found" }, 404);
  const badgeMap = await badgesFor(db, [String(row.id)]);
  const mutual = await db
    .prepare(
      `SELECT s.id, s.name, s.icon_id, theirs.nickname FROM server_members mine
       JOIN server_members theirs ON theirs.server_id = mine.server_id AND theirs.user_id = ?
       JOIN servers s ON s.id = mine.server_id WHERE mine.user_id = ? LIMIT 12`,
    )
    .bind(row.id, viewer.id)
    .all<{ id: string; name: string; icon_id: string | null; nickname: string | null }>();
  const friend = await db
    .prepare("SELECT 1 as ok FROM friendships WHERE user_id = ? AND friend_id = ?")
    .bind(viewer.id, row.id)
    .first();
  const blocked = await db
    .prepare("SELECT 1 as ok FROM blocks WHERE user_id = ? AND blocked_id = ?")
    .bind(viewer.id, row.id)
    .first();
  const dm = await db
    .prepare(
      `SELECT c.id FROM channels c JOIN dm_members a ON a.channel_id = c.id AND a.user_id = ?
       JOIN dm_members b ON b.channel_id = c.id AND b.user_id = ? WHERE c.type = 'dm' LIMIT 1`,
    )
    .bind(viewer.id, row.id)
    .first<{ id: string }>();
  const servers = await db
    .prepare(
      `SELECT s.name, r.name as role_name, r.color FROM server_members sm
       JOIN servers s ON s.id = sm.server_id
       LEFT JOIN member_roles mr ON mr.server_id = sm.server_id AND mr.user_id = sm.user_id
       LEFT JOIN roles r ON r.id = mr.role_id
       WHERE sm.user_id = ? ORDER BY s.name`,
    )
    .bind(row.id)
    .all<{ name: string; role_name: string | null; color: string | null }>();
  return c.json({
    user: decorate(row, badgeMap.get(String(row.id)) ?? []),
    mutualServers: mutual.results.map((m) => ({ id: m.id, name: m.name, iconId: m.icon_id })),
    rolesByServer: servers.results,
    isFriend: !!friend,
    isBlocked: !!blocked,
    dmChannelId: dm?.id ?? null,
    canModerate: viewer.is_owner === 1,
  });
});

account.get("/users/:id/badges", async (c) => {
  const map = await badgesFor(c.env.DB, [c.req.param("id")]);
  return c.json({ badges: map.get(c.req.param("id")) ?? [] });
});

/* ------------------------------- friends ------------------------------- */

account.get("/friends", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const friends = await db
    .prepare(
      `SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.username`,
    )
    .bind(me.id)
    .all<Record<string, unknown>>();
  const incoming = await db
    .prepare(
      `SELECT fr.*, u.username, u.display_name, u.avatar_id, u.accent_color, u.is_owner, u.plus_until
       FROM friend_requests fr JOIN users u ON u.id = fr.from_user
       WHERE fr.to_user = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    )
    .bind(me.id)
    .all<Record<string, unknown>>();
  const outgoing = await db
    .prepare(
      `SELECT fr.*, u.username, u.display_name, u.avatar_id, u.accent_color, u.is_owner, u.plus_until
       FROM friend_requests fr JOIN users u ON u.id = fr.to_user
       WHERE fr.from_user = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    )
    .bind(me.id)
    .all<Record<string, unknown>>();
  const blocked = await db
    .prepare(`SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ?`)
    .bind(me.id)
    .all<Record<string, unknown>>();
  const allIds = [...friends.results, ...blocked.results].map((r) => String(r.id));
  const badgeMap = await badgesFor(db, allIds);
  const shape = (r: Record<string, unknown>) =>
    decorate(
      {
        ...r,
        id: r.id,
        username: r.username,
        display_name: r.display_name,
      },
      badgeMap.get(String(r.id)) ?? [],
    );
  return c.json({
    friends: friends.results.map(shape),
    incoming: incoming.results.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.created_at,
      user: shape({ ...r, id: r.from_user, username: r.username, display_name: r.display_name }),
    })),
    outgoing: outgoing.results.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      user: shape({ ...r, id: r.to_user, username: r.username, display_name: r.display_name }),
    })),
    blocked: blocked.results.map(shape),
  });
});

account.post("/friends/requests", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const username = str(body.username, 24).replace(/^@/, "");
  if (!username) return bad(c, "Enter a username.");
  const target = await userByUsername(db, username);
  if (!target) return c.json({ error: "No user with that username." }, 404);
  if (target.id === me.id) return bad(c, "You cannot add yourself.");
  if (target.platform_banned) return c.json({ error: "That account is suspended." }, 403);
  if (!(await rateLimit(db, `friendreq:${me.id}`, 30, 60 * 60 * 1000)))
    return bad(c, "Too many friend requests. Slow down.", 429);
  const blocked = await db
    .prepare("SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)")
    .bind(target.id, me.id, me.id, target.id)
    .first();
  if (blocked) return c.json({ error: "Friend request unavailable." }, 403);
  const friend = await db
    .prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?")
    .bind(me.id, target.id)
    .first();
  if (friend) return bad(c, "You are already friends.");
  const existing = await db
    .prepare(
      "SELECT * FROM friend_requests WHERE status = 'pending' AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))",
    )
    .bind(me.id, target.id, target.id, me.id)
    .first<Record<string, unknown>>();
  if (existing) {
    if (existing.from_user === me.id) return bad(c, "Request already sent.");
    // They already requested us: accept.
    await db
      .prepare("UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ?")
      .bind(now(), existing.id)
      .run();
    await db
      .prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)")
      .bind(me.id, target.id, now(), target.id, me.id, now())
      .run();
    await emit(db, "user", String(target.id), "friend.update", { userId: me.id });
    await emit(db, "user", me.id, "friend.update", { userId: target.id });
    return c.json({ ok: true, accepted: true });
  }
  const id = uid();
  await db
    .prepare(
      "INSERT INTO friend_requests (id, from_user, to_user, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    )
    .bind(id, me.id, target.id, str(body.message, 200) || null, now())
    .run();
  await notify(db, {
    userId: String(target.id),
    kind: "friend_request",
    title: "New friend request",
    body: `${me.username} wants to be friends.`,
    actorId: me.id,
  });
  await emit(db, "user", String(target.id), "friend.request", { from: me.id });
  return c.json({ ok: true, id });
});

account.post("/friends/requests/:id/accept", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const req = await db.prepare("SELECT * FROM friend_requests WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!req) return c.json({ error: "Request not found" }, 404);
  if (req.to_user !== me.id) return c.json({ error: "Not your request" }, 403);
  if (req.status !== "pending") return bad(c, "Request already handled.");
  await db.prepare("UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ?").bind(now(), req.id).run();
  await db
    .prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)")
    .bind(me.id, req.from_user, now(), req.from_user, me.id, now())
    .run();
  await notify(db, {
    userId: String(req.from_user),
    kind: "friend_accept",
    title: "Friend request accepted",
    body: `${me.username} accepted your friend request.`,
    actorId: me.id,
  });
  await emit(db, "user", String(req.from_user), "friend.update", { userId: me.id });
  await emit(db, "user", me.id, "friend.update", { userId: req.from_user });
  return c.json({ ok: true });
});

account.post("/friends/requests/:id/decline", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const req = await db.prepare("SELECT * FROM friend_requests WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!req) return c.json({ error: "Request not found" }, 404);
  if (req.to_user !== me.id && req.from_user !== me.id) return c.json({ error: "Not your request" }, 403);
  await db.prepare("UPDATE friend_requests SET status = 'declined', responded_at = ? WHERE id = ?").bind(now(), req.id).run();
  await emit(db, "user", String(req.to_user === me.id ? req.from_user : req.to_user), "friend.update", {});
  return c.json({ ok: true });
});

account.delete("/friends/:userId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const other = c.req.param("userId");
  await db
    .prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
    .bind(me.id, other, other, me.id)
    .run();
  await emit(db, "user", other, "friend.update", {});
  return c.json({ ok: true });
});

account.post("/users/:id/block", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const target = c.req.param("id");
  if (target === me.id) return bad(c, "You cannot block yourself.");
  const body = await readJson<Record<string, unknown>>(c);
  if (body.blocked === false) {
    await db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").bind(me.id, target).run();
    return c.json({ ok: true, blocked: false });
  }
  await db.prepare("INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").bind(me.id, target, now()).run();
  await db
    .prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
    .bind(me.id, target, target, me.id)
    .run();
  await db
    .prepare("UPDATE friend_requests SET status = 'declined', responded_at = ? WHERE status = 'pending' AND (from_user = ? OR to_user = ?)")
    .bind(now(), target, target)
    .run();
  return c.json({ ok: true, blocked: true });
});

/* --------------------------------- DMs --------------------------------- */

account.get("/dms", async (c) => {
  const me = c.get("user");
  const dms = await myDms(c.env.DB, me.id);
  return c.json({ dms: dms.filter((d) => !d.isRequest), requests: dms.filter((d) => d.isRequest) });
});

account.post("/dms", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const ids = parseIdList(body.userIds, 9);
  if (!ids.length) return bad(c, "Choose at least one person.");
  const unique = [...new Set([me.id, ...ids])];
  if (unique.length > 10) return bad(c, "Group chats are limited to 10 people.");
  for (const id of unique) {
    if (id === me.id) continue;
    const target = await userById(db, id);
    if (!target) return bad(c, "Unknown user in conversation.");
    if (target.platform_banned) return bad(c, "One of those accounts is suspended.");
    const blocked = await db
      .prepare("SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)")
      .bind(id, me.id, me.id, id)
      .first();
    if (blocked) return c.json({ error: "You cannot message that user." }, 403);
  }
  const channel = await getOrCreateDm(db, unique, str(body.name, 60) || undefined);
  if (unique.length === 2) {
    const other = unique.find((id) => id !== me.id)!;
    const friend = await db
      .prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?")
      .bind(me.id, other)
      .first();
    const existingRequest = await db
      .prepare("SELECT request_for FROM dm_members WHERE channel_id = ? AND user_id = ?")
      .bind(channel.id, other)
      .first<{ request_for: string | null }>();
    if (!friend && !existingRequest?.request_for) {
      await db
        .prepare("UPDATE dm_members SET request_for = ? WHERE channel_id = ? AND user_id = ?")
        .bind(other, channel.id, other)
        .run();
      await emit(db, "user", other, "dm.request", { channelId: channel.id, from: me.id });
    }
  }
  return c.json({ channel });
});

account.post("/dms/:id/accept", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.param("id");
  const member = await db
    .prepare("SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, me.id)
    .first();
  if (!member) return c.json({ error: "Not in this conversation" }, 403);
  await db.prepare("UPDATE dm_members SET request_for = NULL WHERE channel_id = ?").bind(channelId).run();
  return c.json({ ok: true });
});

account.patch("/dms/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.param("id");
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(channelId).first<Record<string, unknown>>();
  if (!channel) return c.json({ error: "Conversation not found" }, 404);
  const member = await db
    .prepare("SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, me.id)
    .first();
  if (!member) return c.json({ error: "Not in this conversation" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  if (channel.type !== "group") return bad(c, "Only group chats can be renamed.");
  const name = str(body.name, 60);
  if (!name) return bad(c, "Group name cannot be empty.");
  await db.prepare("UPDATE channels SET name = ? WHERE id = ?").bind(name, channelId).run();
  await emit(db, "channel", channelId, "dm.update", { name });
  return c.json({ ok: true });
});

account.post("/dms/:id/members", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.param("id");
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(channelId).first<Record<string, unknown>>();
  if (!channel || channel.type !== "group") return bad(c, "Group chat not found.");
  const member = await db
    .prepare("SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?")
    .bind(channelId, me.id)
    .first();
  if (!member) return c.json({ error: "Not in this conversation" }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const ids = parseIdList(body.userIds, 8);
  const count = await db
    .prepare("SELECT COUNT(*) as n FROM dm_members WHERE channel_id = ?")
    .bind(channelId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) + ids.length > 10) return bad(c, "Group chats are limited to 10 people.");
  for (const id of ids) {
    if (!(await userById(db, id))) return bad(c, "Unknown user.");
    await db.prepare("INSERT OR IGNORE INTO dm_members (channel_id, user_id) VALUES (?, ?)").bind(channelId, id).run();
    await emit(db, "user", id, "dm.added", { channelId });
  }
  await emit(db, "channel", channelId, "dm.members", {});
  return c.json({ ok: true });
});

account.delete("/dms/:id/members/:userId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const channelId = c.req.param("id");
  const target = c.req.param("userId");
  if (target !== me.id && me.is_owner !== 1) return c.json({ error: "You can only leave a group yourself." }, 403);
  await db.prepare("DELETE FROM dm_members WHERE channel_id = ? AND user_id = ?").bind(channelId, target).run();
  await emit(db, "channel", channelId, "dm.members", {});
  return c.json({ ok: true });
});

/* ----------------------------- notifications ---------------------------- */

account.get("/notifications", async (c) => {
  const me = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60",
  )
    .bind(me.id)
    .all<Record<string, unknown>>();
  return c.json({
    notifications: rows.results.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      actorId: n.actor_id,
      serverId: n.server_id,
      channelId: n.channel_id,
      messageId: n.message_id,
      read: !!n.read_at,
      createdAt: n.created_at,
    })),
  });
});

account.post("/notifications/read", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  if (body.all !== false) {
    await db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(now(), me.id).run();
  } else {
    for (const id of parseIdList(body.ids, 50)) {
      await db
        .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
        .bind(now(), id, me.id)
        .run();
    }
  }
  return c.json({ ok: true });
});

/* ------------------------------ read state ------------------------------ */

account.get("/channels/:id/read", async (c) => {
  const me = c.get("user");
  const state = await c.env.DB.prepare("SELECT last_read_at FROM read_states WHERE user_id = ? AND channel_id = ?")
    .bind(me.id, c.req.param("id"))
    .first<{ last_read_at: number }>();
  return c.json({ lastReadAt: state?.last_read_at ?? 0 });
});

/* ------------------------------- layout -------------------------------- */

account.get("/layout", async (c) => {
  const me = c.get("user");
  const folders = await c.env.DB.prepare(
    "SELECT id, name, color, position FROM server_folders WHERE user_id = ? ORDER BY position",
  )
    .bind(me.id)
    .all();
  const layout = await c.env.DB.prepare(
    "SELECT server_id, folder_id, position FROM server_layout WHERE user_id = ? ORDER BY position",
  )
    .bind(me.id)
    .all();
  return c.json({ folders: folders.results, servers: layout.results });
});

account.post("/folders", async (c) => {
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 24);
  if (!name) return bad(c, "Folder needs a name.");
  const color = /^#[0-9a-fA-F]{6}$/.test(str(body.color, 9)) ? str(body.color, 9) : "#2f7cff";
  const id = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) as p FROM server_folders WHERE user_id = ?")
    .bind(me.id)
    .first<{ p: number }>();
  await c.env.DB.prepare(
    "INSERT INTO server_folders (id, user_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, me.id, name, color, (max?.p ?? -1) + 1, now())
    .run();
  return c.json({ folder: { id, name, color, position: (max?.p ?? -1) + 1 } });
});

account.patch("/folders/:id", async (c) => {
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 24);
  const color = str(body.color, 9);
  await c.env.DB.prepare(
    "UPDATE server_folders SET name = COALESCE(NULLIF(?, ''), name), color = CASE WHEN ? != '' THEN ? ELSE color END WHERE id = ? AND user_id = ?",
  )
    .bind(name, color, color, c.req.param("id"), me.id)
    .run();
  return c.json({ ok: true });
});

account.delete("/folders/:id", async (c) => {
  const me = c.get("user");
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM server_folders WHERE id = ? AND user_id = ?").bind(id, me.id).run();
  await c.env.DB.prepare("UPDATE server_layout SET folder_id = NULL WHERE user_id = ? AND folder_id = ?").bind(me.id, id).run();
  return c.json({ ok: true });
});

account.put("/layout", async (c) => {
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const servers = Array.isArray(body.servers) ? body.servers.slice(0, 200) : [];
  for (const item of servers) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const serverId = str(entry.serverId, 64);
    if (!serverId) continue;
    const folderId = entry.folderId ? str(entry.folderId, 64) : null;
    const position = clamp(parseInt(String(entry.position ?? 0), 10) || 0, 0, 500);
    const member = await c.env.DB.prepare("SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(serverId, me.id)
      .first();
    if (!member) continue;
    await c.env.DB.prepare(
      "INSERT INTO server_layout (user_id, server_id, folder_id, position) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, server_id) DO UPDATE SET folder_id = excluded.folder_id, position = excluded.position",
    )
      .bind(me.id, serverId, folderId, position)
      .run();
  }
  return c.json({ ok: true });
});

/* ------------------------------ reports -------------------------------- */

account.post("/reports", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const reason = str(body.reason, 80);
  if (!reason) return bad(c, "Choose a reason for the report.");
  const targetUser = str(body.targetUserId, 64) || null;
  const messageId = str(body.messageId, 64) || null;
  let serverId = str(body.serverId, 64) || null;
  if (messageId) {
    const msg = await db.prepare("SELECT channel_id FROM messages WHERE id = ?").bind(messageId).first<{ channel_id: string }>();
    if (!msg) return bad(c, "Message not found.");
    const channel = await db.prepare("SELECT server_id FROM channels WHERE id = ?").bind(msg.channel_id).first<{ server_id: string | null }>();
    serverId = channel?.server_id ?? null;
  }
  const id = uid();
  await db
    .prepare(
      "INSERT INTO reports (id, reporter_id, target_user_id, server_id, message_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    )
    .bind(id, me.id, targetUser, serverId, messageId, reason, str(body.details, 800) || null, now())
    .run();
  await audit(db, {
    actorId: me.id,
    serverId,
    action: "report.create",
    targetType: "report",
    targetId: id,
    meta: { reason },
  });
  return c.json({ ok: true, id });
});

account.post("/appeals", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const reason = str(body.reason, 1200);
  if (reason.length < 10) return bad(c, "Tell us more about your appeal (at least 10 characters).");
  const existing = await db
    .prepare("SELECT id FROM appeals WHERE user_id = ? AND status = 'open' LIMIT 1")
    .bind(me.id)
    .first();
  if (existing) return bad(c, "You already have an open appeal.");
  const id = uid();
  await db
    .prepare("INSERT INTO appeals (id, user_id, reason, status, created_at) VALUES (?, ?, ?, 'open', ?)")
    .bind(id, me.id, reason, now())
    .run();
  return c.json({ ok: true, id });
});

account.get("/appeals/mine", async (c) => {
  const me = c.get("user");
  const rows = await c.env.DB.prepare("SELECT * FROM appeals WHERE user_id = ? ORDER BY created_at DESC")
    .bind(me.id)
    .all<Record<string, unknown>>();
  return c.json({
    appeals: rows.results.map((a) => ({
      id: a.id,
      reason: a.reason,
      status: a.status,
      reviewNote: a.review_note,
      createdAt: a.created_at,
    })),
  });
});

// A member can always see where their own application stands.
account.get("/staff-applications", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const rows = await db
    .prepare("SELECT * FROM staff_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10")
    .bind(me.id)
    .all<Record<string, unknown>>();
  return c.json({
    applications: rows.results.map((a) => ({
      id: a.id,
      position: a.position,
      why: a.why,
      experience: a.experience,
      status: a.status,
      reviewNote: a.review_note,
      createdAt: a.created_at,
      reviewedAt: a.reviewed_at,
    })),
  });
});

account.post("/staff-applications", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const body = await readJson<Record<string, unknown>>(c);
  const position = str(body.position, 60);
  const why = str(body.why, 1500);
  if (!position || why.length < 20) return bad(c, "Tell us the role and why you want it (at least 20 characters).");
  const existing = await db
    .prepare("SELECT id FROM staff_applications WHERE user_id = ? AND status = 'pending' LIMIT 1")
    .bind(me.id)
    .first();
  if (existing) return bad(c, "You already have a pending application.");
  await db
    .prepare(
      "INSERT INTO staff_applications (id, user_id, position, why, experience, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(uid(), me.id, position, why, str(body.experience, 1500) || null, now())
    .run();
  return c.json({ ok: true });
});

/* --------------------------- invite previews --------------------------- */

account.get("/invites/:code", async (c) => {
  const db = c.env.DB;
  const invite = await db
    .prepare("SELECT * FROM invites WHERE code = ?")
    .bind(c.req.param("code"))
    .first<Record<string, unknown>>();
  if (!invite) return c.json({ error: "Invite is invalid or expired." }, 404);
  if (invite.expires_at && Number(invite.expires_at) < now()) return c.json({ error: "Invite has expired." }, 404);
  if (invite.max_uses && Number(invite.uses) >= Number(invite.max_uses))
    return c.json({ error: "Invite has reached its limit." }, 404);
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(invite.server_id).first<Record<string, unknown>>();
  if (!server) return c.json({ error: "Server no longer exists." }, 404);
  const counts = await db
    .prepare("SELECT COUNT(*) as members FROM server_members WHERE server_id = ?")
    .bind(server.id)
    .first<{ members: number }>();
  const online = await db
    .prepare(
      `SELECT COUNT(*) as n FROM server_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ? AND u.last_seen_at > ? AND u.status != 'invisible'`,
    )
    .bind(server.id, now() - 5 * 60 * 1000)
    .first<{ n: number }>();
  return c.json({
    invite: { code: invite.code, uses: invite.uses },
    server: {
      id: server.id,
      name: server.name,
      description: server.description,
      iconId: server.icon_id,
      memberCount: counts?.members ?? 0,
      onlineCount: online?.n ?? 0,
    },
  });
});

/* ----------------------- channel access details ------------------------ */

account.get("/channels/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const { getChannelAccess } = await import("../perms");
  const access = await getChannelAccess(db, me, c.req.param("id"));
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!(access.permissions & P.VIEW_CHANNEL)) return c.json({ error: "No access" }, 403);
  const unread = await channelUnread(db, me.id, access.channel);
  const readState = await db
    .prepare("SELECT last_read_at FROM read_states WHERE user_id = ? AND channel_id = ?")
    .bind(me.id, access.channel.id)
    .first<{ last_read_at: number }>();
  return c.json({
    channel: access.channel,
    permissions: access.permissions,
    unreadCount: unread,
    lastReadAt: readState?.last_read_at ?? 0,
    serverId: access.serverId,
    isDm: access.isDm,
  });
});

