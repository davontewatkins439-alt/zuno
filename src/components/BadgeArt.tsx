import React from "react";
import type { Badge } from "../lib/types";
import { cls } from "../lib/utils";

export type BadgeArtKey =
  | "origin"
  | "seal"
  | "bloom"
  | "shield"
  | "blade"
  | "terminal"
  | "prism"
  | "laurel"
  | "sprout"
  | "pulse"
  | "arcade"
  | "spark"
  | "age-1"
  | "age-2"
  | "age-3"
  | "age-4"
  | "age-5"
  | "age-6"
  | "age-7"
  | "age-8"
  | "age-9"
  | "age-10";

/**
 * The ZUNO account-age badge: a neon seven-segment numeral sitting in a leaf
 * cradle, one drawing per rung of the ten-year ladder. The digits are drawn as
 * geometry rather than text, so they look identical on every machine and stay
 * crisp from a 16px chip up to a 96px profile tile. Rung ten shows "10".
 */
const AGE_RUNG: Record<string, string> = {
  "age-1": "1",
  "age-2": "2",
  "age-3": "3",
  "age-4": "4",
  "age-5": "5",
  "age-6": "6",
  "age-7": "7",
  "age-8": "8",
  "age-9": "9",
  "age-10": "10",
};

/** Which of the seven bars light up for each digit: A B C D E F G. */
const DIGIT_BARS: Record<string, boolean[]> = {
  "0": [true, true, true, true, true, true, false],
  "1": [false, true, true, false, false, false, false],
  "2": [true, true, false, true, true, false, true],
  "3": [true, true, true, true, false, false, true],
  "4": [false, true, true, false, false, true, true],
  "5": [true, false, true, true, false, true, true],
  "6": [true, false, true, true, true, true, true],
  "7": [true, true, true, false, false, false, false],
  "8": [true, true, true, true, true, true, true],
  "9": [true, true, true, true, false, true, true],
};

/** Bar geometry for one digit centred on (24, 21.5). */
function digitBars(digit: string): { key: string; x: number; y: number; w: number; h: number }[] {
  const flags = DIGIT_BARS[digit] ?? DIGIT_BARS["0"];
  const [A, B, C, D, E, F, G] = flags;
  const mid = 20.8;
  const bar = 2.7;
  const half = 9.4; // half height of the digit box
  const gap = 1.5; // breathing room between the bars
  const len = half - bar - gap; // length of a vertical bar
  const out: { key: string; x: number; y: number; w: number; h: number }[] = [];
  const horizontal = (on: boolean, key: string, y: number) => {
    if (on) out.push({ key, x: 19.4, y: y - bar / 2, w: 9.2, h: bar });
  };
  horizontal(A, "A", mid - half);
  horizontal(G, "G", mid);
  horizontal(D, "D", mid + half);
  const vertical = (on: boolean, key: string, x: number, y: number) => {
    if (on) out.push({ key, x, y, w: bar, h: len });
  };
  vertical(F, "F", 17.6, mid - half + bar / 2 + gap / 2);
  vertical(B, "B", 27.7, mid - half + bar / 2 + gap / 2);
  vertical(E, "E", 17.6, mid + gap / 2);
  vertical(C, "C", 27.7, mid + gap / 2);
  return out;
}

function AgeNumeral({ rung, color, id }: { rung: string; color: string; id: string }) {
  const digits = rung.split("");
  const scale = digits.length > 1 ? 0.66 : 1;
  const centres = digits.length > 1 ? [24 - 5.6, 24 + 5.6] : [24];
  const bars = digits.flatMap((digit, i) =>
    digitBars(digit).map((bar) => ({ ...bar, key: `${i}-${bar.key}`, tx: centres[i], scale })),
  );
  return (
    <>
      {/* soft tube glow behind the neon bars */}
      <g opacity="0.4">
        {bars.map((bar) => (
          <rect
            key={`glow-${bar.key}`}
            x={bar.x - 0.7}
            y={bar.y - 0.7}
            width={bar.w + 1.4}
            height={bar.h + 1.4}
            rx={(bar.w + 1.4) / 2}
            fill={color}
            transform={`translate(${bar.tx} 20.8) scale(${bar.scale}) translate(-24 -20.8)`}
          />
        ))}
      </g>
      {bars.map((bar) => (
        <g key={bar.key} transform={`translate(${bar.tx} 20.8) scale(${bar.scale}) translate(-24 -20.8)`}>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={bar.w / 2} fill={color} />
          <rect x={bar.x + 0.7} y={bar.y + 0.7} width={bar.w - 1.4} height={bar.h - 1.4} rx={(bar.w - 1.4) / 2} fill={`url(#${id}-core)`} />
        </g>
      ))}
    </>
  );
}

/** Two slender leaves cradling the numeral from below. */
function AgeCradle({ color }: { color: string }) {
  return (
    <g>
      <path d="M11.6 34.2c4.4-3.4 9.2-5.2 14.4-5.4-3.8 4.4-8.8 6.4-14.4 5.8Z" fill={color} />
      <path d="M36.4 34.2c-4.4-3.4-9.2-5.2-14.4-5.4 3.8 4.4 8.8 6.4 14.4 5.8Z" fill={color} fillOpacity="0.62" />
      <path d="M13.4 33.2c3.6-1.9 7.6-2.9 12.2-2.8" stroke="#06101f" strokeOpacity="0.22" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** The whole age badge: leaf cradle, neon numeral, tier ring. */
function AgeArt({ rung, color }: { rung: string; color: string }) {
  const id = `ba-age-${rung}`;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-core`} x1="18" y1="10" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19.4" fill="#06101f" />
      <circle cx="24" cy="22" r="12" fill={color} fillOpacity="0.14" />
      <circle cx="24" cy="24" r="19.4" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
      <AgeCradle color={color} />
      <AgeNumeral rung={rung} color={color} id={id} />
    </>
  );
}

/**
 * ZUNO's original badge artwork. Every shape is drawn from scratch for ZUNO —
 * no third-party icon set, no copied mascots. Each renders from 16px chips up
 * to 96px profile tiles.
 */
export function BadgeArt({ art, color, size = 24 }: { art?: string | null; color: string; size?: number }) {
  const key = (art || "spark") as BadgeArtKey;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color }}>
      {key === "origin" && (
        <>
          <defs>
            <linearGradient id="ba-or-a" x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#8ff6ff" />
              <stop offset="0.5" stopColor="#2f7cff" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="ba-or-b" x1="17" y1="12" x2="32" y2="36" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" />
              <stop offset="1" stopColor="#b8ecff" />
            </linearGradient>
          </defs>
          <path d="M24 3.6 43 14v19.4L24 44.4 5 33.4V14L24 3.6Z" fill="url(#ba-or-a)" />
          <path d="M24 8.4 38.6 16.6v14.2L24 39.2 9.4 30.8V16.6L24 8.4Z" fill="#071225" fillOpacity="0.55" />
          <path d="M24 12.4 33.6 23 24 34.4 14.4 23 24 12.4Z" fill="url(#ba-or-b)" />
          <path d="M24 18.2 28.4 23 24 28.4 19.6 23 24 18.2Z" fill="#2f7cff" />
          <path d="M38 10.4l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3 1.3-3.2Z" fill="#a8fbff" />
          <circle cx="10.6" cy="34.4" r="1.8" fill="#a8fbff" fillOpacity="0.9" />
        </>
      )}

      {key === "bloom" && (
        <>
          <defs>
            <linearGradient id="ba-bl-a" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffb8e3" />
              <stop offset="0.55" stopColor="#f472b6" />
              <stop offset="1" stopColor="#c026d3" />
            </linearGradient>
            <linearGradient id="ba-bl-b" x1="20" y1="18" x2="28" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" />
              <stop offset="1" stopColor="#ffe1f3" />
            </linearGradient>
          </defs>
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={angle}
              cx="24"
              cy="13.4"
              rx="6.1"
              ry="9.6"
              fill="url(#ba-bl-a)"
              transform={`rotate(${angle} 24 24)`}
            />
          ))}
          <circle cx="24" cy="24" r="6.2" fill="url(#ba-bl-b)" />
          <circle cx="24" cy="24" r="2.8" fill="#f472b6" />
          <circle cx="36.6" cy="11.4" r="1.7" fill="#ffd1ec" />
        </>
      )}

      {key === "seal" && (
        <>
          <defs>
            <linearGradient id="ba-se-a" x1="10" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6ee7ff" />
              <stop offset="0.55" stopColor="#2f7cff" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <path
            d="M24 3.2 28.7 7l5.1-.6.9 5 4.6 2.4-1.9 4.8 1.9 4.8-4.6 2.4-.9 5-5.1-.6L24 44.8 19.3 41l-5.1.6-.9-5-4.6-2.4 1.9-4.8-1.9-4.8 4.6-2.4.9-5 5.1.6L24 3.2Z"
            fill="url(#ba-se-a)"
          />
          <circle cx="24" cy="24" r="11.2" fill="#071225" fillOpacity="0.35" />
          <path d="m18.6 24.2 3.6 3.6 7.6-7.6" stroke="#effbff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {key === "shield" && (
        <>
          <defs>
            <linearGradient id="ba-sh-a" x1="12" y1="6" x2="36" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffb4b4" />
              <stop offset="0.5" stopColor="#f87171" />
              <stop offset="1" stopColor="#b91c1c" />
            </linearGradient>
          </defs>
          <path d="M24 4 40 9.6v11.8c0 10.4-6.6 18.6-16 22.6C14.6 40 8 31.8 8 21.4V9.6L24 4Z" fill="url(#ba-sh-a)" />
          <path d="M24 9.2 35.2 13.2v8.2c0 7.4-4.6 13.6-11.2 16.8-6.6-3.2-11.2-9.4-11.2-16.8v-8.2L24 9.2Z" fill="#3b0a0a" fillOpacity="0.4" />
          <path d="m18.8 23.6 3.6 3.6 7-7" stroke="#fff1f1" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {key === "blade" && (
        <>
          <defs>
            <linearGradient id="ba-bl-b1" x1="14" y1="38" x2="36" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9fb8d8" />
              <stop offset="0.5" stopColor="#effaff" />
              <stop offset="1" stopColor="#c9f6ff" />
            </linearGradient>
            <linearGradient id="ba-bl-b2" x1="30" y1="30" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fbbf24" />
              <stop offset="1" stopColor="#d97706" />
            </linearGradient>
          </defs>
          <path d="M36.6 6.4 41 8l1.4 4.2-17.6 21.4-5.6-4.4L36.6 6.4Z" fill="url(#ba-bl-b1)" />
          <path d="m33.4 12.2 4.6-1.8 3.6 3.8-1.8 4.4-6.4-6.4Z" fill="#2f7cff" fillOpacity="0.5" />
          <path d="m15.4 26.4 6.2 5-3.2 4.6-2.4-2.4-2.6 2.6-2.2-2.2 2.6-2.6-2.4-2.4 4-2.6Z" fill="url(#ba-bl-b2)" />
          <path d="m8.2 38.6 3.2-3.2 2.2 2.2-3.2 3.2-2.2-2.2Z" fill="#ffd79a" />
        </>
      )}

      {key === "terminal" && (
        <>
          <defs>
            <linearGradient id="ba-te-a" x1="10" y1="8" x2="38" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7ef0ff" />
              <stop offset="0.6" stopColor="#22b8d6" />
              <stop offset="1" stopColor="#0f6f8f" />
            </linearGradient>
            <linearGradient id="ba-te-b" x1="14" y1="12" x2="34" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#bff8ff" />
              <stop offset="1" stopColor="#2f7cff" />
            </linearGradient>
          </defs>
          <rect x="6" y="8" width="36" height="26" rx="5.4" fill="url(#ba-te-a)" />
          <rect x="9.6" y="11.6" width="28.8" height="18.8" rx="3.4" fill="#04121f" />
          <rect x="12.4" y="14.4" width="23.2" height="13.2" rx="2.4" fill="url(#ba-te-b)" />
          <path d="M16 18.6l3.4 2.6-3.4 2.6" stroke="#04121f" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22.6 24.2h6" stroke="#04121f" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M18 34h12l2.6 6H15.4l2.6-6Z" fill="#0f6f8f" />
          <rect x="13.4" y="39.4" width="21.2" height="3.4" rx="1.7" fill="#7ef0ff" />
        </>
      )}

      {key === "prism" && (
        <>
          <defs>
            <linearGradient id="ba-pr-a" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7dd3fc" />
              <stop offset="0.35" stopColor="#2f7cff" />
              <stop offset="0.7" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#22c55e" />
            </linearGradient>
            <linearGradient id="ba-pr-b" x1="16" y1="14" x2="32" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <path d="M24 4.2 41.4 14v20L24 43.8 6.6 34V14L24 4.2Z" fill="url(#ba-pr-a)" />
          <path d="M24 12 34.4 18v12L24 36 13.6 30V18L24 12Z" fill="#06101f" fillOpacity="0.42" />
          <path d="M24 12 34.4 18 24 24 13.6 18 24 12Z" fill="url(#ba-pr-b)" />
          <path d="M24 24v12L13.6 30V18L24 24Z" fill="#ffffff" fillOpacity="0.13" />
          <path d="m37.4 6.4 1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1L33 10.7l3.2-1.2 1.2-3.1Z" fill="#d9fbff" />
        </>
      )}

      {key === "laurel" && (
        <>
          <defs>
            <linearGradient id="ba-la-a" x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fde68a" />
              <stop offset="0.55" stopColor="#fbbf24" />
              <stop offset="1" stopColor="#2f7cff" />
            </linearGradient>
          </defs>
          <path
            d="M14 38c-5-5.2-6-13-2-20M34 38c5-5.2 6-13 2-20"
            stroke="url(#ba-la-a)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {[
            [10.4, 24.6, -32],
            [11.6, 31.2, -14],
            [15.2, 36.2, 8],
            [37.6, 24.6, 32],
            [36.4, 31.2, 14],
            [32.8, 36.2, -8],
          ].map(([x, y, r]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="3.1" ry="5.4" fill="url(#ba-la-a)" transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <path d="m24 9 2.3 5 5.5.5-4.2 3.7 1.3 5.4-4.9-3-4.9 3 1.3-5.4-4.2-3.7 5.5-.5L24 9Z" fill="#fff3c4" />
        </>
      )}

      {key === "sprout" && (
        <>
          <defs>
            <linearGradient id="ba-sp-a" x1="12" y1="38" x2="36" y2="10" gradientUnits="userSpaceOnUse">
              <stop stopColor="#65a30d" />
              <stop offset="0.55" stopColor="#a3e635" />
              <stop offset="1" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          <path d="M37.4 9.4C25 9.8 14.6 16.6 13.2 27.6c-.8 6.2 3.4 10.4 9 10.4 10.2 0 15.6-12.4 15.2-28.6Z" fill="url(#ba-sp-a)" />
          <path d="M11.4 41c2.4-9.6 8.4-16.4 18.2-21.2" stroke="#ecfccb" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.85" />
          <path d="M22 29.6c.2-4.8 1.6-8.6 4.4-11.6" stroke="#ecfccb" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.55" />
        </>
      )}

      {key === "pulse" && (
        <>
          <defs>
            <linearGradient id="ba-pu-a" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5fe3ff" />
              <stop offset="0.55" stopColor="#2f7cff" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="19.4" fill="url(#ba-pu-a)" />
          <circle cx="24" cy="24" r="15.2" fill="#06101f" fillOpacity="0.55" />
          {[
            [13.4, 8],
            [18.2, 16],
            [23, 23],
            [27.8, 14],
            [32.6, 9],
          ].map(([x, h]) => (
            <rect key={x} x={x - 1.6} y={24 - h / 2} width="3.2" height={h} rx="1.6" fill="#9ff4ff" />
          ))}
          <path d="M38 8.6 39.2 12l3.4 1.2-3.4 1.2L38 17.8l-1.2-3.4L33.4 13l3.4-1.2L38 8.6Z" fill="#bff8ff" />
        </>
      )}

      {key === "arcade" && (
        <>
          <defs>
            <linearGradient id="ba-ar-a" x1="8" y1="14" x2="40" y2="36" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7ef0ff" />
              <stop offset="0.55" stopColor="#22b8d6" />
              <stop offset="1" stopColor="#0e7490" />
            </linearGradient>
          </defs>
          <path
            d="M17 14h14c4.8 0 8.8 3.4 9.6 8.2l2 12.2c.6 3.8-3.6 6.2-6.6 4.2l-7-4.6c-1.8-1.2-4.2-1.2-6 0l-7 4.6c-3 2-7.2-.4-6.6-4.2l2-12.2C8.2 17.4 12.2 14 17 14Z"
            fill="url(#ba-ar-a)"
          />
          <rect x="13" y="22.4" width="8.2" height="2.8" rx="1.4" fill="#04212b" />
          <rect x="15.7" y="19.7" width="2.8" height="8.2" rx="1.4" fill="#04212b" />
          <circle cx="32.4" cy="21.8" r="2.1" fill="#04212b" />
          <circle cx="36.2" cy="25.4" r="2.1" fill="#04212b" />
          <circle cx="28.6" cy="25.4" r="2.1" fill="#04212b" />
          <circle cx="32.4" cy="29" r="2.1" fill="#04212b" />
        </>
      )}

      {AGE_RUNG[key] ? <AgeArt rung={AGE_RUNG[key]} color={color} /> : null}


      {key === "spark" && (
        <>
          <defs>
            <linearGradient id="ba-st-a" x1="14" y1="10" x2="34" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fff0fb" />
              <stop offset="0.45" stopColor="#e879f9" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <path d="M24 4.6c1.6 8.2 5.6 12.4 13.8 14-8.2 1.6-12.2 5.8-13.8 14-1.6-8.2-5.6-12.4-13.8-14 8.2-1.6 12.2-5.8 13.8-14Z" fill="url(#ba-st-a)" />
          <path d="M36.8 30.2c.8 4 2.8 6.2 6.8 7-4 .8-6 3-6.8 7-.8-4-2.8-6.2-6.8-7 4-.8 6-3 6.8-7Z" fill="#f0abfc" />
          <path d="M11 9.6c.5 2.6 1.8 4 4.4 4.5-2.6.5-3.9 1.9-4.4 4.5-.5-2.6-1.8-4-4.4-4.5 2.6-.5 3.9-1.9 4.4-4.5Z" fill="#fae8ff" />
        </>
      )}
    </svg>
  );
}

export function BadgeTile({
  badge,
  size = 74,
  label = true,
}: {
  badge: Pick<Badge, "name" | "color" | "art" | "unique"> & { ageLabel?: string; accountAge?: boolean };
  size?: number;
  label?: boolean;
}) {
  const isAge = badge.accountAge === true;
  return (
    <span className={cls("badge-tile-wrap", isAge && "age-wrap")}>
      <span
        className={cls("badge-tile", badge.unique && "unique", isAge && "age")}
        style={{
          width: size,
          height: size,
          ["--badge-color" as string]: badge.color,
        }}
        title={
          isAge
            ? `Account age · ${badge.name} · ${badge.ageLabel ?? ""}`.trim()
            : badge.unique
              ? `${badge.name} · 1 of 1`
              : badge.name
        }
      >
        <BadgeArt art={badge.art} color={badge.color} size={Math.round(size * (isAge ? 0.66 : 0.56))} />
        {badge.unique && <em className="badge-unique">1 OF 1</em>}
      </span>
      {label && isAge && <span className="badge-tile-cap">Account age</span>}
      {label && <span className={cls("badge-tile-label", isAge && "age-label")}>{badge.name}</span>}
      {label && isAge && badge.ageLabel && <span className="badge-tile-since">{badge.ageLabel}</span>}
    </span>
  );
}
