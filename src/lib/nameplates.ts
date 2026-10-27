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
    | "sigil"
    | "pumpkin"
    | "bats"
    | "web"
    | "ghost"
    | "candy"
    | "skull"
    | "tomb"
    | "potion";
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
  // Second member wave — the bundle tier. These ship in themed packs so a
  // member can pick a whole look instead of one plate at a time.
  "polar-drift": { a: "#bfe9ff", b: "#4f7dff", glow: "rgba(191,233,255,0.45)", scene: "tide" },
  "ember-wake": { a: "#ff7a3d", b: "#b3122f", glow: "rgba(255,122,61,0.5)", scene: "flare" },
  "velvet-noise": { a: "#b14bff", b: "#ff5fa8", glow: "rgba(177,75,255,0.5)", scene: "bloom" },
  "steel-lattice": { a: "#59677d", b: "#a9c4e8", glow: "rgba(169,196,232,0.35)", scene: "carbon" },
  "aurora-line": { a: "#34e3a4", b: "#5fe3ff", glow: "rgba(52,227,164,0.45)", scene: "rain" },
  "midnight-market": { a: "#7b5cff", b: "#ffb347", glow: "rgba(123,92,255,0.5)", scene: "city" },
  "signal-void": { a: "#262b3a", b: "#9fb0c9", glow: "rgba(159,176,201,0.3)", scene: "signal" },
  "honey-static": { a: "#ffc24b", b: "#ff7ab8", glow: "rgba(255,194,75,0.45)", scene: "glow" },
  "quartz-fault": { a: "#ff8ad4", b: "#5fe3ff", glow: "rgba(255,138,212,0.5)", scene: "prism" },
  "lumen-shaft": { a: "#e8f6ff", b: "#5fe3ff", glow: "rgba(232,246,255,0.4)", scene: "circuit" },
  "deep-orbit": { a: "#2b3f9e", b: "#c9d6ff", glow: "rgba(43,63,158,0.55)", scene: "moon" },
  "witch-hex": { a: "#7c3aed", b: "#b6ff3d", glow: "rgba(124,58,237,0.5)", scene: "hex" },
  "cinder-tide": { a: "#ff6b35", b: "#2a1430", glow: "rgba(255,107,53,0.45)", scene: "tide" },
  glasswing: { a: "#7ef0c4", b: "#c7b3ff", glow: "rgba(126,240,196,0.45)", scene: "bloom" },
  "blue-hour": { a: "#2f7cff", b: "#9fd6ff", glow: "rgba(47,124,255,0.5)", scene: "city" },
  nocturne: { a: "#3a2a6b", b: "#c0a6ff", glow: "rgba(58,42,107,0.5)", scene: "signal" },
  "static-saint": { a: "#e6e9f5", b: "#8b5cf6", glow: "rgba(230,233,245,0.4)", scene: "prism" },
  "harbour-light": { a: "#2dd4bf", b: "#ffe08a", glow: "rgba(45,212,191,0.45)", scene: "glow" },
  firefly: { a: "#b6ff3d", b: "#ffd166", glow: "rgba(182,255,61,0.45)", scene: "flare" },
  "frost-circuit": { a: "#d8f4ff", b: "#6aa8ff", glow: "rgba(216,244,255,0.4)", scene: "circuit" },
  "dusk-parade": { a: "#ff9d3d", b: "#b14bff", glow: "rgba(255,157,61,0.5)", scene: "rain" },
  "chrome-orchard": { a: "#dbe6f7", b: "#7ef0c4", glow: "rgba(219,230,247,0.4)", scene: "moon" },
  "veil-of-ash": { a: "#4a4a55", b: "#ff7a3d", glow: "rgba(255,122,61,0.45)", scene: "carbon" },
  "candy-comet": { a: "#ff5fa8", b: "#ffe08a", glow: "rgba(255,95,168,0.5)", scene: "prism" },
  "tide-of-gold": { a: "#ffd76e", b: "#0e2a63", glow: "rgba(255,215,110,0.5)", scene: "tide" },
  // Halloween drop. Seasonal plates, so they retire on the date stored in the
  // database and anybody who already claimed one keeps it.
  "ember-pumpkin": { a: "#1a0a08", b: "#ffb347", glow: "rgba(255,179,71,0.5)", scene: "pumpkin" },
  "hollow-lantern": { a: "#1a0f08", b: "#ff8a3d", glow: "rgba(255,138,61,0.55)", scene: "pumpkin" },
  "grave-signal": { a: "#0a0d18", b: "#c9d8f0", glow: "rgba(201,216,240,0.4)", scene: "ghost" },
  "cobweb-veil": { a: "#0d0a1c", b: "#c0c9d6", glow: "rgba(192,201,214,0.35)", scene: "web" },
  "candy-storm": { a: "#1a0a14", b: "#ffcf5c", glow: "rgba(255,207,92,0.45)", scene: "candy" },
  "midnight-bats": { a: "#140b2a", b: "#a06bff", glow: "rgba(160,107,255,0.5)", scene: "bats" },
  "trick-or-treat": { a: "#1a0a14", b: "#ffb347", glow: "rgba(255,179,71,0.45)", scene: "candy" },
  "carved-skull": { a: "#0a0912", b: "#efe6d4", glow: "rgba(239,230,212,0.4)", scene: "skull" },
  "bone-chorus": { a: "#0b0d16", b: "#c8d4ea", glow: "rgba(200,212,234,0.4)", scene: "skull" },
  "graveyard-mist": { a: "#080a14", b: "#9fb8d8", glow: "rgba(159,184,216,0.38)", scene: "tomb" },
  "tombstone-tide": { a: "#0c0a18", b: "#b79cff", glow: "rgba(183,156,255,0.45)", scene: "tomb" },
  "cauldron-brew": { a: "#0b1208", b: "#a6ff3d", glow: "rgba(166,255,61,0.45)", scene: "potion" },
  "potion-noir": { a: "#120712", b: "#ff5fa8", glow: "rgba(255,95,168,0.5)", scene: "potion" },
  // Owner-only tier. Matte black, gold and chrome — built to read as the top
  // of the ladder and never handed out by any unlock rule but ownership.
  "zuno-1of1": { a: "#08090f", b: "#ffd76e", glow: "rgba(255,199,60,0.55)", scene: "figure" },
  "onyx-crown": { a: "#05060b", b: "#f5c542", glow: "rgba(245,197,66,0.5)", scene: "crown" },
  "obsidian-halo": { a: "#05070d", b: "#7ef0ff", glow: "rgba(126,240,255,0.45)", scene: "halo" },
  "chrome-liquid": { a: "#0b0d14", b: "#dbe6f7", glow: "rgba(190,215,255,0.45)", scene: "chrome" },
  "glitch-sovereign": { a: "#080a12", b: "#ff4d8d", glow: "rgba(255,77,141,0.5)", scene: "glitch" },
  "noir-sigil": { a: "#04050a", b: "#ffd76e", glow: "rgba(255,215,110,0.4)", scene: "sigil" },
  "the-founder": { a: "#070910", b: "#5fe3ff", glow: "rgba(95,227,255,0.45)", scene: "figure" },
  "imperial-onyx": { a: "#05060b", b: "#ffe08a", glow: "rgba(255,224,138,0.5)", scene: "crown" },
  "gilded-obsidian": { a: "#04050a", b: "#ffb347", glow: "rgba(255,179,71,0.5)", scene: "crown" },
  "crown-of-static": { a: "#05070d", b: "#b7c6dd", glow: "rgba(183,198,221,0.4)", scene: "halo" },
  "platinum-sigil": { a: "#05060b", b: "#e9f2ff", glow: "rgba(233,242,255,0.4)", scene: "sigil" },
  "sovereign-prism": { a: "#080a12", b: "#bfa6ff", glow: "rgba(191,166,255,0.5)", scene: "chrome" },
  "midnight-throne": { a: "#04060c", b: "#7c4dff", glow: "rgba(124,77,255,0.5)", scene: "figure" },
  "kaws-standard": { a: "#05060b", b: "#ff8a3d", glow: "rgba(255,138,61,0.45)", scene: "figure" },
  "kaws-chrome": { a: "#06070c", b: "#ffd76e", glow: "rgba(255,215,110,0.45)", scene: "chrome" },
  "owners-cut": { a: "#05070d", b: "#ff2e88", glow: "rgba(255,46,136,0.5)", scene: "glitch" },
  "the-architect": { a: "#070910", b: "#5fe3ff", glow: "rgba(95,227,255,0.45)", scene: "sigil" },
  "one-of-one-noir": { a: "#030407", b: "#ffd76e", glow: "rgba(255,215,110,0.45)", scene: "halo" },
  "sovereign-hollow": { a: "#05060b", b: "#ff8a3d", glow: "rgba(255,138,61,0.5)", scene: "crown" },
  "haunted-noir": { a: "#04050a", b: "#ffd76e", glow: "rgba(255,215,110,0.4)", scene: "bats" },
  "owner-witchfire": { a: "#05070d", b: "#a6ff3d", glow: "rgba(166,255,61,0.45)", scene: "web" },
  "owner-bone-crown": { a: "#05060b", b: "#efe6d4", glow: "rgba(239,230,212,0.42)", scene: "skull" },
  "owner-crypt": { a: "#04050a", b: "#ffd76e", glow: "rgba(255,215,110,0.4)", scene: "tomb" },
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
