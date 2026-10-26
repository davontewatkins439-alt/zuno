export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  OWNER_EMAIL?: string;
  OWNER_USERNAME?: string;
  DEMO_SEED?: string;
  APP_ENV?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PLUS_PRICE_ID?: string;
  APP_ORIGIN?: string;
  // Windows desktop download: "owner/repo" of the GitHub project that publishes
  // the installer release. Optional GITHUB_TOKEN lifts anonymous API limits.
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  WINDOWS_INSTALLER_URL?: string;
  WINDOWS_INSTALLER_VERSION?: string;
  MAC_INSTALLER_URL?: string;
  MAC_INSTALLER_VERSION?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_id: string | null;
  banner_id: string | null;
  bio: string | null;
  custom_status: string | null;
  status: string;
  last_seen_at: number;
  accent_color: string | null;
  platform_role: string;
  is_owner: number;
  plus_until: number | null;
  plus_theme: string | null;
  plus_decoration: string | null;
  created_at: number;
  platform_banned: number;
  platform_ban_reason: string | null;
}
