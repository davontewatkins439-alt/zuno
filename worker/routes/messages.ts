import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { rateLimit } from "../auth";
import { bad, clamp, now, num, readJson, str, uid } from "../lib";
import { audit, emit, getChannelAccess, has, listAccessibleChannels, notify, P } from "../perms";
import type { Access, ChannelRow } from "../perms";
import { badgesFor, decorate } from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const messages = new Hono<Ctx>();

const STICKERS = new Set(["zuno-bolt", "zuno-crown", "zuno-ghost", "zuno-heart", "zuno-rocket", "zuno-star", "zuno-wave"]);
const GIF_HOSTS = ["media.giphy.com", "media.tenor.com", "c.tenor.com", "i.giphy.com", "media0.giphy.com", "media1.giphy.com"];

function validGifUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (GIF_HOSTS.includes(url.hostname)) return url.toString();
    if (url.pathname.toLowerCase().endsWith(".gif")) return url.toString();
    return null;
  } catch {
    return null;
  }
}

async function accessibleChannel(
  db: D1Database,
  user: SessionUser,
  channelId: string,
  permission: number,
): Promise<Access | null> {
  const access = await getChannelAccess(db, user, channelId);
  if (!access) return null;
  if (!has(access.permissions, P.VIEW_CHANNEL)) return null;
  if (permission && !has(access.permissions, permission)) return null;
  return access;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  reply_to_id: string | null;
  system: number;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  pinned_at: number | null;
  pinned_by: string | null;
  sticker: string | null;
  gif_url: string | null;
  author_username: string;
  author_display: string | null;
  author_avatar: string | null;
  author_accent: string | null;
  author_owner: number;
  author_plus_until: number | null;
  author_plus_theme: string | null;
  author_plus_decoration: string | null;
  author_status: string;
  author_last_seen: number;
  nickname?: string | null;
}

export async function serializeMessages(
  db: D1Database,
  rows: MessageRow[],
  viewerId: string,
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const badgeMap = await badgesFor(db, authorIds);
  const attachRows = await db
    .prepare(
      `SELECT a.message_id, f.id as file_id, f.filename, f.content_type, f.size FROM attachments a
       JOIN files f ON f.id = a.file_id WHERE a.message_id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<{ message_id: string; file_id: string; filename: string; content_type: string; size: number }>();
  const reactionRows = await db
    .prepare(`SELECT message_id, emoji, COUNT(*) as count FROM reactions WHERE message_id IN (${placeholders}) GROUP BY message_id, emoji`)
    .bind(...ids)
    .all<{ message_id: string; emoji: string; count: number }>();
  const mine = await db
    .prepare(`SELECT message_id, emoji FROM reactions WHERE user_id = ? AND message_id IN (${placeholders})`)
    .bind(viewerId, ...ids)
    .all<{ message_id: string; emoji: string }>();
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter((x): x is string => !!x))];
  const replyMap = new Map<string, { id: string; content: string; authorName: string; deleted: boolean }>();
  if (replyIds.length) {
    const replyRows = await db
      .prepare(
        `SELECT m.id, m.content, m.deleted_at, u.display_name, u.username FROM messages m
         JOIN users u ON u.id = m.author_id WHERE m.id IN (${replyIds.map(() => "?").join(",")})`,
      )
      .bind(...replyIds)
      .all<{ id: string; content: string; deleted_at: number | null; display_name: string | null; username: string }>();
    for (const r of replyRows.results) {
      replyMap.set(r.id, {
        id: r.id,
        content: r.content.slice(0, 180),
        authorName: r.display_name || r.username,
        deleted: !!r.deleted_at,
      });
    }
  }
  const threadRows = await db
    .prepare(
      `SELECT c.id, c.parent_message_id, COUNT(m.id) as replies, MAX(m.created_at) as last
       FROM channels c LEFT JOIN messages m ON m.channel_id = c.id AND m.deleted_at IS NULL
       WHERE c.type = 'thread' AND c.parent_message_id IN (${placeholders}) GROUP BY c.id`,
    )
    .bind(...ids)
    .all<{ id: string; parent_message_id: string; replies: number; last: number | null }>();
  const threadMap = new Map(threadRows.results.map((t) => [t.parent_message_id, t]));

  return rows.map((r) => {
    const authorBadges = badgeMap.get(r.author_id) ?? [];
    const attachments = attachRows.results
      .filter((a) => a.message_id === r.id)
      .map((a) => ({ fileId: a.file_id, filename: a.filename, contentType: a.content_type, size: a.size }));
    const grouped = new Map<string, { emoji: string; count: number; me: boolean }>();
    for (const reaction of reactionRows.results.filter((x) => x.message_id === r.id)) {
      grouped.set(reaction.emoji, { emoji: reaction.emoji, count: reaction.count, me: false });
    }
    for (const m of mine.results) {
      if (m.message_id !== r.id) continue;
      const entry = grouped.get(m.emoji);
      if (entry) entry.me = true;
    }
    const reply = r.reply_to_id ? replyMap.get(r.reply_to_id) : null;
    const thread = threadMap.get(r.id);
    return {
      id: r.id,
      channelId: r.channel_id,
      content: r.deleted_at ? "" : r.content,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted: !!r.deleted_at,
      system: !!r.system,
      sticker: r.sticker,
      gifUrl: r.gif_url,
      pinned: !!r.pinned_at,
      author: {
        id: r.author_id,
        username: r.author_username,
        displayName: r.nickname || r.author_display || r.author_username,
        avatarId: r.author_avatar,
        accentColor: r.author_accent,
        isOwner: !!r.author_owner,
        plusActive: !!(r.author_owner || (r.author_plus_until && Number(r.author_plus_until) > now())),
        plusTheme: r.author_plus_theme,
        plusDecoration: r.author_plus_decoration,
        badges: [
          ...authorBadges,
          ...(r.author_owner && !authorBadges.some((b) => b.slug === "owner")
            ? [{ slug: "owner", name: "ZUNO OWNER", color: "#5fe3ff", glyph: "crown" }]
            : []),
        ],
      },
      replyTo: reply
        ? { id: reply.id, preview: reply.deleted ? "Message deleted" : reply.content, authorName: reply.authorName }
        : null,
      reactions: [...grouped.values()],
      attachments,
      thread: thread ? { id: thread.id, replies: thread.replies, lastActivity: thread.last } : null,
    };
  });
}

const MESSAGE_SELECT = `SELECT m.*, u.username as author_username, u.display_name as author_display, u.avatar_id as author_avatar,
  u.accent_color as author_accent, u.is_owner as author_owner, u.plus_until as author_plus_until,
  u.plus_theme as author_plus_theme, u.plus_decoration as author_plus_decoration,
  u.status as author_status, u.last_seen_at as author_last_seen
  FROM messages m JOIN users u ON u.id = m.author_id`;

/* -------------------------------- history -------------------------------- */

messages.get("/channels/:id/messages", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!has(access.permissions, P.READ_HISTORY) && !access.isDm)
    return c.json({ error: "Missing permission: Read Message History" }, 403);
  const limit = clamp(num(c.req.query("limit"), 40), 1, 80);
  const before = num(c.req.query("before"), 0);
  const after = num(c.req.query("after"), 0);
  const rows = await db
    .prepare(
      `${MESSAGE_SELECT} WHERE m.channel_id = ? ${before ? "AND m.created_at < ?" : ""} ${after ? "AND m.created_at > ?" : ""}
       ORDER BY m.created_at DESC LIMIT ?`,
    )
    .bind(...[access.channel.id, ...(before ? [before] : []), ...(after ? [after] : []), limit])
    .all<MessageRow>();
  const ordered = [...rows.results].sort((a, b) => a.created_at - b.created_at);
  const serialized = await serializeMessages(db, ordered, me.id);
  return c.json({
    messages: serialized,
    hasMore: rows.results.length === limit,
    permissions: access.permissions,
    channel: access.channel,
  });
});

messages.get("/channels/:id/search", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  if (!q) return c.json({ results: [] });
  const rows = await db
    .prepare(
      `${MESSAGE_SELECT} WHERE m.channel_id = ? AND m.deleted_at IS NULL AND (m.content LIKE ? OR m.content LIKE ?)
       ORDER BY m.created_at DESC LIMIT 40`,
    )
    .bind(access.channel.id, `%${q}%`, `%${q.toLowerCase()}%`)
    .all<MessageRow>();
  return c.json({ results: await serializeMessages(db, [...rows.results].reverse(), me.id) });
});

messages.get("/servers/:id/search", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const serverId = c.req.param("id");
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  if (!q) return c.json({ results: [] });
  const member = await db.prepare("SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?").bind(serverId, me.id).first();
  if (!member && me.is_owner !== 1) return c.json({ error: "Not a member" }, 403);
  const channels = await listAccessibleChannels(db, me, serverId);
  const textChannels = channels.filter((ch) => ch.channel.type === "text");
  if (!textChannels.length) return c.json({ results: [] });
  const placeholders = textChannels.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `${MESSAGE_SELECT} WHERE m.channel_id IN (${placeholders}) AND m.deleted_at IS NULL AND m.content LIKE ?
       ORDER BY m.created_at DESC LIMIT 40`,
    )
    .bind(...textChannels.map((c2) => c2.channel.id), `%${q}%`)
    .all<MessageRow>();
  const channelMap = new Map(textChannels.map((ch) => [ch.channel.id, ch.channel.name]));
  return c.json({
    results: (await serializeMessages(db, [...rows.results].reverse(), me.id)).map((m) => ({
      ...m,
      channelName: channelMap.get(String(m.channelId)),
    })),
  });
});

messages.get("/channels/:id/pins", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  const rows = await db
    .prepare(`${MESSAGE_SELECT} WHERE m.channel_id = ? AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC LIMIT 50`)
    .bind(access.channel.id)
    .all<MessageRow>();
  return c.json({ pins: await serializeMessages(db, rows.results, me.id) });
});

messages.get("/channels/:id/threads", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  const rows = await db
    .prepare(
      `SELECT t.id, t.name, t.parent_message_id, t.created_at,
        (SELECT COUNT(*) FROM messages mm WHERE mm.channel_id = t.id AND mm.deleted_at IS NULL) as replies,
        (SELECT MAX(created_at) FROM messages mm WHERE mm.channel_id = t.id) as last
       FROM channels t WHERE t.type = 'thread' AND t.server_id = ? AND t.parent_message_id IN
       (SELECT id FROM messages WHERE channel_id = ?) ORDER BY last DESC LIMIT 30`,
    )
    .bind(access.serverId, access.channel.id)
    .all<{ id: string; name: string; parent_message_id: string; created_at: number; replies: number; last: number }>();
  return c.json({
    threads: rows.results.map((t) => ({
      id: t.id,
      name: t.name,
      parentMessageId: t.parent_message_id,
      replies: Math.max(0, t.replies - 1),
      lastActivity: t.last,
      createdAt: t.created_at,
    })),
  });
});

/* -------------------------------- compose -------------------------------- */

messages.post("/channels/:id/messages", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), P.SEND_MESSAGES);
  if (!access) return c.json({ error: "You cannot send messages here." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  let content = str(body.content, 4000);
  const sticker = STICKERS.has(str(body.sticker, 32)) ? str(body.sticker, 32) : null;
  const gifUrl = body.gifUrl ? validGifUrl(str(body.gifUrl, 400)) : null;
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((x): x is string => typeof x === "string").slice(0, 10)
    : [];
  const replyToId = str(body.replyToId, 64) || null;
  if (body.gifUrl && !gifUrl) return bad(c, "That GIF link is not supported. Use a Giphy or Tenor link.");
  if (!content && !attachmentIds.length && !sticker && !gifUrl) return bad(c, "Message cannot be empty.");
  if (attachmentIds.length && !has(access.permissions, P.ATTACH_FILES) && !access.isDm)
    return c.json({ error: "Missing permission: Attach Files" }, 403);

  if (access.channel.slowmode > 0 && !has(access.permissions, P.MANAGE_MESSAGES)) {
    const last = await db
      .prepare("SELECT created_at FROM messages WHERE channel_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(access.channel.id, me.id)
      .first<{ created_at: number }>();
    if (last && now() - last.created_at < access.channel.slowmode * 1000) {
      const wait = Math.ceil((access.channel.slowmode * 1000 - (now() - last.created_at)) / 1000);
      return c.json({ error: `Slow mode: wait ${wait}s before sending again.` }, 429);
    }
  }
  if (!(await rateLimit(db, `msg:${me.id}:${access.channel.id}`, 8, 10_000)))
    return c.json({ error: "You are sending messages too quickly." }, 429);

  if (content.includes("@everyone") && !has(access.permissions, P.MENTION_EVERYONE) && !access.isDm)
    return c.json({ error: "You do not have permission to mention @everyone." }, 403);

  if (replyToId) {
    const parent = await db
      .prepare("SELECT channel_id FROM messages WHERE id = ?")
      .bind(replyToId)
      .first<{ channel_id: string }>();
    if (!parent || parent.channel_id !== access.channel.id) return bad(c, "Cannot reply to that message.");
  }

  const validFiles: string[] = [];
  for (const fileId of attachmentIds) {
    const file = await db.prepare("SELECT id FROM files WHERE id = ? AND owner_id = ?").bind(fileId, me.id).first();
    if (file) validFiles.push(fileId);
  }

  const id = uid();
  const created = now();
  await db
    .prepare(
      "INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, created_at, sticker, gif_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, access.channel.id, me.id, content, replyToId, created, sticker, gifUrl)
    .run();
  for (const fileId of validFiles) {
    await db.prepare("INSERT INTO attachments (id, message_id, file_id) VALUES (?, ?, ?)").bind(uid(), id, fileId).run();
  }
  await db.prepare("UPDATE channels SET last_message_at = ? WHERE id = ?").bind(created, access.channel.id).run();
  await db
    .prepare(
      "INSERT INTO read_states (user_id, channel_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_at = excluded.last_read_at",
    )
    .bind(me.id, access.channel.id, created)
    .run();
  await db.prepare("DELETE FROM rate_limits WHERE key LIKE ? AND window_start < ?").bind("msg:%", now() - 60_000).run();

  // Mentions & DM notifications
  if (access.serverId && access.server) {
    const text = content;
    if (text.includes("@everyone") && has(access.permissions, P.MENTION_EVERYONE)) {
      const members = await db
        .prepare("SELECT user_id FROM server_members WHERE server_id = ? AND user_id != ?")
        .bind(access.serverId, me.id)
        .all<{ user_id: string }>();
      for (const m of members.results) {
        await notify(db, {
          userId: m.user_id,
          kind: "mention",
          title: `@everyone in #${access.channel.name}`,
          body: `${me.display_name || me.username}: ${content.slice(0, 120)}`,
          actorId: me.id,
          serverId: access.serverId,
          channelId: access.channel.id,
          messageId: id,
        });
        await emit(db, "user", m.user_id, "notification", { serverId: access.serverId, channelId: access.channel.id });
      }
    } else {
      const mentioned = [...text.matchAll(/@([a-z0-9_.]{3,20})/gi)].map((m) => m[1].toLowerCase());
      if (mentioned.length) {
        const members = await db
          .prepare(
            `SELECT u.id, u.username FROM server_members sm JOIN users u ON u.id = sm.user_id
             WHERE sm.server_id = ? AND u.id != ?`,
          )
          .bind(access.serverId, me.id)
          .all<{ id: string; username: string }>();
        for (const m of members.results) {
          if (!mentioned.includes(m.username.toLowerCase())) continue;
          await notify(db, {
            userId: m.id,
            kind: "mention",
            title: `${me.display_name || me.username} mentioned you in #${access.channel.name}`,
            body: content.slice(0, 140),
            actorId: me.id,
            serverId: access.serverId,
            channelId: access.channel.id,
            messageId: id,
          });
          await emit(db, "user", m.id, "notification", { serverId: access.serverId, channelId: access.channel.id });
        }
      }
    }
    await emit(db, "server", access.serverId, "message.activity", {
      channelId: access.channel.id,
      authorId: me.id,
      createdAt: created,
    });
  } else if (access.isDm) {
    const members = await db
      .prepare("SELECT user_id FROM dm_members WHERE channel_id = ?")
      .bind(access.channel.id)
      .all<{ user_id: string }>();
    for (const m of members.results) {
      if (m.user_id === me.id) continue;
      await notify(db, {
        userId: m.user_id,
        kind: "dm",
        title: `${me.display_name || me.username}`,
        body: content.slice(0, 140) || "Sent an attachment",
        actorId: me.id,
        channelId: access.channel.id,
        messageId: id,
      });
      await db
        .prepare("UPDATE dm_members SET request_for = NULL WHERE channel_id = ? AND user_id = ?")
        .bind(access.channel.id, m.user_id)
        .run();
      await emit(db, "user", m.user_id, "dm.message", { channelId: access.channel.id, messageId: id });
    }
  }

  const row = await db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).bind(id).first<MessageRow>();
  const serialized = row ? (await serializeMessages(db, [row], me.id))[0] : null;
  await emit(db, "channel", access.channel.id, "message.create", { message: serialized });
  return c.json({ message: serialized }, 201);
});

messages.get("/messages/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).bind(c.req.param("id")).first<MessageRow>();
  if (!row) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  const [serialized] = await serializeMessages(db, [row], me.id);
  return c.json({ message: serialized });
});

messages.patch("/messages/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row || row.deleted_at) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  const canManage = has(access.permissions, P.MANAGE_MESSAGES);
  if (row.author_id !== me.id && !canManage) return c.json({ error: "You can only edit your own messages." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const content = str(body.content, 4000);
  if (!content) return bad(c, "Message cannot be empty.");
  if (content.includes("@everyone") && !has(access.permissions, P.MENTION_EVERYONE) && !access.isDm)
    return c.json({ error: "You do not have permission to mention @everyone." }, 403);
  await db.prepare("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?").bind(content, now(), row.id).run();
  await emit(db, "channel", row.channel_id, "message.update", { messageId: row.id, content, editedAt: now() });
  return c.json({ ok: true, content, editedAt: now() });
});

messages.delete("/messages/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row || row.deleted_at) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  const canManage = has(access.permissions, P.MANAGE_MESSAGES);
  if (row.author_id !== me.id && !canManage) return c.json({ error: "You cannot delete this message." }, 403);
  await db.prepare("UPDATE messages SET deleted_at = ?, content = '' WHERE id = ?").bind(now(), row.id).run();
  await db.prepare("DELETE FROM reactions WHERE message_id = ?").bind(row.id).run();
  if (canManage && row.author_id !== me.id) {
    await audit(db, {
      serverId: access.serverId,
      actorId: me.id,
      action: "message.delete",
      targetType: "message",
      targetId: row.id,
      meta: { authorId: row.author_id, channelId: row.channel_id },
    });
  }
  await emit(db, "channel", row.channel_id, "message.delete", { messageId: row.id });
  return c.json({ ok: true });
});

/* ------------------------------- reactions ------------------------------- */

messages.post("/messages/:id/reactions", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row || row.deleted_at) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, P.ADD_REACTIONS);
  if (!access) return c.json({ error: "You cannot react here." }, 403);
  const body = await readJson<Record<string, unknown>>(c);
  const emoji = str(body.emoji, 48);
  if (!emoji) return bad(c, "Pick a reaction.");
  await db
    .prepare("INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)")
    .bind(row.id, me.id, emoji, now())
    .run();
  const count = await db
    .prepare("SELECT COUNT(*) as n FROM reactions WHERE message_id = ? AND emoji = ?")
    .bind(row.id, emoji)
    .first<{ n: number }>();
  await emit(db, "channel", row.channel_id, "reaction.update", { messageId: row.id });
  return c.json({ ok: true, emoji, count: count?.n ?? 0 });
});

messages.delete("/messages/:id/reactions/:emoji", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  const emoji = decodeURIComponent(c.req.param("emoji"));
  await db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?").bind(row.id, me.id, emoji).run();
  await emit(db, "channel", row.channel_id, "reaction.update", { messageId: row.id });
  return c.json({ ok: true });
});

/* --------------------------------- pins ---------------------------------- */

messages.post("/messages/:id/pin", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row || row.deleted_at) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  if (!has(access.permissions, P.MANAGE_MESSAGES)) return c.json({ error: "Missing permission: Manage Messages" }, 403);
  await db.prepare("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?").bind(now(), me.id, row.id).run();
  await emit(db, "channel", row.channel_id, "pin.update", { messageId: row.id, pinned: true });
  return c.json({ ok: true });
});

messages.delete("/messages/:id/pin", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, 0);
  if (!access) return c.json({ error: "Message not found" }, 404);
  if (!has(access.permissions, P.MANAGE_MESSAGES)) return c.json({ error: "Missing permission: Manage Messages" }, 403);
  await db.prepare("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?").bind(row.id).run();
  await emit(db, "channel", row.channel_id, "pin.update", { messageId: row.id, pinned: false });
  return c.json({ ok: true });
});

/* --------------------------------- read ---------------------------------- */

messages.post("/channels/:id/read", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  const body = await readJson<Record<string, unknown>>(c);
  const at = Math.max(num(body.lastReadAt, now()), now());
  await db
    .prepare(
      "INSERT INTO read_states (user_id, channel_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_at = MAX(excluded.last_read_at, read_states.last_read_at)",
    )
    .bind(me.id, access.channel.id, at)
    .run();
  await db
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND channel_id = ? AND read_at IS NULL")
    .bind(now(), me.id, access.channel.id)
    .run();
  return c.json({ ok: true, lastReadAt: at });
});

/* --------------------------------- typing -------------------------------- */

messages.post("/channels/:id/typing", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), P.SEND_MESSAGES);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!(await rateLimit(db, `typing:${me.id}:${access.channel.id}`, 1, 3500))) return c.json({ ok: true });
  await emit(db, "channel", access.channel.id, "typing", {
    userId: me.id,
    displayName: me.display_name || me.username,
    username: me.username,
  });
  return c.json({ ok: true });
});

/* -------------------------------- threads -------------------------------- */

messages.post("/messages/:id/thread", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(c.req.param("id")).first<MessageRow>();
  if (!row || row.deleted_at) return c.json({ error: "Message not found" }, 404);
  const access = await accessibleChannel(db, me, row.channel_id, P.SEND_MESSAGES);
  if (!access) return c.json({ error: "You cannot start a thread here." }, 403);
  if (!access.serverId) return c.json({ error: "Threads are available in server channels." }, 400);
  const existing = await db
    .prepare("SELECT * FROM channels WHERE type = 'thread' AND parent_message_id = ?")
    .bind(row.id)
    .first<ChannelRow>();
  if (existing) return c.json({ thread: existing });
  const body = await readJson<Record<string, unknown>>(c);
  const name = str(body.name, 60) || row.content.slice(0, 50) || "Thread";
  const id = uid();
  await db
    .prepare(
      "INSERT INTO channels (id, server_id, category_id, name, type, topic, position, parent_message_id, created_at) VALUES (?, ?, ?, ?, 'thread', ?, 0, ?, ?)",
    )
    .bind(id, access.serverId, access.channel.category_id, name, `Thread from ${access.channel.name}`, row.id, now())
    .run();
  await db
    .prepare("INSERT INTO messages (id, channel_id, author_id, content, system, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .bind(uid(), id, me.id, `Thread created from a message in #${access.channel.name}.`, now())
    .run();
  await emit(db, "channel", access.channel.id, "thread.create", { threadId: id, messageId: row.id });
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(id).first<ChannelRow>();
  return c.json({ thread: channel }, 201);
});

/* --------------------------- channel management -------------------------- */

messages.patch("/channels/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (access.isDm) return c.json({ error: "DM channels are edited through the conversation menu." }, 400);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission: Manage Channels" }, 403);
  if (access.channel.type === "thread") return c.json({ error: "Threads inherit their parent channel settings." }, 400);
  const body = await readJson<Record<string, unknown>>(c);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined) {
    const raw = str(body.name, 60);
    const name = access.channel.type === "text" ? raw.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-|-$/g, "") : raw;
    if (!name) return bad(c, "Channel needs a name.");
    sets.push("name = ?");
    args.push(name);
  }
  if (body.topic !== undefined) {
    sets.push("topic = ?");
    args.push(str(body.topic, 200) || null);
  }
  if (body.slowmode !== undefined) {
    sets.push("slowmode = ?");
    args.push(clamp(num(body.slowmode, 0), 0, 21600));
  }
  if (body.categoryId !== undefined) {
    const categoryId = str(body.categoryId, 64) || null;
    if (categoryId) {
      const cat = await db
        .prepare("SELECT 1 FROM categories WHERE id = ? AND server_id = ?")
        .bind(categoryId, access.serverId)
        .first();
      if (!cat) return bad(c, "Category not found.");
    }
    sets.push("category_id = ?");
    args.push(categoryId);
  }
  if (body.position !== undefined) {
    sets.push("position = ?");
    args.push(clamp(num(body.position, access.channel.position), 0, 500));
  }
  if (body.isPrivate !== undefined) {
    const privateNow = !!body.isPrivate;
    sets.push("is_private = ?");
    args.push(privateNow ? 1 : 0);
    const everyone = await db
      .prepare("SELECT id FROM roles WHERE server_id = ? AND is_everyone = 1")
      .bind(access.serverId)
      .first<{ id: string }>();
    if (everyone) {
      if (privateNow) {
        await db
          .prepare(
            "INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES (?, 'role', ?, 0, ?) ON CONFLICT(channel_id, target_type, target_id) DO UPDATE SET deny = excluded.deny, allow = excluded.allow",
          )
          .bind(access.channel.id, everyone.id, P.VIEW_CHANNEL)
          .run();
      } else {
        await db
          .prepare("DELETE FROM channel_overwrites WHERE channel_id = ? AND target_type = 'role' AND target_id = ?")
          .bind(access.channel.id, everyone.id)
          .run();
      }
    }
  }
  if (!sets.length) return bad(c, "Nothing to update.");
  args.push(access.channel.id);
  await db.prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  await audit(db, {
    serverId: access.serverId,
    actorId: me.id,
    action: "channel.update",
    targetType: "channel",
    targetId: access.channel.id,
    meta: { fields: sets.map((s) => s.split(" = ")[0]) },
  });
  await emit(db, "server", String(access.serverId), "channel.update", { channelId: access.channel.id });
  return c.json({ ok: true });
});

messages.delete("/channels/:id", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!access.serverId) return c.json({ error: "Cannot delete a DM." }, 400);
  if (!has(access.permissions, P.MANAGE_CHANNELS)) return c.json({ error: "Missing permission: Manage Channels" }, 403);
  const channel = access.channel;
  await db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(channel.id).run();
  await db.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(channel.id).run();
  await db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(channel.id).run();
  await db.prepare("DELETE FROM channel_overwrites WHERE channel_id = ?").bind(channel.id).run();
  await db.prepare("DELETE FROM read_states WHERE channel_id = ?").bind(channel.id).run();
  await db.prepare("DELETE FROM voice_states WHERE channel_id = ?").bind(channel.id).run();
  await db.prepare("UPDATE channels SET parent_message_id = NULL WHERE parent_message_id IN (SELECT id FROM messages WHERE channel_id = ?)").bind(channel.id).run();
  await db.prepare("DELETE FROM channels WHERE parent_message_id = ?").bind(channel.parent_message_id ?? "").run();
  await db.prepare("DELETE FROM channels WHERE id = ?").bind(channel.id).run();
  await audit(db, {
    serverId: access.serverId,
    actorId: me.id,
    action: "channel.delete",
    targetType: "channel",
    targetId: channel.id,
    meta: { name: channel.name },
  });
  await emit(db, "server", String(access.serverId), "channel.delete", { channelId: channel.id });
  return c.json({ ok: true });
});

messages.get("/channels/:id/overwrites", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!access.serverId) return c.json({ overwrites: [] });
  if (!has(access.permissions, P.MANAGE_ROLES) && !has(access.permissions, P.MANAGE_CHANNELS))
    return c.json({ error: "Missing permission" }, 403);
  const rows = await db
    .prepare("SELECT * FROM channel_overwrites WHERE channel_id = ?")
    .bind(access.channel.id)
    .all<{ target_type: string; target_id: string; allow: number; deny: number }>();
  const roles = await db.prepare("SELECT id, name, color, is_everyone FROM roles WHERE server_id = ? ORDER BY position DESC").bind(access.serverId).all();
  return c.json({ overwrites: rows.results, roles: roles.results, isPrivate: !!access.channel.is_private });
});

messages.put("/channels/:id/overwrites", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const access = await accessibleChannel(db, me, c.req.param("id"), 0);
  if (!access) return c.json({ error: "Channel not found" }, 404);
  if (!access.serverId) return c.json({ error: "DM channels have no overwrites." }, 400);
  if (!has(access.permissions, P.MANAGE_ROLES)) return c.json({ error: "Missing permission: Manage Roles" }, 403);
  if (!has(access.permissions, P.ADMINISTRATOR)) {
    const role = await db.prepare("SELECT position FROM roles WHERE server_id = ? AND is_everyone = 1").bind(access.serverId).first<{ position: number }>();
    if (!role) return c.json({ error: "Server role config missing" }, 500);
  }
  const body = await readJson<Record<string, unknown>>(c);
  const overwrites = Array.isArray(body.overwrites) ? body.overwrites.slice(0, 100) : [];
  await db.prepare("DELETE FROM channel_overwrites WHERE channel_id = ?").bind(access.channel.id).run();
  let everyoneDeniedView = false;
  for (const raw of overwrites) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const targetType = o.targetType === "member" ? "member" : "role";
    const targetId = str(o.targetId, 64);
    if (!targetId) continue;
    if (targetType === "role") {
      const exists = await db.prepare("SELECT 1 FROM roles WHERE id = ? AND server_id = ?").bind(targetId, access.serverId).first();
      if (!exists) continue;
    } else {
      const exists = await db.prepare("SELECT 1 FROM server_members WHERE user_id = ? AND server_id = ?").bind(targetId, access.serverId).first();
      if (!exists) continue;
    }
    const allow = clamp(num(o.allow, 0), 0, 0x3fffff);
    const deny = clamp(num(o.deny, 0), 0, 0x3fffff);
    if (targetType === "role" && deny & P.VIEW_CHANNEL) {
      const everyone = await db.prepare("SELECT id FROM roles WHERE server_id = ? AND is_everyone = 1").bind(access.serverId).first<{ id: string }>();
      if (everyone && everyone.id === targetId) everyoneDeniedView = true;
    }
    await db
      .prepare("INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES (?, ?, ?, ?, ?)")
      .bind(access.channel.id, targetType, targetId, allow, deny)
      .run();
  }
  await db.prepare("UPDATE channels SET is_private = ? WHERE id = ?").bind(everyoneDeniedView ? 1 : 0, access.channel.id).run();
  await audit(db, {
    serverId: access.serverId,
    actorId: me.id,
    action: "channel.permissions.update",
    targetType: "channel",
    targetId: access.channel.id,
    meta: { overwrites: overwrites.length },
  });
  await emit(db, "server", String(access.serverId), "channel.update", { channelId: access.channel.id });
  return c.json({ ok: true });
});

export { STICKERS, validGifUrl };
