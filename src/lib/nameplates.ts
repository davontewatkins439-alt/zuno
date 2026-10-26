/**
 * Nameplate visuals.
 *
 * The server stores only the plate id on the user row, so every surface can
 * render the same artwork without an extra request. Colours drive the CSS
 * gradient behind the name; `scene` picks the original ZUNO vector artwork
 * painted inside the pill (see components/PlateArt.tsx).
 */
export interface PlateArtSpec {
  a: string;
  b: string;
  glow: string;
  scene:
    | "circuit"
    | "rain"
    | "signal"
    | "flare"
    | "tide"
    | "bloom"
    | "city"
    | "origin"
    | "moon"
    | "hex"
    | "prism"
    | "carbon"
    | "vault"
    | "glow"
    | "figure"
    | "crown"
    | "halo"
    | "chrome"
    | "glitch"
    | "sigil";
}

export const PLATE_ART: Record<string, PlateArtSpec> = {
  "midnight-circuit": { a: "#2f7cff", b: "#5fe3ff", glow: "rgba(47,124,255,0.55)", scene: "circuit" },
  "neon-rain": { a: "#8b5cf6", b: "#5fe3ff", glow: "rgba(139,92,246,0.55)", scene: "rain" },
  "ghost-signal": { a: "#4b5b74", b: "#b7c6dd", glow: "rgba(183,198,221,0.35)", scene: "signal" },
  "solar-flare": { a: "#f59e0b", b: "#ff5f6d", glow: "rgba(245,158,11,0.55)", scene: "flare" },
  "deep-current": { a: "#0e2a63", b: "#2dd4bf", glow: "rgba(45,212,191,0.45)", scene: "tide" },
  "static-bloom": { a: "#f472b6", b: "#8b5cf6", glow: "rgba(244,114,182,0.5)", scene: "bloom" },
  "city-lights": { a: "#5fe3ff", b: "#f472b6", glow: "rgba(244,114,182,0.5)", scene: "city" },
  origin: { a: "#5fe3ff", b: "#7c4dff", glow: "rgba(124,77,255,0.6)", scene: "origin" },
  "lunar-static": { a: "#7f8cff", b: "#cfd8ff", glow: "rgba(160,175,255,0.5)", scene: "moon" },
  hexglow: { a: "#a855f7", b: "#ff9d3d", glow: "rgba(168,85,247,0.55)", scene: "hex" },
  "prism-riot": { a: "#5fe3ff", b: "#ff5f6d", glow: "rgba(255,95,109,0.5)", scene: "prism" },
  "carbon-bloom": { a: "#3f4a5a", b: "#7ef0c4", glow: "rgba(126,240,196,0.4)", scene: "carbon" },
  "ice-vault": { a: "#b8f1ff", b: "#2f7cff", glow: "rgba(184,241,255,0.45)", scene: "vault" },
  afterglow: { a: "#ff7ab8", b: "#ffcf6b", glow: "rgba(255,122,184,0.5)", scene: "glow" },
  // Owner-only tier. Matte black, gold and chrome — built to read as the top
  // of the ladder and never handed out by any unlock rule but ownership.
  "zuno-1of1": { a: "#08090f", b: "#ffd76e", glow: "rgba(255,199,60,0.55)", scene: "figure" },
  "onyx-crown": { a: "#05060b", b: "#f5c542", glow: "rgba(245,197,66,0.5)", scene: "crown" },
  "obsidian-halo": { a: "#05070d", b: "#7ef0ff", glow: "rgba(126,240,255,0.45)", scene: "halo" },
  "chrome-liquid": { a: "#0b0d14", b: "#dbe6f7", glow: "rgba(190,215,255,0.45)", scene: "chrome" },
  "glitch-sovereign": { a: "#080a12", b: "#ff4d8d", glow: "rgba(255,77,141,0.5)", scene: "glitch" },
  "noir-sigil": { a: "#04050a", b: "#ffd76e", glow: "rgba(255,215,110,0.4)", scene: "sigil" },
  "the-founder": { a: "#070910", b: "#5fe3ff", glow: "rgba(95,227,255,0.45)", scene: "figure" },
};

export const NAMEPLATE_IDS = Object.keys(PLATE_ART);

export type NameplateId = string;

export function isNameplateId(value: unknown): value is NameplateId {
  return typeof value === "string" && value in PLATE_ART;
}

export function plateArt(nameplate: string | null | undefined): PlateArtSpec | null {
  if (!isNameplateId(nameplate)) return null;
  return PLATE_ART[nameplate];
}

/** Class that paints the nameplate behind a display name, or "" for none. */
export function plateClass(nameplate: string | null | undefined): string {
  if (!isNameplateId(nameplate)) return "";
  return `np np-${nameplate}`;
}
