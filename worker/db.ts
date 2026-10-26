import type { Env } from "./env";
import { hashPassword } from "./auth";
import { now } from "./lib";

const SCHEMA_VERSION = 11;

const SCHEMA: string[] = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, username TEXT NOT NULL,
    display_name TEXT, password_hash TEXT NOT NULL, avatar_id TEXT, banner_id TEXT,
    bio TEXT, custom_status TEXT, status TEXT NOT NULL DEFAULT 'online',
    last_seen_at INTEGER NOT NULL DEFAULT 0, accent_color TEXT,
    platform_role TEXT NOT NULL DEFAULT 'user', is_owner INTEGER NOT NULL DEFAULT 0,
    plus_until INTEGER, plus_theme TEXT, plus_decoration TEXT,
    platform_banned INTEGER NOT NULL DEFAULT 0, platform_ban_reason TEXT,
    created_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
  "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, key TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT 'channel', created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS badges (slug TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT NOT NULL, glyph TEXT NOT NULL, art TEXT, unique_flag INTEGER NOT NULL DEFAULT 0, premium INTEGER NOT NULL DEFAULT 0, automatic INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS user_badges (user_id TEXT NOT NULL, badge_slug TEXT NOT NULL, granted_by TEXT, granted_at INTEGER NOT NULL, PRIMARY KEY (user_id, badge_slug))",
  "CREATE TABLE IF NOT EXISTS servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon_id TEXT, banner_id TEXT, owner_id TEXT NOT NULL, description TEXT, is_public INTEGER NOT NULL DEFAULT 0, invite_code TEXT NOT NULL UNIQUE, welcome_message TEXT, rules TEXT, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS server_members (server_id TEXT NOT NULL, user_id TEXT NOT NULL, nickname TEXT, joined_at INTEGER NOT NULL, server_avatar_id TEXT, server_bio TEXT, PRIMARY KEY (server_id, user_id))",
  "CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id)",
  "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, permissions INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, is_everyone INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id, position)",
  "CREATE TABLE IF NOT EXISTS member_roles (server_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (server_id, user_id, role_id))",
  "CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, server_id TEXT, category_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text', topic TEXT, position INTEGER NOT NULL DEFAULT 0, is_private INTEGER NOT NULL DEFAULT 0, slowmode INTEGER NOT NULL DEFAULT 0, parent_message_id TEXT, created_at INTEGER NOT NULL, last_message_at INTEGER)",
  "CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position)",
  "CREATE TABLE IF NOT EXISTS channel_overwrites (channel_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, allow INTEGER NOT NULL DEFAULT 0, deny INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel_id, target_type, target_id))",
  "CREATE TABLE IF NOT EXISTS dm_members (channel_id TEXT NOT NULL, user_id TEXT NOT NULL, request_for TEXT, PRIMARY KEY (channel_id, user_id))",
  "CREATE INDEX IF NOT EXISTS idx_dm_members_user ON dm_members(user_id)",
  "CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, author_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', reply_to_id TEXT, system INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, edited_at INTEGER, deleted_at INTEGER, pinned_at INTEGER, pinned_by TEXT, sticker TEXT, gif_url TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at)",
  "CREATE TABLE IF NOT EXISTS reactions (message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id, emoji))",
  "CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, file_id TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)",
  "CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, server_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS bans (server_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT, banned_by TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (server_id, user_id))",
  "CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, server_id TEXT, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT, target_id TEXT, meta TEXT, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_logs(server_id, created_at)",
  "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_user_id TEXT, server_id TEXT, message_id TEXT, reason TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolution TEXT, resolved_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS appeals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, reviewed_by TEXT, review_note TEXT, reviewed_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS server_events (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, starts_at INTEGER NOT NULL, ends_at INTEGER, location TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, scope TEXT NOT NULL, server_id TEXT, author_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS emojis (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, file_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(server_id, name))",
  "CREATE TABLE IF NOT EXISTS read_states (user_id TEXT NOT NULL, channel_id TEXT NOT NULL, last_read_at INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id))",
  "CREATE TABLE IF NOT EXISTS friendships (user_id TEXT NOT NULL, friend_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, friend_id))",
  "CREATE TABLE IF NOT EXISTS friend_requests (id TEXT PRIMARY KEY, from_user TEXT NOT NULL, to_user TEXT NOT NULL, message TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, responded_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS blocks (user_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, blocked_id))",
  "CREATE TABLE IF NOT EXISTS voice_states (channel_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL, muted INTEGER NOT NULL DEFAULT 0, deafened INTEGER NOT NULL DEFAULT 0, video INTEGER NOT NULL DEFAULT 0, screen INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (channel_id, user_id))",
  "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, actor_id TEXT, server_id TEXT, channel_id TEXT, message_id TEXT, read_at INTEGER, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at)",
  "CREATE TABLE IF NOT EXISTS plus_subscriptions (user_id TEXT PRIMARY KEY, provider TEXT NOT NULL, customer_ref TEXT, subscription_ref TEXT, status TEXT NOT NULL, source TEXT NOT NULL, current_period_end INTEGER, updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staff_applications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, position TEXT NOT NULL, why TEXT NOT NULL, experience TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, reviewed_by TEXT, review_note TEXT, reviewed_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS server_folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#2f7cff', position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS server_layout (user_id TEXT NOT NULL, server_id TEXT NOT NULL, folder_id TEXT, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, server_id))",
  "CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, ref_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_event_log_scope ON event_log(scope, ref_id, id)",
  "CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, caller_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'audio', status TEXT NOT NULL DEFAULT 'ringing', created_at INTEGER NOT NULL, answered_at INTEGER, ended_at INTEGER)",
  "CREATE INDEX IF NOT EXISTS idx_calls_channel ON calls(channel_id, status)",
  // ---- ZUNO QUESTS -------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS quests (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, instructions TEXT,
    category TEXT NOT NULL DEFAULT 'daily', difficulty TEXT NOT NULL DEFAULT 'easy',
    xp INTEGER NOT NULL DEFAULT 50, badge_slug TEXT, verification TEXT NOT NULL DEFAULT 'manual',
    target TEXT, link TEXT, repeatable INTEGER NOT NULL DEFAULT 0, cooldown_hours INTEGER NOT NULL DEFAULT 24,
    active INTEGER NOT NULL DEFAULT 1, starts_at INTEGER, ends_at INTEGER, sort INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quest_claims (
    id TEXT PRIMARY KEY, quest_id TEXT NOT NULL, user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', period_key TEXT NOT NULL DEFAULT 'once',
    evidence TEXT, submitted_at INTEGER NOT NULL, reviewed_by TEXT, review_note TEXT,
    reviewed_at INTEGER, xp_awarded INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_quest_claims_user ON quest_claims(user_id, quest_id)",
  "CREATE INDEX IF NOT EXISTS idx_quest_claims_status ON quest_claims(status, submitted_at)",
  // One open/verified claim per period is the database-level guard against
  // duplicate rewards; rejected claims may be retried.
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_quest_claims_period ON quest_claims(quest_id, user_id, period_key) WHERE status <> 'rejected'",
  "CREATE TABLE IF NOT EXISTS quest_xp (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, quest_id TEXT, amount INTEGER NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_quest_xp_user ON quest_xp(user_id, created_at)",
  "CREATE TABLE IF NOT EXISTS roblox_links (user_id TEXT PRIMARY KEY, roblox_user_id TEXT NOT NULL, roblox_username TEXT NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS referrals (invitee_id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL, credited INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, credited)",
  // ---- ZUNO boosts + server identity -----------------------------------
  "CREATE TABLE IF NOT EXISTS server_boosts (server_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (server_id, user_id))",
  // ---- ZUNO nameplates --------------------------------------------------
  `CREATE TABLE IF NOT EXISTS nameplates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, rarity TEXT NOT NULL DEFAULT 'standard',
    unlock TEXT NOT NULL DEFAULT 'free', animation TEXT, active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0, released_at INTEGER NOT NULL DEFAULT 0, available_until INTEGER
  )`,
  "CREATE TABLE IF NOT EXISTS user_nameplates (user_id TEXT NOT NULL, nameplate_id TEXT NOT NULL, granted_by TEXT, granted_at INTEGER NOT NULL, PRIMARY KEY (user_id, nameplate_id))",
  "CREATE TABLE IF NOT EXISTS nameplate_favorites (user_id TEXT NOT NULL, nameplate_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, nameplate_id))",
  "CREATE INDEX IF NOT EXISTS idx_nameplate_favorites_user ON nameplate_favorites(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_server_boosts_server ON server_boosts(server_id)",
];

async function ensureColumn(env: Env, table: string, column: string, ddl: string): Promise<void> {
  const cols = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!cols.results.some((col) => col.name === column)) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  }
}

// The owner's PLUS is complimentary and never depends on a payment. Members keep
// buying, gifting and managing their own memberships normally.
async function ensureOwnerPlusOnce(env: Env): Promise<void> {
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = 'owner_plus_v1'")
    .first<{ value: string }>()
    .catch(() => null);
  if (done) return;
  const t = now();
  const until = t + 100 * 365 * 24 * 60 * 60 * 1000;
  await env.DB.prepare("UPDATE users SET plus_until = ? WHERE is_owner = 1").bind(until).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) SELECT id, 'plus', NULL, ? FROM users WHERE is_owner = 1",
  )
    .bind(t)
    .run();
  await env.DB.prepare(
    `INSERT INTO plus_subscriptions (user_id, provider, customer_ref, subscription_ref, status, source, current_period_end, updated_at)
     SELECT id, 'complimentary', NULL, NULL, 'active', 'owner', ?, ? FROM users WHERE is_owner = 1
     ON CONFLICT(user_id) DO UPDATE SET provider = 'complimentary', status = 'active', source = 'owner',
     current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
  )
    .bind(until, t)
    .run();
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('owner_plus_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
}

async function ensureBadgeArtOnce(env: Env): Promise<void> {
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = 'badges_art_v1'")
    .first<{ value: string }>()
    .catch(() => null);
  if (done) return;
  await ensureBadgeArt(env);
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('badges_art_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run();
}

export async function ensureSchema(env: Env): Promise<void> {
  const existing = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .first<{ value: string }>()
    .catch(() => null);
  if (existing && Number(existing.value) >= SCHEMA_VERSION) {
    await ensureBadgeArtOnce(env);
    await ensureOwnerPlusOnce(env);
    await ensureQuestsOnce(env);
    await ensureNameplatesOnce(env);
    return;
  }
  for (const sql of SCHEMA) {
    await env.DB.prepare(sql).run();
  }
  await ensureColumn(env, "badges", "art", "art TEXT");
  await ensureColumn(env, "badges", "unique_flag", "unique_flag INTEGER NOT NULL DEFAULT 0");
  // Quest progression lives on the user row so profiles and leaderboards can
  // read it without a join.
  await ensureColumn(env, "users", "xp", "xp INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "users", "quest_streak", "quest_streak INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "users", "quest_streak_day", "quest_streak_day TEXT");
  await ensureColumn(env, "users", "quest_streak_best", "quest_streak_best INTEGER NOT NULL DEFAULT 0");
  // Server identity: discovery category, the short member tag, and boosts.
  await ensureColumn(env, "servers", "category", "category TEXT NOT NULL DEFAULT 'social'");
  await ensureColumn(env, "servers", "tag", "tag TEXT");
  await ensureColumn(env, "servers", "tag_badge", "tag_badge TEXT");
  await ensureColumn(env, "servers", "boost_goal", "boost_goal INTEGER NOT NULL DEFAULT 10");
  await ensureColumn(env, "servers", "boost_bar", "boost_bar INTEGER NOT NULL DEFAULT 1");
  await ensureColumn(env, "users", "nameplate", "nameplate TEXT");
  // Limited-edition plates retire after a date; released_at drives the NEW tag.
  await ensureColumn(env, "nameplates", "released_at", "released_at INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "nameplates", "available_until", "available_until INTEGER");
  await env.DB.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(String(SCHEMA_VERSION))
    .run();
  await seedBadges(env);
  await ensureBadgeArtOnce(env);
  await ensureOwnerPlusOnce(env);
  await ensureQuestsOnce(env);
  await ensureNameplatesOnce(env);
  if (env.DEMO_SEED === "true") await seedDemo(env).catch((err) => console.error("seed failed", err));
}

export const BADGE_ARTS = [
  "origin",
  "seal",
  "bloom",
  "shield",
  "blade",
  "terminal",
  "prism",
  "laurel",
  "sprout",
  "pulse",
  "arcade",
  "spark",
] as const;

const SYSTEM_BADGE_ART: Record<string, string> = {
  owner: "origin",
  verified: "seal",
  admin: "shield",
  manager: "bloom",
  moderator: "blade",
  developer: "terminal",
  support: "pulse",
  events: "laurel",
  plus: "prism",
  booster: "arcade",
  founder: "sprout",
  creator: "pulse",
  event_winner: "laurel",
  early_supporter: "spark",
  quest_recruit: "laurel",
  quest_streak: "spark",
  quest_legend: "origin",
};

export async function seedBadges(env: Env): Promise<void> {
  // slug, name, description, colour, glyph, art, unique, premium, automatic, sort
  const badges: [string, string, string, string, string, string, number, number, number, number][] = [
    ["owner", "ZUNO OWNER", "1 of 1 — the founding account of ZUNO.", "#5fe3ff", "crown", "origin", 1, 0, 0, 100],
    ["verified", "VERIFIED", "Identity verified by the ZUNO team.", "#2f7cff", "check", "seal", 0, 0, 0, 90],
    ["admin", "ADMIN", "Platform administrator with broad oversight.", "#f87171", "shield", "shield", 0, 0, 0, 80],
    ["manager", "MANAGER", "Leads platform operations and staff.", "#f472b6", "layers", "bloom", 0, 0, 0, 75],
    ["moderator", "MODERATOR", "Keeps ZUNO communities safe.", "#34d399", "gavel", "blade", 0, 0, 0, 70],
    ["developer", "DEVELOPER", "Builds and maintains ZUNO itself.", "#8b5cf6", "code", "terminal", 0, 0, 0, 65],
    ["support", "SUPPORT AGENT", "Helps members with questions and account problems.", "#38bdf8", "headset", "pulse", 0, 0, 0, 63],
    ["events", "EVENTS HOST", "Runs community events, watch parties and voice nights.", "#fb923c", "calendar", "laurel", 0, 0, 0, 62],
    ["plus", "ZUNO PLUS", "Active ZUNO PLUS member.", "#fbbf24", "sparkles", "prism", 0, 1, 1, 60],
    ["booster", "BOOSTER", "Boosted a community they love.", "#f472b6", "rocket", "arcade", 0, 0, 0, 50],
    ["founder", "COMMUNITY FOUNDER", "Founded a thriving ZUNO community.", "#a3e635", "flag", "sprout", 0, 0, 0, 45],
    ["creator", "CONTENT CREATOR", "Creates content featured across ZUNO.", "#c084fc", "pen", "pulse", 0, 0, 0, 40],
    ["event_winner", "EVENT WINNER", "Won an official ZUNO community event.", "#facc15", "trophy", "laurel", 0, 0, 0, 35],
    ["early_supporter", "EARLY SUPPORTER", "Supported ZUNO from the very beginning.", "#5fe3ff", "heart", "spark", 0, 0, 0, 30],
    ["quest_recruit", "QUEST ROOKIE", "Completed their first verified ZUNO quest.", "#5fe3ff", "trophy", "laurel", 0, 0, 1, 28],
    ["quest_streak", "STREAK KEEPER", "Held a 7-day quest streak.", "#fb923c", "sparkles", "spark", 0, 0, 1, 27],
    ["quest_legend", "QUEST LEGEND", "Reached quest level 10.", "#c084fc", "trophy", "origin", 0, 0, 1, 26],
  ];
  for (const [slug, name, description, color, glyph, art, unique, premium, automatic, sort] of badges) {
    await env.DB.prepare(
      "INSERT INTO badges (slug, name, description, color, glyph, art, unique_flag, premium, automatic, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING",
    )
      .bind(slug, name, description, color, glyph, art, unique, premium, automatic, sort)
      .run();
  }
}

// Applies the original badge artwork to installs created before it existed.
export async function ensureBadgeArt(env: Env): Promise<void> {
  for (const [slug, art] of Object.entries(SYSTEM_BADGE_ART)) {
    await env.DB.prepare("UPDATE badges SET art = ? WHERE slug = ? AND (art IS NULL OR art = '')")
      .bind(art, slug)
      .run();
  }
  await env.DB.prepare("UPDATE badges SET unique_flag = 1 WHERE slug = 'owner'").run();
  await env.DB.prepare("UPDATE badges SET color = '#f472b6' WHERE slug = 'manager' AND color = '#f59e0b'").run();
}

/* ------------------------------------------------------------------ */
/* Default quest catalogue. Ids are stable so the site can link to them.*/
/* ------------------------------------------------------------------ */

async function ensureQuestsOnce(env: Env): Promise<void> {
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = 'quests_seed_v1'")
    .first<{ value: string }>()
    .catch(() => null);
  if (done) return;
  const owner = await env.DB.prepare("SELECT id FROM users WHERE is_owner = 1 LIMIT 1")
    .first<{ id: string }>()
    .catch(() => null);
  const createdBy = owner?.id ?? "system";
  const t = now();
  // title, description, instructions, category, difficulty, xp, verification,
  // target, link, repeatable, cooldown hours, sort
  const quests: [string, string, string, string, string, string, number, string, string, string, number, number, number][] = [
    [
      "q_daily_login",
      "Daily check-in",
      "Stop by ZUNO once a day to keep your streak alive.",
      "Open ZUNO and press Claim. We check your last sign-in on the server, so there is nothing to paste.",
      "daily",
      "easy",
      40,
      "login",
      "",
      "",
      1,
      24,
      100,
    ],
    [
      "q_roblox_group",
      "Join the official ZUNO Roblox group",
      "Join our group on Roblox and ZUNO verifies it for you.",
      "Link your Roblox account (profile code), then press Verify. We read your public group list directly from Roblox.",
      "beginner",
      "easy",
      120,
      "group_membership",
      "",
      "https://www.roblox.com/communities",
      0,
      0,
      90,
    ],
    [
      "q_roblox_game",
      "Play the official ZUNO Roblox game",
      "Jump into our Roblox game and play a round.",
      "Roblox does not expose play history to third parties. Send your Roblox username after playing and a moderator confirms it.",
      "beginner",
      "medium",
      150,
      "game_visit",
      "",
      "https://www.roblox.com/games",
      1,
      24,
      80,
    ],
    [
      "q_roblox_milestone",
      "Reach an in-game milestone",
      "Hit the milestone our team announced for this season.",
      "Describe or screenshot the milestone. In-game progress cannot be read through a public Roblox API, so staff review it.",
      "event",
      "hard",
      300,
      "manual",
      "",
      "",
      0,
      0,
      70,
    ],
    [
      "q_join_community",
      "Join the ZUNO community",
      "Become a member of our official ZUNO server.",
      "Join the community with an invite, then press Verify. Membership is checked against the server itself.",
      "beginner",
      "easy",
      80,
      "community",
      "",
      "",
      0,
      0,
      60,
    ],
    [
      "q_invite_friends",
      "Invite 3 friends to ZUNO",
      "Share your referral link and bring three real people to ZUNO.",
      "Copy your referral link below. Each account that signs up with it counts once, and self-referrals are ignored.",
      "weekly",
      "medium",
      200,
      "referral",
      "3",
      "",
      1,
      168,
      50,
    ],
  ];
  for (const [id, title, description, instructions, category, difficulty, xp, verification, target, link, repeatable, cooldown, sort] of quests) {
    await env.DB.prepare(
      `INSERT INTO quests (id, title, description, instructions, category, difficulty, xp, verification, target, link, repeatable, cooldown_hours, active, sort, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
      .bind(id, title, description, instructions, category, difficulty, xp, verification, target, link, repeatable, cooldown, sort, createdBy, t, t)
      .run();
  }
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('quests_seed_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
}


/* ------------------------------------------------------------------ */
/* Nameplates — the ZUNO profile banner behind your name.              */
/* ------------------------------------------------------------------ */

async function ensureNameplatesOnce(env: Env): Promise<void> {
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = 'nameplates_seed_v3'")
    .first<{ value: string }>()
    .catch(() => null);
  if (done) return;
  const t = now();
  const day = 86_400_000;
  const plates: [string, string, string, string, string, string | null, number][] = [
    [
      "midnight-circuit",
      "Midnight Circuit",
      "The founding ZUNO plate: electric blue into icy cyan.",
      "standard",
      "free",
      "shimmer",
      90,
    ],
    ["neon-rain", "Neon Rain", "Violet downpour with a slow cyan sheen.", "premium", "plus", "rain", 80],
    ["ghost-signal", "Ghost Signal", "Cold steel and static for low-key profiles.", "standard", "plus", "flicker", 70],
    ["solar-flare", "Solar Flare", "Amber heat that bleeds into deep red.", "premium", "plus", "pulse", 60],
    ["deep-current", "Deep Current", "Abyssal blue with a teal undertow.", "standard", "plus", null, 50],
    ["static-bloom", "Static Bloom", "Pink and violet bloom caught mid-glitch.", "premium", "plus", "rain", 40],
    ["city-lights", "City Lights", "Every neon sign on the block at once.", "legendary", "plus", "shimmer", 30],
    ["origin", "Origin", "1 of 1 — reserved for the ZUNO owner account.", "legendary", "owner", "shimmer", 100],
  ];
  for (const [id, name, description, rarity, unlock, animation, sort] of plates) {
    await env.DB.prepare(
      "INSERT INTO nameplates (id, name, description, rarity, unlock, animation, active, sort) VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(id, name, description, rarity, unlock, animation, sort)
      .run();
  }

  // Seasonal drop. `available_until` retires a plate for everyone but the
  // owner; anything already unlocked stays usable.
  const drop: [string, string, string, string, string, number, number | null][] = [
    ["lunar-static", "Lunar Static", "Pale moonlight over a quiet signal band.", "premium", "plus", 88, t + 9 * day],
    ["hexglow", "Hexglow", "Witchfire hexes burning violet into amber.", "premium", "plus", 86, t + 8 * day],
    ["prism-riot", "Prism Riot", "Shattered glass throwing every colour at once.", "premium", "plus", 76, null],
    ["carbon-bloom", "Carbon Bloom", "Matte carbon weave with a mint undertow.", "standard", "plus", 66, null],
    ["ice-vault", "Ice Vault", "Frosted facets locked behind reinforced glass.", "standard", "free", 56, null],
    ["afterglow", "Afterglow", "The last warm light after the neon dies.", "premium", "plus", 46, null],
  ];
  for (const [id, name, description, rarity, unlock, sort, availableUntil] of drop) {
    await env.DB.prepare(
      "INSERT INTO nameplates (id, name, description, rarity, unlock, animation, active, sort, released_at, available_until) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(id, name, description, rarity, unlock, sort, t, availableUntil)
      .run();
  }
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('nameplates_seed_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('nameplates_seed_v2', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();

  // Owner tier: never unlockable through any rule but ownership. Kept last in
  // the catalogue so they sit at the top of the shop.
  const ownerPlates: [string, string, string, number][] = [
    ["zuno-1of1", "ZUNO 1 OF 1", "One account. One copy. The hardest plate on the platform.", 99],
    ["onyx-crown", "Onyx Crown", "Matte black crownwork, struck in gold.", 98],
    ["obsidian-halo", "Obsidian Halo", "A cold ring of light over pure obsidian.", 97],
    ["chrome-liquid", "Chrome Liquid", "Liquid chrome poured across the pill.", 96],
    ["glitch-sovereign", "Glitch Sovereign", "A signature that refuses to render cleanly.", 95],
    ["noir-sigil", "Noir Sigil", "ZUNO struck in gold on black.", 94],
    ["the-founder", "The Founder", "The mascot plate, reserved for the account that built ZUNO.", 93],
  ];
  for (const [id, name, description, sort] of ownerPlates) {
    await env.DB.prepare(
      "INSERT INTO nameplates (id, name, description, rarity, unlock, animation, active, sort, released_at, available_until) VALUES (?, ?, ?, 'legendary', 'owner', 'shimmer', 1, ?, ?, NULL) ON CONFLICT(id) DO NOTHING",
    )
      .bind(id, name, description, sort, t)
      .run();
  }
  await env.DB.prepare(
    "UPDATE nameplates SET description = 'The founding plate, reserved for the ZUNO owner account.' WHERE id = 'origin'",
  ).run();
  // The owner account lands on the top plate unless they already chose one.
  await env.DB.prepare(
    "UPDATE users SET nameplate = 'zuno-1of1' WHERE is_owner = 1 AND (nameplate IS NULL OR nameplate = '')",
  ).run();
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('nameplates_seed_v3', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
}

/* ------------------------------------------------------------------ */
/* Demo community so a fresh install is not an empty shell.            */
/* ------------------------------------------------------------------ */

async function seedDemo(env: Env): Promise<void> {
  const seeded = await env.DB.prepare("SELECT value FROM site_config WHERE key = 'demo_seeded'").first();
  if (seeded) return;
  const db = env.DB;
  const run = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
  const t = now();
  const day = 86_400_000;
  const demoHash = await hashPassword("ZunoDemo!2026");
  const ownerHash = await hashPassword("ZunoOwner!2026");

  type SeedUser = {
    id: string;
    email: string;
    username: string;
    display: string;
    bio: string;
    accent: string;
    status: string;
    role: string;
    owner?: boolean;
    ownerPassword?: boolean;
    plus?: number;
    theme?: string;
    decoration?: string;
    status_text?: string;
    badges: string[];
  };

  const users: SeedUser[] = [
    {
      id: "u_astra",
      email: "astra@zuno.gg",
      username: "astra",
      display: "Astra",
      bio: "Founder of the ZUNO HQ community. Designing the midnight city, one channel at a time.",
      accent: "#5fe3ff",
      status: "online",
      role: "user",
      ownerPassword: true,
      status_text: "building ZUNO",
      badges: ["founder", "verified", "early_supporter"],
    },
    {
      id: "u_nova",
      email: "nova@zuno.gg",
      username: "nova",
      display: "Nova Vex",
      bio: "Community lead. Neon Arena admin. Always down for a late-night tournament.",
      accent: "#8b5cf6",
      status: "online",
      role: "user",
      plus: t + 30 * day,
      theme: "aurora",
      decoration: "holo",
      status_text: "queueing ranked",
      badges: ["plus", "creator", "early_supporter"],
    },
    {
      id: "u_kiro",
      email: "kiro@zuno.gg",
      username: "kiro",
      display: "Kiro",
      bio: "Systems engineer for ZUNO. I break things so you don't have to.",
      accent: "#34d399",
      status: "dnd",
      role: "developer",
      status_text: "in the code mines",
      badges: ["developer", "early_supporter"],
    },
    {
      id: "u_mira",
      email: "mira@zuno.gg",
      username: "mira",
      display: "Mira Sol",
      bio: "Design manager. Curating the ZUNO visual language and Midnight Studio.",
      accent: "#f472b6",
      status: "online",
      role: "manager",
      plus: t + 12 * day,
      theme: "midnight",
      badges: ["manager", "plus", "creator", "early_supporter"],
    },
    {
      id: "u_dex",
      email: "dex@zuno.gg",
      username: "dex",
      display: "Dex",
      bio: "Moderation crew. Report it, I'll handle it.",
      accent: "#f59e0b",
      status: "idle",
      role: "moderator",
      badges: ["moderator", "booster"],
    },
    {
      id: "u_luna",
      email: "luna@zuno.gg",
      username: "luna",
      display: "Luna",
      bio: "Pixel artist. Sticker goblin.",
      accent: "#a3e635",
      status: "online",
      role: "user",
      badges: ["early_supporter"],
    },
    {
      id: "u_riven",
      email: "riven@zuno.gg",
      username: "riven",
      display: "Riven",
      bio: "Here for the voice chats.",
      accent: "#2f7cff",
      status: "invisible",
      role: "user",
      badges: [],
    },
  ];

  for (const u of users) {
    await run(
      `INSERT INTO users (id, email, username, display_name, password_hash, bio, custom_status, status, last_seen_at, accent_color, platform_role, is_owner, plus_until, plus_theme, plus_decoration, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id,
      u.email,
      u.username,
      u.display,
      u.owner || u.ownerPassword ? ownerHash : demoHash,
      u.bio,
      u.status_text ?? null,
      u.status,
      t - (u.status === "invisible" ? 60 * 60 * 1000 : 5_000),
      u.accent,
      u.role,
      u.owner ? 1 : 0,
      u.plus ?? null,
      u.theme ?? null,
      u.decoration ?? null,
      t - 120 * day,
    );
    for (const b of u.badges) {
      await run(
        "INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, ?, ?, ?)",
        u.id,
        b,
        "u_astra",
        t - 90 * day,
      );
    }
    if (u.plus) {
      await run(
        "INSERT INTO plus_subscriptions (user_id, provider, status, source, current_period_end, updated_at) VALUES (?, 'complimentary', 'active', 'complimentary', ?, ?)",
        u.id,
        u.plus,
        t,
      );
    }
  }

  const cfg: [string, string][] = [
    ["site_name", "ZUNO"],
    ["tagline", "Your city after dark."],
    ["registration_open", "true"],
    ["discovery_enabled", "true"],
    ["maintenance_mode", "false"],
    ["maintenance_message", "ZUNO is getting an upgrade. We'll be back in a moment."],
    ["plus_price_label", "$4.99 / month"],
    ["demo_seeded", "1"],
    ["invite_only", "false"],
  ];
  for (const [k, v] of cfg) await run("INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)", k, v);

  // ---- Servers ----
  const everyoneBase =
    (1 << 11) | (1 << 12) | (1 << 13) | (1 << 8) | (1 << 15) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 20);

  type SeedServer = {
    id: string;
    name: string;
    owner: string;
    description: string;
    categories: { id: string; name: string }[];
    channels: { id: string; name: string; type?: string; category: string; topic?: string; private?: boolean }[];
    roles: { id: string; name: string; color: string; permissions: number; position: number; everyone?: boolean }[];
    members: { id: string; roles: string[]; nickname?: string }[];
    iconColor: string;
  };

  const servers: SeedServer[] = [
    {
      id: "s_hq",
      name: "ZUNO HQ",
      owner: "u_astra",
      description: "The official ZUNO community. Announcements, feedback, and the people building the platform.",
      iconColor: "#2f7cff",
      categories: [
        { id: "c_hq_info", name: "INFORMATION" },
        { id: "c_hq_community", name: "COMMUNITY" },
        { id: "c_hq_voice", name: "VOICE" },
      ],
      channels: [
        { id: "ch_welcome", name: "welcome", category: "c_hq_info", topic: "Start here. Read the rules, grab a role, say hi." },
        { id: "ch_announce", name: "announcements", category: "c_hq_info", topic: "Official ZUNO platform announcements." },
        { id: "ch_general", name: "general", category: "c_hq_community", topic: "Talk about anything ZUNO." },
        { id: "ch_intros", name: "introductions", category: "c_hq_community", topic: "Tell us who you are." },
        { id: "ch_showcase", name: "showcase", category: "c_hq_community", topic: "Share what you're building." },
        { id: "ch_lounge", name: "Lounge", type: "voice", category: "c_hq_voice" },
        { id: "ch_focus", name: "Focus Room", type: "voice", category: "c_hq_voice" },
      ],
      roles: [
        { id: "r_hq_everyone", name: "@everyone", color: "#8ea4c8", permissions: everyoneBase, position: 0, everyone: true },
        { id: "r_hq_mod", name: "Moderator", color: "#34d399", permissions: (1 << 6) | (1 << 4) | (1 << 7) | (1 << 10), position: 1 },
        { id: "r_hq_admin", name: "Admin", color: "#5fe3ff", permissions: (1 << 0), position: 2 },
        { id: "r_hq_booster", name: "Booster", color: "#f472b6", permissions: 0, position: 3 },
      ],
      members: [
        { id: "u_astra", roles: ["r_hq_admin"] },
        { id: "u_nova", roles: ["r_hq_booster"] },
        { id: "u_kiro", roles: ["r_hq_admin"] },
        { id: "u_mira", roles: ["r_hq_admin"] },
        { id: "u_dex", roles: ["r_hq_mod"] },
        { id: "u_luna", roles: [] },
        { id: "u_riven", roles: [] },
      ],
    },
    {
      id: "s_arena",
      name: "Neon Arena",
      owner: "u_nova",
      description: "Nightly tournaments, clip review, and a very loud voice stage. All skill levels welcome.",
      iconColor: "#8b5cf6",
      categories: [
        { id: "c_arena_main", name: "ARENA" },
        { id: "c_arena_voice", name: "STAGE" },
      ],
      channels: [
        { id: "ch_arena_lobby", name: "lobby", category: "c_arena_main", topic: "Find a squad." },
        { id: "ch_arena_clips", name: "clips", category: "c_arena_main", topic: "Best plays of the week." },
        { id: "ch_arena_lfg", name: "looking-for-group", category: "c_arena_main", topic: "Post your rank and region." },
        { id: "ch_arena_stage", name: "Arena Stage", type: "voice", category: "c_arena_voice" },
      ],
      roles: [
        { id: "r_arena_everyone", name: "@everyone", color: "#8ea4c8", permissions: everyoneBase, position: 0, everyone: true },
        { id: "r_arena_champ", name: "Arena Champion", color: "#facc15", permissions: (1 << 6), position: 1 },
      ],
      members: [
        { id: "u_nova", roles: [] },
        { id: "u_astra", roles: [] },
        { id: "u_kiro", roles: ["r_arena_champ"] },
        { id: "u_dex", roles: [] },
        { id: "u_luna", roles: ["r_arena_champ"] },
      ],
    },
    {
      id: "s_studio",
      name: "Midnight Studio",
      owner: "u_mira",
      description: "A quiet creative server for designers and artists. Feedback, critique, and the private vault.",
      iconColor: "#f472b6",
      categories: [
        { id: "c_studio_main", name: "STUDIO" },
        { id: "c_studio_private", name: "PRIVATE" },
      ],
      channels: [
        { id: "ch_studio_chat", name: "studio-chat", category: "c_studio_main", topic: "Work in progress, always." },
        { id: "ch_studio_feedback", name: "feedback", category: "c_studio_main", topic: "Ask for critique. Be kind." },
        { id: "ch_studio_vault", name: "studio-vault", category: "c_studio_private", topic: "Client work. Designers only.", private: true },
      ],
      roles: [
        { id: "r_studio_everyone", name: "@everyone", color: "#8ea4c8", permissions: everyoneBase, position: 0, everyone: true },
        { id: "r_studio_designer", name: "Designers", color: "#f472b6", permissions: 0, position: 1 },
      ],
      members: [
        { id: "u_mira", roles: ["r_studio_designer"] },
        { id: "u_astra", roles: [] },
        { id: "u_kiro", roles: ["r_studio_designer"] },
        { id: "u_luna", roles: [] },
      ],
    },
  ];

  for (const s of servers) {
    const invite = `zuno-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await run(
      "INSERT INTO servers (id, name, owner_id, description, is_public, invite_code, welcome_message, rules, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
      s.id,
      s.name,
      s.owner,
      s.description,
      invite,
      `Welcome to ${s.name}, {user}. Read the channels, say hello, and make yourself at home.`,
      "1. Be decent to each other.\n2. Keep channels on topic.\n3. No spam or self-promo outside showcase.\n4. Report problems to the staff team.",
      t - 100 * day,
    );
    for (const r of s.roles) {
      await run(
        "INSERT INTO roles (id, server_id, name, color, permissions, position, is_everyone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        r.id,
        s.id,
        r.name,
        r.color,
        r.permissions,
        r.position,
        r.everyone ? 1 : 0,
        t - 100 * day,
      );
    }
    let catPos = 0;
    for (const cat of s.categories) {
      await run("INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, ?, ?)", cat.id, s.id, cat.name, catPos++);
    }
    let pos = 0;
    for (const ch of s.channels) {
      await run(
        "INSERT INTO channels (id, server_id, category_id, name, type, topic, position, is_private, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ch.id,
        s.id,
        ch.category,
        ch.name,
        ch.type ?? "text",
        ch.topic ?? null,
        pos++,
        ch.private ? 1 : 0,
        t - 100 * day,
      );
      if (ch.private) {
        const everyoneRole = s.roles.find((r) => r.everyone);
        if (everyoneRole) {
          await run(
            "INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES (?, 'role', ?, 0, ?)",
            ch.id,
            everyoneRole.id,
            1 << 20,
          );
        }
      }
    }
    for (const m of s.members) {
      await run(
        "INSERT INTO server_members (server_id, user_id, nickname, joined_at) VALUES (?, ?, ?, ?)",
        s.id,
        m.id,
        m.nickname ?? null,
        t - 80 * day,
      );
      for (const roleId of m.roles) {
        await run("INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)", s.id, m.id, roleId);
      }
    }
    await run(
      "INSERT INTO invites (code, server_id, created_by, created_at, max_uses, uses) VALUES (?, ?, ?, ?, NULL, 24)",
      invite,
      s.id,
      s.owner,
      t - 90 * day,
    );
  }

  // Private channel allow-list for designers
  await run(
    "INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES ('ch_studio_vault', 'role', 'r_studio_designer', ?, 0)",
    (1 << 20) | (1 << 11) | (1 << 12) | (1 << 13) | (1 << 15),
  );
  await run(
    "INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES ('ch_studio_vault', 'role', 'r_studio_everyone', 0, ?)",
    1 << 20,
  );
  await run(
    "INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES ('ch_announce', 'role', 'r_hq_everyone', ?, ?)",
    1 << 15,
    (1 << 11) | (1 << 12) | (1 << 13),
  );
  await run(
    "INSERT OR REPLACE INTO channel_overwrites (channel_id, target_type, target_id, allow, deny) VALUES ('ch_announce', 'role', 'r_hq_admin', ?, 0)",
    (1 << 11) | (1 << 12) | (1 << 13),
  );

  // ---- Messages ----
  type SeedMsg = {
    id: string;
    channel: string;
    author: string;
    content: string;
    minutesAgo: number;
    replyTo?: string;
    reactions?: [string, string[]][];
    pinned?: boolean;
    sticker?: string;
    gif?: string;
    system?: boolean;
  };

  const msgs: SeedMsg[] = [
    { id: "m1", channel: "ch_general", author: "u_astra", content: "@everyone Welcome to ZUNO HQ. This is our home base while we build the platform — feedback goes straight to the team.", minutesAgo: 300, pinned: true, reactions: [["🛸", ["u_nova", "u_kiro", "u_mira", "u_dex", "u_luna"]], ["💙", ["u_nova", "u_luna"]]] },
    { id: "m2", channel: "ch_general", author: "u_nova", content: "The new server rail is so smooth. Folding my servers into a folder was the thing I didn't know I needed.", minutesAgo: 240, reactions: [["🔥", ["u_astra", "u_kiro"]]] },
    { id: "m3", channel: "ch_general", author: "u_kiro", content: "That's the drag-and-drop folder work. Drop a server onto another one and it nests.", minutesAgo: 235, replyTo: "m2" },
    { id: "m4", channel: "ch_general", author: "u_mira", content: "Reminder: profile decorations ship with ZUNO PLUS this month. Aurora theme is my favourite so far.", minutesAgo: 180, reactions: [["✨", ["u_nova", "u_luna", "u_astra"]]] },
    { id: "m5", channel: "ch_general", author: "u_luna", content: "Made a sticker pack for the studio. Should I drop it in showcase?", minutesAgo: 95 },
    { id: "m6", channel: "ch_general", author: "u_dex", content: "Yes please. And if anyone sees spam DMs, use the report button — it lands in our queue instantly.", minutesAgo: 90, replyTo: "m5", reactions: [["🫡", ["u_astra"]]] },
    { id: "m7", channel: "ch_general", author: "u_astra", content: "Voice is live too. Jump into Lounge and screen share if you want to co-work.", minutesAgo: 40, reactions: [["🎧", ["u_nova", "u_kiro", "u_mira"]]] },
    { id: "m8", channel: "ch_welcome", author: "u_astra", content: "Welcome to ZUNO — the city after dark. Grab a channel, introduce yourself, and make something with us.", minutesAgo: 4000, pinned: true, reactions: [["👋", ["u_nova", "u_kiro", "u_mira", "u_dex", "u_luna"]]] },
    { id: "m9", channel: "ch_announce", author: "u_astra", content: "ZUNO 1.0 — servers, channels, DMs, voice, roles, and the owner console are all online. Thank you for being early.", minutesAgo: 1440, reactions: [["🚀", ["u_nova", "u_kiro", "u_mira", "u_dex", "u_luna"]]] },
    { id: "m10", channel: "ch_intros", author: "u_luna", content: "Hi! Luna, pixel artist, professional lurker. I make tiny stickers and big messes.", minutesAgo: 600, reactions: [["💙", ["u_nova", "u_mira"]]] },
    { id: "m11", channel: "ch_showcase", author: "u_nova", content: "New Arena banner concept. Thoughts before I lock it in?", minutesAgo: 320 },
    { id: "m12", channel: "ch_arena_lobby", author: "u_nova", content: "Tournament night at 21:00 UTC. Bo3, double elim. Sign up in looking-for-group.", minutesAgo: 150, pinned: true, reactions: [["⚔️", ["u_kiro", "u_luna", "u_dex"]]] },
    { id: "m13", channel: "ch_arena_lobby", author: "u_kiro", content: "I'll cast the finals if someone else runs the bracket.", minutesAgo: 140, replyTo: "m12" },
    { id: "m14", channel: "ch_arena_clips", author: "u_luna", content: "One-tap across the map. I will not be answering questions.", minutesAgo: 60, reactions: [["😤", ["u_kiro", "u_nova"]]] },
    { id: "m15", channel: "ch_studio_chat", author: "u_mira", content: "Rounded panels are in. Contrast pass on the midnight palette is next.", minutesAgo: 200 },
    { id: "m16", channel: "ch_studio_vault", author: "u_kiro", content: "Client build is on the private branch. Designers only, as usual.", minutesAgo: 100, reactions: [["🔒", ["u_mira"]]] },
    { id: "m17", channel: "ch_studio_feedback", author: "u_luna", content: "The cyan accents read beautifully on OLED. Maybe push one more step on hover glow?", minutesAgo: 80 },
    { id: "m18", channel: "ch_general", author: "u_astra", content: "Small thing: unread dividers now survive a refresh, and pinned messages are searchable.", minutesAgo: 12, reactions: [["💙", ["u_nova"]]] },
  ];

  for (const m of msgs) {
    const created = t - m.minutesAgo * 60_000;
    await run(
      "INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, system, created_at, pinned_at, pinned_by, sticker, gif_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      m.id,
      m.channel,
      m.author,
      m.content,
      m.replyTo ?? null,
      m.system ? 1 : 0,
      created,
      m.pinned ? created + 1000 : null,
      m.pinned ? "u_astra" : null,
      m.sticker ?? null,
      m.gif ?? null,
    );
    for (const [emoji, userIds] of m.reactions ?? []) {
      for (const u of userIds) {
        await run("INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", m.id, u, emoji, created + 2000);
      }
    }
    await run("UPDATE channels SET last_message_at = ? WHERE id = ?", created, m.channel);
  }

  // ---- DMs ----
  await run("INSERT INTO channels (id, server_id, name, type, created_at) VALUES ('dm_astra_nova', NULL, 'Nova Vex', 'dm', ?)", t - 40 * day);
  await run("INSERT INTO dm_members (channel_id, user_id) VALUES ('dm_astra_nova', 'u_astra'), ('dm_astra_nova', 'u_nova')");
  const dmMessages: [string, string, string, number][] = [
    ["dm1", "u_nova", "The PLUS upgrade flow is wired to the payment provider. Test mode only until you add the live keys.", 120],
    ["dm2", "u_astra", "Perfect. Keep it honest — nobody gets a badge until the webhook confirms it.", 118],
    ["dm3", "u_nova", "Agreed. Also the Neon Arena event is up. Want to co-host?", 110],
    ["dm4", "u_astra", "Always. Put me down for the opening stream.", 108],
  ];
  for (const [id, author, content, mins] of dmMessages) {
    await run(
      "INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, 'dm_astra_nova', ?, ?, ?)",
      id,
      author,
      content,
      t - mins * 60_000,
    );
  }
  await run("UPDATE channels SET last_message_at = ? WHERE id = 'dm_astra_nova'", t - 108 * 60_000);

  // ---- Invites / read state / events / announcements ----
  await run(
    "INSERT INTO server_events (id, server_id, name, description, starts_at, ends_at, location, created_by, created_at) VALUES (?, 's_arena', 'Neon Arena Weekly', 'Double elimination tournament. Finals casted live from the Arena Stage.', ?, ?, 'Arena Stage', 'u_nova', ?)",
    "ev_1",
    t + 2 * day,
    t + 2 * day + 3 * 60 * 60 * 1000,
    t - 5 * day,
  );
  await run(
    "INSERT INTO server_events (id, server_id, name, description, starts_at, ends_at, location, created_by, created_at) VALUES (?, 's_hq', 'ZUNO Town Hall', 'Roadmap review, PLUS preview, and open Q&A with the founding team.', ?, ?, 'Lounge', 'u_astra', ?)",
    "ev_2",
    t + 5 * day,
    t + 5 * day + 60 * 60 * 1000,
    t - 3 * day,
  );
  await run(
    "INSERT INTO announcements (id, scope, server_id, author_id, title, body, created_at) VALUES (?, 'platform', NULL, 'u_astra', 'ZUNO 1.0 is live', 'Servers, channels, voice, roles and the owner console are online. Thank you for being early.', ?)",
    "an_1",
    t - 2 * day,
  );
  await run(
    "INSERT INTO announcements (id, scope, server_id, author_id, title, body, created_at) VALUES (?, 'server', 's_hq', 'u_astra', 'Town hall this week', 'Join us in Lounge for the roadmap review. Bring questions.', ?)",
    "an_2",
    t - 1 * day,
  );

  await run(
    "INSERT INTO friendships (user_id, friend_id, created_at) VALUES ('u_astra', 'u_nova', ?), ('u_nova', 'u_astra', ?), ('u_astra', 'u_kiro', ?), ('u_kiro', 'u_astra', ?), ('u_astra', 'u_mira', ?), ('u_mira', 'u_astra', ?)",
    t - 60 * day,
    t - 60 * day,
    t - 55 * day,
    t - 55 * day,
    t - 40 * day,
    t - 40 * day,
  );
  await run(
    "INSERT INTO friend_requests (id, from_user, to_user, message, status, created_at) VALUES ('fr_1', 'u_luna', 'u_astra', 'Hey! Loved the new rail design.', 'pending', ?)",
    t - 2 * 60 * 60 * 1000,
  );
  await run(
    "INSERT INTO read_states (user_id, channel_id, last_read_at) VALUES ('u_astra', 'ch_general', ?), ('u_astra', 'ch_welcome', ?), ('u_astra', 'ch_announce', ?)",
    t - 20 * 60_000,
    t - 1000,
    t - 1000,
  );

  await run(
    "INSERT INTO reports (id, reporter_id, target_user_id, server_id, message_id, reason, details, status, created_at) VALUES ('rep_1', 'u_luna', 'u_riven', 's_hq', NULL, 'Harassment', 'Repeated unwanted DMs after being asked to stop.', 'open', ?)",
    t - 3 * 60 * 60 * 1000,
  );
  await run(
    "INSERT INTO staff_applications (id, user_id, position, why, experience, status, created_at) VALUES ('app_1', 'u_luna', 'Community Moderator', 'I am online most evenings and I already help new members settle in.', 'Two years moderating art communities.', 'pending', ?)",
    t - 26 * 60 * 60 * 1000,
  );
  await run(
    "INSERT INTO audit_logs (id, server_id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, 's_hq', 'u_astra', 'channel.create', 'channel', 'ch_showcase', '{\"name\":\"showcase\"}', ?)",
    "al_1",
    t - 20 * day,
  );
  await run(
    "INSERT INTO audit_logs (id, server_id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, 's_hq', 'u_astra', 'server.invite.create', 'invite', 'zuno-zuno-hq', '{}', ?)",
    "al_2",
    t - 10 * day,
  );
  await run(
    "INSERT INTO audit_logs (id, server_id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, NULL, 'u_astra', 'badge.grant', 'user', 'u_nova', '{\"badge\":\"creator\"}', ?)",
    "al_3",
    t - 4 * day,
  );

  // A starter server folder so the rail demonstrates folders and drag-and-drop on day one.
  await run(
    "INSERT OR IGNORE INTO server_folders (id, user_id, name, color, position, created_at) VALUES ('f_astra_crew', 'u_astra', 'ZUNO CREW', '#5fe3ff', 0, ?)",
    t - 60 * day,
  );
  await run(
    "INSERT OR REPLACE INTO server_layout (user_id, server_id, folder_id, position) VALUES ('u_astra', 's_hq', 'f_astra_crew', 0), ('u_astra', 's_arena', 'f_astra_crew', 1), ('u_astra', 's_studio', NULL, 0)",
  );

  await setConfig(env, "demo_seeded", "1");
}

export async function getConfig(env: Env): Promise<Record<string, string>> {
  const rows = await env.DB.prepare("SELECT key, value FROM site_config").all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of rows.results) out[r.key] = r.value;
  return out;
}

export async function setConfig(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO site_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

export function schemaVersion() {
  return SCHEMA_VERSION;
}
