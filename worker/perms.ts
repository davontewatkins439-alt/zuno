
import { now } from "./lib";

export const P = {
  ADMINISTRATOR: 1 << 0,
  MANAGE_SERVER: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  BAN_MEMBERS: 1 << 5,
  MANAGE_MESSAGES: 1 << 6,
  VIEW_AUDIT: 1 << 7,
  CREATE_INVITES: 1 << 8,
  MANAGE_EMOJIS: 1 << 9,
  MANAGE_EVENTS: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  ATTACH_FILES: 1 << 12,
  ADD_REACTIONS: 1 << 13,
  MENTION_EVERYONE: 1 << 14,
  READ_HISTORY: 1 << 15,
  VOICE_CONNECT: 1 << 16,
  VOICE_SPEAK: 1 << 17,
  STREAM: 1 << 18,
  MANAGE_THREADS: 1 << 19,
  VIEW_CHANNEL: 1 << 20,
} as const;

export const ALL_PERMS = (1 << 21) - 1;

export const DEFAULT_EVERYONE =
  P.SEND_MESSAGES |
  P.ATTACH_FILES |
  P.ADD_REACTIONS |
  P.CREATE_INVITES |
  P.READ_HISTORY |
  P.VOICE_CONNECT |
  P.VOICE_SPEAK |
  P.STREAM |
  P.VIEW_CHANNEL;

export const PERMISSION_META: { key: keyof typeof P; label: string; description: string; group: string }[] = [
  { key: "VIEW_CHANNEL", label: "View channels", description: "See this channel and read its history.", group: "General" },
  { key: "SEND_MESSAGES", label: "Send messages", description: "Post new messages.", group: "General" },
  { key: "READ_HISTORY", label: "Read message history", description: "Read messages sent before joining.", group: "General" },
  { key: "ATTACH_FILES", label: "Attach files", description: "Upload images and files.", group: "General" },
  { key: "ADD_REACTIONS", label: "Add reactions", description: "React with emoji.", group: "General" },
  { key: "CREATE_INVITES", label: "Create invites", description: "Invite new members to this server.", group: "General" },
  { key: "MANAGE_CHANNELS", label: "Manage channels", description: "Create, edit, reorder and delete channels.", group: "Management" },
  { key: "MANAGE_ROLES", label: "Manage roles", description: "Create roles and change permissions.", group: "Management" },
  { key: "MANAGE_SERVER", label: "Manage server", description: "Edit server identity and settings.", group: "Management" },
  { key: "MANAGE_MESSAGES", label: "Manage messages", description: "Delete others' messages and pin messages.", group: "Moderation" },
  { key: "KICK_MEMBERS", label: "Kick members", description: "Remove members from the server.", group: "Moderation" },
  { key: "BAN_MEMBERS", label: "Ban members", description: "Ban members and review bans.", group: "Moderation" },
  { key: "VIEW_AUDIT", label: "View audit log", description: "Read the server audit trail.", group: "Moderation" },
  { key: "MANAGE_EVENTS", label: "Manage events", description: "Create and cancel server events.", group: "Community" },
  { key: "MANAGE_EMOJIS", label: "Manage emojis", description: "Add and remove custom server emoji.", group: "Community" },
  { key: "MENTION_EVERYONE", label: "Mention @everyone", description: "Ping the whole server.", group: "Community" },
  { key: "ADMINISTRATOR", label: "Administrator", description: "Grants every permission and bypasses channel overwrites.", group: "Danger" },
  { key: "VOICE_CONNECT", label: "Connect to voice", description: "Join voice channels.", group: "Voice" },
  { key: "VOICE_SPEAK", label: "Speak", description: "Transmit audio in voice.", group: "Voice" },
  { key: "STREAM", label: "Share screen", description: "Stream video or screen.", group: "Voice" },
];

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  is_everyone: number;
}

export interface ServerRow {
  id: string;
  name: string;
  icon_id: string | null;
  banner_id: string | null;
  owner_id: string;
  description: string | null;
  is_public: number;
  invite_code: string;
  welcome_message: string | null;
  rules: string | null;
  created_at: number;
  category?: string | null;
  tag?: string | null;
  tag_badge?: string | null;
  boost_goal?: number | null;
  boost_bar?: number | null;
}

export interface ChannelRow {
  id: string;
  server_id: string | null;
  category_id: string | null;
  name: string;
  type: string;
  topic: string | null;
  position: number;
  is_private: number;
  slowmode: number;
  parent_message_id: string | null;
  created_at: number;
  last_message_at: number | null;
}

export const has = (perms: number, bit: number) => (perms & bit) === bit;

export async function getServerMember(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<{ server_id: string; user_id: string; nickname: string | null; joined_at: number } | null> {
  return db
    .prepare("SELECT server_id, user_id, nickname, joined_at FROM server_members WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .first();
}

export async function getRoles(db: D1Database, serverId: string): Promise<Role[]> {
  const rows = await db
    .prepare("SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC")
    .bind(serverId)
    .all<Role>();
  return rows.results;
}

export async function getMemberRoleIds(db: D1Database, serverId: string, userId: string): Promise<string[]> {
  const rows = await db
    .prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .all<{ role_id: string }>();
  return rows.results.map((r) => r.role_id);
}

export async function computeServerPerms(
  db: D1Database,
  server: { id: string; owner_id: string },
  userId: string,
  isPlatformOwner: boolean,
): Promise<{ permissions: number; roles: Role[]; everyone: Role | null }> {
  const roles = await getRoles(db, server.id);
  const everyone = roles.find((r) => r.is_everyone === 1) ?? null;
  if (server.owner_id === userId || isPlatformOwner) {
    return { permissions: ALL_PERMS, roles, everyone };
  }
  const memberRoleIds = await getMemberRoleIds(db, server.id, userId);
  let perms = everyone ? everyone.permissions : DEFAULT_EVERYONE;
  for (const role of roles) {
    if (role.is_everyone) continue;
    if (memberRoleIds.includes(role.id)) perms |= role.permissions;
  }
  return { permissions: perms, roles, everyone };
}

export interface Access {
  channel: ChannelRow;
  serverId: string | null;
  permissions: number;
  isDm: boolean;
  server?: ServerRow;
  isPlatformOwner: boolean;
}

/**
 * Resolve a channel plus the requesting user's effective permissions in it.
 * Returns null when the channel does not exist or the user may not see it.
 */
export async function getChannelAccess(
  db: D1Database,
  user: { id: string; is_owner: number },
  channelId: string,
): Promise<Access | null> {
  const channel = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(channelId).first<ChannelRow>();
  if (!channel) return null;
  const platformOwner = user.is_owner === 1 || false;

  if (!channel.server_id) {
    const member = await db
      .prepare("SELECT channel_id FROM dm_members WHERE channel_id = ? AND user_id = ?")
      .bind(channelId, user.id)
      .first();
    if (!member) return null;
    return {
      channel,
      serverId: null,
      isDm: true,
      permissions:
        P.VIEW_CHANNEL |
        P.SEND_MESSAGES |
        P.ATTACH_FILES |
        P.ADD_REACTIONS |
        P.READ_HISTORY |
        P.VOICE_CONNECT |
        P.VOICE_SPEAK |
        P.STREAM,
      isPlatformOwner: platformOwner,
    };
  }

  // Threads inherit the permissions of their parent channel.
  if (channel.type === "thread" && channel.parent_message_id) {
    const parentMsg = await db
      .prepare("SELECT channel_id FROM messages WHERE id = ?")
      .bind(channel.parent_message_id)
      .first<{ channel_id: string }>();
    if (parentMsg) {
      const parent = await getChannelAccess(db, user, parentMsg.channel_id);
      if (!parent || !has(parent.permissions, P.VIEW_CHANNEL)) return null;
      return { ...parent, channel };
    }
  }

  const member = await getServerMember(db, channel.server_id, user.id);
  if (!member) return null;
  const server = await db.prepare("SELECT * FROM servers WHERE id = ?").bind(channel.server_id).first<ServerRow>();
  if (!server) return null;

  const { permissions: base, roles } = await computeServerPerms(db, server, user.id, platformOwner);
  if (has(base, P.ADMINISTRATOR)) {
    return { channel, serverId: server.id, server, isDm: false, permissions: ALL_PERMS, isPlatformOwner: platformOwner };
  }

  const memberRoleIds = await getMemberRoleIds(db, server.id, user.id);
  const overwrites = await db
    .prepare("SELECT * FROM channel_overwrites WHERE channel_id = ?")
    .bind(channelId)
    .all<{ target_type: string; target_id: string; allow: number; deny: number }>();

  let allow = 0;
  let deny = 0;
  const everyone = roles.find((r) => r.is_everyone === 1);
  const everyoneOverwrite = overwrites.results.find(
    (o) => o.target_type === "role" && everyone && o.target_id === everyone.id,
  );
  if (everyoneOverwrite) {
    allow |= everyoneOverwrite.allow;
    deny |= everyoneOverwrite.deny;
  }
  for (const o of overwrites.results) {
    if (o.target_type === "role" && memberRoleIds.includes(o.target_id)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  const memberOverwrite = overwrites.results.find(
    (o) => o.target_type === "member" && o.target_id === user.id,
  );
  if (memberOverwrite) {
    allow |= memberOverwrite.allow;
    deny |= memberOverwrite.deny;
  }
  const permissions = (base & ~deny) | allow;
  if (!has(permissions, P.VIEW_CHANNEL)) return null;
  return { channel, serverId: server.id, server, isDm: false, permissions, isPlatformOwner: platformOwner };
}

export async function listAccessibleChannels(
  db: D1Database,
  user: { id: string; is_owner: number },
  serverId: string,
): Promise<{ channel: ChannelRow; permissions: number }[]> {
  const rows = await db
    .prepare("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC")
    .bind(serverId)
    .all<ChannelRow>();
  const out: { channel: ChannelRow; permissions: number }[] = [];
  for (const channel of rows.results) {
    if (channel.type === "thread") continue;
    const access = await getChannelAccess(db, user, channel.id);
    if (access && has(access.permissions, P.VIEW_CHANNEL)) out.push({ channel, permissions: access.permissions });
  }
  return out;
}

export async function audit(
  db: D1Database,
  entry: {
    serverId?: string | null;
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_logs (id, server_id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      entry.serverId ?? null,
      entry.actorId,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.meta ?? {}),
      now(),
    )
    .run();
}

export async function emit(
  db: D1Database,
  scope: "channel" | "server" | "user",
  refId: string,
  kind: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare("INSERT INTO event_log (scope, ref_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(scope, refId, kind, JSON.stringify(data), now())
    .run();
  if (Math.random() < 0.05) {
    await db.prepare("DELETE FROM event_log WHERE created_at < ?").bind(now() - 30 * 60 * 1000).run();
  }
}

export async function notify(
  db: D1Database,
  target: {
    userId: string;
    kind: string;
    title: string;
    body?: string;
    actorId?: string;
    serverId?: string;
    channelId?: string;
    messageId?: string;
  },
): Promise<void> {
  // Do Not Disturb means exactly that: nothing is written for an account in
  // that status, so no bell entry, toast, desktop alert or unread badge can be
  // produced from it. The check lives in the insert itself so every caller is
  // covered without having to remember it.
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, actor_id, server_id, channel_id, message_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE COALESCE((SELECT status FROM users WHERE id = ?), 'online') <> 'dnd'`,
    )
    .bind(
      crypto.randomUUID(),
      target.userId,
      target.kind,
      target.title,
      target.body ?? null,
      target.actorId ?? null,
      target.serverId ?? null,
      target.channelId ?? null,
      target.messageId ?? null,
      now(),
      target.userId,
    )
    .run();
}
