import React, { useEffect, useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import type { InvitePreview } from "../lib/types";
import { ZunoMark } from "./ui";

export function InviteLanding({ code }: { code: string }) {
  const app = useApp();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : "This invite is invalid."));
  }, [code]);

  const joined = preview ? app.me.servers.some((server) => server.id === preview.server.id) : false;

  return (
    <section className="invite-landing">
      <div className="invite-landing-art">
        <span className="aurora aurora-one" />
        <span className="aurora aurora-two" />
      </div>
      <div className="invite-landing-card">
        <ZunoMark size={34} />
        {error && (
          <>
            <h1>Invite unavailable</h1>
            <p>{error}</p>
            <button type="button" className="primary-btn" onClick={() => app.navigate("/")}>
              Back to ZUNO
            </button>
          </>
        )}
        {!error && !preview && <p className="sidebar-empty">Checking your invite…</p>}
        {preview && (
          <>
            <span className="invite-eyebrow">YOU HAVE BEEN INVITED TO JOIN</span>
            <div className="invite-landing-server">
              <span className="invite-server-icon large">
                {preview.server.iconId ? (
                  <img src={`/api/files/${preview.server.iconId}`} alt="" />
                ) : (
                  preview.server.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <h1>{preview.server.name}</h1>
              <span className="invite-landing-meta">
                <Users size={13} /> {preview.server.memberCount} members · {preview.server.onlineCount} online
              </span>
            </div>
            <p>{preview.server.description || "A ZUNO community waiting for you."}</p>
            <button
              type="button"
              className="primary-btn full"
              disabled={busy}
              onClick={async () => {
                if (joined) {
                  app.navigate(`/channels/${preview.server.id}`);
                  return;
                }
                setBusy(true);
                try {
                  await api(`/api/servers/${preview.server.id}/join`, { method: "POST", body: { code } });
                  await app.refreshMe(true);
                  app.navigate(`/channels/${preview.server.id}`);
                  app.toast(`Welcome to ${preview.server.name}`, "success");
                } catch (err) {
                  app.toast(err instanceof Error ? err.message : "Could not join", "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {joined ? "Open community" : busy ? "Joining…" : "Accept invite"} <ArrowRight size={15} />
            </button>
            <button type="button" className="ghost-btn full" onClick={() => app.navigate("/")}>
              Not now
            </button>
          </>
        )}
      </div>
    </section>
  );
}
