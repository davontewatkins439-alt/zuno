/**
 * Nameplate visuals.
 *
 * The server stores only the plate id on the user row, so every surface can
 * render the right gradient without an extra request. The styles live in
 * styles.css under `.np-<id>`; keep this list in sync with the seeded catalog.
 */
export const NAMEPLATE_IDS = [
  "midnight-circuit",
  "neon-rain",
  "ghost-signal",
  "solar-flare",
  "deep-current",
  "static-bloom",
  "city-lights",
  "origin",
] as const;

export type NameplateId = (typeof NAMEPLATE_IDS)[number];

export function isNameplateId(value: unknown): value is NameplateId {
  return typeof value === "string" && (NAMEPLATE_IDS as readonly string[]).includes(value);
}

/** Class that paints the nameplate behind a display name, or "" for none. */
export function plateClass(nameplate: string | null | undefined): string {
  if (!isNameplateId(nameplate)) return "";
  return `np np-${nameplate}`;
}
