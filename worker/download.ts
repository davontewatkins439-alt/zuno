import type { Env } from "./env";

/**
 * Desktop download discovery.
 *
 * GitHub Actions publishes ONE RELEASE PER PLATFORM, so visitors see clearly
 * separated "ZUNO … for Windows" and "ZUNO … for macOS" entries:
 *
 *   tag desktop-v1.0.0-win  ->  ZUNO_1.0.0_x64-setup.exe
 *   tag desktop-v1.0.0-mac  ->  ZUNO_1.0.0_universal.dmg
 *
 * This module therefore looks through recent releases and picks the newest one
 * that actually carries an installer for the requested platform. A platform
 * with no installer yet reports `available: false`, and the website shows
 * "coming soon" instead of a link that would 404.
 *
 * Two discovery paths are used because the anonymous GitHub REST API is rate
 * limited per shared Workers egress IP:
 *   1. REST `/releases` (rich: real sizes) when reachable.
 *   2. The public `releases.atom` feed plus HEAD probes on the expected asset
 *      URLs — no API quota involved, so the buttons keep working under load.
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

/** `desktop-v1.0.0-win` and `desktop-v1.0.0-mac` both mean "1.0.0". */
function cleanVersion(tag: string): string {
  return tag
    .replace(/^desktop-/i, "")
    .replace(/^v/i, "")
    .replace(/-(windows|win|macos|mac|osx)$/i, "");
}

function versionRank(version: string): number[] {
  return version
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** Newest version first; stable because the sum of digits is never equal for real versions. */
function compareVersions(a: string, b: string): number {
  const left = versionRank(a);
  const right = versionRank(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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

function headers(env: Env): Record<string, string> {
  const base: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ZUNO-site",
  };
  if (env.GITHUB_TOKEN) base.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return base;
}

interface Candidate {
  tag: string;
  version: string;
  assets: Asset[];
  publishedAt: string | null;
}

/** Newest matching asset across every recent release, API edition. */
async function candidatesFromApi(env: Env, repo: string): Promise<Candidate[] | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
    headers: headers(env),
  } as RequestInit);
  if (!res.ok) return null;
  const list = (await res.json()) as {
    tag_name?: string;
    draft?: boolean;
    published_at?: string;
    assets?: { name: string; browser_download_url: string; size: number }[];
  }[];
  if (!Array.isArray(list)) return null;
  return list
    .filter((release) => !release.draft && !!release.tag_name)
    .map((release) => ({
      tag: release.tag_name as string,
      version: cleanVersion(release.tag_name as string),
      publishedAt: release.published_at ?? null,
      assets: (release.assets ?? []).map((a) => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
      })),
    }));
}

/** Release tags from the public Atom feed — no API quota, works when the API 403s. */
async function tagsFromAtom(repo: string): Promise<Candidate[] | null> {
  const res = await fetch(`https://github.com/${repo}/releases.atom`, {
    headers: { "user-agent": "ZUNO-site", accept: "application/atom+xml" },
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const tags: string[] = [];
  const pattern = new RegExp(`/releases/tag/([^"'<\\s]+)`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const tag = decodeURIComponent(match[1]);
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (!tags.length) return null;
  return tags.map((tag) => ({
    tag,
    version: cleanVersion(tag),
    publishedAt: null,
    assets: [],
  }));
}

async function probe(repo: string, tag: string, platform: Platform): Promise<DownloadInfo | null> {
  const rules = PLATFORMS[platform];
  const version = cleanVersion(tag);
  for (const name of rules.fallbackNames(version)) {
    const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${name}`;
    try {
      const head = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "user-agent": "ZUNO-site" } });
      if (![200, 301, 302, 303, 307, 308].includes(head.status)) continue;
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
    } catch {
      /* try the next filename */
    }
  }
  return null;
}

function bestFromCandidates(repo: string, platform: Platform, candidates: Candidate[]): DownloadInfo | null {
  const rules = PLATFORMS[platform];
  const ranked = [...candidates].sort((a, b) => compareVersions(b.version, a.version));
  for (const candidate of ranked) {
    if (!candidate.assets.length) continue;
    const asset = rules.pick(candidate.assets);
    if (!asset) continue;
    return {
      available: true,
      version: candidate.version,
      url: asset.url,
      filename: asset.name,
      size: asset.size > 0 ? asset.size : null,
      publishedAt: candidate.publishedAt,
      minOs: rules.minOs,
    };
  }
  return null;
}

async function discover(env: Env, repo: string, platform: Platform): Promise<DownloadInfo> {
  const rules = PLATFORMS[platform];

  const fromApi = await candidatesFromApi(env, repo).catch(() => null);
  if (fromApi) {
    const hit = bestFromCandidates(repo, platform, fromApi);
    if (hit) return hit;
  }

  const fromFeed = await tagsFromAtom(repo).catch(() => null);
  if (fromFeed) {
    const ranked = [...fromFeed].sort((a, b) => compareVersions(b.version, a.version));
    for (const candidate of ranked) {
      const hit = await probe(repo, candidate.tag, platform);
      if (hit) return hit;
    }
  }

  return unavailable(rules.minOs, "No installer for this platform has been published yet.", {
    version: fromApi?.[0]?.version ?? fromFeed?.[0]?.version ?? null,
  });
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
    value = await discover(env, repo, platform);
  } catch {
    value = unavailable(rules.minOs, "GitHub could not be reached.");
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

export const windowsDownload = (env: Env) => downloadFor(env, "windows");
export const macDownload = (env: Env) => downloadFor(env, "macos");
