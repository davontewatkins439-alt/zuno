import React, { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  Crown,
  LogOut,
  MessageSquare,
  Palette,
  Save,
  Shield,
  Sparkles,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { useApp } from "../../state";
import { api, uploadFile } from "../../lib/api";
import { cls, formatShort, has, P, PLUS_DECORATIONS, PLUS_THEMES } from "../../lib/utils";
import { plateClass } from "../../lib/nameplates";
import { PlateArt } from "../PlateArt";
import { Avatar, BadgeRow, BadgeTile, IconButton, Modal, Verified } from "../ui";
import { AccountAgePanel } from "../AccountAge";
import { VoiceSettings } from "./VoiceSettings";

type Tab = "profile" | "plus" | "appearance" | "voice" | "account";

export function UserSettingsModal({ initialTab = "profile" }: { initialTab?: Tab }) {
  const app = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Modal
      title="User settings"
      subtitle={`@${app.me.user.username} · ${app.me.user.email}`}
      onClose={app.closeModal}
      wide
      className="settings-modal"
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          <button type="button" className={cls(tab === "profile" && "active")} onClick={() => setTab("profile")}>
            My profile
          </button>
          <button type="button" className={cls(tab === "plus" && "active")} onClick={() => setTab("plus")}>
            ZUNO PLUS
          </button>
          <button type="button" className={cls(tab === "appearance" && "active")} onClick={() => setTab("appearance")}>
            Appearance
          </button>
          <button type="button" className={cls(tab === "voice" && "active")} onClick={() => setTab("voice")}>
            Voice &amp; video
          </button>
          <button type="button" className={cls(tab === "account" && "active")} onClick={() => setTab("account")}>
            Account
          </button>
        </nav>
        <div className="settings-content">
          {tab === "profile" && <ProfileSettings />}
          {tab === "plus" && <PlusSettings />}
          {tab === "appearance" && <AppearanceSettings />}
          {tab === "voice" && <VoiceSettings />}
          {tab === "account" && <AccountSettings />}
        </div>
      </div>
    </Modal>
  );
}

function ProfileSettings() {
  const app = useApp();
  const user = app.me.user;
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? "");
  const [customStatus, setCustomStatus] = useState(user.customStatus ?? "");
  const [accent, setAccent] = useState(user.accentColor);
  const [status, setStatus] = useState(user.status);
  const [busy, setBusy] = useState(false);
  const [avatarId, setAvatarId] = useState(user.avatarId);
  const [bannerId, setBannerId] = useState(user.bannerId);
  const accents = ["#2f7cff", "#5fe3ff", "#8b5cf6", "#f472b6", "#34d399", "#f59e0b", "#f87171", "#a3e635"];

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: { displayName, bio, customStatus, accentColor: accent, status, avatarId, bannerId },
      });
      await app.refreshMe(true);
      app.toast("Profile saved", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not save profile", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-stack">
      <div className="profile-upload-row">
        <div className="profile-preview" style={{ background: `linear-gradient(135deg, ${accent}44, #05070f)` }}>
          <span className="profile-banner-preview">
            {bannerId ? <img src={`/api/files/${bannerId}`} alt="" /> : null}
          </span>
          <Avatar
            user={{ ...user, displayName, accentColor: accent, avatarId }}
            size={68}
            showStatus
            decoration={user.plusDecoration}
          />
          <div className="profile-preview-copy">
            <strong>
              <span className={cls("plate-name", plateClass(user.nameplate))}>
                <PlateArt id={user.nameplate} />
                <span className="plate-label">{displayName}</span>
              </span>{" "}
              {user.isOwner && <Verified />}
            </strong>
            <span>{customStatus || `@${user.username}`}</span>
            <BadgeRow badges={user.badges} max={4} />
          </div>
        </div>
        <div className="upload-buttons">
          <label className="ghost-btn small">
            <Upload size={13} /> Avatar
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const result = await uploadFile(file, "avatar");
                  setAvatarId(result.file.id);
                  await api("/api/me", { method: "PATCH", body: { avatarId: result.file.id } });
                  await app.refreshMe(true);
                  app.toast("Avatar updated", "success");
                } catch (err) {
                  app.toast(err instanceof Error ? err.message : "Upload failed", "error");
                }
              }}
            />
          </label>
          <label className="ghost-btn small">
            <Upload size={13} /> Banner
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const result = await uploadFile(file, "banner");
                  setBannerId(result.file.id);
                  await api("/api/me", { method: "PATCH", body: { bannerId: result.file.id } });
                  await app.refreshMe(true);
                  app.toast("Banner updated", "success");
                } catch (err) {
                  app.toast(err instanceof Error ? err.message : "Upload failed", "error");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="ghost-btn small"
            onClick={async () => {
              setAvatarId(null);
              setBannerId(null);
              await api("/api/me", { method: "PATCH", body: { avatarId: "", bannerId: "" } });
              await app.refreshMe(true);
            }}
          >
            <X size={13} /> Remove images
          </button>
        </div>
      </div>

      <div className="form-inline">
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="dnd">Do Not Disturb</option>
            <option value="invisible">Invisible</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Custom status</span>
        <input value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} maxLength={80} placeholder="building something at 2am" />
      </label>
      <label className="field">
        <span>About me</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={240} />
      </label>
      <div className="field">
        <span>Profile accent</span>
        <div className="accent-row">
          {accents.map((color) => (
            <button
              type="button"
              key={color}
              className={cls("accent-swatch", accent === color && "active")}
              style={{ background: color }}
              aria-label={`Accent ${color}`}
              onClick={() => setAccent(color)}
            />
          ))}
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Custom accent" />
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary-btn" onClick={() => void save()} disabled={busy}>
          <Save size={15} /> {busy ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="ghost-btn" onClick={() => app.openModal({ type: "userSettings", tab: "plus" })}>
          <Sparkles size={15} /> Customise with PLUS
        </button>
      </div>
    </div>
  );
}

function PlusSettings() {
  const app = useApp();
  const { plus } = app.me;
  const [busy, setBusy] = useState(false);
  const active = app.me.user.plusActive;
  const isOwner = app.me.user.isOwner;
  const activeUntil = app.me.user.plusUntil;
  const comp = plus.subscription?.provider === "complimentary" || plus.subscription?.source === "complimentary" || plus.subscription?.source === "owner";

  useEffect(() => {
    // Ownership, membership and payment config can change while the app is open, so pull fresh state when this opens.
    void app.refreshMe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const data = await api<{ url: string }>("/api/plus/checkout", { method: "POST", body: {} });
      window.location.href = data.url;
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Checkout unavailable", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-stack">
      <div className="plus-hero">
        <span className="plus-hero-glow" />
        <span className="eyebrow">
          <Sparkles size={15} /> ZUNO PLUS
        </span>
        <h2>Glow a little brighter.</h2>
        <p>Premium identity for people who make ZUNO theirs: animated themes, exclusive decorations and a badge that follows you everywhere.</p>
        <div className="plus-price-row">
          <strong>{plus.priceLabel}</strong>
          {active ? (
            <span className="plus-active-pill">
              <Check size={13} /> Active
              {isOwner ? " · owner account" : comp ? " · complimentary" : activeUntil ? ` · renews ${new Date(activeUntil).toLocaleDateString()}` : ""}
            </span>
          ) : (
            <span className="plus-inactive-pill">Not subscribed</span>
          )}
        </div>
        <div className="plus-hero-actions">
          {!active && (
            <button type="button" className="primary-btn" onClick={() => void subscribe()} disabled={busy}>
              {busy ? "Opening checkout…" : "Subscribe with Stripe"}
            </button>
          )}
          {active && !comp && !isOwner && (
            <button type="button" className="ghost-btn" disabled={busy} onClick={async () => {
              try {
                await api("/api/plus/cancel", { method: "POST", body: {} });
                await app.refreshMe(true);
                app.toast("Subscription will end at the current period", "success");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not cancel", "error");
              }
            }}>
              Cancel at period end
            </button>
          )}
        </div>
        {!plus.configured && (
          <p className="plus-config-note">
            Payments are not configured on this deployment yet. An owner must add the Stripe secret key, price ID and webhook signing
            secret before subscriptions can be purchased. No one is marked as paid without a verified webhook.
          </p>
        )}
        {plus.subscription && !comp && (
          <p className="form-hint">
            Provider: {plus.subscription.source} · status {plus.subscription.status}
            {plus.subscription.currentPeriodEnd ? ` · period ends ${formatShort(plus.subscription.currentPeriodEnd)}` : ""}
          </p>
        )}
        {isOwner && active && (
          <p className="form-hint">Yours free as the platform owner — no payment method is connected and nothing renews.</p>
        )}
        {comp && !isOwner && (
          <p className="form-hint">
            Complimentary membership granted by ZUNO — no payment is connected to this account and nothing will be charged.
          </p>
        )}
      </div>

      <h4 className="settings-heading">Benefits</h4>
      <ul className="benefit-list">
        {[
          "Animated Aurora, Midnight, Ember and Neon profile themes",
          "Holo, pulse and grid profile decorations",
          "Exclusive PLUS badge in chat, profiles and member lists",
          "Expanded accent colour control",
          "Priority access to new cosmetic features",
          "Extra custom emoji slots for communities you run",
        ].map((benefit) => (
          <li key={benefit}>
            <Check size={14} /> {benefit}
          </li>
        ))}
      </ul>

      <h4 className="settings-heading">Profile theme</h4>
      <div className="theme-grid">
        {PLUS_THEMES.map((theme) => (
          <button
            type="button"
            key={theme.key}
            className={cls("theme-card", app.me.user.plusTheme === theme.key && "active")}
            style={{ background: `linear-gradient(135deg, ${theme.colors[0]}33, ${theme.colors[1]}22)` }}
            disabled={!active}
            onClick={async () => {
              try {
                await api("/api/me", { method: "PATCH", body: { plusTheme: theme.key } });
                await app.refreshMe(true);
                app.toast(`${theme.label} theme applied`, "success");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "PLUS required", "error");
              }
            }}
          >
            <span className="theme-dots">
              {theme.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <strong>{theme.label}</strong>
            {app.me.user.plusTheme === theme.key && <Check size={14} />}
          </button>
        ))}
      </div>

      <h4 className="settings-heading">Profile decoration</h4>
      <div className="chip-row">
        {PLUS_DECORATIONS.map((decoration) => (
          <button
            type="button"
            key={decoration.key}
            className={cls("chip", app.me.user.plusDecoration === decoration.key && "active")}
            disabled={!active}
            onClick={async () => {
              await api("/api/me", { method: "PATCH", body: { plusDecoration: decoration.key } }).catch((err) =>
                app.toast(err instanceof Error ? err.message : "PLUS required", "error"),
              );
              await app.refreshMe(true);
            }}
          >
            {decoration.label}
          </button>
        ))}
      </div>
      {!active && <p className="form-hint">Themes and decorations unlock while PLUS is active.</p>}
    </div>
  );
}

function AppearanceSettings() {
  const app = useApp();
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("zuno:reduce-motion") === "1");
  const [glow, setGlow] = useState(() => localStorage.getItem("zuno:glow") !== "0");

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
    localStorage.setItem("zuno:reduce-motion", reduceMotion ? "1" : "0");
    document.documentElement.classList.toggle("no-glow", !glow);
    localStorage.setItem("zuno:glow", glow ? "1" : "0");
  }, [reduceMotion, glow]);

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Appearance</h3>
      <label className="switch-row">
        <div>
          <strong>Ambient glow</strong>
          <span>Show the midnight-blue bloom behind panels and the rail.</span>
        </div>
        <input type="checkbox" checked={glow} onChange={(e) => setGlow(e.target.checked)} />
      </label>
      <label className="switch-row">
        <div>
          <strong>Reduce motion</strong>
          <span>Disable animated backgrounds, hover lifts and transitions.</span>
        </div>
        <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
      </label>
      <div className="appearance-preview">
        <span className="eyebrow">PREVIEW</span>
        <div className="preview-message">
          <Avatar user={app.me.user} size={32} showStatus />
          <div>
            <strong>ZUNO looks like this</strong>
            <p>Electric blue active states, icy cyan highlights and rounded panels.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSettings() {
  const app = useApp();
  const user = app.me.user;
  return (
    <div className="form-stack">
      <h3 className="settings-heading">Account</h3>
      <div className="account-facts">
        <div>
          <span>Username</span>
          <strong>@{user.username}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{user.email}</strong>
        </div>
        <div>
          <span>Member since</span>
          <strong>{new Date(user.createdAt).toLocaleDateString()}</strong>
        </div>
        <div>
          <span>Platform role</span>
          <strong>{user.isOwner ? "ZUNO OWNER" : user.platformRole.replace(/^\w/, (c) => c.toUpperCase())}</strong>
        </div>
        <div>
          <span>PLUS</span>
          <strong>{user.plusActive ? `Active until ${new Date(user.plusUntil ?? Date.now()).toLocaleDateString()}` : "Not subscribed"}</strong>
        </div>
      </div>

      <h4 className="settings-heading">Your badges</h4>
      <div className="badge-list">
        {user.badges.length ? (
          user.badges.map((badge) => <BadgeTile key={badge.slug} badge={badge} size={58} />)
        ) : (
          <p className="sidebar-empty">No badges yet.</p>
        )}
      </div>

      <h4 className="settings-heading">Account age</h4>
      <AccountAgePanel createdAt={user.createdAt} compact />

      {user.isOwner && (
        <div className="owner-note">
          <Crown size={16} />
          <div>
            <strong>Owner protections are active</strong>
            <span>Your owner status cannot be granted, revoked or edited by any other account, including administrators.</span>
          </div>
        </div>
      )}

      <h4 className="settings-heading">Session</h4>
      <button type="button" className="ghost-btn danger-text" onClick={() => void app.logout()}>
        <LogOut size={15} /> Sign out of ZUNO
      </button>
    </div>
  );
}

export function ProfileModal() {
  const app = useApp();
  const profile = app.profile;
  const loading = app.profileLoading;
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <Modal title="Loading profile" onClose={() => app.closeModal()}>
        <p className="sidebar-empty">Fetching profile…</p>
      </Modal>
    );
  }

  if (!profile) {
    return (
      <Modal title="Profile" onClose={() => app.closeModal()}>
        <p className="sidebar-empty">This profile is unavailable.</p>
      </Modal>
    );
  }

  const user = profile.user;
  const isMe = user.id === app.me.user.id;
  const server = app.server;
  const member = server?.members.find((m) => m.id === user.id);
  const roles = server && member ? server.roles.filter((r) => member.roleIds.includes(r.id) && !r.is_everyone) : [];
  const canModerate = server && member && !member.isServerOwner
    ? has(server.permissions, P.KICK_MEMBERS) || has(server.permissions, P.BAN_MEMBERS)
    : false;

  return (
    <Modal title="Profile" onClose={() => app.closeModal()} wide className="profile-modal">
      <div
        className={cls("profile-banner", user.plusTheme && `theme-${user.plusTheme}`)}
        style={{ background: `linear-gradient(120deg, ${user.accentColor}66, #05070f 70%)` }}
      >
        {user.bannerId && <img src={`/api/files/${user.bannerId}`} alt="" />}
      </div>
      <div className="profile-head">
        <Avatar user={user} size={82} showStatus decoration={user.plusDecoration} />
        <div className="profile-identity">
          <h2>
            <span className={cls("plate-name", plateClass(user.nameplate))}>
              <PlateArt id={user.nameplate} />
              <span className="plate-label">{user.displayName}</span>
            </span>
            {user.isOwner && <Verified />}
            {user.badges.some((b) => b.slug === "verified") && !user.isOwner && <Verified />}
          </h2>
          <span className="profile-username">@{user.username}</span>
          {user.customStatus && <span className="profile-status">{user.customStatus}</span>}
        </div>
        <div className="profile-actions">
          {isMe ? (
            <button type="button" className="ghost-btn" onClick={() => app.openModal({ type: "userSettings", tab: "profile" })}>
              Edit profile
            </button>
          ) : (
            <>
              <button type="button" className="primary-btn small" onClick={() => void app.openDm(user.id)}>
                <MessageSquare size={14} /> Message
              </button>
              {!profile.isFriend && (
                <button
                  type="button"
                  className="ghost-btn small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await app.addFriend(user.username);
                    } catch (err) {
                      app.toast(err instanceof Error ? err.message : "Could not send request", "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <UserPlus size={14} /> Add friend
                </button>
              )}
              <IconButton
                label="Copy username"
                onClick={async () => {
                  await navigator.clipboard.writeText(`@${user.username}`);
                  app.toast("Username copied", "success");
                }}
              >
                <Copy size={14} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {user.badges.length > 0 && (
        <div className="profile-badges">
          {user.badges.map((badge) => (
            <BadgeTile key={badge.slug} badge={badge} size={54} />
          ))}
        </div>
      )}

      <AccountAgePanel createdAt={user.createdAt} displayName={user.displayName || user.username} />

      <div className="profile-columns">
        <div className="profile-main">
          {user.isOwner && (
            <div className="owner-note">
              <Crown size={16} />
              <div>
                <strong>ZUNO OWNER</strong>
                <span>Platform founder. Exclusive badge, verified checkmark and platform-wide controls.</span>
              </div>
            </div>
          )}
          <div className="profile-block">
            <span className="section-label">ABOUT</span>
            <p>{user.bio || "This person has not written a bio yet."}</p>
          </div>
          <div className="profile-block">
            <span className="section-label">MEMBER SINCE</span>
            <p>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          {roles.length > 0 && (
            <div className="profile-block">
              <span className="section-label">ROLES IN THIS SERVER</span>
              <div className="tag-row">
                {roles.map((role) => (
                  <span className="role-chip" key={role.id} style={{ borderColor: role.color ?? "#2f7cff", color: role.color ?? "#5fe3ff" }}>
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.mutualServers.length > 0 && (
            <div className="profile-block">
              <span className="section-label">MUTUAL COMMUNITIES</span>
              <div className="tag-row">
                {profile.mutualServers.map((serverItem) => (
                  <span className="tag" key={serverItem.id}>
                    {serverItem.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="profile-side">
          <div className="profile-block">
            <span className="section-label">STATUS</span>
            <p>{user.status === "offline" ? "Offline" : user.status}</p>
          </div>
          {server && member && has(server.permissions, P.MANAGE_ROLES) && (
            <button type="button" className="ghost-btn full" onClick={() => app.openModal({ type: "memberRoles", userId: user.id })}>
              <Shield size={14} /> Manage roles
            </button>
          )}
          {server && canModerate && (
            <>
              <button
                type="button"
                className="ghost-btn full"
                onClick={async () => {
                  if (!window.confirm(`Kick ${user.displayName} from ${server.server.name}?`)) return;
                  try {
                    await api(`/api/servers/${server.server.id}/members/${user.id}`, { method: "DELETE" });
                    await app.reloadServer(true);
                    app.closeModal();
                    app.toast("Member kicked");
                  } catch (err) {
                    app.toast(err instanceof Error ? err.message : "Could not kick", "error");
                  }
                }}
              >
                <LogOut size={14} /> Kick from server
              </button>
              {has(server.permissions, P.BAN_MEMBERS) && (
                <button
                  type="button"
                  className="ghost-btn full danger-text"
                  onClick={async () => {
                    const reason = window.prompt(`Ban ${user.displayName}. Reason?`, "Server rules violation");
                    if (reason === null) return;
                    try {
                      await api(`/api/servers/${server.server.id}/bans`, { method: "POST", body: { userId: user.id, reason } });
                      await app.reloadServer(true);
                      app.closeModal();
                      app.toast("Member banned");
                    } catch (err) {
                      app.toast(err instanceof Error ? err.message : "Could not ban", "error");
                    }
                  }}
                >
                  <Ban size={14} /> Ban from server
                </button>
              )}
            </>
          )}
          {!isMe && (
            <>
              <button
                type="button"
                className="ghost-btn full"
                onClick={async () => {
                  try {
                    await api(`/api/users/${user.id}/block`, { method: "POST", body: { blocked: !profile.isBlocked } });
                    await app.openProfile(user.id);
                    await app.refreshFriends();
                    app.toast(profile.isBlocked ? "User unblocked" : "User blocked");
                  } catch (err) {
                    app.toast(err instanceof Error ? err.message : "Could not block", "error");
                  }
                }}
              >
                <Ban size={14} /> {profile.isBlocked ? "Unblock user" : "Block user"}
              </button>
              <button
                type="button"
                className="ghost-btn full danger-text"
                onClick={() =>
                  app.openModal({ type: "report", targetUserId: user.id, serverId: server?.server.id })
                }
              >
                Report user
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export { Palette };
