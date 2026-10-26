import type { Context } from "hono";
import type { Env, SessionUser } from "./env";

export type AppCtx = Context<{ Bindings: Env; Variables: { user: SessionUser } }>;

export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export function bad(c: AppCtx, message: string, status = 400) {
  return c.json({ error: message }, status as 400);
}

export async function readJson<T = Record<string, unknown>>(c: AppCtx): Promise<T> {
  try {
    const body = await c.req.json();
    return (body ?? {}) as T;
  } catch {
    return {} as T;
  }
}

export function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function jsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 50);
}

export function parseIdList(value: unknown, max = 25): string[] {
  return jsonArray(value)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function publicUser(u: Record<string, unknown>) {
  return {
    id: u.id,
    username: u.username,
    displayName: (u.display_name as string) || (u.username as string),
    avatarId: u.avatar_id,
    bannerId: u.banner_id,
    bio: u.bio,
    customStatus: u.custom_status,
    status: u.status,
    lastSeenAt: u.last_seen_at,
    accentColor: u.accent_color,
    platformRole: u.platform_role,
    isOwner: !!(u.is_owner as number),
    plusUntil: u.plus_until,
    plusTheme: u.plus_theme,
    plusDecoration: u.plus_decoration,
    createdAt: u.created_at,
    banned: !!(u.platform_banned as number),
    badges: [] as { slug: string; name: string; color: string; glyph: string }[],
  };
}

export function effectiveStatus(u: {
  status?: string;
  last_seen_at?: number;
  is_owner?: number;
}): string {
  const status = u.status || "online";
  if (status === "invisible") return "offline";
  const last = u.last_seen_at || 0;
  if (Date.now() - last > 1000 * 60 * 5) return "offline";
  return status;
}

export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export const ACCENTS = [
  "#2f7cff",
  "#5fe3ff",
  "#8b5cf6",
  "#f472b6",
  "#34d399",
  "#f59e0b",
  "#f87171",
  "#a3e635",
];

export function accentFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}
