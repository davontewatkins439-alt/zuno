import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Check,
  Crown,
  Database,
  Megaphone,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import type { OwnerOverview, User } from "../lib/types";
import { cls, compact, formatShort, humanAction } from "../lib/utils";
import { Avatar, BadgeRow, BadgeTile, IconButton, Verified } from "./ui";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "users", label: "Users" },
  { id: "staff", label: "Staff" },
  { id: "reports", label: "Reports" },
  { id: "appeals", label: "Appeals" },
  { id: "applications", label: "Applications" },
  { id: "servers", label: "Servers" },
  { id: "badges", label: "Badges" },
  { id: "announcements", label: "Announcements" },
  { id: "plus", label: "ZUNO PLUS" },
  { id: "config", label: "Configuration" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function useFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<T>(path);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, reload, setData };
}

export function OwnerDashboard() {
  const app = useApp();
  const [tab, setTab] = useState<TabId>("overview");

  if (!app.me.user.isOwner) {
    return (
      <section className="owner-denied">
        <Shield size={32} />
        <h2>Owner access only</h2>
        <p>This console is reserved for the ZUNO platform owner.</p>
        <button type="button" className="primary-btn" onClick={() => app.navigate("/")}>
          Back to ZUNO
        </button>
      </section>
    );
  }

  return (
    <section className="owner-console">
      <header className="owner-head">
        <div>
          <span className="eyebrow">
            <Crown size={14} /> ZUNO OWNER CONSOLE
          </span>
          <h1>Platform control</h1>
          <p>Signed in as {app.me.user.displayName} · owner privileges are server-enforced and cannot be granted by anyone else.</p>
        </div>
        <span className="owner-badge-large">
          <Crown size={16} /> OWNER
        </span>
      </header>

      <nav className="owner-tabs">
        {TABS.map((entry) => (
          <button type="button" key={entry.id} className={cls(tab === entry.id && "active")} onClick={() => setTab(entry.id)}>
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="owner-body">
        {tab === "overview" && <OverviewTab onJump={setTab} />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "appeals" && <AppealsTab />}
        {tab === "applications" && <ApplicationsTab />}
        {tab === "servers" && <ServersTab />}
        {tab === "badges" && <BadgesTab />}
        {tab === "announcements" && <AnnouncementsTab />}
        {tab === "plus" && <PlusTab />}
        {tab === "config" && <ConfigTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </section>
  );
}

function OverviewTab({ onJump }: { onJump: (tab: TabId) => void }) {
  const app = useApp();
  const { data, loading, reload } = useFetch<OwnerOverview>("/api/owner/overview");
  if (loading && !data) return <p className="sidebar-empty">Loading platform overview…</p>;
  if (!data) return <p className="sidebar-empty">Could not load overview.</p>;

  const cards = [
    { label: "Total users", value: data.counts.users, note: `${data.counts.activeToday} active today` },
    { label: "Communities", value: data.counts.servers, note: `${data.counts.channels} channels` },
    { label: "Messages", value: data.counts.messages, note: `${data.counts.messagesToday} today` },
    { label: "PLUS members", value: data.counts.plusMembers, note: "active subscriptions" },
    { label: "Open reports", value: data.counts.openReports, note: "needs moderation", action: () => onJump("reports") },
    { label: "Open appeals", value: data.counts.openAppeals, note: "account appeals", action: () => onJump("appeals") },
    { label: "Applications", value: data.counts.pendingApplications, note: "staff queue", action: () => onJump("applications") },
    { label: "Suspended", value: data.counts.bannedUsers, note: "platform bans" },
  ];

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Platform overview</h2>
        <button type="button" className="ghost-btn small" onClick={() => void reload()}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="stat-grid">
        {cards.map((card) => (
          <button type="button" key={card.label} className="stat-card" onClick={card.action} disabled={!card.action}>
            <span>{card.label}</span>
            <strong>{compact(card.value)}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </div>

      <div className="owner-columns">
        <div className="owner-card">
          <div className="owner-card-head">
            <h3>Newest members</h3>
            <button type="button" className="link-btn" onClick={() => onJump("users")}>
              Manage users
            </button>
          </div>
          {data.recentUsers.map((user) => (
            <button type="button" className="owner-user-row" key={user.id} onClick={() => void app.openProfile(user.id)}>
              <Avatar user={user} size={30} showStatus />
              <span>
                <strong>
                  {user.displayName}
                  {user.isOwner && <Verified />}
                </strong>
                <small>@{user.username}</small>
              </span>
              <BadgeRow badges={user.badges} max={2} compact />
              <time>{formatShort(user.createdAt)}</time>
            </button>
          ))}
        </div>

        <div className="owner-card">
          <div className="owner-card-head">
            <h3>Largest communities</h3>
            <button type="button" className="link-btn" onClick={() => onJump("servers")}>
              Oversight
            </button>
          </div>
          {data.topServers.map((server) => (
            <div className="owner-server-row" key={server.id}>
              <span className="owner-server-icon">{server.iconId ? <img src={`/api/files/${server.iconId}`} alt="" /> : server.name.slice(0, 2)}</span>
              <span>
                <strong>{server.name}</strong>
                <small>{server.memberCount} members</small>
              </span>
              <button type="button" className="ghost-btn small" onClick={() => app.navigate(`/channels/${server.id}`)}>
                Open
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="owner-card">
        <div className="owner-card-head">
          <h3>Recent security & audit activity</h3>
          <button type="button" className="link-btn" onClick={() => onJump("audit")}>
            Full audit log
          </button>
        </div>
        {data.recentAudit.map((entry) => (
          <div className="audit-row compact" key={entry.id}>
            <span className="audit-time">{formatShort(entry.createdAt)}</span>
            <div>
              <strong>{humanAction(entry.action)}</strong>
              <span>
                {entry.actorName}
                {entry.serverName ? ` · ${entry.serverName}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ data, label }: { data: { day: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.length) return <p className="sidebar-empty">No {label} in this window yet.</p>;
  return (
    <div className="bar-chart">
      {data.map((point) => (
        <div className="bar" key={point.day} title={`${point.day}: ${point.n} ${label}`}>
          <span style={{ height: `${Math.max(4, (point.n / max) * 100)}%` }} />
          <small>{point.day.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab() {
  const { data, loading } = useFetch<{
    messages: { day: string; n: number }[];
    users: { day: string; n: number }[];
    topChannels: { name: string; id: string; server: string; n: number }[];
  }>("/api/owner/analytics");

  if (loading && !data) return <p className="sidebar-empty">Crunching numbers…</p>;
  if (!data) return <p className="sidebar-empty">Analytics unavailable.</p>;

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Platform analytics</h2>
        <span className="owner-note-small">Last 14 days · live database</span>
      </div>
      <div className="owner-columns">
        <div className="owner-card">
          <h3>Messages per day</h3>
          <Bars data={data.messages} label="messages" />
        </div>
        <div className="owner-card">
          <h3>New accounts per day</h3>
          <Bars data={data.users} label="sign-ups" />
        </div>
      </div>
      <div className="owner-card">
        <h3>Most active channels</h3>
        {data.topChannels.map((channel) => (
          <div className="owner-server-row" key={channel.id}>
            <span className="hash-badge">#</span>
            <span>
              <strong>{channel.name}</strong>
              <small>{channel.server}</small>
            </span>
            <strong className="count">{channel.n}</strong>
          </div>
        ))}
        {!data.topChannels.length && <p className="sidebar-empty">No channel activity yet.</p>}
      </div>
    </div>
  );
}

function UsersTab() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const path = useMemo(() => `/api/owner/users${query ? `?q=${encodeURIComponent(query)}` : ""}`, [query]);
  const { data, loading, reload } = useFetch<{ users: User[] }>(path);
  const badges = useFetch<{ badges: { slug: string; name: string; color: string; glyph: string }[] }>("/api/owner/badges");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, body: Record<string, unknown>, message: string) => {
    setBusy(id);
    try {
      await api(`/api/owner/users/${id}`, { method: "PATCH", body });
      await reload();
      app.toast(message, "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>User management</h2>
        <label className="owner-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, username or email" />
        </label>
      </div>
      {loading && <p className="sidebar-empty">Loading users…</p>}
      <div className="owner-table">
        {(data?.users ?? []).map((user) => (
          <div className={cls("owner-user-card", user.banned && "banned")} key={user.id}>
            <div className="owner-user-main">
              <Avatar user={user} size={38} showStatus />
              <div className="owner-user-copy">
                <strong>
                  {user.displayName}
                  {user.isOwner && <Verified />}
                </strong>
                <span>@{user.username} · {user.email}</span>
                <BadgeRow badges={user.badges} max={4} compact />
              </div>
              <div className="owner-user-flags">
                <span className={cls("platform-role", user.isOwner && "owner")}>
                  {user.isOwner ? "OWNER" : user.platformRole}
                </span>
                {user.banned && <span className="ban-flag">SUSPENDED</span>}
                {user.plusActive && <span className="plus-flag">PLUS</span>}
                <span className="owner-note-small">{user.serverCount ?? 0} servers</span>
              </div>
            </div>
            {!user.isOwner && (
              <div className="owner-user-actions">
                <label className="mini-field">
                  Role
                  <select
                    value={user.platformRole}
                    disabled={busy === user.id}
                    onChange={(e) => void act(user.id, { platformRole: e.target.value }, "Platform role updated")}
                  >
                    {["user", "moderator", "manager", "admin", "support", "events", "founder"].map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mini-field">
                  Badge
                  <select
                    value=""
                    onChange={(e) => {
                      const slug = e.target.value;
                      if (!slug) return;
                      const existing = user.badges.some((b) => b.slug === slug);
                      void api(`/api/owner/users/${user.id}/badges`, {
                        method: "POST",
                        body: { slug, grant: !existing },
                      }).then(async () => {
                        await reload();
                        app.toast(existing ? "Badge revoked" : "Badge granted", "success");
                      });
                    }}
                  >
                    <option value="">Manage badges…</option>
                    {(badges.data?.badges ?? []).filter((b) => b.slug !== "owner").map((badge) => (
                      <option key={badge.slug} value={badge.slug}>
                        {user.badges.some((b) => b.slug === badge.slug) ? `Remove ${badge.name}` : `Grant ${badge.name}`}
                      </option>
                    ))}
                  </select>
                </label>
                {!user.isOwner && (
                  <button
                    type="button"
                    className="ghost-btn small"
                    disabled={busy === user.id}
                    onClick={() => {
                      const months = window.prompt(`Grant complimentary PLUS months to ${user.displayName} (1-12)`, "1");
                      if (!months) return;
                      const parsed = Number(months);
                      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
                        app.toast("Enter a whole number between 1 and 12", "error");
                        return;
                      }
                      void act(user.id, { plusMonths: parsed }, "Complimentary PLUS granted");
                    }}
                  >
                    <Sparkles size={13} /> Give PLUS
                  </button>
                )}
                {user.plusActive && (
                  <button
                    type="button"
                    className="ghost-btn small"
                    onClick={async () => {
                      if (!window.confirm("Revoke PLUS from this account?")) return;
                      await api(`/api/owner/plus/${user.id}`, { method: "DELETE" });
                      await reload();
                      app.toast("PLUS removed");
                    }}
                  >
                    Revoke PLUS
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-btn small"
                  onClick={() => void app.openProfile(user.id)}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className={cls("ghost-btn small", user.banned ? "" : "danger-text")}
                  disabled={busy === user.id}
                  onClick={() => {
                    if (user.banned) {
                      void act(user.id, { banned: false }, "Account restored");
                    } else {
                      const reason = window.prompt(`Suspend ${user.username}. Reason (shown to the member)?`, "Platform rules violation");
                      if (reason === null) return;
                      void act(user.id, { banned: true, banReason: reason }, "Account suspended");
                    }
                  }}
                >
                  {user.banned ? <Check size={13} /> : <X size={13} />}
                  {user.banned ? "Restore" : "Suspend"}
                </button>
                <button
                  type="button"
                  className="ghost-btn small danger-text"
                  disabled={busy === user.id}
                  title="Permanently delete this account"
                  onClick={() => {
                    const typed = window.prompt(
                      `Permanently remove @${user.username}?\n\nThis deletes their account, logs them out everywhere, removes their uploads and deletes any servers they own. It cannot be undone.\n\nType the username to confirm.`,
                      "",
                    );
                    if (typed === null) return;
                    if (typed.trim().toLowerCase() !== user.username.toLowerCase()) {
                      app.toast("Username did not match — nothing was removed.", "error");
                      return;
                    }
                    setBusy(user.id);
                    void api(`/api/owner/users/${user.id}`, { method: "DELETE" })
                      .then(async () => {
                        await reload();
                        app.toast(`@${user.username} was removed`, "success");
                      })
                      .catch((err: unknown) => {
                        app.toast(err instanceof Error ? err.message : "Could not remove account", "error");
                      })
                      .finally(() => setBusy(null));
                  }}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            )}
            {user.isOwner && <div className="owner-protected">Owner account · protected from all staff actions</div>}
          </div>
        ))}
        {!loading && !data?.users.length && <p className="sidebar-empty">No users matched.</p>}
      </div>
    </div>
  );
}

function StaffTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{ staff: User[] }>("/api/owner/staff");
  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Staff & permissions</h2>
        <span className="owner-note-small">Platform roles are separate from server roles.</span>
      </div>
      {loading && <p className="sidebar-empty">Loading staff…</p>}
      {(data?.staff ?? []).map((member) => (
        <div className="owner-card staff-card" key={member.id}>
          <Avatar user={member} size={36} showStatus />
          <div className="owner-user-copy">
            <strong>{member.displayName}{member.isOwner && <Verified />}</strong>
            <span>@{member.username} · last seen {formatShort(member.lastSeenAt)}</span>
            <BadgeRow badges={member.badges} max={4} compact />
          </div>
          <span className={cls("platform-role", member.isOwner && "owner")}>{member.isOwner ? "OWNER" : member.platformRole}</span>
          {!member.isOwner && (
            <select
              value={member.platformRole}
              onChange={async (e) => {
                await api(`/api/owner/users/${member.id}`, { method: "PATCH", body: { platformRole: e.target.value } });
                await reload();
                app.toast("Staff role updated", "success");
              }}
            >
              {["user", "moderator", "manager", "admin", "support", "events", "founder"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      <p className="form-hint">
        Staff cannot grant themselves owner status. Only the protected owner account can access this console.
      </p>
    </div>
  );
}

function ReportsTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    reports: {
      id: string;
      reason: string;
      details: string | null;
      status: string;
      createdAt: number;
      reporterName: string | null;
      targetId: string | null;
      targetName: string | null;
      serverName: string | null;
      messageId: string | null;
      resolution: string | null;
    }[];
  }>("/api/owner/reports");
  const [filter, setFilter] = useState("all");

  const list = (data?.reports ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Moderation reports</h2>
        <div className="segmented">
          {["all", "open", "reviewing", "resolved", "dismissed"].map((status) => (
            <button type="button" key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>
              {status}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="sidebar-empty">Loading reports…</p>}
      {!loading && !list.length && <p className="sidebar-empty">Nothing in this queue.</p>}
      {list.map((report) => (
        <div className="owner-card report-card" key={report.id}>
          <div className="report-head">
            <span className={cls("report-status", report.status)}>{report.status}</span>
            <strong>{report.reason}</strong>
            <time>{formatShort(report.createdAt)}</time>
          </div>
          <p>{report.details || "No extra context supplied."}</p>
          <div className="report-meta">
            <span>Reporter: {report.reporterName ?? "unknown"}</span>
            <span>Target: {report.targetName ?? "unknown"}</span>
            {report.serverName && <span>Server: {report.serverName}</span>}
            {report.messageId && <span className="mono">message {report.messageId.slice(0, 8)}</span>}
          </div>
          {report.resolution && <p className="form-hint">Resolution: {report.resolution}</p>}
          <div className="report-actions">
            {report.status !== "reviewing" && (
              <button
                type="button"
                className="ghost-btn small"
                onClick={async () => {
                  await api(`/api/owner/reports/${report.id}`, { method: "PATCH", body: { status: "reviewing" } });
                  await reload();
                }}
              >
                Start review
              </button>
            )}
            <button
              type="button"
              className="primary-btn small"
              onClick={async () => {
                const resolution = window.prompt("Resolution note (shared with the reporter)", "Reviewed and actioned.");
                if (resolution === null) return;
                await api(`/api/owner/reports/${report.id}`, { method: "PATCH", body: { status: "resolved", resolution } });
                await reload();
                app.toast("Report resolved", "success");
              }}
            >
              <Check size={13} /> Resolve
            </button>
            <button
              type="button"
              className="ghost-btn small"
              onClick={async () => {
                await api(`/api/owner/reports/${report.id}`, { method: "PATCH", body: { status: "dismissed", resolution: "No violation found." } });
                await reload();
              }}
            >
              Dismiss
            </button>
            {report.targetId && (
              <button type="button" className="ghost-btn small danger-text" onClick={async () => {
                const reason = window.prompt("Suspend this account? Reason:", "Platform rules violation");
                if (reason === null) return;
                await api(`/api/owner/users/${report.targetId}`, { method: "PATCH", body: { banned: true, banReason: reason } });
                app.toast("Account suspended", "success");
              }}>
                Suspend target
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AppealsTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    appeals: { id: string; reason: string; status: string; createdAt: number; username: string; displayName: string; banned: boolean; reviewNote: string | null }[];
  }>("/api/owner/appeals");

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Appeals</h2>
      </div>
      {loading && <p className="sidebar-empty">Loading appeals…</p>}
      {!loading && !data?.appeals.length && <p className="sidebar-empty">No appeals submitted.</p>}
      {(data?.appeals ?? []).map((appeal) => (
        <div className="owner-card appeal-card" key={appeal.id}>
          <div className="report-head">
            <span className={cls("report-status", appeal.status)}>{appeal.status}</span>
            <strong>{appeal.displayName} · @{appeal.username}</strong>
            <time>{formatShort(appeal.createdAt)}</time>
          </div>
          <p>{appeal.reason}</p>
          {appeal.reviewNote && <p className="form-hint">Review: {appeal.reviewNote}</p>}
          <div className="report-actions">
            <button
              type="button"
              className="primary-btn small"
              disabled={!appeal.banned}
              onClick={async () => {
                const note = window.prompt("Approve appeal. Note to the member:", "We reviewed your appeal and restored your account.");
                if (note === null) return;
                await api(`/api/owner/appeals/${appeal.id}`, { method: "PATCH", body: { status: "approved", note } });
                await reload();
                app.toast("Appeal approved — account restored", "success");
              }}
            >
              Approve & restore
            </button>
            <button
              type="button"
              className="ghost-btn small"
              onClick={async () => {
                const note = window.prompt("Deny appeal. Note to the member:", "After review we are keeping the suspension in place.");
                if (note === null) return;
                await api(`/api/owner/appeals/${appeal.id}`, { method: "PATCH", body: { status: "denied", note } });
                await reload();
              }}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationsTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    applications: {
      id: string;
      position: string;
      why: string;
      experience: string | null;
      status: string;
      createdAt: number;
      userId: string;
      username: string;
      displayName: string;
      platformRole: string;
      reviewNote: string | null;
    }[];
  }>("/api/owner/applications");
  const [role, setRole] = useState("moderator");
  const roleLabel = (value: string) => (value === "founder" ? "community founder" : value);

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Staff applications</h2>
        <label className="mini-field">
          Accept as
          <select value={role} onChange={(e) => setRole(e.target.value)}>              {["moderator", "manager", "admin", "support", "events", "founder"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p className="sidebar-empty">Loading applications…</p>}
      {!loading && !data?.applications.length && <p className="sidebar-empty">No applications in the queue.</p>}
      {(data?.applications ?? []).map((application) => (
        <div className="owner-card application-card" key={application.id}>
          <div className="report-head">
            <span className={cls("report-status", application.status)}>{application.status}</span>
            <strong>{application.displayName} · {application.position}</strong>
            <time>{formatShort(application.createdAt)}</time>
          </div>
          <p>{application.why}</p>
          {application.experience && <p className="form-hint">Experience: {application.experience}</p>}
          <div className="report-actions">
            <button
              type="button"
              className="primary-btn small"
              onClick={async () => {
                const note = window.prompt("Accept application. Note to the applicant:", `Welcome to the ZUNO ${roleLabel(role)} team!`);
                if (note === null) return;
                try {
                  await api(`/api/owner/applications/${application.id}`, {
                    method: "PATCH",
                    body: { status: "accepted", note, platformRole: role },
                  });
                  app.toast("Applicant accepted", "success");
                } catch (err) {
                  app.toast(err instanceof Error ? err.message : "Could not review that application", "error");
                } finally {
                  await reload();
                }
              }}
            >
              <Check size={13} /> Accept as {roleLabel(role)}
            </button>
            <button
              type="button"
              className="ghost-btn small"
              onClick={async () => {
                const note = window.prompt("Deny application. Note to the applicant:", "Thank you for applying — we are not moving forward this time.");
                if (note === null) return;
                try {
                  await api(`/api/owner/applications/${application.id}`, { method: "PATCH", body: { status: "denied", note } });
                  app.toast("Application denied", "success");
                } catch (err) {
                  app.toast(err instanceof Error ? err.message : "Could not review that application", "error");
                } finally {
                  await reload();
                }
              }}
            >
              Deny
            </button>
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => void app.openProfile(application.userId)}
            >
              View applicant
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServersTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    servers: { id: string; name: string; ownerName: string; isPublic: boolean; memberCount: number; messageCount: number; createdAt: number }[];
  }>("/api/owner/servers");

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Server oversight</h2>
        <span className="owner-note-small">Deleting a community is permanent and audited.</span>
      </div>
      {loading && <p className="sidebar-empty">Loading servers…</p>}
      <div className="owner-table">
        {(data?.servers ?? []).map((server) => (
          <div className="owner-card server-admin-row" key={server.id}>
            <div>
              <strong>{server.name}</strong>
              <span>
                {server.ownerName} · {server.memberCount} members · {server.messageCount} messages · {server.isPublic ? "public" : "invite-only"}
              </span>
            </div>
            <div className="report-actions">
              <button type="button" className="ghost-btn small" onClick={() => app.navigate(`/channels/${server.id}`)}>
                Inspect
              </button>
              <button
                type="button"
                className="ghost-btn small danger-text"
                onClick={async () => {
                  if (!window.confirm(`Delete ${server.name}? All channels and messages are removed.`)) return;
                  await api(`/api/owner/servers/${server.id}`, { method: "DELETE" });
                  await reload();
                  await app.refreshMe(true);
                  app.toast("Community deleted", "success");
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        ))}
        {!loading && !data?.servers.length && <p className="sidebar-empty">No communities yet.</p>}
      </div>
    </div>
  );
}

const BADGE_ART_OPTIONS = [
  ["origin", "Origin crystal — 1 of 1"] ,
  ["seal", "Verified seal"],
  ["bloom", "Bloom — pink"],
  ["shield", "Shield"],
  ["blade", "Blade"],
  ["terminal", "Terminal"],
  ["prism", "Prism"],
  ["laurel", "Laurel"],
  ["sprout", "Sprout"],
  ["pulse", "Pulse"],
  ["arcade", "Arcade"],
  ["spark", "Spark"],
  ["vine-1", "Account age vine — sprout"],
  ["vine-2", "Account age vine — bud"],
  ["vine-3", "Account age vine — blossom"],
  ["vine-4", "Account age vine — evergreen"],
  ["vine-5", "Account age vine — ironvine"],
  ["vine-6", "Account age vine — neon"],
] as const;

function BadgesTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    badges: {
      slug: string;
      name: string;
      description: string;
      color: string;
      glyph: string;
      art: string | null;
      unique_flag: number;
      premium: number;
      automatic: number;
      assigned: number;
    }[];
  }>("/api/owner/badges");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#f472b6");
  const [art, setArt] = useState("bloom");
  const [unique, setUnique] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/owner/badges", {
        method: "POST",
        body: { name: name.trim(), description, color, art, unique },
      });
      setName("");
      setDescription("");
      setUnique(false);
      await reload();
      app.toast("Custom badge created", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not create badge", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Badge management</h2>
        <span className="owner-note-small">Assign badges to members from the Users tab.</span>
      </div>

      <div className="owner-card badge-create">
        <div className="badge-create-head">
          <BadgeTile badge={{ name: name || "New badge", color, art, unique }} size={58} label={false} />
          <div>
            <h3>Create a custom badge</h3>
            <p>Pick original ZUNO artwork, a colour, and whether only one member can ever hold it.</p>
          </div>
        </div>
        <div className="badge-create-fields">
          <label className="mini-field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="NIGHT OWL" />
          </label>
          <label className="mini-field">
            Artwork
            <select value={art} onChange={(e) => setArt(e.target.value)}>
              {BADGE_ART_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            Colour
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label className="badge-unique-toggle">
            <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
            1 of 1
          </label>
        </div>
        <input
          className="badge-create-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="What does this badge celebrate? (optional)"
        />
        <button type="button" className="primary-btn small" disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? "Creating…" : "Create badge"}
        </button>
      </div>

      {loading && <p className="sidebar-empty">Loading badges…</p>}
      <div className="badge-admin-grid">
        {(data?.badges ?? []).map((badge) => (
          <div className="owner-card badge-admin" key={badge.slug}>
            <div className="badge-admin-preview">
              <BadgeTile
                badge={{ name: badge.name, color: badge.color, art: badge.art, unique: badge.unique_flag === 1 }}
                size={62}
                label={false}
              />
              <div className="badge-admin-tags">
                {badge.unique_flag === 1 && <span className="tag unique">1 OF 1</span>}
                {badge.automatic ? <span className="tag">automatic</span> : null}
                {badge.premium ? <span className="tag plus">PLUS</span> : null}
              </div>
            </div>
            <input
              defaultValue={badge.name}
              onBlur={async (e) => {
                if (e.target.value === badge.name || !e.target.value.trim()) return;
                await api(`/api/owner/badges/${badge.slug}`, { method: "PATCH", body: { name: e.target.value } });
                await reload();
                app.toast("Badge renamed", "success");
              }}
            />
            <textarea
              defaultValue={badge.description ?? ""}
              rows={2}
              onBlur={async (e) => {
                if (e.target.value === badge.description) return;
                await api(`/api/owner/badges/${badge.slug}`, { method: "PATCH", body: { description: e.target.value } });
                await reload();
              }}
            />
            <div className="badge-admin-foot">
              <input
                type="color"
                defaultValue={badge.color}
                onChange={async (e) => {
                  await api(`/api/owner/badges/${badge.slug}`, { method: "PATCH", body: { color: e.target.value } });
                }}
              />
              <select
                value={badge.art ?? "spark"}
                onChange={async (e) => {
                  await api(`/api/owner/badges/${badge.slug}`, { method: "PATCH", body: { art: e.target.value } });
                  await reload();
                }}
              >
                {BADGE_ART_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span>{badge.assigned} assigned</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementsTab() {
  const app = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { data, loading, reload } = useFetch<{
    announcements: { id: string; scope: string; title: string; body: string; authorName: string; serverName: string | null; createdAt: number }[];
  }>("/api/owner/announcements");

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Platform announcements</h2>
      </div>
      <div className="owner-card">
        <h3>
          <Megaphone size={15} /> Broadcast to everyone
        </h3>
        <div className="form-stack">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="ZUNO 1.1 is live" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={3000} />
          </label>
          <button
            type="button"
            className="primary-btn"
            disabled={!title.trim() || !body.trim()}
            onClick={async () => {
              await api("/api/owner/announcements", { method: "POST", body: { title, body } });
              setTitle("");
              setBody("");
              await reload();
              await app.refreshMe(true);
              app.toast("Announcement sent to every member", "success");
            }}
          >
            <Megaphone size={15} /> Publish announcement
          </button>
        </div>
      </div>
      {loading && <p className="sidebar-empty">Loading announcements…</p>}
      {(data?.announcements ?? []).map((announcement) => (
        <div className="owner-card" key={announcement.id}>
          <div className="report-head">
            <span className={cls("report-status", announcement.scope)}>{announcement.scope}</span>
            <strong>{announcement.title}</strong>
            <time>{formatShort(announcement.createdAt)}</time>
          </div>
          <p>{announcement.body}</p>
          <div className="report-actions">
            <span className="owner-note-small">
              by {announcement.authorName}
              {announcement.serverName ? ` · ${announcement.serverName}` : ""}
            </span>
            <button
              type="button"
              className="ghost-btn small danger-text"
              onClick={async () => {
                await api(`/api/owner/announcements/${announcement.id}`, { method: "DELETE" });
                await reload();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlusTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{
    subscriptions: {
      userId: string;
      username: string;
      displayName: string;
      email: string;
      isOwner: boolean;
      provider: string;
      status: string;
      source: string;
      currentPeriodEnd: number | null;
      updatedAt: number;
    }[];
  }>("/api/owner/plus");

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>ZUNO PLUS management</h2>
        <span className="owner-note-small">Only provider-confirmed or explicitly complimentary memberships appear here.</span>
      </div>
      <div className="owner-card plus-status-card">
        <Sparkles size={18} />
        <div>
          <strong>Subscription provider</strong>
          <span>
            {app.me.plus.configured
              ? "Stripe is configured. Checkout sessions are created server-side and memberships activate only after webhook verification."
              : "Not configured. Add STRIPE_SECRET_KEY, STRIPE_PLUS_PRICE_ID and STRIPE_WEBHOOK_SECRET as server secrets."}
          </span>
        </div>
      </div>
      {loading && <p className="sidebar-empty">Loading subscriptions…</p>}
      <div className="owner-table">
        {(data?.subscriptions ?? []).map((sub) => (
          <div className="owner-card server-admin-row" key={sub.userId}>
            <div>
              <strong>{sub.displayName} · @{sub.username}</strong>
              <span>
                {sub.source} · {sub.status} · {sub.currentPeriodEnd ? `renews ${formatShort(sub.currentPeriodEnd)}` : "no period"} · {sub.email}
              </span>
            </div>
            {(sub.source === "complimentary" || sub.source === "owner") && !sub.isOwner && (
              <button
                type="button"
                className="ghost-btn small danger-text"
                onClick={async () => {
                  await api(`/api/owner/plus/${sub.userId}`, { method: "DELETE" });
                  await reload();
                  app.toast("PLUS removed");
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {!loading && !data?.subscriptions.length && <p className="sidebar-empty">No PLUS memberships yet.</p>}
      </div>
    </div>
  );
}

function ConfigTab() {
  const app = useApp();
  const { data, loading, reload } = useFetch<{ config: Record<string, string> }>("/api/owner/config");
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.config) setDraft(data.config);
  }, [data?.config]);

  if (loading && !data) return <p className="sidebar-empty">Loading configuration…</p>;

  const value = (key: string) => draft[key] ?? data?.config[key] ?? "";
  const set = (key: string, next: string) => setDraft((prev) => ({ ...prev, [key]: next }));
  const toggle = (key: string) => set(key, value(key) === "true" ? "false" : "true");

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Website configuration</h2>
        <button
          type="button"
          className="primary-btn small"
          onClick={async () => {
            await api("/api/owner/config", { method: "PATCH", body: draft });
            await reload();
            await app.refreshMe(true);
            app.toast("Configuration saved", "success");
          }}
        >
          <Database size={13} /> Save configuration
        </button>
      </div>

      <div className="owner-card">
        <h3>
          <Settings size={15} /> Identity
        </h3>
        <div className="form-inline">
          <label className="field">
            <span>Site name</span>
            <input value={value("site_name")} onChange={(e) => set("site_name", e.target.value)} />
          </label>
          <label className="field">
            <span>Tagline</span>
            <input value={value("tagline")} onChange={(e) => set("tagline", e.target.value)} />
          </label>
          <label className="field">
            <span>PLUS price label</span>
            <input value={value("plus_price_label")} onChange={(e) => set("plus_price_label", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="owner-card">
        <h3>
          <Shield size={15} /> Access & maintenance
        </h3>
        <label className="switch-row">
          <div>
            <strong>Registration open</strong>
            <span>Allow new accounts to be created.</span>
          </div>
          <input type="checkbox" checked={value("registration_open") === "true"} onChange={() => toggle("registration_open")} />
        </label>
        <label className="switch-row">
          <div>
            <strong>Public discovery</strong>
            <span>Show the Discover directory to members.</span>
          </div>
          <input type="checkbox" checked={value("discovery_enabled") === "true"} onChange={() => toggle("discovery_enabled")} />
        </label>
        <label className="switch-row">
          <div>
            <strong>Invite-only platform</strong>
            <span>New members must arrive through an invite.</span>
          </div>
          <input type="checkbox" checked={value("invite_only") === "true"} onChange={() => toggle("invite_only")} />
        </label>
        <label className="switch-row">
          <div>
            <strong>Maintenance mode</strong>
            <span>Only the owner can use ZUNO while enabled. The API returns a maintenance notice to everyone else.</span>
          </div>
          <input type="checkbox" checked={value("maintenance_mode") === "true"} onChange={() => toggle("maintenance_mode")} />
        </label>
        <label className="field">
          <span>Maintenance message</span>
          <textarea value={value("maintenance_message")} onChange={(e) => set("maintenance_message", e.target.value)} rows={2} />
        </label>
      </div>
    </div>
  );
}

function AuditTab() {
  const [query, setQuery] = useState("");
  const path = `/api/owner/audit${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const { data, loading } = useFetch<{
    entries: { id: string; action: string; actorName: string; serverName: string | null; targetType: string | null; targetId: string | null; meta: string | null; createdAt: number }[];
  }>(path);

  return (
    <div className="owner-stack">
      <div className="owner-toolbar">
        <h2>Security & audit log</h2>
        <label className="owner-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter actions, staff or servers" />
        </label>
      </div>
      {loading && <p className="sidebar-empty">Loading audit entries…</p>}
      <div className="owner-card audit-table">
        {(data?.entries ?? []).map((entry) => (
          <div className="audit-row" key={entry.id}>
            <span className="audit-time">{formatShort(entry.createdAt)}</span>
            <div>
              <strong>{humanAction(entry.action)}</strong>
              <span>
                {entry.actorName}
                {entry.serverName ? ` · ${entry.serverName}` : " · platform"}
                {entry.targetType ? ` → ${entry.targetType}` : ""}
              </span>
            </div>
            {entry.meta && entry.meta !== "{}" && <code>{entry.meta.slice(0, 80)}</code>}
          </div>
        ))}
        {!loading && !data?.entries.length && <p className="sidebar-empty">No matching audit entries.</p>}
      </div>
    </div>
  );
}

export { Activity, BadgeCheck, IconButton };
