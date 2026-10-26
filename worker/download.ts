import type { Env } from "./env";

/**
 * Desktop download discovery.
 *
 * Installers are built by GitHub Actions and attached to one GitHub Release per
 * version, so this module asks GitHub which files exist right now. A release that
 * has not been published yet (or a deployment with no repository configured)
 * reports `available: false`, and the website shows "coming soon" instead of a
 * link that would 404.
 */
export type Platform = "windows" | "macos";

export interface DownloadInfo {
  available: boolean;
  version: string | null;
  url: string | null;
  filename: string | null;
  size: number | null;
  publishedAt: string | null;
  minOs: string;
  reason?: string;
}

const WINDOWS_MIN_OS = "Windows 10 or 11 (64-bit)";
const MACOS_MIN_OS = "macOS 10.15+ · Intel & Apple Silicon";
const CACHE_MS = 10 * 60 * 1000;

interface Asset {
  name: string;
  url: string;
  size: number;
}

interface PlatformRules {
  minOs: string;
  overrideUrl?: keyof Env;
  overrideVersion?: keyof Env;
  pick: (assets: Asset[]) => Asset | null;
  fallbackNames: (version: string) => string[];
}

const PLATFORMS: Record<Platform, PlatformRules> = {
  windows: {
    minOs: WINDOWS_MIN_OS,
    overrideUrl: "WINDOWS_INSTALLER_URL",
    overrideVersion: "WINDOWS_INSTALLER_VERSION",
    // Visitors are almost always on x64; never hand them an ARM build.
    pick: (assets) => {
      const eligible = assets.filter((a) => !/arm64|aarch64/i.test(a.name));
      return (
        eligible.find((a) => /setup.*\.exe$/i.test(a.name)) ??
        eligible.find((a) => /\.exe$/i.test(a.name)) ??
        eligible.find((a) => /\.msi$/i.test(a.name)) ??
        null
      );
    },
    fallbackNames: (v) => [`ZUNO_${v}_x64-setup.exe`, `ZUNO_${v}_x64_en-US.msi`, `ZUNO_${v}_x64.msi`],
  },
  macos: {
    minOs: MACOS_MIN_OS,
    overrideUrl: "MAC_INSTALLER_URL",
    overrideVersion: "MAC_INSTALLER_VERSION",
    pick: (assets) =>
      assets.find((a) => /universal.*\.dmg$/i.test(a.name)) ?? assets.find((a) => /\.dmg$/i.test(a.name)) ?? null,
    fallbackNames: (v) => [`ZUNO_${v}_universal.dmg`, `ZUNO_${v}_aarch64.dmg`, `ZUNO_${v}_x64.dmg`],
  },
};

const cache = new Map<string, { at: number; value: DownloadInfo }>();

function cleanVersion(tag: string): string {
  return tag.replace(/^desktop-/, "").replace(/^v/, "");
}

function unavailable(minOs: string, reason: string, extra: Partial<DownloadInfo> = {}): DownloadInfo {
  return {
    available: false,
    version: extra.version ?? null,
    url: null,
    filename: null,
    size: null,
    publishedAt: extra.publishedAt ?? null,
    minOs,
    reason,
  };
}

async function fromGitHub(env: Env, repo: string, platform: Platform): Promise<DownloadInfo> {
  const rules = PLATFORMS[platform];
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ZUNO-site",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers } as RequestInit);
  if (!res.ok) return unavailable(rules.minOs, `GitHub responded ${res.status}.`);

  const release = (await res.json()) as {
    tag_name?: string;
    draft?: boolean;
    published_at?: string;
    assets?: { name: string; browser_download_url: string; size: number }[];
  };
  const version = release.tag_name ? cleanVersion(release.tag_name) : null;
  if (release.draft) return unavailable(rules.minOs, "The release is still a draft.");
  if (release.draft === undefined) return unavailable(rules.minOs, "GitHub returned an unexpected release.");

  const asset = rules.pick(
    (release.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
  );
  if (!asset) {
    return unavailable(rules.minOs, "The latest release has no installer for this platform.", {
      version,
      publishedAt: release.published_at ?? null,
    });
  }
  return {
    available: true,
    version,
    url: asset.url,
    filename: asset.name,
    size: asset.size,
    publishedAt: release.published_at ?? null,
    minOs: rules.minOs,
  };
}

/**
 * The REST API is rate limited per IP and Workers share egress IPs, so a 403 is
 * common. GitHub's public redirects and release downloads are not rate limited,
 * so fall back to them: /releases/latest points at the tag, and the asset URL is
 * derived from the tag and confirmed with a HEAD request.
 */
async function fromPublicUrls(repo: string, platform: Platform): Promise<DownloadInfo | null> {
  const rules = PLATFORMS[platform];
  const latest = await fetch(`https://github.com/${repo}/releases/latest`, {
    redirect: "manual",
    headers: { "user-agent": "ZUNO-site" },
  });
  const location = latest.headers.get("location") ?? "";
  const match = location.match(/\/releases\/tag\/(.+)$/);
  if (!match) return null;
  const tag = decodeURIComponent(match[1]);
  const version = cleanVersion(tag);

  for (const name of rules.fallbackNames(version)) {
    const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
    const head = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "user-agent": "ZUNO-site" } });
    if ([200, 301, 302, 307].includes(head.status)) {
      const size = Number(head.headers.get("content-length") ?? 0);
      return {
        available: true,
        version,
        url,
        filename: name,
        size: Number.isFinite(size) && size > 0 ? size : null,
        publishedAt: null,
        minOs: rules.minOs,
      };
    }
  }
  return null;
}

export async function downloadFor(env: Env, platform: Platform): Promise<DownloadInfo> {
  const rules = PLATFORMS[platform];

  // A direct override wins, for hosting an installer somewhere other than GitHub.
  const overrideUrl = rules.overrideUrl ? (env[rules.overrideUrl] as string | undefined) : undefined;
  if (overrideUrl) {
    const overrideVersion = rules.overrideVersion ? (env[rules.overrideVersion] as string | undefined) : undefined;
    return {
      available: true,
      version: overrideVersion || null,
      url: overrideUrl,
      filename: overrideUrl.split("/").pop() ?? null,
      size: null,
      publishedAt: null,
      minOs: rules.minOs,
    };
  }

  const repo = (env.GITHUB_REPO || "").trim();
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return unavailable(rules.minOs, "No GitHub repository is configured for the download.");
  }

  const key = `${platform}:${repo}:${env.GITHUB_TOKEN ? "auth" : "anon"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value: DownloadInfo;
  try {
    value = await fromGitHub(env, repo, platform);
  } catch {
    value = unavailable(rules.minOs, "GitHub could not be reached.");
  }

  if (!value.available) {
    try {
      const fallback = await fromPublicUrls(repo, platform);
      if (fallback) value = fallback;
    } catch {
      /* keep the API verdict if the public pages are unreachable too */
    }
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

export const windowsDownload = (env: Env) => downloadFor(env, "windows");
export const macDownload = (env: Env) => downloadFor(env, "macos");
