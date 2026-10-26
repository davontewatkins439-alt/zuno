import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { rateLimit } from "../auth";
import { bad, now, num, readJson, str, uid } from "../lib";
import { emit, notify } from "../perms";
import { badgesFor } from "../service";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const quests = new Hono<Ctx>();

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

const BASE_STEP = 250;
const STEP_GROWTH = 1.15;

/** Level 1 starts at 0 XP; every level needs a bit more than the last. */
export function levelFor(xp: number): { level: number; into: number; need: number; total: number } {
  let level = 1;
  let need = BASE_STEP;
  let remaining = Math.max(0, Math.floor(xp));
  while (remaining >= need && level < 200) {
    remaining -= need;
    level++;
    need = Math.round(need * STEP_GROWTH);
  }
  return { level, into: remaining, need, total: Math.max(0, Math.floor(xp)) };
}

const DAY_MS = 86_400_000;
const dayKey = (t = now()) => new Date(t).toISOString().slice(0, 10);
const prevDayKey = (t = now()) => new Date(t - DAY_MS).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Roblox (public, documented endpoints only)                          */
/* ------------------------------------------------------------------ */

interface RobloxAccount {
  id: string;
  name: string;
  displayName: string;
}

async function robloxAccount(username: string): Promise<RobloxAccount | null> {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "ZUNO-Quests" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  if (!res.ok) throw new Error(`Roblox lookup failed (${res.status})`);
  const body = (await res.json()) as { data?: { id: number; name: string; displayName: string }[] };
  const hit = body.data?.[0];
  return hit ? { id: String(hit.id), name: hit.name, displayName: hit.displayName } : null;
}

async function robloxProfile(robloxId: string): Promise<{ description: string; name: string } | null> {
  const res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`, {
    headers: { "user-agent": "ZUNO-Quests" },
  });
  if (!res.ok) throw new Error(`Roblox profile failed (${res.status})`);
  const body = (await res.json()) as { description?: string; name?: string };
  return { description: body.description ?? "", name: body.name ?? "" };
}

async function robloxGroupIds(robloxId: string): Promise<string[] | null> {
  const res = await fetch(`https://groups.roblox.com/v1/users/${encodeURIComponent(robloxId)}/groups/roles`, {
    headers: { "user-agent": "ZUNO-Quests" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { group?: { id: number } }[] };
  return (body.data ?? []).map((entry) => String(entry.group?.id ?? "")).filter(Boolean);
}

interface LinkRow {
  user_id: string;
  roblox_user_id: string;
  roblox_username: string;
  code: string;
  created_at: number;
  verified_at: number | null;
}

const newCode = () => `ZUNO-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

async function linkFor(db: D1Database, userId: string): Promise<LinkRow | null> {
  return db.prepare("SELECT * FROM roblox_links WHERE user_id = ?").bind(userId).first<LinkRow>();
}

/* ------------------------------------------------------------------ */
/* Claim periods                                                       */
/* ------------------------------------------------------------------ */

interface QuestRow {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  category: string;
  difficulty: string;
  xp: number;
  badge_slug: string | null;
  verification: string;
  target: string | null;
  link: string | null;
  repeatable: number;
  cooldown_hours: number;
  active: number;
  starts_at: number | null;
  ends_at: number | null;
  sort: number;
  created_at: number;
}

function periodFor(quest: QuestRow): string {
  if (!quest.repeatable) return "once";
  if (quest.category === "daily") return `d${dayKey()}`;
  if (quest.category === "weekly") {
    const day = Math.floor(now() / DAY_MS);
    return `w${Math.floor((day + 4) / 7)}`;
  }
  const window = Math.max(1, quest.cooldown_hours) * 3_600_000;
  return `c${Math.floor(now() / window)}`;
}

function scheduleState(quest: QuestRow): "live" | "scheduled" | "ended" | "disabled" {
  if (!quest.active) return "disabled";
  if (quest.starts_at && quest.starts_at > now()) return "scheduled";
  if (quest.ends_at && quest.ends_at < now()) return "ended";
  return "live";
}

/* ------------------------------------------------------------------ */
/* Reward granting                                                     */
/* ------------------------------------------------------------------ */

async function grantBadge(db: D1Database, userId: string, slug: string) {
  await db
    .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, ?, NULL, ?)")
    .bind(userId, slug, now())
    .run();
}

async function userRow(db: D1Database, userId: string) {
  return db
    .prepare("SELECT id, username, display_name, xp, quest_streak, quest_streak_day, quest_streak_best, is_owner FROM users WHERE id = ?")
    .bind(userId)
    .first<{
      id: string;
      username: string;
      display_name: string | null;
      xp: number;
      quest_streak: number;
      quest_streak_day: string | null;
      quest_streak_best: number;
    }>();
}

/**
 * Marks a claim verified and pays out exactly once. The conditional UPDATE is
 * the concurrency guard: a second request (double click, replay) changes no
 * rows and therefore pays nothing.
 */
async function payClaim(
  db: D1Database,
  claimId: string,
  quest: QuestRow,
  userId: string,
): Promise<{ paid: boolean; xp: number; level: number; streak: number }> {
  const marked = await db
    .prepare("UPDATE quest_claims SET status = 'verified', xp_awarded = ?, reviewed_at = ? WHERE id = ? AND status <> 'verified'")
    .bind(quest.xp, now(), claimId)
    .run();
  if (!marked.meta.changes) {
    const current = await userRow(db, userId);
    const xp = current?.xp ?? 0;
    return { paid: false, xp, level: levelFor(xp).level, streak: current?.quest_streak ?? 0 };
  }

  await db.batch([
    db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").bind(quest.xp, userId),
    db
      .prepare("INSERT INTO quest_xp (id, user_id, quest_id, amount, source, created_at) VALUES (?, ?, ?, ?, 'quest', ?)")
      .bind(uid(), userId, quest.id, quest.xp, now()),
  ]);

  const row = await userRow(db, userId);
  const xp = row?.xp ?? quest.xp;
  const level = levelFor(xp).level;

  // Daily quests drive the streak; other categories leave it alone.
  let streak = row?.quest_streak ?? 0;
  if (quest.category === "daily") {
    const today = dayKey();
    if (row?.quest_streak_day !== today) {
      streak = row?.quest_streak_day === prevDayKey() ? (row?.quest_streak ?? 0) + 1 : 1;
      const best = Math.max(streak, row?.quest_streak_best ?? 0);
      await db
        .prepare("UPDATE users SET quest_streak = ?, quest_streak_day = ?, quest_streak_best = ? WHERE id = ?")
        .bind(streak, today, best, userId)
        .run();
      if (streak >= 7) await grantBadge(db, userId, "quest_streak");
    }
  }

  const completed = await db
    .prepare("SELECT COUNT(*) as n FROM quest_claims WHERE user_id = ? AND status = 'verified'")
    .bind(userId)
    .first<{ n: number }>();
  if ((completed?.n ?? 0) >= 1) await grantBadge(db, userId, "quest_recruit");
  if (level >= 10) await grantBadge(db, userId, "quest_legend");
  if (quest.badge_slug) await grantBadge(db, userId, quest.badge_slug);

  await notify(db, {
    userId,
    kind: "quest",
    title: `Quest complete — ${quest.title}`,
    body: `+${quest.xp} XP`,
  });
  await emit(db, "user", userId, "quest.completed", { questId: quest.id, xp: quest.xp, level, streak });
  return { paid: true, xp, level, streak };
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

interface Verdict {
  status: "verified" | "pending" | "failed";
  reason: string;
  evidence?: string;
}

async function verifyQuest(env: Env, me: SessionUser, quest: QuestRow): Promise<Verdict> {
  const db = env.DB;
  const link = await linkFor(db, me.id);

  switch (quest.verification) {
    case "login":
      return { status: "verified", reason: "Checked against your sign-in on the ZUNO server." };

    case "group_membership": {
      if (!link || !link.verified_at) {
        return { status: "failed", reason: "Link your Roblox account first — we need it to read your public group list." };
      }
      if (!quest.target || !/^\d+$/.test(quest.target.trim())) {
        return { status: "pending", reason: "The owner has not set this group yet, so a moderator will review it." };
      }
      try {
        const groups = await robloxGroupIds(link.roblox_user_id);
        if (!groups) return { status: "pending", reason: "Roblox did not answer, so this was sent to staff review." };
        if (groups.includes(quest.target.trim())) {
          return { status: "verified", reason: `Roblox confirms @${link.roblox_username} is in the group.` };
        }
        return { status: "failed", reason: `Roblox does not show @${link.roblox_username} in that group yet.` };
      } catch {
        return { status: "pending", reason: "Roblox could not be reached; sent to staff review." };
      }
    }

    case "community": {
      if (!quest.target) {
        return { status: "pending", reason: "The owner has not attached a community yet, so staff will review this." };
      }
      const member = await db
        .prepare("SELECT 1 as ok FROM server_members WHERE server_id = ? AND user_id = ?")
        .bind(quest.target, me.id)
        .first<{ ok: number }>();
      if (member) return { status: "verified", reason: "Your membership was checked on the ZUNO server." };
      return { status: "failed", reason: "Join that ZUNO community first, then claim again." };
    }

    case "referral": {
      const need = Math.max(1, num(quest.target, 1));
      const credited = await db
        .prepare("SELECT COUNT(*) as n FROM referrals WHERE inviter_id = ? AND credited = 1")
        .bind(me.id)
        .first<{ n: number }>();
      const count = credited?.n ?? 0;
      if (count >= need) return { status: "verified", reason: `${count} verified referrals.` };
      return { status: "failed", reason: `You have ${count} of ${need} verified referrals so far.` };
    }

    case "game_visit":
    case "milestone":
    case "manual":
    default:
      return {
        status: "pending",
        reason: "Roblox does not expose this publicly, so a moderator reviews it by hand.",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Member endpoints                                                    */
/* ------------------------------------------------------------------ */

async function summary(db: D1Database, me: SessionUser) {
  const row = await userRow(db, me.id);
  const xp = row?.xp ?? 0;
  const progress = levelFor(xp);
  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM quest_claims WHERE user_id = ?`,
    )
    .bind(me.id)
    .first<{ verified: number | null; pending: number | null }>();
  const link = await linkFor(db, me.id);
  const referrals = await db
    .prepare("SELECT COUNT(*) as n FROM referrals WHERE inviter_id = ? AND credited = 1")
    .bind(me.id)
    .first<{ n: number }>();
  return {
    xp,
    level: progress.level,
    intoLevel: progress.into,
    nextLevelXp: progress.need,
    streak: row?.quest_streak ?? 0,
    bestStreak: row?.quest_streak_best ?? 0,
    completed: counts?.verified ?? 0,
    pending: counts?.pending ?? 0,
    referrals: referrals?.n ?? 0,
    referralCode: me.id,
    roblox: link
      ? {
          username: link.roblox_username,
          userId: link.roblox_user_id,
          verified: !!link.verified_at,
          code: link.verified_at ? null : link.code,
        }
      : null,
  };
}

quests.get("/quests", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const rows = await db.prepare("SELECT * FROM quests ORDER BY sort DESC, created_at DESC").all<QuestRow>();
  const claims = await db
    .prepare(
      `SELECT * FROM quest_claims WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 400`,
    )
    .bind(me.id)
    .all<{
      id: string;
      quest_id: string;
      status: string;
      period_key: string;
      submitted_at: number;
      reviewed_at: number | null;
      review_note: string | null;
      xp_awarded: number;
    }>();

  const list = rows.results
    .filter((quest) => quest.active || me.is_owner === 1)
    .map((quest) => {
      const mine = claims.results.filter((claim) => claim.quest_id === quest.id);
      const period = periodFor(quest);
      // Rejected attempts do not block a retry for the same period.
      const current = mine.find((claim) => claim.period_key === period && claim.status !== "rejected") ?? null;
      const verifiedTotal = mine.filter((claim) => claim.status === "verified").length;
      return {
        id: quest.id,
        title: quest.title,
        description: quest.description,
        instructions: quest.instructions,
        category: quest.category,
        difficulty: quest.difficulty,
        xp: quest.xp,
        badge: quest.badge_slug,
        verification: quest.verification,
        link: quest.link,
        repeatable: !!quest.repeatable,
        active: !!quest.active,
        state: scheduleState(quest),
        startsAt: quest.starts_at,
        endsAt: quest.ends_at,
        completedCount: verifiedTotal,
        claim: current
          ? {
              id: current.id,
              status: current.status,
              submittedAt: current.submitted_at,
              reviewedAt: current.reviewed_at,
              note: current.review_note,
              xp: current.xp_awarded,
            }
          : null,
        canClaim: scheduleState(quest) === "live" && !current,
      };
    });

  const history = claims.results.slice(0, 12).map((claim) => ({
    id: claim.id,
    questId: claim.quest_id,
    title: rows.results.find((q) => q.id === claim.quest_id)?.title ?? "Quest",
    status: claim.status,
    xp: claim.xp_awarded,
    at: claim.reviewed_at ?? claim.submitted_at,
    note: claim.review_note,
  }));

  return c.json({
    quests: list,
    summary: await summary(db, me),
    history,
  });
});

quests.get("/quests/leaderboard", async (c) => {
  const db = c.env.DB;
  const range = c.req.query("range") === "all" ? "all" : "week";
  if (range === "all") {
    const rows = await db
      .prepare(
        `SELECT id, username, display_name, avatar_id, xp, quest_streak, is_owner
         FROM users WHERE xp > 0 ORDER BY xp DESC, created_at ASC LIMIT 25`,
      )
      .all<{ id: string; username: string; display_name: string | null; avatar_id: string | null; xp: number; quest_streak: number; is_owner: number }>();
    const badges = await badgesFor(db, rows.results.map((row) => row.id));
    return c.json({
      range,
      entries: rows.results.map((row, index) => ({
        rank: index + 1,
        userId: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        avatarId: row.avatar_id,
        xp: row.xp,
        streak: row.quest_streak,
        isOwner: !!row.is_owner,
        badges: badges.get(row.id) ?? [],
      })),
    });
  }

  const since = now() - 7 * DAY_MS;
  const rows = await db
    .prepare(
      `SELECT q.user_id as id, SUM(q.amount) as xp, u.username, u.display_name, u.avatar_id, u.quest_streak, u.is_owner
       FROM quest_xp q JOIN users u ON u.id = q.user_id
       WHERE q.created_at >= ? GROUP BY q.user_id ORDER BY xp DESC LIMIT 25`,
    )
    .bind(since)
    .all<{ id: string; xp: number; username: string; display_name: string | null; avatar_id: string | null; quest_streak: number; is_owner: number }>();
  const badges = await badgesFor(db, rows.results.map((row) => row.id));
  return c.json({
    range,
    entries: rows.results.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarId: row.avatar_id,
      xp: row.xp,
      streak: row.quest_streak,
      isOwner: !!row.is_owner,
      badges: badges.get(row.id) ?? [],
    })),
  });
});

quests.post("/quests/:id/start", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const quest = await db.prepare("SELECT * FROM quests WHERE id = ?").bind(c.req.param("id")).first<QuestRow>();
  if (!quest) return bad(c, "That quest no longer exists.", 404);
  const state = scheduleState(quest);
  if (state !== "live") return bad(c, state === "scheduled" ? "This quest has not started yet." : "This quest is closed.", 409);

  // Starting is a bookmark: the claim itself does the verification. This keeps
  // "started" honest without letting the browser mint progress.
  await db
    .prepare("DELETE FROM quest_claims WHERE quest_id = ? AND user_id = ? AND status = 'rejected'")
    .bind(quest.id, me.id)
    .run();
  return c.json({ ok: true, questId: quest.id, state });
});

quests.post("/quests/:id/claim", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  if (!(await rateLimit(db, `quest-claim:${me.id}`, 30, 3_600_000)))
    return bad(c, "Slow down a moment — too many quest claims. Try again shortly.", 429);

  const quest = await db.prepare("SELECT * FROM quests WHERE id = ?").bind(c.req.param("id")).first<QuestRow>();
  if (!quest) return bad(c, "That quest no longer exists.", 404);
  if (scheduleState(quest) !== "live") return bad(c, "This quest is not open right now.", 409);

  const evidence = str((await readJson<Record<string, unknown>>(c)).evidence, 800);
  const period = periodFor(quest);
  const existing = await db
    .prepare("SELECT id, status FROM quest_claims WHERE quest_id = ? AND user_id = ? AND period_key = ? AND status <> 'rejected'")
    .bind(quest.id, me.id, period)
    .first<{ id: string; status: string }>();
  if (existing) {
    return c.json(
      {
        error:
          existing.status === "verified"
            ? "You already completed this quest for this period."
            : "This quest is already waiting on review.",
        claim: existing,
      },
      409,
    );
  }

  const verdict = await verifyQuest(c.env, me, quest);
  const claimId = uid();
  const t = now();

  if (verdict.status === "failed") {
    await db
      .prepare(
        "INSERT INTO quest_claims (id, quest_id, user_id, status, period_key, evidence, submitted_at, review_note, reviewed_at, created_at) VALUES (?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?)",
      )
      .bind(claimId, quest.id, me.id, period, evidence || null, t, verdict.reason, t, t)
      .run();
    return c.json({ status: "failed", reason: verdict.reason }, 422);
  }

  if (verdict.status === "pending") {
    const claim = await db
      .prepare(
        "INSERT INTO quest_claims (id, quest_id, user_id, status, period_key, evidence, submitted_at, review_note, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
      )
      .bind(claimId, quest.id, me.id, period, evidence || null, t, verdict.reason, t)
      .run();
    if (!claim.meta.changes) return bad(c, "A claim for this quest is already open.", 409);
    await emit(db, "user", me.id, "quest.pending", { questId: quest.id });
    return c.json({ status: "pending", reason: verdict.reason, claimId });
  }

  const claim = await db
    .prepare(
      "INSERT INTO quest_claims (id, quest_id, user_id, status, period_key, evidence, submitted_at, review_note, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
    )
    .bind(claimId, quest.id, me.id, period, evidence || null, t, verdict.reason, t)
    .run()
    .catch(() => null);
  if (!claim || !claim.meta.changes) return bad(c, "A claim for this quest is already open.", 409);

  const payout = await payClaim(db, claimId, quest, me.id);
  return c.json({
    status: "verified",
    reason: verdict.reason,
    claimId,
    xpAwarded: payout.paid ? quest.xp : 0,
    ...(await summary(db, me)),
  });
});

quests.get("/quests/history", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const rows = await db
    .prepare(
      `SELECT c.id, c.quest_id, c.status, c.xp_awarded, c.submitted_at, c.reviewed_at, c.review_note, q.title
       FROM quest_claims c LEFT JOIN quests q ON q.id = c.quest_id
       WHERE c.user_id = ? ORDER BY c.submitted_at DESC LIMIT 50`,
    )
    .bind(me.id)
    .all<{ id: string; quest_id: string; status: string; xp_awarded: number; submitted_at: number; reviewed_at: number | null; review_note: string | null; title: string | null }>();
  return c.json({
    history: rows.results.map((row) => ({
      id: row.id,
      questId: row.quest_id,
      title: row.title ?? "Quest",
      status: row.status,
      xp: row.xp_awarded,
      at: row.reviewed_at ?? row.submitted_at,
      note: row.review_note,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Roblox account linking                                              */
/* ------------------------------------------------------------------ */

quests.get("/roblox", async (c) => {
  const link = await linkFor(c.env.DB, c.get("user").id);
  return c.json({
    linked: !!link,
    verified: !!link?.verified_at,
    username: link?.roblox_username ?? null,
    userId: link?.roblox_user_id ?? null,
    code: link && !link.verified_at ? link.code : null,
  });
});

quests.post("/roblox/start", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  if (!(await rateLimit(db, `roblox-link:${me.id}`, 8, 3_600_000)))
    return bad(c, "Too many Roblox link attempts. Try again later.", 429);

  const username = str((await readJson<Record<string, unknown>>(c)).username, 40);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return bad(c, "Enter your exact Roblox username.");

  let account: RobloxAccount | null = null;
  try {
    account = await robloxAccount(username);
  } catch {
    return bad(c, "Roblox could not be reached. Try again in a minute.", 502);
  }
  if (!account) return bad(c, "Roblox has no account with that username.", 404);

  const code = newCode();
  await db
    .prepare(
      `INSERT INTO roblox_links (user_id, roblox_user_id, roblox_username, code, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET roblox_user_id = excluded.roblox_user_id,
         roblox_username = excluded.roblox_username, code = excluded.code,
         created_at = excluded.created_at, verified_at = NULL`,
    )
    .bind(me.id, account.id, account.name, code, now())
    .run();

  return c.json({
    linked: true,
    verified: false,
    username: account.name,
    displayName: account.displayName,
    userId: account.id,
    code,
    instructions: `Open your Roblox profile, paste ${code} into the About / Description box, save it, then press Verify.`,
  });
});

quests.post("/roblox/verify", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  if (!(await rateLimit(db, `roblox-verify:${me.id}`, 20, 3_600_000)))
    return bad(c, "Too many verification attempts. Try again later.", 429);

  const link = await linkFor(db, me.id);
  if (!link) return bad(c, "Start by entering your Roblox username.", 404);
  if (link.verified_at) return c.json({ verified: true, username: link.roblox_username });

  let profile: { description: string; name: string } | null = null;
  try {
    profile = await robloxProfile(link.roblox_user_id);
  } catch {
    return bad(c, "Roblox could not be reached. Try again in a minute.", 502);
  }
  if (!profile) return bad(c, "Roblox could not find that account anymore.", 404);

  const normalized = profile.description.replace(/\s+/g, "").toUpperCase();
  if (!normalized.includes(link.code.replace(/\s+/g, "").toUpperCase())) {
    return c.json(
      {
        verified: false,
        reason: `We could not find ${link.code} in your Roblox profile description yet. Paste it in, save, and try again.`,
      },
      409,
    );
  }

  await db.prepare("UPDATE roblox_links SET verified_at = ? WHERE user_id = ?").bind(now(), me.id).run();
  await notify(db, {
    userId: me.id,
    kind: "quest",
    title: "Roblox account linked",
    body: `@${link.roblox_username} is now verified. Group quests can be checked automatically.`,
  });
  return c.json({ verified: true, username: link.roblox_username, userId: link.roblox_user_id });
});

quests.delete("/roblox", async (c) => {
  await c.env.DB.prepare("DELETE FROM roblox_links WHERE user_id = ?").bind(c.get("user").id).run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Owner review (called from the owner router, which enforces is_owner) */
/* ------------------------------------------------------------------ */

export async function reviewClaim(
  env: Env,
  claimId: string,
  actorId: string,
  approve: boolean,
  note: string,
): Promise<{ ok: true; status: "verified" | "rejected" } | { ok: false; error: string }> {
  const db = env.DB;
  const claim = await db
    .prepare("SELECT * FROM quest_claims WHERE id = ?")
    .bind(claimId)
    .first<{ id: string; quest_id: string; user_id: string; status: string }>();
  if (!claim) return { ok: false, error: "That claim no longer exists." };
  if (claim.status !== "pending") return { ok: false, error: `That claim is already ${claim.status}.` };

  const quest = await db.prepare("SELECT * FROM quests WHERE id = ?").bind(claim.quest_id).first<QuestRow>();
  if (!quest) return { ok: false, error: "The quest was deleted." };

  const t = now();
  if (!approve) {
    await db
      .prepare("UPDATE quest_claims SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
      .bind(actorId, note || "Reviewed by staff.", t, claim.id)
      .run();
    await notify(db, {
      userId: claim.user_id,
      kind: "quest",
      title: `Quest not approved — ${quest.title}`,
      body: note || "A moderator reviewed your claim and could not verify it.",
    });
    return { ok: true, status: "rejected" };
  }

  await db
    .prepare("UPDATE quest_claims SET reviewed_by = ?, review_note = ? WHERE id = ?")
    .bind(actorId, note || "Approved by staff.", claim.id)
    .run();
  const payout = await payClaim(db, claim.id, quest, claim.user_id);
  if (!payout.paid) return { ok: false, error: "That reward was already paid out." };
  return { ok: true, status: "verified" };
}
