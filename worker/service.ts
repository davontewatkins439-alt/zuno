
import { accentFor, effectiveStatus, now, publicUser } from "./lib";
import type { ChannelRow, ServerRow } from "./perms";
import { has, P } from "./perms";

export interface Badge {
  slug: string;
  name: string;
  color: string;
  glyph: string;
  art: string | null;
  unique: boolean;
  /** Only on the derived account-age badge: "4 years, 1 month". */
  ageLabel?: string;
  /** Marks the derived account-age badge so surfaces can present it specially. */
  accountAge?: boolean;
}

/**
 * ZUNO account age.
 *
 * Nothing is granted or stored: the tier is derived from `users.created_at`
 * every time a user is serialised, so it climbs on its own and can never be
 * handed to somebody early or taken away. Six tiers, each with its own stage of
 * the original ZUNO vine artwork.
 */
const AGE_DAY = 86_400_000;

export const AGE_TIERS: { slug: string; name: string; color: string; art: string; days: number }[] = [
  { slug: "age_sprout", name: "SPROUT", color: "#a3e635", art: "vine-1", days: 0 },
  { slug: "age_bud", name: "BUD", color: "#4ade80", art: "vine-2", days: 30 },
  { slug: "age_blossom", name: "BLOSSOM", color: "#22d3ee", art: "vine-3", days: 180 },
  { slug: "age_evergreen", name: "EVERGREEN", color: "#38bdf8", art: "vine-4", days: 365 },
  { slug: "age_ironvine", name: "IRONVINE", color: "#8b5cf6", art: "vine-5", days: 730 },
  { slug: "age_neonvine", name: "NEON VINE", color: "#5fe3ff", art: "vine-6", days: 1825 },
];

export function isAgeBadge(badge: { slug: string; accountAge?: boolean }): boolean {
  return badge.accountAge === true || AGE_TIERS.some((tier) => tier.slug === badge.slug);
}

/** Whole days the account has existed; 0 when the timestamp is unusable. */
export function accountAgeDays(createdAt: unknown): number {
  const created = Number(createdAt);
  if (!Number.isFinite(created) || created <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / AGE_DAY));
}

/** "Joined today" / "12 days" / "11 months" / "4 years, 1 month". */
export function formatAccountAge(createdAt: unknown): string {
  const created = Number(createdAt);
  if (!Number.isFinite(created) || created <= 0) return "New here";
  const days = accountAgeDays(created);
  if (days < 1) return "Joined today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const from = new Date(created);
  const to = new Date();
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  months = Math.max(1, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  if (!parts.length) parts.push("1 month");
  return parts.join(", ");
}

/** The tier this account wears right now. */
export function accountAgeBadge(createdAt: unknown): Badge {
  const days = accountAgeDays(createdAt);
  let tier = AGE_TIERS[0];
  for (const candidate of AGE_TIERS) if (days >= candidate.days) tier = candidate;
  return {
    slug: tier.slug,
    name: tier.name,
    color: tier.color,
    glyph: "sprout",
    art: tier.art,
    unique: false,
    ageLabel: formatAccountAge(createdAt),
    accountAge: true,
  };
}

/** Keeps exactly one age badge, always last so it never crowds out real ones. */
function withAgeBadge(list: Badge[], createdAt: unknown): Badge[] {
  const existing = list.find(isAgeBadge);
  const rest = list.filter((badge) => !isAgeBadge(badge));
  const age = Number(createdAt) > 0 ? accountAgeBadge(createdAt) : existing;
  return age ? [...rest, age] : rest;
}

export async function badgesFor(db: D1Database, userIds: string[]): Promise<Map<string, Badge[]>> {
  const map = new Map<string, Badge[]>();
  if (!userIds.length) return map;
  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT ub.user_id, b.slug, b.name, b.color, b.glyph, b.art, b.unique_flag FROM user_badges ub
       JOIN badges b ON b.slug = ub.badge_slug WHERE ub.user_id IN (${placeholders})
       ORDER BY b.sort DESC`,
    )
    .bind(...userIds)
    .all<{ user_id: string; slug: string; name: string; color: string; glyph: string; art: string | null; unique_flag: number }>();
  for (const r of rows.results) {
    const list = map.get(r.user_id) ?? [];
    if (!list.some((b) => b.slug === r.slug))
      list.push({ slug: r.slug, name: r.name, color: r.color, glyph: r.glyph, art: r.art ?? null, unique: r.unique_flag === 1 });
    map.set(r.user_id, list);
  }
  // Account age is derived, so it needs the join date rather than a stored grant.
  const accounts = await db
    .prepare(`SELECT id, created_at FROM users WHERE id IN (${placeholders})`)
    .bind(...userIds)
    .all<{ id: string; created_at: number }>();
  for (const account of accounts.results) {
    map.set(account.id, withAgeBadge(map.get(account.id) ?? [], account.created_at));
  }
  return map;
}

export function decorate(u: Record<string, unknown>, badges: Badge[] = []) {
  const base = publicUser(u);
  const list = withAgeBadge([...badges], u.created_at);
  const add = (slug: string, name: string, color: string, glyph: string, art: string, unique = false) => {
    if (!list.some((b) => b.slug === slug)) list.push({ slug, name, color, glyph, art, unique });
  };
  if (u.is_owner) add("owner", "ZUNO OWNER", "#5fe3ff", "crown", "origin", true);
  // PLUS is part of the owner account, so it never depends on a payment row.
  if (u.is_owner || (u.plus_until && Number(u.plus_until) > now())) add("plus", "ZUNO PLUS", "#fbbf24", "sparkles", "prism");
  return {
    ...base,
    badges: list,
    status: effectiveStatus({
      status: u.status as string,
      last_seen_at: u.last_seen_at as number,
      is_owner: u.is_owner as number,
    }),
    plusActive: !!(u.is_owner || (u.plus_until && Number(u.plus_until) > now())),
    accentColor: (u.accent_color as string) || accentFor(String(u.id)),
    nameplate: (u.nameplate as string) || null,
  };
}

export async function userById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

export async function userByUsername(db: D1Database, username: string) {
  return db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind(username).first<Record<string, unknown>>();
}

export async function userByEmail(db: D1Database, email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first<Record<string, unknown>>();
}

export function serverSummary(s: ServerRow, extra: Record<string, unknown> = {}) {
  return {
    id: s.id,
    name: s.name,
    iconId: s.icon_id,
    bannerId: s.banner_id,
    description: s.description,
    isPublic: !!s.is_public,
    inviteCode: s.invite_code,
    ownerId: s.owner_id,
    createdAt: s.created_at,
    category: s.category || "social",
    tag: s.tag || null,
    tagBadge: s.tag_badge || null,
    boostGoal: Number(s.boost_goal ?? 10) || 10,
    boostBar: Number(s.boost_bar ?? 1) === 1,
    ...extra,
  };
}

export async function serverMembership(db: D1Database, userId: string, serverId: string) {
  return db
    .prepare(
      `SELECT sm.*, u.username, u.display_name FROM server_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ? AND sm.user_id = ?`,
    )
    .bind(serverId, userId)
    .first<Record<string, unknown>>();
}

export async function channelUnread(db: D1Database, userId: string, channel: ChannelRow): Promise<number> {
  if (!channel.last_message_at) return 0;
  const state = await db
    .prepare("SELECT last_read_at FROM read_states WHERE user_id = ? AND channel_id = ?")
    .bind(userId, channel.id)
    .first<{ last_read_at: number }>();
  const since = state?.last_read_at ?? 0;
  if (channel.last_message_at <= since) return 0;
  const row = await db
    .prepare(
      "SELECT COUNT(*) as n FROM messages WHERE channel_id = ? AND created_at > ? AND author_id != ? AND deleted_at IS NULL",
    )
    .bind(channel.id, since, userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function mentionUnread(
  db: D1Database,
  userId: string,
  username: string,
  channel: ChannelRow,
): Promise<number> {
  if (!channel.last_message_at) return 0;
  const state = await db
    .prepare("SELECT last_read_at FROM read_states WHERE user_id = ? AND channel_id = ?")
    .bind(userId, channel.id)
    .first<{ last_read_at: number }>();
  const since = state?.last_read_at ?? 0;
  if (channel.last_message_at <= since) return 0;
  const row = await db
    .prepare(
      `SELECT COUNT(*) as n FROM messages WHERE channel_id = ? AND created_at > ? AND deleted_at IS NULL
       AND (content LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')`,
    )
    .bind(channel.id, since, `%@${username}%`, "%@everyone%")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function myServers(db: D1Database, userId: string, username: string) {
  const rows = await db
    .prepare(
      `SELECT s.*, sm.nickname FROM server_members sm JOIN servers s ON s.id = sm.server_id
       WHERE sm.user_id = ? ORDER BY s.created_at ASC`,
    )
    .bind(userId)
    .all<ServerRow & { nickname: string | null }>();

  const layout = await db
    .prepare("SELECT server_id, folder_id, position FROM server_layout WHERE user_id = ?")
    .bind(userId)
    .all<{ server_id: string; folder_id: string | null; position: number }>();
  const layoutMap = new Map(layout.results.map((l) => [l.server_id, l]));

  const out = [];
  for (const server of rows.results) {
    const channels = await db
      .prepare("SELECT * FROM channels WHERE server_id = ? AND type != 'thread'")
      .bind(server.id)
      .all<ChannelRow>();
    let unread = 0;
    let mentions = 0;
    let readMentions = 0;
    for (const ch of channels.results) {
      if (ch.type === "voice") continue;
      unread += await channelUnread(db, userId, ch);
      mentions += await mentionUnread(db, userId, username, ch);
    }
    let readMentionsRow = { n: 0 };
    try {
      readMentionsRow =
        (await db
          .prepare(
            "SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND server_id = ? AND read_at IS NULL AND kind = 'mention'",
          )
          .bind(userId, server.id)
          .first<{ n: number }>()) ?? { n: 0 };
    } catch {
      readMentionsRow = { n: 0 };
    }
    readMentions = readMentionsRow.n;
    const lay = layoutMap.get(server.id);
    out.push(
      serverSummary(server, {
        unreadCount: unread,
        mentionCount: Math.max(mentions, readMentions),
        folderId: lay?.folder_id ?? null,
        position: lay?.position ?? out.length,
        nickname: server.nickname,
      }),
    );
  }
  return out;
}

export async function myDms(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT c.*, dm.request_for FROM channels c JOIN dm_members dm ON dm.channel_id = c.id
       WHERE dm.user_id = ? AND c.type IN ('dm','group') ORDER BY c.last_message_at DESC NULLS LAST`,
    )
    .bind(userId)
    .all<ChannelRow & { request_for: string | null }>();

  const out = [];
  for (const channel of rows.results) {
    const others = await db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar_id, u.status, u.last_seen_at, u.accent_color, u.is_owner, u.plus_until, u.plus_decoration
         FROM dm_members dm JOIN users u ON u.id = dm.user_id WHERE dm.channel_id = ? AND dm.user_id != ?`,
      )
      .bind(channel.id, userId)
      .all<Record<string, unknown>>();
    const last = await db
      .prepare(
        `SELECT m.id, m.content, m.created_at, m.author_id, u.username FROM messages m JOIN users u ON u.id = m.author_id
         WHERE m.channel_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1`,
      )
      .bind(channel.id)
      .first<{ id: string; content: string; created_at: number; author_id: string; username: string }>();
    const unread = await channelUnread(db, userId, channel);
    const badgeMap = await badgesFor(
      db,
      others.results.map((o) => String(o.id)),
    );
    out.push({
      id: channel.id,
      type: channel.type,
      name: channel.type === "group" ? channel.name : others.results[0]?.display_name || others.results[0]?.username || "Direct message",
      iconId: null,
      isRequest: channel.request_for === userId,
      unreadCount: unread,
      lastMessageAt: channel.last_message_at,
      lastMessage: last
        ? {
            id: last.id,
            preview: last.content.slice(0, 120),
            createdAt: last.created_at,
            authorId: last.author_id,
            authorName: last.username,
            isMine: last.author_id === userId,
          }
        : null,
      participants: others.results.map((o) => decorate(o, badgeMap.get(String(o.id)) ?? [])),
    });
  }
  return out;
}

export async function getOrCreateDm(db: D1Database, userIds: string[], name?: string): Promise<ChannelRow> {
  const unique = [...new Set(userIds)];
  if (unique.length === 2) {
    const found = await db
      .prepare(
        `SELECT c.* FROM channels c
         JOIN dm_members a ON a.channel_id = c.id AND a.user_id = ?
         JOIN dm_members b ON b.channel_id = c.id AND b.user_id = ?
         WHERE c.type = 'dm' LIMIT 1`,
      )
      .bind(unique[0], unique[1])
      .first<ChannelRow>();
    if (found) return found;
  }
  const id = crypto.randomUUID();
  const created = now();
  await db
    .prepare("INSERT INTO channels (id, server_id, name, type, created_at) VALUES (?, NULL, ?, ?, ?)")
    .bind(id, name || "Group chat", unique.length > 2 ? "group" : "dm", created)
    .run();
  for (const uid of unique) {
    await db.prepare("INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)").bind(id, uid).run();
  }
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(id).first<ChannelRow>();
  return channel!;
}

export async function canViewChannel(db: D1Database, user: { id: string; is_owner: number }, channelId: string) {
  const { getChannelAccess } = await import("./perms");
  const access = await getChannelAccess(db, user, channelId);
  return access && has(access.permissions, P.VIEW_CHANNEL) ? access : null;
}

export async function unreadTotals(db: D1Database, userId: string): Promise<{ dms: number; mentions: number }> {
  const dms = await db
    .prepare(
      `SELECT COUNT(*) as n FROM messages m
       JOIN dm_members dm ON dm.channel_id = m.channel_id AND dm.user_id = ?
       LEFT JOIN read_states rs ON rs.channel_id = m.channel_id AND rs.user_id = ?
       WHERE m.deleted_at IS NULL AND m.author_id != ? AND m.created_at > COALESCE(rs.last_read_at, 0)`,
    )
    .bind(userId, userId, userId)
    .first<{ n: number }>();
  const mentions = await db
    .prepare("SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(userId)
    .first<{ n: number }>();
  return { dms: dms?.n ?? 0, mentions: mentions?.n ?? 0 };
}
