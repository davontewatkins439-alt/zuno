import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env, SessionUser } from "./env";
import { now, uid } from "./lib";

export const SESSION_COOKIE = "zuno_session";
const SESSION_DAYS = 30;
// Cloudflare Workers rejects PBKDF2 iteration counts above 100,000, so this is
// the strongest value the hosted runtime accepts. Hashes store their own count.
const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = unb64(parts[2]);
  const expected = parts[3];
  const hash = await pbkdf2(password, salt, iterations);
  const actual = b64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let out = "";
  for (const b of arr) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(c: Context<any>, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const created = now();
  const expires = created + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await c.env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(tokenHash, userId, created, expires, (c.req.header("user-agent") || "").slice(0, 200))
    .run();
  const secure = !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(new URL(c.req.url).host);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return token;
}

export async function destroySession(c: Context<any>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const hash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getUserFromRequest(
  db: D1Database,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const rows = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
    )
    .bind(hash, now())
    .all<SessionUser>();
  return rows.results[0] ?? null;
}

export function getSessionToken(c: Context<any>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** Same-origin enforcement for state-changing requests (CSRF defense). */
export const csrfGuard: MiddlewareHandler<any> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin) {
      const originHost = new URL(origin).host;
      const host = c.req.header("x-forwarded-host") || c.req.header("host") || "";
      if (originHost !== host) return c.json({ error: "Cross-origin request rejected" }, 403);
    }
  }
  await next();
};

export async function rateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const t = now();
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();
  if (!row || t - row.window_start > windowMs) {
    await db
      .prepare(
        "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start",
      )
      .bind(key, t)
      .run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

export async function newId(prefix = ""): Promise<string> {
  return prefix ? `${prefix}_${uid()}` : uid();
}
