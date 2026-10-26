import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Crown,
  Flame,
  Gamepad2,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldQuestion,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../state";
import { api, ApiError } from "../lib/api";
import type { Quest, QuestBoardEntry, QuestHistoryEntry, QuestSummary } from "../lib/types";
import { cls, compact, formatShort } from "../lib/utils";
import { Avatar, BadgeRow, Verified } from "./ui";

interface QuestPayload {
  quests: Quest[];
  summary: QuestSummary;
  history: QuestHistoryEntry[];
}

const CATEGORIES = [
  { id: "all", label: "All quests" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "beginner", label: "Beginner" },
  { id: "event", label: "Event" },
] as const;

const VERIFY_LABEL: Record<string, string> = {
  login: "Checked server-side",
  group_membership: "Roblox group check",
  community: "Community membership",
  referral: "Referral tracking",
  game_visit: "Staff review",
  milestone: "Staff review",
  manual: "Staff review",
};

const NEEDS_EVIDENCE = new Set(["game_visit", "milestone", "manual"]);

function statusChip(quest: Quest) {
  if (quest.state === "ended") return { tone: "muted" as const, label: "Ended" };
  if (quest.state === "scheduled") return { tone: "muted" as const, label: "Starts soon" };
  if (!quest.active) return { tone: "muted" as const, label: "Disabled" };
  if (quest.claim?.status === "verified") return { tone: "done" as const, label: "Completed" };
  if (quest.claim?.status === "pending") return { tone: "pending" as const, label: "Awaiting review" };
  return { tone: "open" as const, label: "Ready" };
}

export function QuestsView() {
  const app = useApp();
  const [data, setData] = useState<QuestPayload | null>(null);
  const [board, setBoard] = useState<QuestBoardEntry[]>([]);
  const [range, setRange] = useState<"week" | "all">("week");
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<QuestPayload>("/api/quests"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Quests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBoard = useCallback(async (which: "week" | "all") => {
    setBoardLoading(true);
    try {
      const result = await api<{ entries: QuestBoardEntry[] }>(`/api/quests/leaderboard?range=${which}`);
      setBoard(result.entries);
    } catch {
      setBoard([]);
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBoard(range);
  }, [loadBoard, range]);

  const claim = async (quest: Quest) => {
    setBusy(quest.id);
    try {
      const result = await api<{ status: string; xpAwarded?: number; reason?: string }>(`/api/quests/${quest.id}/claim`, {
        method: "POST",
        body: { evidence: evidence[quest.id] ?? "" },
      });
      if (result.status === "verified") {
        app.toast(`${quest.title} complete — +${result.xpAwarded ?? quest.xp} XP`, "success");
        setOpenEvidence(null);
      } else {
        app.toast("Sent for staff review. You will get a notification when it is checked.", "info");
        setOpenEvidence(null);
      }
      await Promise.all([load(), loadBoard(range)]);
    } catch (err) {
      const reason =
        err instanceof ApiError && typeof err.payload.reason === "string" ? err.payload.reason : null;
      app.toast(reason ?? (err instanceof ApiError ? err.message : "That quest could not be claimed."), "error");
      if (err instanceof ApiError && err.status === 422) await load();
    } finally {
      setBusy(null);
    }
  };

  const quests = useMemo(() => {
    const list = data?.quests ?? [];
    return list.filter((quest) => {
      if (category !== "all" && quest.category !== category) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return quest.title.toLowerCase().includes(q) || (quest.description ?? "").toLowerCase().includes(q);
    });
  }, [data?.quests, category, query]);

  const summary = data?.summary;

  if (loading && !data) {
    return (
      <section className="quests-view">
        <div className="quests-loading">
          <Loader2 className="spin" size={22} />
          <p>Loading your quests…</p>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="quests-view">
        <div className="quests-error">
          <ShieldQuestion size={26} />
          <h2>Quests are unavailable</h2>
          <p>{error}</p>
          <button type="button" className="primary-btn" onClick={() => void load()}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </section>
    );
  }

  const levelPct = summary ? Math.min(100, Math.round((summary.intoLevel / Math.max(1, summary.nextLevelXp)) * 100)) : 0;

  return (
    <section className="quests-view">
      <header className="quests-head">
        <div className="quests-head-main">
          <span className="eyebrow">
            <Gamepad2 size={14} /> ZUNO QUESTS
          </span>
          <h1>Roblox Quests</h1>
          <p>Complete quests, earn XP, and climb the board. Every reward is verified on the server before it is paid.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={cls(loading && "spin")} /> Refresh
        </button>
      </header>

      <div className="quests-stats">
        <article className="quest-level-card">
          <div className="quest-level-top">
            <span className="quest-level-ring">
              <strong>{summary?.level ?? 1}</strong>
              <em>LEVEL</em>
            </span>
            <div>
              <p className="quest-level-title">Quest level {summary?.level ?? 1}</p>
              <p className="quest-level-sub">
                {compact(summary?.intoLevel ?? 0)} / {compact(summary?.nextLevelXp ?? 250)} XP to level {(summary?.level ?? 1) + 1}
              </p>
            </div>
            <span className="quest-xp-total">
              <Sparkles size={14} /> {compact(summary?.xp ?? 0)} total XP
            </span>
          </div>
          <div className="quest-progress" aria-label={`${levelPct}% to the next level`}>
            <span style={{ width: `${levelPct}%` }} />
          </div>
        </article>

        <article className="quest-mini-card">
          <Flame size={18} />
          <div>
            <strong>{summary?.streak ?? 0} day streak</strong>
            <span>Best {summary?.bestStreak ?? 0} · daily check-in keeps it alive</span>
          </div>
        </article>

        <article className="quest-mini-card">
          <Trophy size={18} />
          <div>
            <strong>{summary?.completed ?? 0} completed</strong>
            <span>{summary?.pending ?? 0} waiting on review</span>
          </div>
        </article>

        <article className="quest-mini-card">
          <Users size={18} />
          <div>
            <strong>{summary?.referrals ?? 0} referrals</strong>
            <span>Real signups with your link</span>
          </div>
        </article>
      </div>

      <RobloxLinkCard summary={summary} onChanged={() => void Promise.all([load(), loadBoard(range)])} />

      <div className="quests-toolbar">
        <label className="quests-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quests"
            aria-label="Search quests"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </label>
        <div className="quests-filters" role="tablist" aria-label="Quest categories">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={category === entry.id}
              className={cls(category === entry.id && "active")}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {quests.length === 0 ? (
        <div className="quests-empty">
          <Compass size={26} />
          <h3>No quests match that filter</h3>
          <p>Try another category or clear the search box.</p>
        </div>
      ) : (
        <div className="quest-grid">
          {quests.map((quest) => {
            const chip = statusChip(quest);
            const locked = quest.state !== "live";
            const verifying = busy === quest.id;
            return (
              <article key={quest.id} className={cls("quest-card", `quest-${quest.category}`, chip.tone === "done" && "is-done")}>
                <div className="quest-card-glow" aria-hidden="true" />
                <header className="quest-card-head">
                  <span className="quest-cat">{quest.category}</span>
                  <span className={cls("quest-chip", `chip-${chip.tone}`)}>{chip.label}</span>
                </header>
                <h3>{quest.title}</h3>
                <p className="quest-desc">{quest.description}</p>
                {quest.instructions && <p className="quest-instructions">{quest.instructions}</p>}

                <div className="quest-meta">
                  <span className={cls("quest-diff", `diff-${quest.difficulty}`)}>{quest.difficulty}</span>
                  <span className="quest-verify">
                    {quest.verification === "manual" ? <ShieldQuestion size={12} /> : <BadgeCheck size={12} />}
                    {VERIFY_LABEL[quest.verification] ?? quest.verification}
                  </span>
                  <span className="quest-xp">
                    <Sparkles size={12} /> +{quest.xp} XP
                  </span>
                </div>

                {quest.claim?.status === "rejected" && quest.claim.note && (
                  <p className="quest-reject-note">{quest.claim.note}</p>
                )}

                {quest.verification === "referral" && (
                  <button
                    type="button"
                    className="quest-referral"
                    onClick={() => {
                      const link = `${window.location.origin}/?ref=${summary?.referralCode ?? ""}`;
                      void navigator.clipboard
                        ?.writeText(link)
                        .then(() => app.toast("Referral link copied", "success"))
                        .catch(() => app.toast(link, "info"));
                    }}
                  >
                    <Copy size={13} /> Copy referral link
                  </button>
                )}

                {openEvidence === quest.id && (
                  <div className="quest-evidence">
                    <label htmlFor={`evidence-${quest.id}`}>What did you do? Paste proof or your Roblox username.</label>
                    <textarea
                      id={`evidence-${quest.id}`}
                      value={evidence[quest.id] ?? ""}
                      maxLength={800}
                      onChange={(event) => setEvidence((prev) => ({ ...prev, [quest.id]: event.target.value }))}
                      placeholder="Roblox username, milestone reached, screenshot link…"
                    />
                  </div>
                )}

                <footer className="quest-card-actions">
                  {quest.link && (
                    <a className="ghost-btn" href={quest.link} target="_blank" rel="noreferrer noopener">
                      <ArrowUpRight size={14} /> Open
                    </a>
                  )}
                  {quest.claim?.status === "verified" ? (
                    <span className="quest-done">
                      <Check size={15} /> +{quest.claim.xp || quest.xp} XP earned
                    </span>
                  ) : quest.claim?.status === "pending" ? (
                    <span className="quest-pending">
                      <Loader2 size={14} /> Waiting on staff
                    </span>
                  ) : locked ? (
                    <span className="quest-locked">
                      <Lock size={14} /> {quest.state === "scheduled" ? "Not started" : "Closed"}
                    </span>
                  ) : NEEDS_EVIDENCE.has(quest.verification) && openEvidence !== quest.id ? (
                    <button type="button" className="primary-btn" onClick={() => setOpenEvidence(quest.id)}>
                      <Target size={14} /> Submit for review
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => (NEEDS_EVIDENCE.has(quest.verification) && !evidence[quest.id] ? setOpenEvidence(quest.id) : void claim(quest))}
                      disabled={verifying}
                    >
                      {verifying ? <Loader2 size={14} className="spin" /> : <ChevronRight size={14} />}
                      {NEEDS_EVIDENCE.has(quest.verification) ? "Send claim" : quest.verification === "login" ? "Claim check-in" : "Verify quest"}
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <div className="quests-lower">
        <section className="quest-board">
          <header>
            <div>
              <h2>
                <Trophy size={17} /> Leaderboard
              </h2>
              <p>Weekly resets every 7 days; all-time never resets.</p>
            </div>
            <div className="quest-board-toggle">
              <button type="button" className={cls(range === "week" && "active")} onClick={() => setRange("week")}>
                Weekly
              </button>
              <button type="button" className={cls(range === "all" && "active")} onClick={() => setRange("all")}>
                All time
              </button>
            </div>
          </header>
          {boardLoading ? (
            <p className="quest-board-empty">
              <Loader2 size={16} className="spin" /> Loading rankings…
            </p>
          ) : board.length === 0 ? (
            <p className="quest-board-empty">Nobody has earned XP this week yet. Be the first.</p>
          ) : (
            <ol className="quest-board-list">
              {board.map((entry) => (
                <li key={entry.userId} className={cls(entry.userId === app.me.user.id && "is-me")}>
                  <span className={cls("quest-rank", entry.rank <= 3 && `rank-${entry.rank}`)}>{entry.rank}</span>
                  <button type="button" className="quest-board-user" onClick={() => app.openProfile(entry.userId)}>
                    <Avatar
                      user={{
                        id: entry.userId,
                        username: entry.username,
                        displayName: entry.displayName,
                        avatarId: entry.avatarId,
                        accentColor: "#2f7cff",
                        plusDecoration: null,
                      }}
                      size={30}
                    />
                    <span>
                      <strong>
                        {entry.displayName}
                        {entry.isOwner && <Crown size={12} className="quest-crown" />}
                        {entry.isOwner && <Verified />}
                      </strong>
                      <em>
                        {entry.streak > 0 ? `${entry.streak} day streak` : "ZUNO member"}
                        {entry.badges.length > 0 && <BadgeRow badges={entry.badges} max={2} compact />}
                      </em>
                    </span>
                  </button>
                  <span className="quest-board-xp">+{compact(entry.xp)} XP</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="quest-history">
          <h2>
            <Sparkles size={17} /> Your recent activity
          </h2>
          {(data?.history ?? []).length === 0 ? (
            <p className="quest-board-empty">Claim your first quest and it will show up here.</p>
          ) : (
            <ul>
              {(data?.history ?? []).map((entry) => (
                <li key={entry.id}>
                  <span className={cls("quest-dot", `dot-${entry.status}`)} aria-hidden="true" />
                  <div>
                    <strong>{entry.title}</strong>
                    <em>
                      {entry.status === "verified" ? `+${entry.xp} XP` : entry.status === "pending" ? "Awaiting review" : entry.note || "Not approved"}
                      {" · "}
                      {formatShort(entry.at)}
                    </em>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

function RobloxLinkCard({ summary, onChanged }: { summary?: QuestSummary; onChanged: () => void }) {
  const app = useApp();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<"start" | "verify" | "unlink" | null>(null);
  const [local, setLocal] = useState<{ username: string; code: string } | null>(null);

  const link = summary?.roblox;
  const pendingCode = link && !link.verified ? link.code ?? local?.code ?? null : local?.code ?? null;

  const start = async () => {
    setBusy("start");
    try {
      const result = await api<{ username: string; code: string }>("/api/roblox/start", {
        method: "POST",
        body: { username },
      });
      setLocal({ username: result.username, code: result.code });
      app.toast(`Verification code created for @${result.username}`, "success");
      onChanged();
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "That username could not be checked.", "error");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy("verify");
    try {
      const result = await api<{ verified: boolean; reason?: string; username?: string }>("/api/roblox/verify", {
        method: "POST",
      });
      if (result.verified) app.toast(`Roblox account @${result.username} verified`, "success");
      else app.toast(result.reason ?? "Code not found in your Roblox profile yet.", "error");
      onChanged();
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "Verification failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    if (!window.confirm("Unlink your Roblox account? Group quests will need a fresh link.")) return;
    setBusy("unlink");
    try {
      await api("/api/roblox", { method: "DELETE" });
      setLocal(null);
      app.toast("Roblox account unlinked", "info");
      onChanged();
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "Could not unlink.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={cls("quest-roblox", link?.verified && "is-verified")}>
      <div className="quest-roblox-icon">
        <Gamepad2 size={20} />
      </div>
      <div className="quest-roblox-body">
        <h2>
          Roblox account{" "}
          {link?.verified ? (
            <span className="quest-roblox-state">
              <BadgeCheck size={14} /> linked
            </span>
          ) : (
            <span className="quest-roblox-state pending">not linked</span>
          )}
        </h2>
        {link?.verified ? (
          <p>
            Verified as <strong>@{link.username}</strong>. Group quests are checked against Roblox automatically.
          </p>
        ) : (
          <p>
            ZUNO never asks for your Roblox password. We give you a short code to paste into your Roblox profile About box, then read it
            back from Roblox&apos;s public API.
          </p>
        )}

        {pendingCode && (
          <div className="quest-code">
            <code>{pendingCode}</code>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void navigator.clipboard?.writeText(pendingCode).then(() => app.toast("Code copied", "success"))}
            >
              <Copy size={13} /> Copy
            </button>
          </div>
        )}
      </div>
      <div className="quest-roblox-actions">
        {link?.verified ? (
          <button type="button" className="ghost-btn" onClick={() => void unlink()} disabled={busy !== null}>
            {busy === "unlink" ? <Loader2 size={14} className="spin" /> : <X size={14} />} Unlink
          </button>
        ) : (
          <>
            <label className="quest-username">
              <Link2 size={14} />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your Roblox username"
                aria-label="Roblox username"
                maxLength={20}
              />
            </label>
            <button type="button" className="ghost-btn" onClick={() => void start()} disabled={busy !== null || username.trim().length < 3}>
              {busy === "start" ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />} Get code
            </button>
            {pendingCode && (
              <button type="button" className="primary-btn" onClick={() => void verify()} disabled={busy !== null}>
                {busy === "verify" ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Verify
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
