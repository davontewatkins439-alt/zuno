import React, { useEffect, useState } from "react";
import { Bell, Check, Copy, Hash, Keyboard, MessageSquare, Plus, Send, Volume2 } from "lucide-react";
import { useApp } from "../../state";
import { api } from "../../lib/api";
import type { InvitePreview, Notification, User } from "../../lib/types";
import { cls, formatShort, has, P } from "../../lib/utils";
import { Avatar, IconButton, Modal, StatusDot } from "../ui";

function copy(text: string) {
  return navigator.clipboard.writeText(text);
}

export function CreateServerModal() {
  const app = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api<{ server: { id: string } }>("/api/servers", {
        method: "POST",
        body: { name: name.trim(), description, isPublic },
      });
      await app.refreshMe(true);
      app.closeModal();
      app.navigate(`/channels/${result.server.id}`);
      app.toast("Server created — you are the founder", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not create server", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create your community"
      subtitle="Your server starts with #general and a voice room. You can customise everything after."
      onClose={app.closeModal}
      footer={
        <>
          <button type="button" className="ghost-btn" onClick={() => app.openModal({ type: "joinServer" })}>
            I already have an invite
          </button>
          <button type="submit" form="create-server" className="primary-btn" disabled={busy || name.trim().length < 2}>
            {busy ? "Creating…" : "Create server"}
          </button>
        </>
      }
    >
      <form id="create-server" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Server name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Midnight Society" />
        </label>
        <label className="field">
          <span>What is it about?</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="A quiet place for late-night creative work."
          />
        </label>
        <label className="switch-row">
          <div>
            <strong>List in Discover</strong>
            <span>Anyone can find and join this community.</span>
          </div>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        </label>
      </form>
    </Modal>
  );
}

export function JoinServerModal() {
  const app = useApp();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = value.includes("/invite/") ? value.split("/invite/")[1].split(/[?#]/)[0] : value.trim();
    if (!code) return;
    setBusy(true);
    try {
      const preview = await api<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`);
      await api(`/api/servers/${preview.server.id}/join`, { method: "POST", body: { code } });
      await app.refreshMe(true);
      app.closeModal();
      app.navigate(`/channels/${preview.server.id}`);
      app.toast(`Welcome to ${preview.server.name}`, "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Invalid invite", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Join a community"
      subtitle="Paste a ZUNO invite link or code."
      onClose={app.closeModal}
      footer={
        <button type="submit" form="join-server" className="primary-btn" disabled={busy || value.trim().length < 3}>
          {busy ? "Joining…" : "Join server"}
        </button>
      }
    >
      <form id="join-server" className="form-stack" onSubmit={join}>
        <label className="field">
          <span>Invite link or code</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://zuno.app/invite/midnight-society-abc123"
          />
        </label>
        <p className="form-hint">Invites can expire or be limited. Ask a member of the community for a fresh one.</p>
      </form>
    </Modal>
  );
}

export function InviteModal({ serverId }: { serverId?: string }) {
  const app = useApp();
  const id = serverId ?? app.serverId;
  const server = app.me.servers.find((s) => s.id === id);
  const canInvite = app.server?.server.id === id ? has(app.server.permissions, P.CREATE_INVITES) : true;
  const [invites, setInvites] = useState<
    { code: string; uses: number; maxUses: number | null; expiresAt: number | null; createdBy: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<{ invites: typeof invites }>(`/api/servers/${id}/invites`)
      .then((data) => setInvites(data.invites))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load invites"));
  }, [id]);

  if (!id || !server) {
    return (
      <Modal title="Invite people" onClose={app.closeModal}>
        <p className="sidebar-empty">Open a server first to create an invite.</p>
      </Modal>
    );
  }

  const create = async () => {
    setBusy(true);
    try {
      const data = await api<{ invite: { code: string } }>(`/api/servers/${id}/invites`, {
        method: "POST",
        body: { expiresInHours: 24 },
      });
      setInvites((prev) => [
        { code: data.invite.code, uses: 0, maxUses: null, expiresAt: Date.now() + 24 * 3600_000, createdBy: app.me.user.username },
        ...prev,
      ]);
      await copy(`${window.location.origin}/invite/${data.invite.code}`);
      app.toast("Invite link copied to clipboard", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not create invite", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Invite people to ${server.name}`}
      subtitle={canInvite ? "Anyone with the link can join this community." : "You need the Create Invites permission."}
      onClose={app.closeModal}
      footer={
        <button type="button" className="primary-btn" onClick={() => void create()} disabled={busy || !canInvite}>
          <Plus size={15} /> {busy ? "Creating…" : "Create new invite"}
        </button>
      }
    >
      {error && <p className="form-error">{error}</p>}
      <div className="invite-permanent">
        <div>
          <strong>Permanent server invite</strong>
          <span>{window.location.origin}/invite/{server.inviteCode ?? "unavailable"}</span>
        </div>
        <IconButton
          label="Copy permanent invite"
          onClick={async () => {
            if (!server.inviteCode) return;
            await copy(`${window.location.origin}/invite/${server.inviteCode}`);
            app.toast("Copied", "success");
          }}
        >
          <Copy size={15} />
        </IconButton>
      </div>

      <div className="invite-list">
        {invites.map((invite) => (
          <div className="invite-row" key={invite.code}>
            <div>
              <strong>
                {window.location.origin}/invite/{invite.code}
              </strong>
              <span>
                {invite.uses} uses · by {invite.createdBy}
                {invite.expiresAt ? ` · expires ${formatShort(invite.expiresAt)}` : " · never expires"}
              </span>
            </div>
            <IconButton
              label="Copy invite"
              onClick={async () => {
                await copy(`${window.location.origin}/invite/${invite.code}`);
                app.toast("Copied", "success");
              }}
            >
              <Copy size={14} />
            </IconButton>
            {canInvite && (
              <button
                type="button"
                className="ghost-btn small danger-text"
                onClick={async () => {
                  await api(`/api/servers/${id}/invites/${invite.code}`, { method: "DELETE" });
                  setInvites((prev) => prev.filter((i) => i.code !== invite.code));
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {!invites.length && <p className="sidebar-empty">No active invites yet.</p>}
      </div>
    </Modal>
  );
}

export function CreateChannelModal({ categoryId }: { categoryId?: string }) {
  const app = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [category, setCategory] = useState(categoryId ?? "");
  const [busy, setBusy] = useState(false);

  if (!app.server) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ channel: { id: string } }>(`/api/servers/${app.server!.server.id}/channels`, {
        method: "POST",
        body: { name, type, topic, isPrivate, categoryId: category || null },
      });
      await app.reloadServer(true);
      await app.refreshMe(true);
      app.closeModal();
      if (type === "text") app.navigate(`/channels/${app.server!.server.id}/${result.channel.id}`);
      app.toast(`${type === "voice" ? "Voice" : "Text"} channel created`, "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not create channel", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create a channel"
      subtitle="Text channels are for conversation. Voice channels are for hanging out."
      onClose={app.closeModal}
      footer={
        <button type="submit" form="create-channel" className="primary-btn" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create channel"}
        </button>
      }
    >
      <form id="create-channel" className="form-stack" onSubmit={submit}>
        <div className="segmented wide">
          <button type="button" className={type === "text" ? "active" : ""} onClick={() => setType("text")}>
            <Hash size={14} /> Text
          </button>
          <button type="button" className={type === "voice" ? "active" : ""} onClick={() => setType("voice")}>
            <Volume2 size={14} /> Voice
          </button>
        </div>
        <label className="field">
          <span>Channel name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={type === "text" ? "late-night-talks" : "Lounge"} />
        </label>
        {type === "text" && (
          <label className="field">
            <span>Topic (optional)</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="What is this channel for?" />
          </label>
        )}
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">No category</option>
            {app.server.categories.map((cat) => (
              <option value={cat.id} key={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>
        <label className="switch-row">
          <div>
            <strong>Private channel</strong>
            <span>Only chosen roles and members can see it. You can fine-tune access afterwards.</span>
          </div>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        </label>
      </form>
    </Modal>
  );
}

export function ReportModal({ targetUserId, messageId, serverId }: { targetUserId?: string; messageId?: string; serverId?: string }) {
  const app = useApp();
  const [reason, setReason] = useState("Harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const reasons = ["Harassment", "Spam", "Hate speech", "Impersonation", "NSFW content", "Scam or phishing", "Other"];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/reports", { method: "POST", body: { reason, details, targetUserId, messageId, serverId } });
      app.closeModal();
      app.toast("Report submitted. The ZUNO team will review it.", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not submit report", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Report a problem"
      subtitle="Reports go privately to ZUNO moderation. False reports are logged."
      onClose={app.closeModal}
      footer={
        <button type="submit" form="report-form" className="primary-btn danger-bg" disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
      }
    >
      <form id="report-form" className="form-stack" onSubmit={submit}>
        <div className="chip-row">
          {reasons.map((option) => (
            <button
              type="button"
              key={option}
              className={cls("chip", reason === option && "active")}
              onClick={() => setReason(option)}
            >
              {reason === option && <Check size={12} />} {option}
            </button>
          ))}
        </div>
        <label className="field">
          <span>What happened?</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            maxLength={800}
            placeholder="Add context, timestamps or anything the moderators should know."
          />
        </label>
        {messageId && <p className="form-hint">A copy of the reported message is attached to this report.</p>}
      </form>
    </Modal>
  );
}

export function NotificationsModal() {
  const app = useApp();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app
      .loadNotifications()
      .then(async () => {
        const response = await api<{ notifications: Notification[] }>("/api/notifications");
        setItems(response.notifications);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal
      title="Notifications"
      subtitle="Mentions, friend requests, announcements and moderation updates."
      onClose={app.closeModal}
      footer={
        <button
          type="button"
          className="ghost-btn"
          onClick={async () => {
            await app.markNotificationsRead();
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
          }}
        >
          Mark all as read
        </button>
      }
    >
      <div className="notification-list">
        {loading && <p className="sidebar-empty">Loading…</p>}
        {!loading && !items.length && (
          <div className="panel-empty">
            <Bell size={22} />
            <strong>All quiet in the city</strong>
            <span>No notifications yet.</span>
          </div>
        )}
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={cls("notification-row", !item.read && "unread")}
            onClick={async () => {
              if (item.channelId && item.serverId) {
                app.navigate(`/channels/${item.serverId}/${item.channelId}`);
                if (item.messageId) app.setHighlightId(item.messageId);
              } else if (item.channelId) {
                app.navigate(`/dm/${item.channelId}`);
              }
              app.closeModal();
            }}
          >
            <span className="notification-icon">
              <Bell size={14} />
            </span>
            <span className="notification-copy">
              <strong>{item.title}</strong>
              {item.body && <span>{item.body}</span>}
              <time>{formatShort(item.createdAt)}</time>
            </span>
            {!item.read && <span className="notif-dot" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function NewDmModal() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(app.friends?.friends ?? []);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const data = await api<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        setResults(data.users);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, app.friends?.friends]);

  return (
    <Modal title="New conversation" subtitle="Search by username or pick a friend." onClose={app.closeModal}>
      <label className="dm-search wide">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ZUNO users" aria-label="Search users" />
      </label>
      <div className="user-result-list">
        {loading && <p className="sidebar-empty">Searching…</p>}
        {results.map((user) => (
          <button
            type="button"
            key={user.id}
            className="user-result"
            onClick={async () => {
              try {
                await app.openDm(user.id);
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not open conversation", "error");
              }
            }}
          >
            <Avatar user={user} size={34} showStatus />
            <span>
              <strong>{user.displayName}</strong>
              <small>@{user.username}</small>
            </span>
            <MessageSquare size={16} />
          </button>
        ))}
        {!results.length && !loading && (
          <p className="sidebar-empty">{query ? `No users matched “${query}”.` : "No friends yet — search for a username above."}</p>
        )}
      </div>
    </Modal>
  );
}

export function AppealModal() {
  const app = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Appeal your suspension"
      subtitle="Tell the ZUNO team what happened. A human reviews every appeal."
      onClose={() => app.navigate("/")}
      footer={
        <button
          type="button"
          className="primary-btn"
          disabled={busy || reason.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/appeals", { method: "POST", body: { reason } });
              app.toast("Appeal submitted. We will notify you when it is reviewed.", "success");
            } catch (err) {
              app.toast(err instanceof Error ? err.message : "Could not submit appeal", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Submitting…" : "Submit appeal"}
        </button>
      }
    >
      <label className="field">
        <span>Your appeal</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={7}
          maxLength={1200}
          placeholder="Explain the context and why your account should be restored."
        />
      </label>
    </Modal>
  );
}

export function KeyboardModal() {
  const app = useApp();
  const shortcuts = [
    ["Ctrl / ⌘ + K", "Jump to a conversation"],
    ["Ctrl / ⌘ + Shift + M", "Toggle microphone"],
    ["Ctrl / ⌘ + Shift + D", "Toggle deafen"],
    ["Alt + ↑ / ↓", "Move between channels"],
    ["Shift + Esc", "Mark everything as read"],
    ["Esc", "Close the current panel or modal"],
    ["Enter", "Send a message"],
    ["Shift + Enter", "New line in the composer"],
  ];
  return (
    <Modal title="Keyboard shortcuts" subtitle="Built for people who live in chat." onClose={app.closeModal}>
      <div className="shortcut-list">
        {shortcuts.map(([keys, label]) => (
          <div key={keys}>
            <kbd>{keys}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="panel-note">
        <Keyboard size={15} /> Tip: press <strong>Ctrl/⌘ + K</strong> from anywhere to open the conversation jumper.
      </div>
    </Modal>
  );
}

export function SendIcon() {
  return <Send size={15} />;
}

export function IdleUsers() {
  return (
    <div className="idle-users">
      <StatusDot status="idle" /> Away
    </div>
  );
}
