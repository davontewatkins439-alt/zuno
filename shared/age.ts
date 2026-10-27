/**
 * ZUNO account age — the single source of truth for the Worker and the browser.
 *
 * The ladder has ten year-based tiers. Nothing is stored or granted: a tier is
 * worked out from the account's join date every time it is needed, so it climbs
 * by itself and can never be handed out early or taken away. Accounts younger
 * than one year have no age badge yet and see the ladder as locked progress.
 */

export const AGE_DAY = 86_400_000;

export interface AgeTier {
  /** 1-based rung on the ladder. */
  tier: number;
  /** Calendar years of membership this rung needs (10 means ten or more). */
  years: number;
  name: string;
  color: string;
  /** Badge artwork key. */
  art: string;
  /** Badge slug, so stored badge lists and the ladder always agree. */
  slug: string;
  /** One line explaining what unlocks it. */
  blurb: string;
}

export const AGE_TIERS: AgeTier[] = [
  {
    tier: 1,
    years: 1,
    name: "SPROUT",
    color: "#a3e635",
    art: "age-1",
    slug: "age_1",
    blurb: "Have an active ZUNO account for 1 year to unlock this badge.",
  },
  {
    tier: 2,
    years: 2,
    name: "BUD",
    color: "#4ade80",
    art: "age-2",
    slug: "age_2",
    blurb: "Have an active ZUNO account for 2 years to unlock this badge.",
  },
  {
    tier: 3,
    years: 3,
    name: "SAPLING",
    color: "#34d399",
    art: "age-3",
    slug: "age_3",
    blurb: "Have an active ZUNO account for 3 years to unlock this badge.",
  },
  {
    tier: 4,
    years: 4,
    name: "BLOOM",
    color: "#22d3ee",
    art: "age-4",
    slug: "age_4",
    blurb: "Have an active ZUNO account for 4 years to unlock this badge.",
  },
  {
    tier: 5,
    years: 5,
    name: "EVERGREEN",
    color: "#38bdf8",
    art: "age-5",
    slug: "age_5",
    blurb: "Have an active ZUNO account for 5 years to unlock this badge.",
  },
  {
    tier: 6,
    years: 6,
    name: "IRONVINE",
    color: "#2f7cff",
    art: "age-6",
    slug: "age_6",
    blurb: "Have an active ZUNO account for 6 years to unlock this badge.",
  },
  {
    tier: 7,
    years: 7,
    name: "SKYVINE",
    color: "#818cf8",
    art: "age-7",
    slug: "age_7",
    blurb: "Have an active ZUNO account for 7 years to unlock this badge.",
  },
  {
    tier: 8,
    years: 8,
    name: "NEON VINE",
    color: "#8b5cf6",
    art: "age-8",
    slug: "age_8",
    blurb: "Have an active ZUNO account for 8 years to unlock this badge.",
  },
  {
    tier: 9,
    years: 9,
    name: "MIDNIGHT BLOOM",
    color: "#c084fc",
    art: "age-9",
    slug: "age_9",
    blurb: "Have an active ZUNO account for 9 years to unlock this badge.",
  },
  {
    tier: 10,
    years: 10,
    name: "ETERNAL VINE",
    color: "#5fe3ff",
    art: "age-10",
    slug: "age_10",
    blurb: "Have an active ZUNO account for 10 years or more to unlock this badge.",
  },
];

/** `age_4` and artwork `age-4` both mean rung four. */
export function ageTierFromSlug(slug: string): AgeTier | null {
  return AGE_TIERS.find((tier) => tier.slug === slug) ?? null;
}

export function isAgeSlug(slug: string): boolean {
  return AGE_TIERS.some((tier) => tier.slug === slug);
}

/** Calendar years of membership, counting real anniversaries. */
export function ageYears(createdAt: number, at: number = Date.now()): number {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 0;
  let years = new Date(at).getUTCFullYear() - new Date(createdAt).getUTCFullYear();
  if (addYears(createdAt, years) > at) years -= 1;
  return Math.max(0, years);
}

export function ageDays(createdAt: number, at: number = Date.now()): number {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 0;
  return Math.max(0, Math.floor((at - createdAt) / AGE_DAY));
}

/** Whole calendar months between two instants. */
function ageMonths(createdAt: number, at: number): number {
  const from = new Date(createdAt);
  const to = new Date(at);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function addYears(at: number, years: number): number {
  const date = new Date(at);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.getTime();
}

/** "4 years, 1 month" · "7 months" · "12 days" · "Joined today". */
export function ageLabel(createdAt: number, at: number = Date.now()): string {
  const days = ageDays(createdAt, at);
  if (days < 1) return "Joined today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = ageMonths(createdAt, at);
  if (months < 12) return `${Math.max(1, months)} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const head = `${years} year${years === 1 ? "" : "s"}`;
  return rest ? `${head}, ${rest} month${rest === 1 ? "" : "s"}` : head;
}

/** The rung this account stands on, or null while it is under a year old. */
export function ageTierFor(createdAt: number, at: number = Date.now()): AgeTier | null {
  const years = ageYears(createdAt, at);
  if (years < 1) return null;
  let found: AgeTier | null = null;
  for (const tier of AGE_TIERS) if (years >= tier.years) found = tier;
  return found;
}

/** The next rung to work towards, or null at the top. */
export function nextAgeTier(createdAt: number, at: number = Date.now()): AgeTier | null {
  const years = ageYears(createdAt, at);
  return AGE_TIERS.find((tier) => years < tier.years) ?? null;
}

/** When this account crossed — or will cross — a rung's anniversary. */
export function ageUnlockAt(createdAt: number, years: number): number {
  return addYears(createdAt, years);
}

export interface AgeProgressRow {
  tier: number;
  years: number;
  name: string;
  color: string;
  art: string;
  slug: string;
  blurb: string;
  unlocked: boolean;
  unlockedAt: number;
}

export interface AgeProgress {
  /** Days of membership so far. */
  days: number;
  /** "4 years, 1 month". */
  label: string;
  /** Current rung, or null under a year. */
  tier: AgeTier | null;
  /** When the current rung was earned, or null under a year. */
  unlockedAt: number | null;
  /** Next rung to reach, or null at the top of the ladder. */
  next: AgeTier | null;
  /** When the next rung arrives, or null at the top. */
  nextAt: number | null;
  rows: AgeProgressRow[];
}

/** Everything the profile card and the progress grid need. */
export function ageProgress(createdAt: number, at: number = Date.now()): AgeProgress {
  const tier = ageTierFor(createdAt, at);
  const next = nextAgeTier(createdAt, at);
  return {
    days: ageDays(createdAt, at),
    label: ageLabel(createdAt, at),
    tier,
    unlockedAt: tier ? ageUnlockAt(createdAt, tier.years) : null,
    next,
    nextAt: next ? ageUnlockAt(createdAt, next.years) : null,
    rows: AGE_TIERS.map((rung) => ({
      ...rung,
      unlocked: !!tier && rung.tier <= tier.tier,
      unlockedAt: ageUnlockAt(createdAt, rung.years),
    })),
  };
}
