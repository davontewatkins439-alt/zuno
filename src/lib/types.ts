export interface QuestClaim {
  id: string;
  status: "pending" | "verified" | "rejected";
  submittedAt: number;
  reviewedAt: number | null;
  note: string | null;
  xp: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  category: "daily" | "weekly" | "beginner" | "event" | string;
  difficulty: "easy" | "medium" | "hard" | "elite" | string;
  xp: number;
  badge: string | null;
  verification: string;
  link: string | null;
  repeatable: boolean;
  active: boolean;
  state: "live" | "scheduled" | "ended" | "disabled";
  startsAt: number | null;
  endsAt: number | null;
  completedCount: number;
  claim: QuestClaim | null;
  canClaim: boolean;
}

export interface QuestSummary {
  xp: number;
  level: number;
  intoLevel: number;
  nextLevelXp: number;
  streak: number;
  bestStreak: number;
  completed: number;
  pending: number;
  referrals: number;
  referralCode: string;
  roblox: { username: string; userId: string; verified: boolean; code: string | null } | null;
}

export interface QuestHistoryEntry {
  id: string;
  questId: string;
  title: string;
  status: "pending" | "verified" | "rejected";
  xp: number;
  at: number;
  note: string | null;
}

export interface QuestBoardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  xp: number;
  streak: number;
  isOwner: boolean;
  badges: Badge[];
}

export interface Badge {
  slug: string;
  name: string;
  color: string;
  glyph: string;
  art?: string | null;
  unique?: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  bannerId: string | null;
  bio: string | null;
  customStatus: string | null;
  status: "online" | "idle" | "dnd" | "offline" | string;
  lastSeenAt: number;
  accentColor: string;
  platformRole: string;
  isOwner: boolean;
  plusUntil: number | null;
  plusActive: boolean;
  plusTheme: string | null;
  plusDecoration: string | null;
  createdAt: number;
  banned?: boolean;
  email?: string | null;
  serverCount?: number;
  badges: Badge[];
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface ServerSummary {
  id: string;
  name: string;
  iconId: string | null;
  bannerId: string | null;
  description: string | null;
  isPublic: boolean;
  inviteCode: string | null;
  ownerId: string;
  createdAt: number;
  category?: string;
  tag?: string | null;
  tagBadge?: string | null;
  boostGoal?: number;
  boostBar?: boolean;
  unreadCount: number;
  mentionCount: number;
  folderId: string | null;
  position: number;
  nickname: string | null;
}

export interface LastMessage {
  id: string;
  preview: string;
  createdAt: number;
  authorId: string;
  authorName: string;
  isMine: boolean;
}

export interface DMChannel {
  id: string;
  type: "dm" | "group";
  name: string;
  iconId: string | null;
  isRequest: boolean;
  unreadCount: number;
  lastMessageAt: number | null;
  lastMessage: LastMessage | null;
  participants: User[];
}

export interface CallInfo {
  id: string;
  channelId: string;
  kind: "audio" | "video";
  status: "ringing" | "active" | "declined" | "ended" | "missed";
  callerId: string;
  caller: User | null;
  createdAt: number;
  answeredAt: number | null;
}

export interface PlusState {
  configured: boolean;
  priceLabel: string;
  subscription: { provider: string; status: string; source: string; currentPeriodEnd: number | null } | null;
}

export interface PlatformConfig {
  siteName: string;
  tagline: string;
  registrationOpen: boolean;
  discoveryEnabled: boolean;
  maintenance: boolean;
  maintenanceMessage: string;
  inviteOnly: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: number;
}

export interface Me {
  user: User;
  servers: ServerSummary[];
  dms: DMChannel[];
  requests: DMChannel[];
  folders: Folder[];
  totals: { dms: number; mentions: number };
  plus: PlusState;
  config: PlatformConfig;
  announcements: Announcement[];
  ownerConfigured?: boolean;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  is_everyone: number;
  memberCount?: number;
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  server_id: string | null;
  category_id: string | null;
  name: string;
  type: "text" | "voice" | "thread" | "dm" | "group";
  topic: string | null;
  position: number;
  is_private: number;
  slowmode: number;
  parent_message_id: string | null;
  created_at: number;
  last_message_at: number | null;
}

export interface ServerMember extends User {
  nickname: string | null;
  joinedAt: number;
  serverAvatarId: string | null;
  serverBio: string | null;
  roleIds: string[];
  isServerOwner: boolean;
}

export interface VoiceState {
  channelId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarId: string | null;
  accentColor: string | null;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  badges: Badge[];
}

export interface ServerEvent {
  id: string;
  name: string;
  description: string | null;
  startsAt: number;
  endsAt: number | null;
  location: string | null;
  createdBy: string;
}

export interface ServerEmoji {
  id: string;
  server_id: string;
  name: string;
  file_id: string;
}

export interface ServerDetail {
  server: ServerSummary & {
    memberCount: number;
    onlineCount: number;
    welcomeMessage: string | null;
    rules: string | null;
    isOwner: boolean;
  };
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  myRoles: { id: string; name: string; color: string | null }[];
  permissions: number;
  members: ServerMember[];
  voiceStates: VoiceState[];
  emojis: ServerEmoji[];
  events: ServerEvent[];
  announcements: Announcement[];
  permissionMeta: PermissionMeta[];
  boosts: {
    count: number;
    mine: boolean;
    goal: number;
    users: { userId: string; username: string; displayName: string; avatarId: string | null; since: number }[];
  };
}

export interface PermissionMeta {
  key: string;
  label: string;
  description: string;
  group: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface Attachment {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  accentColor: string | null;
  isOwner: boolean;
  plusActive: boolean;
  plusTheme: string | null;
  plusDecoration: string | null;
  badges: Badge[];
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  system: boolean;
  sticker: string | null;
  gifUrl: string | null;
  pinned: boolean;
  author: MessageAuthor;
  replyTo: { id: string; preview: string; authorName: string } | null;
  reactions: Reaction[];
  attachments: Attachment[];
  thread: { id: string; replies: number; lastActivity: number | null } | null;
  channelName?: string;
}

export interface FriendRequest {
  id: string;
  message: string | null;
  createdAt: number;
  user: User;
}

export interface FriendsData {
  friends: User[];
  incoming: FriendRequest[];
  outgoing: { id: string; createdAt: number; user: User }[];
  blocked: User[];
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  actorId: string | null;
  serverId: string | null;
  channelId: string | null;
  messageId: string | null;
  read: boolean;
  createdAt: number;
}

export interface ThreadSummary {
  id: string;
  name: string;
  parentMessageId: string;
  replies: number;
  lastActivity: number | null;
  createdAt: number;
}

export interface InvitePreview {
  invite: { code: string; uses: number };
  server: {
    id: string;
    name: string;
    description: string | null;
    iconId: string | null;
    memberCount: number;
    onlineCount: number;
  };
}

export interface DiscoverServer extends ServerSummary {
  memberCount: number;
  onlineCount: number;
  joined: boolean;
  categories: string[];
  channels: { name: string; type: string }[];
  boostCount: number;
}

export interface PublicConfig {
  siteName: string;
  tagline: string;
  registrationOpen: boolean;
  maintenance: boolean;
  maintenanceMessage: string;
  discoveryEnabled: boolean;
  ownerConfigured: boolean;
  plusLabel: string;
  demo?: boolean;
}

export interface UserProfile {
  user: User;
  mutualServers: { id: string; name: string; iconId: string | null }[];
  rolesByServer: { name: string; role_name: string | null; color: string | null }[];
  isFriend: boolean;
  isBlocked: boolean;
  dmChannelId: string | null;
  canModerate: boolean;
}

export interface OwnerOverview {
  counts: {
    users: number;
    activeToday: number;
    servers: number;
    channels: number;
    messages: number;
    messagesToday: number;
    openReports: number;
    openAppeals: number;
    pendingApplications: number;
    plusMembers: number;
    bannedUsers: number;
  };
  recentUsers: User[];
  topServers: { id: string; name: string; iconId: string | null; memberCount: number }[];
  recentAudit: {
    id: string;
    action: string;
    actorName: string;
    serverName: string | null;
    createdAt: number;
    meta: string | null;
  }[];
}
