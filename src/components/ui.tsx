import React, { useEffect } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Code2,
  Crown,
  Flag,
  Gavel,
  Headphones,
  Heart,
  Layers,
  PenTool,
  Rocket,
  Shield,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import type { Badge, User } from "../lib/types";
import { avatarGradient, cls, initials, statusColor, statusLabel } from "../lib/utils";
import { BadgeArt, BadgeTile } from "./BadgeArt";

export { BadgeArt, BadgeTile };

export function ZunoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="zuno-mark">
      <defs>
        <linearGradient id="zm-g" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5fe3ff" />
          <stop offset="0.55" stopColor="#2f7cff" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
        <linearGradient id="zm-s" x1="20" y1="16" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9f6ff" />
        </linearGradient>
      </defs>
      <path d="M32 2.5 55.6 16v24c0 10.7-9.8 17.9-23.6 21.5C18.2 57.9 8.4 50.7 8.4 40V16L32 2.5Z" fill="url(#zm-g)" />
      <path d="M32 6.8 51.7 18.1v21.4c0 8.6-7.9 14.9-19.7 18-11.8-3.1-19.7-9.4-19.7-18V18.1L32 6.8Z" fill="#070c1a" fillOpacity="0.86" />
      <path d="M22 21h21.5l-13 12.2h11.8L42.4 43H20.2l13.1-12.3H22V21Z" fill="url(#zm-s)" />
      <circle cx="46.5" cy="18.5" r="3.6" fill="#5fe3ff" />
    </svg>
  );
}

export function ZunoWordmark({ small = false }: { small?: boolean }) {
  return (
    <div className={cls("brand", small && "brand-small")}>
      <ZunoMark size={small ? 24 : 34} />
      <div className="brand-text">
        <span className="brand-name">ZUNO</span>
        {!small && <span className="brand-tag">YOUR CITY AFTER DARK</span>}
      </div>
    </div>
  );
}

export function Verified({ className }: { className?: string }) {
  return (
    <span className={cls("verified", className)} title="Verified by ZUNO" aria-label="Verified">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M12 2.2 14.4 4l3-.2 1 2.8 2.6 1.6-.8 2.9.8 2.9-2.6 1.6-1 2.8-3-.2L12 21.8 9.6 20l-3 .2-1-2.8-2.6-1.6.8-2.9-.8-2.9L5.6 6.6l1-2.8 3 .2L12 2.2Z"
          fill="#2f7cff"
        />
        <path d="m8.6 12.2 2.1 2.1 4.6-4.6" fill="none" stroke="#eaf8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const BADGE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  crown: Crown,
  check: BadgeCheck,
  shield: Shield,
  layers: Layers,
  gavel: Gavel,
  code: Code2,
  headset: Headphones,
  calendar: CalendarDays,
  sparkles: Sparkles,
  rocket: Rocket,
  flag: Flag,
  pen: PenTool,
  trophy: Trophy,
  heart: Heart,
};

export function BadgeGlyph({ badge, size = 12 }: { badge: Badge; size?: number }) {
  if (badge.art) return <BadgeArt art={badge.art} color={badge.color} size={size} />;
  const Icon = BADGE_ICONS[badge.glyph] ?? Sparkles;
  return <Icon size={size} />;
}

export function BadgeChip({ badge, compact = false }: { badge: Badge; compact?: boolean }) {
  return (
    <span
      className={cls("badge-chip", compact && "badge-compact")}
      style={{ ["--badge-color" as string]: badge.color }}
      title={badge.unique ? `${badge.name} · 1 of 1` : badge.name}
    >
      <BadgeGlyph badge={badge} />
      {!compact && <span>{badge.name}</span>}
      {badge.unique && <em className="badge-chip-unique">1/1</em>}
    </span>
  );
}

export function BadgeRow({ badges, max = 3, compact = false }: { badges: Badge[]; max?: number; compact?: boolean }) {
  if (!badges.length) return null;
  const visible = badges.slice(0, max);
  const rest = badges.length - visible.length;
  return (
    <span className="badge-row">
      {visible.map((badge) => (
        <BadgeChip key={badge.slug} badge={badge} compact={compact} />
      ))}
      {rest > 0 && (
        <span className="badge-more" title={badges.map((b) => b.name).join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function StatusDot({ status, size = 10 }: { status: string; size?: number }) {
  return (
    <span
      className="status-dot"
      style={{ width: size, height: size, background: statusColor(status) }}
      title={statusLabel(status)}
      aria-label={statusLabel(status)}
    />
  );
}

interface AvatarProps {
  user: Pick<User, "id" | "displayName" | "username" | "avatarId"> & {
    accentColor?: string | null;
    status?: string;
    plusDecoration?: string | null;
    isOwner?: boolean;
  };
  size?: number;
  showStatus?: boolean;
  decoration?: string | null;
  onClick?: () => void;
}

export function Avatar({ user, size = 40, showStatus = false, decoration, onClick }: AvatarProps) {
  const name = user.displayName || user.username;
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(11, size * 0.34),
    background: user.avatarId ? undefined : avatarGradient(user.id, user.accentColor),
  };
  const deco = decoration ?? user.plusDecoration;
  return (
    <span
      className={cls("avatar", onClick && "avatar-clickable", deco && `deco-${deco}`)}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {user.avatarId ? (
        <img src={`/api/files/${user.avatarId}`} alt={name} loading="lazy" />
      ) : (
        <span className="avatar-initials">{initials(name)}</span>
      )}
      {showStatus && (
        <span className="avatar-status">
          <StatusDot status={user.status ?? "online"} size={Math.max(9, size * 0.28)} />
        </span>
      )}
    </span>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  danger,
  className,
  disabled,
  title,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cls("icon-btn", active && "is-active", danger && "is-danger", className)}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
  footer,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls("modal", wide && "modal-wide", className)} role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function StickerArt({ name, size = 96 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 96 96", "aria-hidden": true as const };
  switch (name) {
    case "zuno-bolt":
      return (
        <svg {...common} className="sticker">
          <defs>
            <linearGradient id="st-bolt" x1="20" y1="10" x2="80" y2="90">
              <stop offset="0" stopColor="#5fe3ff" />
              <stop offset="1" stopColor="#2f7cff" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="42" fill="#0b1730" stroke="url(#st-bolt)" strokeWidth="2" />
          <path d="M54 14 26 55h17l-3 27 30-43H52l2-25Z" fill="url(#st-bolt)" />
        </svg>
      );
    case "zuno-crown":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#0d1428" stroke="#fbbf24" strokeWidth="2" />
          <path d="m24 64 4-30 14 12 6-20 6 20 14-12 4 30H24Z" fill="#fbbf24" />
          <circle cx="48" cy="70" r="4" fill="#5fe3ff" />
        </svg>
      );
    case "zuno-ghost":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#0a1024" stroke="#8b5cf6" strokeWidth="2" />
          <path
            d="M30 68V44a18 18 0 0 1 36 0v24l-7-5-6 6-6-6-6 6-6-6-5 5Z"
            fill="#c9f6ff"
            opacity="0.92"
          />
          <circle cx="41" cy="44" r="4" fill="#0a1024" />
          <circle cx="55" cy="44" r="4" fill="#0a1024" />
        </svg>
      );
    case "zuno-heart":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#120c22" stroke="#f472b6" strokeWidth="2" />
          <path
            d="M48 70S24 57 24 40a13 13 0 0 1 24-7 13 13 0 0 1 24 7c0 17-24 30-24 30Z"
            fill="#f472b6"
          />
          <path d="M36 34a8 8 0 0 1 8-4" stroke="#ffe4f1" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "zuno-rocket":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#081324" stroke="#5fe3ff" strokeWidth="2" />
          <path d="M60 22c8 6 10 20 4 30L46 70l-8-8-8-8 18-18c10-6 20-10 12-14Z" fill="#e8fbff" />
          <path d="M30 62c-6 6-4 14-4 14s8 2 14-4" fill="#5fe3ff" />
          <circle cx="56" cy="36" r="6" fill="#2f7cff" />
        </svg>
      );
    case "zuno-star":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#0b1024" stroke="#facc15" strokeWidth="2" />
          <path
            d="m48 20 8 18 20 2-15 13 5 20-18-11-18 11 5-20-15-13 20-2 8-18Z"
            fill="#facc15"
          />
        </svg>
      );
    case "zuno-wave":
      return (
        <svg {...common} className="sticker">
          <circle cx="48" cy="48" r="42" fill="#0a1a2c" stroke="#34d399" strokeWidth="2" />
          <path d="M28 60V46a6 6 0 0 1 12 0v14M40 58V38a6 6 0 0 1 12 0v20M52 58V44a6 6 0 0 1 12 0v16a20 20 0 0 1-36 6" fill="none" stroke="#5fe3ff" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
