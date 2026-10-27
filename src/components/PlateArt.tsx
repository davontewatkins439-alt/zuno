import React, { useId } from "react";
import { plateArt } from "../lib/nameplates";

/**
 * Original ZUNO nameplate artwork.
 *
 * Each plate paints a small vector scene inside the name pill. Everything is
 * hand-built from primitives so there is no third-party art in the product,
 * and the same component is used in the shop and in chat so a preview always
 * matches the real thing.
 */
export function PlateArt({ id, className }: { id: string | null | undefined; className?: string }) {
  const spec = plateArt(id);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!spec) return null;
  const gid = `np-g-${uid}`;
  const sid = `np-s-${uid}`;
  const cid = `np-c-${uid}`;

  return (
    <svg
      className={className ? `plate-art ${className}` : "plate-art"}
      viewBox="0 0 320 60"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={spec.a} stopOpacity="0.85" />
          <stop offset="52%" stopColor={spec.b} stopOpacity="0.55" />
          <stop offset="100%" stopColor={spec.a} stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={sid} cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor={spec.glow} />
          <stop offset="100%" stopColor={spec.a} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="320" height="60" fill={spec.a} opacity="0.18" />
      <g className={`pa-scene scene-${spec.scene}`}>
        <Scene scene={spec.scene} gid={gid} sid={sid} a={spec.a} b={spec.b} />
      </g>
      {/* Ambient motion layer. Every plate breathes, twinkles and catches a
          travelling highlight, so a nameplate is never a still picture. */}
      <g className="pa-ambient">
        <circle className="pa-aura" cx="206" cy="30" r="42" fill={`url(#${sid})`} />
        {SPARKS.map(([x, y, delay], index) => (
          <circle
            key={index}
            className="pa-spark"
            cx={x}
            cy={y}
            r={index % 3 === 0 ? 1.4 : 1}
            fill={spec.b}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </g>
      <rect className="pa-sweep" x="-90" y="-14" width="70" height="88" fill={`url(#${cid})`} />
    </svg>
  );
}

/** Deterministic spark positions, so the twinkle never changes between renders. */
const SPARKS: [number, number, number][] = [
  [36, 12, 0],
  [62, 46, 1.4],
  [88, 22, 2.8],
  [118, 40, 0.6],
  [142, 14, 3.4],
  [168, 48, 2.1],
  [196, 20, 4.2],
  [224, 42, 1.1],
  [252, 12, 3.8],
  [278, 34, 2.5],
  [302, 48, 0.3],
  [16, 38, 4.8],
];

/**
 * The owner signature: the ZUNO crown and the ZUNO wordmark drawn as one
 * lockup, parked in the clear zone of the plate (roughly 40%-67% across).
 *
 * Every owner plate wears it because the avatar and display name always cover
 * the left of a nameplate and the account buttons the right, so an emblem
 * drawn dead-centre would be invisible.
 */
function OwnerMark({ b }: { b: string }) {
  return (
    <g>
      <g transform="translate(145 30) scale(0.36) translate(-160 -26.5)">
        <path
          d="M122 38 L114 10 L140 26 L160 6 L180 26 L206 10 L198 38 Z"
          fill={b}
          opacity="0.92"
          stroke="#04060c"
          strokeOpacity="0.45"
        />
        <rect x="122" y="40" width="76" height="8" rx="3.5" fill={b} />
        <g fill="#ffffff" opacity="0.8">
          <circle cx="160" cy="18" r="2.6" />
          <circle cx="132" cy="23" r="1.8" />
          <circle cx="188" cy="23" r="1.8" />
        </g>
      </g>
      <text
        x="168"
        y="37"
        fill={b}
        fontSize="15"
        fontWeight="800"
        letterSpacing="2.4"
        fontFamily="Inter, system-ui, sans-serif"
      >
        ZUNO
      </text>
    </g>
  );
}

function Scene({ scene, gid, sid, a, b }: { scene: string; gid: string; sid: string; a: string; b: string }) {
  switch (scene) {
    case "circuit":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.5" />
          <g stroke={b} strokeWidth="1" opacity="0.55">
            {[0, 1, 2, 3, 4].map((i) => (
              <path key={`h${i}`} d={`M0 ${12 + i * 9} H320`} opacity={0.18 + i * 0.05} />
            ))}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <path key={`v${i}`} d={`M${20 + i * 42} 0 V60`} opacity="0.2" />
            ))}
          </g>
          <g fill={b}>
            {[
              [62, 21],
              [146, 39],
              [230, 12],
              [286, 48],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="6" height="4" rx="1" opacity="0.95" />
            ))}
          </g>
          <path d="M62 23 H100 V41 H170" stroke={b} strokeWidth="1.4" fill="none" opacity="0.7" />
          <path d="M230 14 H262 V46 H286" stroke={b} strokeWidth="1.4" fill="none" opacity="0.55" />
        </g>
      );
    case "rain":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.55" />
          <rect y="34" width="320" height="26" fill={`url(#${sid})`} />
          <g stroke="#ffffff" strokeWidth="1" strokeLinecap="round">
            {Array.from({ length: 26 }).map((_, i) => {
              const x = (i * 37) % 320;
              const y = (i * 23) % 52;
              return <path key={i} d={`M${x} ${y} l7 18`} opacity={0.06 + ((i * 7) % 22) / 100} />;
            })}
          </g>
          <g stroke={b} strokeWidth="1.2" opacity="0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <path key={i} d={`M${i * 34} ${42 + (i % 3) * 4} l9 20`} />
            ))}
          </g>
        </g>
      );
    case "signal":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.45" />
          <g fill={b}>
            {Array.from({ length: 64 }).map((_, i) => {
              const h = 4 + ((i * 13) % 30);
              return <rect key={i} x={i * 5} y={30 - h / 2} width="2.4" height={h} opacity={0.18 + ((i * 5) % 40) / 100} />;
            })}
          </g>
          <g stroke="#ffffff" opacity="0.14" strokeWidth="0.8">
            {[8, 20, 32, 44, 56].map((y) => (
              <path key={y} d={`M0 ${y} H320`} />
            ))}
          </g>
        </g>
      );
    case "flare":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.6" />
          <rect width="320" height="60" fill={`url(#${sid})`} opacity="0.9" />
          <g fill="none" strokeLinecap="round">
            {Array.from({ length: 9 }).map((_, i) => (
              <path
                key={i}
                d={`M-10 ${44 + i * 3} Q 120 ${4 + i * 2} 330 ${28 + i * 4}`}
                stroke={i % 2 ? b : "#fff5d6"}
                strokeWidth={1.6 - i * 0.1}
                opacity={0.5 - i * 0.04}
              />
            ))}
          </g>
          <circle cx="40" cy="52" r="26" fill="#fff2c9" opacity="0.22" />
        </g>
      );
    case "tide":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.7" />
          <g fill="none" stroke={b} strokeWidth="1.4">
            {[0, 1, 2, 3].map((i) => (
              <path key={i} d={`M0 ${26 + i * 8} C 60 ${18 + i * 8}, 100 ${36 + i * 8}, 160 ${26 + i * 8} S 260 ${18 + i * 8}, 320 ${30 + i * 8}`} opacity={0.55 - i * 0.1} />
            ))}
          </g>
          <rect y="40" width="320" height="20" fill="#04121f" opacity="0.45" />
        </g>
      );
    case "bloom":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.5" />
          <g opacity="0.75">
            <ellipse cx="96" cy="30" rx="62" ry="26" fill={a} opacity="0.5" />
            <ellipse cx="180" cy="22" rx="54" ry="22" fill={b} opacity="0.42" />
            <ellipse cx="254" cy="38" rx="58" ry="24" fill={a} opacity="0.36" />
          </g>
          <g fill="#ffffff" opacity="0.55">
            {[
              [64, 18],
              [132, 40],
              [208, 16],
              [276, 34],
              [156, 10],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="2" rx="0.6" />
            ))}
          </g>
        </g>
      );
    case "city":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.35" />
          <rect y="18" width="320" height="42" fill={`url(#${sid})`} />
          <g fill="#061020">
            {[
              [0, 26, 22, 34],
              [26, 16, 18, 44],
              [48, 30, 26, 30],
              [78, 12, 16, 48],
              [98, 24, 30, 36],
              [132, 34, 20, 26],
              [156, 18, 24, 42],
              [184, 28, 18, 32],
              [206, 10, 26, 50],
              [236, 26, 20, 34],
              [260, 34, 22, 26],
              [286, 20, 34, 40],
            ].map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} opacity="0.9" />
            ))}
          </g>
          <g fill={b} opacity="0.85">
            {Array.from({ length: 40 }).map((_, i) => {
              const x = 4 + ((i * 29) % 314);
              const y = 26 + ((i * 17) % 30);
              return <rect key={i} x={x} y={y} width="2" height="3" opacity={0.35 + ((i * 7) % 60) / 100} />;
            })}
          </g>
        </g>
      );
    case "origin":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.55" />
          <g fill="none" stroke={b} strokeWidth="1.1">
            {[16, 27, 38, 49, 60].map((r, i) => (
              <circle key={r} cx="160" cy="30" r={r} opacity={0.4 - i * 0.06} />
            ))}
          </g>
          <path d="M160 12 L176 30 L160 48 L144 30 Z" fill={b} opacity="0.9" />
          <path d="M160 18 L169 30 L160 42 L151 30 Z" fill="#04101f" opacity="0.55" />
          <g fill="#ffffff" opacity="0.6">
            {[
              [40, 14],
              [282, 20],
              [66, 44],
              [258, 46],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="2" rx="1" />
            ))}
          </g>
        </g>
      );
    case "moon":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.5" />
          <rect width="320" height="60" fill={`url(#${sid})`} opacity="0.7" />
          <g fill="#eef2ff" opacity="0.9">
            <path d="M236 8 a20 20 0 1 0 14 34 a16 16 0 1 1 -14 -34 Z" />
            <circle cx="70" cy="16" r="1.6" />
            <circle cx="112" cy="34" r="1.2" />
            <circle cx="154" cy="12" r="1.8" />
            <circle cx="196" cy="40" r="1.3" />
            <circle cx="286" cy="44" r="1.5" />
            <circle cx="44" cy="42" r="1.1" />
          </g>
          <g stroke="#ffffff" opacity="0.28" strokeWidth="0.9">
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M0 ${46 + i * 6} H320`} />
            ))}
          </g>
        </g>
      );
    case "hex":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.55" />
          <g fill="none" stroke={b} strokeWidth="1" opacity="0.5">
            {Array.from({ length: 6 }).map((_, col) =>
              Array.from({ length: 2 }).map((__, row) => (
                <path
                  key={`${col}-${row}`}
                  d="M0 -11 L9.5 -5.5 L9.5 5.5 L0 11 L-9.5 5.5 L-9.5 -5.5 Z"
                  transform={`translate(${24 + col * 56} ${18 + row * 24})`}
                  opacity={0.35 + ((col + row) % 3) * 0.18}
                />
              )),
            )}
          </g>
          <g fill={b} opacity="0.75">
            {[
              [80, 30],
              [192, 18],
              [248, 42],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="4" height="4" rx="1" />
            ))}
          </g>
        </g>
      );
    case "prism":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.4" />
          <path d="M0 60 L84 0 L132 60 Z" fill={a} opacity="0.55" />
          <path d="M96 60 L168 6 L230 60 Z" fill={b} opacity="0.45" />
          <path d="M204 60 L262 16 L320 60 Z" fill="#ffffff" opacity="0.16" />
          <g stroke="#ffffff" strokeWidth="1" opacity="0.35">
            <path d="M0 60 L84 0" />
            <path d="M84 0 L132 60" />
            <path d="M168 6 L230 60" />
          </g>
        </g>
      );
    case "carbon":
      return (
        <g>
          <rect width="320" height="60" fill="#0a1322" opacity="0.6" />
          <g stroke={b} strokeWidth="1" opacity="0.14">
            {Array.from({ length: 18 }).map((_, i) => (
              <path key={`a${i}`} d={`M${i * 20 - 20} 60 L${i * 20 + 20} 0`} />
            ))}
            {Array.from({ length: 18 }).map((_, i) => (
              <path key={`b${i}`} d={`M${i * 20 - 20} 0 L${i * 20 + 20} 60`} />
            ))}
          </g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.3" />
          <path d="M0 44 Q 80 30 160 44 T 320 40 L320 60 L0 60 Z" fill={b} opacity="0.25" />
          <g fill={b} opacity="0.9">
            <rect x="196" y="14" width="3" height="3" rx="1.4" />
            <rect x="132" y="24" width="2.4" height="2.4" rx="1.1" />
            <rect x="268" y="30" width="2.6" height="2.6" rx="1.2" />
          </g>
        </g>
      );
    case "vault":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.55" />
          <g fill="#ffffff" opacity="0.14">
            <path d="M0 0 L70 0 L28 60 L0 60 Z" />
            <path d="M120 0 L176 0 L140 60 L104 60 Z" />
            <path d="M236 0 L300 0 L268 60 L228 60 Z" />
          </g>
          <g stroke={b} strokeWidth="1.2" opacity="0.6">
            <path d="M44 0 L70 60" />
            <path d="M148 0 L172 60" />
            <path d="M256 0 L282 60" />
          </g>
          <g fill={a} opacity="0.5">
            <rect x="0" y="46" width="320" height="14" />
          </g>
        </g>
      );
    case "glow":
      return (
        <g>
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.45" />
          <rect width="320" height="60" fill={`url(#${sid})`} opacity="0.8" />
          <g fill="none" strokeLinecap="round">
            {[0, 1, 2, 3].map((i) => (
              <path
                key={i}
                d={`M-20 ${14 + i * 11} C 90 ${2 + i * 11}, 210 ${40 + i * 6}, 340 ${18 + i * 11}`}
                stroke={i % 2 ? b : "#ffffff"}
                strokeWidth="1.6"
                opacity={0.5 - i * 0.08}
              />
            ))}
          </g>
          <circle cx="252" cy="18" r="12" fill="#ffffff" opacity="0.18" />
        </g>
      );
    /* ---------------------------- owner tier ---------------------------- */
    case "figure":
      return (
        <g>
          <rect width="320" height="60" fill="#04050a" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.22" />
          <path d="M70 60 Q 160 26 250 60 Z" fill="#090b12" />
          <path d="M70 60 Q 160 26 250 60" stroke={b} strokeWidth="1" fill="none" opacity="0.4" />
          {/* The mascot sits left of the signature so the crown and wordmark
              stay clear of the avatar and display name. */}
          <g transform="translate(-80 0)" opacity="0.9">
            <g fill="#0c1018" stroke={b} strokeOpacity="0.32">
              <rect x="112" y="18" width="14" height="22" rx="6" />
              <rect x="194" y="18" width="14" height="22" rx="6" />
            </g>
            <rect x="130" y="6" width="60" height="48" rx="19" fill="#0a0d14" stroke={b} strokeOpacity="0.5" />
            <rect x="141" y="19" width="38" height="9" rx="4.5" fill={`url(#${gid})`} />
            <rect x="144" y="21" width="11" height="3" rx="1.5" fill="#ffffff" opacity="0.5" />
            <path d="M150 39 H170" stroke={b} strokeWidth="1.2" opacity="0.5" />
            <g fill={b} opacity="0.7">
              <rect x="88" y="16" width="2" height="2" rx="1" />
              <rect x="238" y="24" width="2" height="2" rx="1" />
              <rect x="64" y="34" width="1.6" height="1.6" rx="0.8" />
            </g>
          </g>
          <OwnerMark b={b} />
        </g>
      );
    case "crown":
      return (
        <g>
          <rect width="320" height="60" fill="#05060b" />
          <rect width="320" height="60" fill={`url(#${sid})`} opacity="0.9" />
          <g stroke={b} strokeWidth="0.9" opacity="0.35">
            <path d="M0 30 H96" />
            <path d="M268 30 H320" />
          </g>
          <g fill="#fff6d8" opacity="0.7">
            <circle cx="104" cy="16" r="1.4" />
            <circle cx="92" cy="44" r="1.2" />
            <circle cx="300" cy="14" r="1.3" />
          </g>
          <OwnerMark b={b} />
        </g>
      );
    case "halo":
      return (
        <g>
          <rect width="320" height="60" fill="#04060c" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.28" />
          <g fill="none" stroke={b}>
            <ellipse cx="196" cy="30" rx="34" ry="30" opacity="0.6" strokeWidth="1.2" />
            <ellipse cx="196" cy="30" rx="52" ry="46" opacity="0.34" strokeWidth="0.9" />
            <ellipse cx="196" cy="30" rx="74" ry="64" opacity="0.2" strokeWidth="0.8" />
          </g>
          <ellipse cx="196" cy="30" rx="18" ry="15" fill={b} opacity="0.16" />
          <g fill={b} opacity="0.55">
            {[
              [52, 14],
              [78, 44],
              [268, 20],
              [290, 40],
              [96, 30],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="2" rx="1" />
            ))}
          </g>
          <OwnerMark b={b} />
        </g>
      );
    case "chrome":
      return (
        <g>
          <rect width="320" height="60" fill="#080a10" />
          <g>
            <path d="M-10 52 C 60 8, 120 58, 180 22 S 280 6, 330 30 L330 60 L-10 60 Z" fill={`url(#${gid})`} opacity="0.62" />
            <path d="M-10 48 C 60 12, 120 54, 180 26 S 280 12, 330 34" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.45" />
            <path d="M-10 36 C 80 0, 130 44, 200 14 S 290 0, 330 18" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.26" />
          </g>
          <g stroke="#dbe6f7" strokeWidth="0.8" opacity="0.2">
            <path d="M40 0 V60" />
            <path d="M120 0 V60" />
            <path d="M200 0 V60" />
            <path d="M280 0 V60" />
          </g>
          <OwnerMark b={b} />
        </g>
      );
    case "glitch":
      return (
        <g>
          <rect width="320" height="60" fill="#06080f" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.2" />
          <g opacity="0.75">
            <rect x="0" y="8" width="104" height="6" fill={b} opacity="0.45" />
            <rect x="94" y="8" width="56" height="6" fill="#5fe3ff" opacity="0.3" />
            <rect x="196" y="52" width="124" height="5" fill="#5fe3ff" opacity="0.32" />
            <rect x="232" y="6" width="72" height="6" fill={b} opacity="0.4" />
            <rect x="40" y="48" width="92" height="4" fill="#5fe3ff" opacity="0.24" />
          </g>
          <g stroke="#ffffff" strokeWidth="0.6" opacity="0.12">
            {[6, 18, 30, 42, 54].map((y) => (
              <path key={y} d={`M0 ${y} H320`} />
            ))}
          </g>
          <rect x="286" y="50" width="10" height="10" fill={b} opacity="0.45" />
          <OwnerMark b={b} />
        </g>
      );
    case "sigil":
      return (
        <g>
          <rect width="320" height="60" fill="#030409" />
          <g stroke={b} strokeOpacity="0.28" fill="none">
            <rect x="132" y="14" width="120" height="32" rx="6" />
            <path d="M132 30 H112" />
            <path d="M252 30 H272" />
          </g>
          <g fill={b} opacity="0.5">
            <rect x="96" y="26" width="2" height="2" rx="1" />
            <rect x="288" y="32" width="2" height="2" rx="1" />
          </g>
          <OwnerMark b={b} />
        </g>
      );
    /* --------------------------- halloween drop -------------------------- */
    case "pumpkin":
      return (
        <g>
          <rect width="320" height="60" fill="#08060c" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.26" />
          <ellipse cx="250" cy="56" rx="68" ry="11" fill={a} opacity="0.36" />
          <g transform="translate(248 30)">
            <path d="M-4 -15 C -3 -23 6 -25 8 -19 C 6 -17 4 -17 2 -15 Z" fill="#33421f" />
            <path d="M4 -21 C 14 -25 20 -19 16 -13" stroke="#4a6b2a" strokeWidth="2" fill="none" />
            <ellipse cx="0" cy="4" rx="27" ry="20" fill="#1a1108" stroke={b} strokeOpacity="0.55" strokeWidth="1.1" />
            <ellipse cx="-10" cy="3" rx="12" ry="18" fill="#241708" opacity="0.95" />
            <ellipse cx="10" cy="3" rx="12" ry="18" fill="#241708" opacity="0.95" />
            <path d="M-14 -4 L-6 -11 L-2 -3 Z" fill={b} opacity="0.95" />
            <path d="M14 -4 L6 -11 L2 -3 Z" fill={b} opacity="0.95" />
            <path d="M-12 6 L-6 2 L0 8 L6 2 L12 6 L6 14 L-6 14 Z" fill={b} opacity="0.88" />
            <circle cx="0" cy="6" r="17" fill={`url(#${sid})`} opacity="0.45" />
          </g>
          <g fill={b} opacity="0.8">
            {[
              [186, 16],
              [206, 40],
              [308, 22],
              [292, 46],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="3" rx="1" />
            ))}
          </g>
        </g>
      );
    case "bats":
      return (
        <g>
          <rect width="320" height="60" fill="#06050c" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.3" />
          <path d="M238 6 a19 19 0 1 0 13 32 a15 15 0 1 1 -13 -32 Z" fill="#f6ecd6" opacity="0.9" />
          <g fill="#05040a" stroke={b} strokeWidth="0.6" opacity="0.95">
            {[
              [168, 14, 1.1],
              [204, 30, 0.8],
              [146, 36, 0.7],
              [214, 12, 0.6],
              [128, 18, 0.5],
            ].map(([x, y, s], i) => (
              <path
                key={i}
                d="M0 0 c -4 -6 -11 -7 -14 -1 c 4 0 6 3 7 6 c 3 -2 4 -2 7 0 c 3 -2 4 -2 7 0 c 1 -3 3 -6 7 -6 c -3 -6 -10 -5 -14 1 Z"
                transform={`translate(${x} ${y}) scale(${s})`}
              />
            ))}
          </g>
          <g stroke={b} strokeWidth="0.7" opacity="0.18">
            {[10, 26, 42].map((y) => (
              <path key={y} d={`M0 ${y} H320`} />
            ))}
          </g>
        </g>
      );
    case "web":
      return (
        <g>
          <rect width="320" height="60" fill="#07060f" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.24" />
          <g transform="translate(322 -2)" stroke={b} fill="none" strokeWidth="0.9" opacity="0.5">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const angle = 0.22 + (i * Math.PI) / 10;
              return <path key={`s${i}`} d={`M0 0 L${-Math.cos(angle) * 104} ${Math.sin(angle) * 104}`} />;
            })}
            {[26, 48, 70, 92].map((radius, ring) => {
              const points = [0, 1, 2, 3, 4, 5].map((i) => {
                const angle = 0.22 + (i * Math.PI) / 10;
                return `${-Math.cos(angle) * radius} ${Math.sin(angle) * radius}`;
              });
              return <path key={`r${ring}`} d={`M${points.join(" L")}`} opacity={0.75 - ring * 0.13} />;
            })}
          </g>
          <g transform="translate(252 34)" opacity="0.9">
            <path d="M0 -8 V14" stroke={b} strokeWidth="0.8" opacity="0.6" />
            <ellipse cx="0" cy="6" rx="4.6" ry="5.4" fill="#0a0912" stroke={b} strokeWidth="0.7" />
            <circle cx="0" cy="1.4" r="2.6" fill="#0a0912" stroke={b} strokeWidth="0.6" />
            <g stroke={b} strokeWidth="0.7">
              <path d="M-4 4 L-10 1" />
              <path d="M4 4 L10 1" />
              <path d="M-4 8 L-10 11" />
              <path d="M4 8 L10 11" />
            </g>
          </g>
        </g>
      );
    case "ghost":
      return (
        <g>
          <rect width="320" height="60" fill="#070810" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.22" />
          <g opacity="0.22" fill="#0b0e18">
            {[
              [40, 24, 16, 30],
              [70, 30, 12, 24],
              [284, 22, 14, 32],
            ].map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx={w / 2} />
            ))}
          </g>
          <g transform="translate(250 26)" opacity="0.94">
            <path d="M-19 20 V-3 a19 19 0 0 1 38 0 V20 l-6.3 -5 -6.3 5 -6.4 -5 -6.3 5 -6.4 -5 Z" fill="#eef3ff" />
            <ellipse cx="-6.4" cy="-4" rx="3.2" ry="4.4" fill="#0a0c14" />
            <ellipse cx="6.4" cy="-4" rx="3.2" ry="4.4" fill="#0a0c14" />
            <ellipse cx="0" cy="5" rx="3.2" ry="2.6" fill="#0a0c14" opacity="0.75" />
          </g>
          <rect y="34" width="320" height="26" fill={`url(#${sid})`} opacity="0.8" />
        </g>
      );
    case "candy":
      return (
        <g>
          <rect width="320" height="60" fill="#0a0710" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.3" />
          <g transform="rotate(-10 250 30)">
            <path d="M236 6 L264 6 L250 48 Z" fill="#ffcf5c" />
            <path d="M236 6 L264 6 L258.7 24 L241.3 24 Z" fill="#ff8a3d" />
            <path d="M241.3 24 L258.7 24 L250 48 Z" fill="#fff3dd" />
          </g>
          <g transform="translate(196 22) rotate(14)">
            <rect x="-8" y="-5" width="16" height="10" rx="5" fill={b} opacity="0.85" />
            <path d="M-8 0 L-16 -5 L-16 5 Z" fill={b} opacity="0.55" />
            <path d="M8 0 L16 -5 L16 5 Z" fill={b} opacity="0.55" />
          </g>
          <g transform="translate(296 40) rotate(-18)">
            <rect x="-7" y="-4" width="14" height="8" rx="4" fill="#ff5fa8" opacity="0.8" />
          </g>
          <g fill="#ffffff" opacity="0.5">
            {[
              [176, 44],
              [212, 46],
              [282, 14],
              [306, 22],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="2" rx="1" />
            ))}
          </g>
        </g>
      );
    default:
      return <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.5" />;
  }
}
