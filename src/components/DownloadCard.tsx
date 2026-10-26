import React, { useEffect, useState } from "react";
import { Download, Laptop, MonitorDown } from "lucide-react";
import { api } from "../lib/api";

interface DownloadInfo {
  available: boolean;
  version: string | null;
  url: string | null;
  filename: string | null;
  size: number | null;
  publishedAt: string | null;
  minOs: string;
  reason?: string;
}

interface DownloadPayload {
  windows: DownloadInfo;
  macos: DownloadInfo;
}

function fileSize(bytes: number | null): string | null {
  if (!bytes || bytes < 1) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function meta(info: DownloadInfo | undefined): string {
  if (!info?.available) return "Coming soon";
  const bits = [info.minOs];
  if (info.version) bits.push(`v${info.version}`);
  const size = fileSize(info.size);
  if (size) bits.push(size);
  return bits.join(" · ");
}

/**
 * Visitor-facing desktop download card. Each platform only becomes a link once a
 * release with a real installer is published, so it can never point at a 404.
 */
export function DownloadCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<DownloadPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<DownloadPayload>("/api/public/download")
      .then((payload) => {
        if (live) setData(payload);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const rows = [
    {
      key: "windows",
      label: "ZUNO for Windows",
      icon: <MonitorDown size={18} />,
      info: data?.windows,
    },
    {
      key: "macos",
      label: "ZUNO for macOS",
      icon: <Laptop size={18} />,
      info: data?.macos,
    },
  ];

  const anyReady = rows.some((row) => row.info?.available && row.info.url);

  return (
    <div className={`download-card${compact ? " compact" : ""}${anyReady ? " ready" : ""}`}>
      {rows.map((row) => {
        const ready = !!row.info?.available && !!row.info.url;
        return (
          <div className="download-row" key={row.key}>
            <span className={`download-icon${ready ? " live" : ""}`}>{row.icon}</span>
            <div className="download-copy">
              <strong>{row.label}</strong>
              <span>{row.info || failed ? meta(row.info) : "Checking for desktop app…"}</span>
            </div>
            {ready ? (
              <a className="download-btn" href={row.info!.url!} rel="noreferrer">
                <Download size={14} />
                Download
              </a>
            ) : (
              <button type="button" className="download-btn pending" disabled>
                Coming soon
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
