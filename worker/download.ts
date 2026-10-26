import type { Env } from "./env";

/**
 * Windows download discovery.
 *
 * The installer is built by GitHub Actions and attached to a GitHub Release, so
 * this module asks the GitHub API which asset exists right now. A release that
 * has not been published yet (or a deployment with no repository configured)
 * reports `available: false`, and the website shows "Windows app coming soon"
 * instead of a link that would 404.
 */
export interface WindowsDownload {
  available: boolean;
  version: string | null;
  url: string | null;
  filename: string | null;
  size: number | null;
  publishedAt: string | null;
  minOs: string;
  reason?: string;
}

const MIN_OS = "Windows 10 or 11 (64-bit)";
const CACHE_MS = 10 * 60 * 1000;
let cache: { key: string; at: number; value: WindowsDownload } | null = null;

function cleanVersion(tag: string): string {
  return tag.replace(/^desktop-/, "").replace(/^v/, "");
}

function pickAsset(assets: { name: string; browser_download_url: string; size: number }[]) {
  // Visitors on Windows are almost always on x64; never hand them an ARM build.
  const eligible = assets.filter((a) => !/arm64|aarch64/i.test(a.name));
  const byPattern = (re: RegExp) => eligible.find((a) => re.test(a.name));
  return (
    byPattern(/setup.*(x64|amd64)?.*\.exe$/i) ??
    byPattern(/\.exe$/i) ??
    byPattern(/\.msi$/i) ??
    null
  );
}

async function fromGitHub(env: Env, repo: string): Promise<WindowsDownload> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ZUNO-site",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    // Ask GitHub for the JSON representation; the Worker caches the answer in
    // memory, so no edge-cache directive is needed here.
  } as RequestInit);
  if (!res.ok) {
    return {
      available: false,
      version: null,
      url: null,
      filename: null,
      size: null,
      publishedAt: null,
      minOs: MIN_OS,
      reason: res.status === 404 ? "No published release yet." : `GitHub responded ${res.status}.`,
    };
  }
  const release = (await res.json()) as {
    tag_name?: string;
    draft?: boolean;
    prerelease?: boolean;
    published_at?: string;
    assets?: { name: string; browser_download_url: string; size: number }[];
  };
  if (release.draft) {
    return {
      available: false,
      version: null,
      url: null,
      filename: null,
      size: null,
      publishedAt: null,
      minOs: MIN_OS,
      reason: "The release is still a draft.",
    };
  }
  const asset = pickAsset(release.assets ?? []);
  if (!asset) {
    return {
      available: false,
      version: release.tag_name ? cleanVersion(release.tag_name) : null,
      url: null,
      filename: null,
      size: null,
      publishedAt: release.published_at ?? null,
      minOs: MIN_OS,
      reason: "The latest release has no Windows installer attached.",
    };
  }
  return {
    available: true,
    version: release.tag_name ? cleanVersion(release.tag_name) : null,
    url: asset.browser_download_url,
    filename: asset.name,
    size: asset.size,
    publishedAt: release.published_at ?? null,
    minOs: MIN_OS,
  };
}

/**
 * The GitHub REST API is rate limited per IP, and Workers share egress IPs, so
 * a 403 is common. GitHub's public redirects and release downloads are not rate
 * limited, so we fall back to them: /releases/latest points at the tag, and the
 * installer URL is derived from the tag and confirmed with a HEAD request.
 */
async function fromPublicUrls(repo: string): Promise<WindowsDownload | null> {
  const latest = await fetch(`https://github.com/${repo}/releases/latest`, {
    redirect: "manual",
    headers: { "user-agent": "ZUNO-site" },
  });
  const location = latest.headers.get("location") ?? "";
  const match = location.match(/\/releases\/tag\/(.+)$/);
  if (!match) return null;
  const tag = decodeURIComponent(match[1]);
  const version = cleanVersion(tag);

  for (const name of [`ZUNO_${version}_x64-setup.exe`, `ZUNO_${version}_x64_en-US.msi`, `ZUNO_${version}_x64.msi`]) {
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
        minOs: MIN_OS,
      };
    }
  }
  return null;
}

export async function windowsDownload(env: Env): Promise<WindowsDownload> {
  // A direct override wins, for hosting the installer somewhere other than GitHub.
  if (env.WINDOWS_INSTALLER_URL) {
    return {
      available: true,
      version: env.WINDOWS_INSTALLER_VERSION || null,
      url: env.WINDOWS_INSTALLER_URL,
      filename: env.WINDOWS_INSTALLER_URL.split("/").pop() ?? null,
      size: null,
      publishedAt: null,
      minOs: MIN_OS,
    };
  }

  const repo = (env.GITHUB_REPO || "").trim();
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return {
      available: false,
      version: null,
      url: null,
      filename: null,
      size: null,
      publishedAt: null,
      minOs: MIN_OS,
      reason: "No GitHub repository is configured for the download.",
    };
  }

  const key = `${repo}:${env.GITHUB_TOKEN ? "auth" : "anon"}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value: WindowsDownload;
  try {
    value = await fromGitHub(env, repo);
  } catch {
    value = {
      available: false,
      version: null,
      url: null,
      filename: null,
      size: null,
      publishedAt: null,
      minOs: MIN_OS,
      reason: "GitHub could not be reached.",
    };
  }

  if (!value.available) {
    try {
      const fallback = await fromPublicUrls(repo);
      if (fallback) value = fallback;
    } catch {
      /* keep the API verdict if the public pages are unreachable too */
    }
  }
  cache = { key, at: Date.now(), value };
  return value;
}
