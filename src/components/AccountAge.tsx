import { Lock, Unlock } from "lucide-react";
import { AGE_TIERS, ageProgress } from "../../shared/age";
import { BadgeArt } from "./BadgeArt";
import { cls } from "../lib/utils";

/** "8/27/26" — the short form the age card uses for unlock dates. */
function shortDay(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
}

/**
 * ZUNO account age, presented the way the ladder is meant to read: the badge
 * you wear right now, what unlocks it, and every rung above with its own year
 * requirement. Nothing here is stored — it all follows the account's join date.
 */
export function AccountAgePanel({
  createdAt,
  displayName,
  compact = false,
}: {
  createdAt: number;
  displayName?: string;
  compact?: boolean;
}) {
  const progress = ageProgress(createdAt);
  const current = progress.tier;
  const unlockedCount = progress.rows.filter((row) => row.unlocked).length;

  return (
    <div className={cls("age-panel", compact && "compact")}>
      <div className="age-card" style={{ ["--badge-color" as string]: current?.color ?? "#8ea4c8" }}>
        <BadgeArt art={current?.art ?? AGE_TIERS[0].art} color={current?.color ?? "#8ea4c8"} size={compact ? 58 : 76} />
        <span className="age-card-cap">Account Age</span>
        <strong className="age-card-tier">{current ? current.name : "LOCKED"}</strong>
        <span className="age-card-meta">
          {progress.label}
          {current && progress.unlockedAt ? ` · Unlocked ${shortDay(progress.unlockedAt)}` : ""}
        </span>
      </div>

      <p className="age-blurb">
        {current
          ? current.blurb
          : `Have an active ZUNO account for ${AGE_TIERS[0].years} year to unlock this badge.`}
      </p>
      {!current && progress.nextAt && (
        <p className="age-blurb dim">
          {progress.nextAt > Date.now()
            ? `Unlocks ${shortDay(progress.nextAt)} — keep your account active.`
            : "This badge unlocks shortly."}
        </p>
      )}

      <div className="age-progress-head">
        <span>{displayName ? `${displayName}'s progress` : "Your progress"}</span>
        <em>
          {unlockedCount}/{AGE_TIERS.length}
        </em>
      </div>
      <div className="age-ladder">
        {progress.rows.map((row) => (
          <div
            key={row.slug}
            className={cls("age-rung", row.unlocked && "unlocked", current?.tier === row.tier && "current")}
            style={{ ["--badge-color" as string]: row.color }}
            title={
              row.unlocked
                ? `${row.name} — unlocked ${shortDay(row.unlockedAt)}`
                : `${row.name} — have an active ZUNO account for ${row.years} year${row.years === 1 ? "" : "s"}`
            }
          >
            <span className="age-rung-art">
              <BadgeArt art={row.art} color={row.color} size={38} />
            </span>
            <strong>{row.name}</strong>
            <span className="age-rung-req">
              {row.unlocked ? <Unlock size={9} /> : <Lock size={9} />}
              {row.years === 10 ? "10+ years" : `${row.years} year${row.years === 1 ? "" : "s"}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
