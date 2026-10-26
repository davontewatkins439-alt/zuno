import React, { useEffect, useState } from "react";
import { ArrowRight, Headphones, Lock, MessageSquare, Shield, Users, Zap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { InvitePreview, Me, PublicConfig } from "../lib/types";
import { ZunoMark, ZunoWordmark } from "./ui";
import { DownloadCard } from "./DownloadCard";

export function AuthPage({ onAuthed, inviteCode }: { onAuthed: (me: Me) => void; inviteCode?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PublicConfig>("/api/public/config")
      .then(setConfig)
      .catch(() => undefined);
    if (inviteCode) {
      api<InvitePreview>(`/api/invites/${encodeURIComponent(inviteCode)}`)
        .then(setInvite)
        .catch(() => undefined);
    }
  }, [inviteCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, username, displayName: displayName || username };
      const me = await api<Me>(`/api/${mode}`, { method: "POST", body: payload });
      onAuthed(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const demoLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      const me = await api<Me>("/api/login", {
        method: "POST",
        body: { email: "astra@zuno.gg", password: "ZunoOwner!2026" },
      });
      onAuthed(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Demo workspace is not available here.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-art">
        <div className="aurora aurora-one" />
        <div className="aurora aurora-two" />
        <div className="auth-grid" />
        <div className="auth-art-inner">
          <ZunoWordmark />
          <h1>
            Your city <span>after dark.</span>
          </h1>
          <p className="auth-lead">
            Servers, channels, voice rooms and friends — one midnight-blue home for the communities you actually care about.
          </p>
          <div className="auth-features">
            <div>
              <span className="auth-feature-icon">
                <MessageSquare size={16} />
              </span>
              <strong>Real-time conversations</strong>
              <span>Channels, DMs, replies, threads and reactions that update live.</span>
            </div>
            <div>
              <span className="auth-feature-icon">
                <Headphones size={16} />
              </span>
              <strong>Voice rooms & screen share</strong>
              <span>Jump into a voice channel and share your screen with the room.</span>
            </div>
            <div>
              <span className="auth-feature-icon">
                <Shield size={16} />
              </span>
              <strong>Roles and real permissions</strong>
              <span>Private channels, moderation and audit logs enforced on the server.</span>
            </div>
          </div>
          <div className="auth-art-footer">
            <span><Users size={13} /> Built for communities</span>
            <span><Zap size={13} /> Live on Cloudflare</span>
            <span><Lock size={13} /> Secure sessions</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {invite && (
            <div className="invite-preview">
              <span className="invite-eyebrow">YOU HAVE BEEN INVITED TO</span>
              <div className="invite-server">
                <span className="invite-server-icon">
                  {invite.server.iconId ? <img src={`/api/files/${invite.server.iconId}`} alt="" /> : invite.server.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{invite.server.name}</strong>
                  <span>
                    {invite.server.memberCount} members · {invite.server.onlineCount} online
                  </span>
                </div>
              </div>
              <p>{invite.server.description || "A ZUNO community waiting for you."}</p>
            </div>
          )}

          <div className="auth-card-head">
            <ZunoMark size={26} />
            <div>
              <h2>{mode === "login" ? "Welcome back" : "Create your ZUNO account"}</h2>
              <p>{mode === "login" ? "Sign in to rejoin your city." : "Pick a username, claim your corner of the city."}</p>
            </div>
          </div>

          {config && !config.registrationOpen && mode === "register" && (
            <p className="form-error">Registration is closed right now. Existing members can still sign in.</p>
          )}
          {config?.maintenance && (
            <p className="form-error">{config.maintenanceMessage || "ZUNO is currently in maintenance mode."}</p>
          )}

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label className="field">
                  <span>Username</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="nova"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={20}
                  />
                  <small>3–20 characters: letters, numbers, dot or underscore.</small>
                </label>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nova Vex"
                    maxLength={32}
                  />
                </label>
              </>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                maxLength={200}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="primary-btn full" disabled={busy}>
              {busy ? "One moment…" : mode === "login" ? "Sign in to ZUNO" : "Create account"}
              {!busy && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to ZUNO?{" "}
                <button type="button" onClick={() => setMode("register")}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")}>
                  Sign in
                </button>
              </>
            )}
          </div>

          {config?.demo && (
            <button type="button" className="demo-btn" onClick={() => void demoLogin()} disabled={busy}>
              Explore the ZUNO demo workspace
              <span>Preloaded community · sample data</span>
            </button>
          )}

          <p className="auth-legal">
            By continuing you agree to be a decent human being. ZUNO stores sessions in a secure, HTTP-only cookie and hashes
            passwords with PBKDF2-SHA256.
          </p>
        </div>
        <DownloadCard />
      </section>
    </div>
  );
}
