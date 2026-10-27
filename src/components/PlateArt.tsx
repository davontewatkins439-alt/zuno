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
      </defs>
      <rect width="320" height="60" fill={spec.a} opacity="0.18" />
      <Scene scene={spec.scene} gid={gid} sid={sid} a={spec.a} b={spec.b} />
    </svg>
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
          <text
            x="256"
            y="50"
            fill={b}
            opacity="0.75"
            fontSize="7"
            fontWeight="800"
            letterSpacing="2.4"
            fontFamily="Inter, system-ui, sans-serif"
          >
            ZUNO
          </text>
        </g>
      );
    case "crown":
      return (
        <g>
          <rect width="320" height="60" fill="#05060b" />
          <rect width="320" height="60" fill={`url(#${sid})`} opacity="0.9" />
          <path d="M122 38 L114 10 L140 26 L160 6 L180 26 L206 10 L198 38 Z" fill={`url(#${gid})`} stroke={b} strokeOpacity="0.65" />
          <rect x="122" y="40" width="76" height="7" rx="3" fill={b} opacity="0.85" />
          <g fill="#fff6d8" opacity="0.85">
            <circle cx="160" cy="19" r="2.2" />
            <circle cx="132" cy="24" r="1.5" />
            <circle cx="188" cy="24" r="1.5" />
            <circle cx="142" cy="43.5" r="1.4" />
            <circle cx="178" cy="43.5" r="1.4" />
          </g>
          <g stroke={b} strokeWidth="0.9" opacity="0.35">
            <path d="M0 30 H96" />
            <path d="M224 30 H320" />
          </g>
        </g>
      );
    case "halo":
      return (
        <g>
          <rect width="320" height="60" fill="#04060c" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.28" />
          <g fill="none" stroke={b}>
            <ellipse cx="160" cy="30" rx="34" ry="30" opacity="0.75" strokeWidth="1.2" />
            <ellipse cx="160" cy="30" rx="52" ry="46" opacity="0.4" strokeWidth="0.9" />
            <ellipse cx="160" cy="30" rx="74" ry="64" opacity="0.22" strokeWidth="0.8" />
          </g>
          <ellipse cx="160" cy="30" rx="18" ry="15" fill={b} opacity="0.18" />
          <ellipse cx="160" cy="30" rx="8" ry="7" fill="#eafcff" opacity="0.7" />
          <g fill={b} opacity="0.55">
            {[
              [52, 14],
              [78, 44],
              [244, 20],
              [268, 40],
              [96, 30],
              [226, 48],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2" height="2" rx="1" />
            ))}
          </g>
        </g>
      );
    case "chrome":
      return (
        <g>
          <rect width="320" height="60" fill="#080a10" />
          <g>
            <path d="M-10 52 C 60 8, 120 58, 180 22 S 280 6, 330 30 L330 60 L-10 60 Z" fill={`url(#${gid})`} opacity="0.7" />
            <path d="M-10 48 C 60 12, 120 54, 180 26 S 280 12, 330 34" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.55" />
            <path d="M-10 36 C 80 0, 130 44, 200 14 S 290 0, 330 18" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.3" />
          </g>
          <g stroke="#dbe6f7" strokeWidth="0.8" opacity="0.22">
            <path d="M40 0 V60" />
            <path d="M120 0 V60" />
            <path d="M200 0 V60" />
            <path d="M280 0 V60" />
          </g>
        </g>
      );
    case "glitch":
      return (
        <g>
          <rect width="320" height="60" fill="#06080f" />
          <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.2" />
          <g opacity="0.85">
            <rect x="0" y="10" width="132" height="7" fill={b} opacity="0.55" />
            <rect x="118" y="10" width="60" height="7" fill="#5fe3ff" opacity="0.35" />
            <rect x="176" y="22" width="144" height="5" fill="#5fe3ff" opacity="0.4" />
            <rect x="186" y="34" width="86" height="7" fill={b} opacity="0.5" />
            <rect x="40" y="44" width="112" height="4" fill="#5fe3ff" opacity="0.3" />
          </g>
          <g stroke="#ffffff" strokeWidth="0.6" opacity="0.12">
            {[6, 18, 30, 42, 54].map((y) => (
              <path key={y} d={`M0 ${y} H320`} />
            ))}
          </g>
          <rect x="272" y="6" width="10" height="10" fill={b} opacity="0.5" />
        </g>
      );
    case "sigil":
      return (
        <g>
          <rect width="320" height="60" fill="#030409" />
          <g stroke={b} strokeOpacity="0.35" fill="none">
            <rect x="72" y="12" width="176" height="36" rx="6" />
            <path d="M72 30 H60" />
            <path d="M248 30 H260" />
          </g>
          <text
            x="160"
            y="38"
            textAnchor="middle"
            fill={b}
            fontSize="21"
            fontWeight="800"
            letterSpacing="7"
            fontFamily="Inter, system-ui, sans-serif"
          >
            ZUNO
          </text>
          <g fill={b} opacity="0.6">
            <rect x="86" y="26" width="2" height="2" rx="1" />
            <rect x="232" y="32" width="2" height="2" rx="1" />
          </g>
        </g>
      );
    default:
      return <rect width="320" height="60" fill={`url(#${gid})`} opacity="0.5" />;
  }
}
