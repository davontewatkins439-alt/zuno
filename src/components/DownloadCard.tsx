import React, { useEffect, useState } from "react";
import { Download, MonitorDown } from "lucide-react";
import { api } from "../lib/api";

interface WindowsRelease {
  platform: string;
  available: boolean;
  version: string | null;
  url: string | null;
  filename: string | null;
  size: number | null;
  publishedAt: string | null;
  minOs: string;
  reason?: string;
}

function fileSize(bytes: number | null): string | null {
  if (!bytes || bytes < 1) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Visitor-facing download card. It only becomes a link once a release with a
 * real Windows installer is published, so it can never point at a missing file.
 */
export function DownloadCard({ compact = false }: { compact?: boolean }) {
  const [release, setRelease] = useState<WindowsRelease | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<WindowsRelease>("/api/public/download")
      .then((data) => {
        if (live) setRelease(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const ready = !!release?.available && !!release.url;
  const size = fileSize(release?.size ?? null);

  return (
    <div className={`download-card${compact ? " compact" : ""}${ready ? " ready" : ""}`}>
      <span className="download-icon">
        <MonitorDown size={18} />
      </span>
      <div className="download-copy">
        <strong>ZUNO for Windows</strong>
        <span>
          {ready
            ? `${release?.minOs}${release?.version ? ` · v${release.version}` : ""}${size ? ` · ${size}` : ""}`
            : release?.minOs ?? "Windows 10 or 11 (64-bit)"}
        </span>
      </div>
      {ready ? (
        <a className="download-btn" href={release!.url!} rel="noreferrer">
          <Download size={14} />
          Download for PC
        </a>
      ) : (
        <button type="button" className="download-btn pending" disabled>
          {release || failed ? "Windows app coming soon" : "Checking for Windows app…"}
        </button>
      )}
    </div>
  );
}
