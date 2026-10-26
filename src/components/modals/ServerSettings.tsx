import React, { useEffect, useMemo, useState } from "react";
import { Copy, Hash, Plus, Save, Settings, Trash2, Upload, Volume2 } from "lucide-react";
import { useApp } from "../../state";
import { api, uploadFile } from "../../lib/api";
import type { Channel, PermissionMeta, Role, ServerEmoji } from "../../lib/types";
import { cls, formatShort, has, humanAction, P } from "../../lib/utils";
import { Avatar, IconButton, Modal } from "../ui";

const TABS = [
  { id: "overview", label: "Overview", permission: P.MANAGE_SERVER },
  { id: "channels", label: "Channels", permission: P.MANAGE_CHANNELS },
  { id: "roles", label: "Roles", permission: P.MANAGE_ROLES },
  { id: "members", label: "Members", permission: P.KICK_MEMBERS },
  { id: "invites", label: "Invites", permission: P.CREATE_INVITES },
  { id: "emoji", label: "Emoji", permission: P.MANAGE_EMOJIS },
  { id: "events", label: "Events", permission: P.MANAGE_EVENTS },
  { id: "audit", label: "Audit log", permission: P.VIEW_AUDIT },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ServerSettingsModal({ initialTab = "overview" }: { initialTab?: string }) {
  const app = useApp();
  const detail = app.server;
  const [tab, setTab] = useState<TabId>((TABS.some((t) => t.id === initialTab) ? initialTab : "overview") as TabId);

  if (!detail) {
    return (
      <Modal title="Server settings" onClose={app.closeModal}>
        <p className="sidebar-empty">Open a server first.</p>
      </Modal>
    );
  }

  const allowed = TABS.filter((entry) => has(detail.permissions, entry.permission) || detail.server.ownerId === app.me.user.id);

  return (
    <Modal
      title={`${detail.server.name} · settings`}
      subtitle={`Signed in as ${app.me.user.displayName}. Changes are audited.`}
      onClose={app.closeModal}
      wide
      className="settings-modal"
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {allowed.map((entry) => (
            <button type="button" key={entry.id} className={cls(tab === entry.id && "active")} onClick={() => setTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "overview" && <OverviewTab />}
          {tab === "channels" && <ChannelsTab />}
          {tab === "roles" && <RolesTab />}
          {tab === "members" && <MembersTab />}
          {tab === "invites" && <InvitesTab />}
          {tab === "emoji" && <EmojiTab />}
          {tab === "events" && <EventsTab />}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>
    </Modal>
  );
}

function OverviewTab() {
  const app = useApp();
  const detail = app.server!;
  const [name, setName] = useState(detail.server.name);
  const [description, setDescription] = useState(detail.server.description ?? "");
  const [welcome, setWelcome] = useState(detail.server.welcomeMessage ?? "");
  const [rules, setRules] = useState(detail.server.rules ?? "");
  const [isPublic, setIsPublic] = useState(detail.server.isPublic);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/servers/${detail.server.id}`, {
        method: "PATCH",
        body: { name, description, welcomeMessage: welcome, rules, isPublic },
      });
      await app.reloadServer(true);
      await app.refreshMe(true);
      app.toast("Server updated", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (file: File, kind: "iconId" | "bannerId") => {
    try {
      const result = await uploadFile(file, "server_icon");
      await api(`/api/servers/${detail.server.id}`, { method: "PATCH", body: { [kind]: result.file.id } });
      await app.reloadServer(true);
      app.toast("Server artwork updated", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Upload failed", "error");
    }
  };

  return (
    <div className="form-stack">
      <div className="server-asset-row">
        <div className="server-asset">
          <span className="asset-preview">
            {detail.server.iconId ? <img src={`/api/files/${detail.server.iconId}`} alt="Server icon" /> : <Settings size={24} />}
          </span>
          <label className="ghost-btn small">
            <Upload size={13} /> Change icon
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], "iconId")} />
          </label>
        </div>
        <div className="server-asset">
          <span className="asset-preview banner">
            {detail.server.bannerId ? <img src={`/api/files/${detail.server.bannerId}`} alt="Server banner" /> : "No banner"}
          </span>
          <label className="ghost-btn small">
            <Upload size={13} /> Change banner
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadAsset(e.target.files[0], "bannerId")} />
          </label>
        </div>
      </div>

      <label className="field">
        <span>Server name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
      </label>
      <label className="field">
        <span>Welcome message</span>
        <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={3} maxLength={500} placeholder="Use {user} to greet the new member by name." />
      </label>
      <label className="field">
        <span>Server rules</span>
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={5} maxLength={4000} />
      </label>
      <label className="switch-row">
        <div>
          <strong>Public community</strong>
          <span>Show this server in Discover so anyone can join.</span>
        </div>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
      </label>

      <div className="invite-permanent">
        <div>
          <strong>Permanent invite</strong>
          <span className="mono">{window.location.origin}/invite/{detail.server.inviteCode ?? "no permission"}</span>
        </div>
        <IconButton
          label="Copy invite link"
          onClick={async () => {
            if (!detail.server.inviteCode) return;
            await navigator.clipboard.writeText(`${window.location.origin}/invite/${detail.server.inviteCode}`);
            app.toast("Invite copied", "success");
          }}
        >
          <Copy size={14} />
        </IconButton>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary-btn" onClick={() => void save()} disabled={busy}>
          <Save size={15} /> {busy ? "Saving…" : "Save changes"}
        </button>
        {detail.server.isOwner && (
          <button
            type="button"
            className="ghost-btn danger-text"
            onClick={async () => {
              if (!window.confirm("Delete this server permanently? Everyone loses access immediately.")) return;
              try {
                await api(`/api/servers/${detail.server.id}`, { method: "DELETE" });
                await app.refreshMe(true);
                app.closeModal();
                app.navigate("/");
                app.toast("Server deleted");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not delete server", "error");
              }
            }}
          >
            <Trash2 size={15} /> Delete server
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelsTab() {
  const app = useApp();
  const detail = app.server!;
  const channels = useMemo(
    () => detail.channels.filter((c) => c.type !== "thread").sort((a, b) => a.position - b.position),
    [detail.channels],
  );

  const move = async (channel: Channel, direction: -1 | 1) => {
    const siblings = channels.filter((c) => c.category_id === channel.category_id);
    const index = siblings.findIndex((c) => c.id === channel.id);
    const target = siblings[index + direction];
    if (!target) return;
    await api(`/api/servers/${detail.server.id}/channel-order`, {
      method: "PATCH",
      body: {
        items: [
          { id: channel.id, position: target.position, categoryId: channel.category_id },
          { id: target.id, position: channel.position, categoryId: target.category_id },
        ],
      },
    });
    await app.reloadServer(true);
  };

  return (
    <div className="form-stack">
      <div className="settings-actions spread">
        <h3 className="settings-heading">Channels & categories</h3>
        <button type="button" className="primary-btn small" onClick={() => app.openModal({ type: "createChannel" })}>
          <Plus size={14} /> New channel
        </button>
      </div>
      {detail.categories.map((category) => (
        <div key={category.id} className="settings-group">
          <div className="settings-group-head">
            <span>{category.name}</span>
            <button
              type="button"
              className="ghost-btn small"
              onClick={async () => {
                const name = window.prompt("Rename category", category.name);
                if (!name) return;
                await api(`/api/servers/categories/${category.id}`, { method: "PATCH", body: { name } });
                await app.reloadServer(true);
              }}
            >
              Rename
            </button>
          </div>
          {channels
            .filter((c) => c.category_id === category.id)
            .map((channel) => (
              <div className="settings-row" key={channel.id}>
                <span className="settings-row-icon">{channel.type === "voice" ? <Volume2 size={15} /> : <Hash size={15} />}</span>
                <div className="settings-row-copy">
                  <strong>{channel.name}</strong>
                  <span>
                    {channel.type === "voice" ? "Voice" : "Text"} · position {channel.position}
                    {channel.is_private ? " · private" : ""}
                  </span>
                </div>
                <button type="button" className="ghost-btn small" onClick={() => void move(channel, -1)}>
                  ↑
                </button>
                <button type="button" className="ghost-btn small" onClick={() => void move(channel, 1)}>
                  ↓
                </button>
                <button type="button" className="ghost-btn small" onClick={() => app.openModal({ type: "channelSettings", channelId: channel.id })}>
                  Edit
                </button>
              </div>
            ))}
        </div>
      ))}
      <div className="settings-group">
        <div className="settings-group-head">
          <span>Uncategorised</span>
        </div>
        {channels
          .filter((c) => !c.category_id)
          .map((channel) => (
            <div className="settings-row" key={channel.id}>
              <span className="settings-row-icon">{channel.type === "voice" ? <Volume2 size={15} /> : <Hash size={15} />}</span>
              <div className="settings-row-copy">
                <strong>{channel.name}</strong>
                <span>{channel.type === "voice" ? "Voice" : "Text"}</span>
              </div>
              <button type="button" className="ghost-btn small" onClick={() => app.openModal({ type: "channelSettings", channelId: channel.id })}>
                Edit
              </button>
            </div>
          ))}
      </div>
      <button
        type="button"
        className="ghost-btn"
        onClick={async () => {
          const name = window.prompt("New category name");
          if (!name) return;
          await api(`/api/servers/${detail.server.id}/categories`, { method: "POST", body: { name } });
          await app.reloadServer(true);
        }}
      >
        <Plus size={14} /> Create category
      </button>
    </div>
  );
}

function permissionSummary(role: Role): string {
  if (role.is_everyone) return "Base permissions for every member";
  const count = (role.permissions >>> 0)
    .toString(2)
    .split("")
    .filter((bit) => bit === "1").length;
  return `${count} permission${count === 1 ? "" : "s"}`;
}

function RolesTab() {
  const app = useApp();
  const detail = app.server!;
  const [selectedId, setSelectedId] = useState<string | null>(detail.roles.find((r) => !r.is_everyone)?.id ?? null);
  const selected = detail.roles.find((r) => r.id === selectedId) ?? null;
  const [name, setName] = useState(selected?.name ?? "");
  const [color, setColor] = useState(selected?.color ?? "#5fe3ff");
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(selected?.name ?? "");
    setColor(selected?.color ?? "#5fe3ff");
  }, [selected?.id]);

  const meta: PermissionMeta[] = detail.permissionMeta;
  const groups = useMemo(() => {
    const map = new Map<string, PermissionMeta[]>();
    for (const entry of meta) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return [...map.entries()];
  }, [meta]);

  const togglePermission = async (entry: PermissionMeta, enabled: boolean) => {
    if (!selected) return;
    const bit = P[entry.key as keyof typeof P];
    if (!bit) return;
    let perms = selected.permissions;
    perms = enabled ? perms | bit : perms & ~bit;
    try {
      await api(`/api/servers/roles/${selected.id}`, { method: "PATCH", body: { permissions: perms } });
      await app.reloadServer(true);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not update permissions", "error");
    }
  };

  return (
    <div className="settings-split">
      <div className="role-list">
        {detail.roles
          .slice()
          .sort((a, b) => b.position - a.position)
          .map((role) => (
            <button
              type="button"
              key={role.id}
              className={cls("role-row", selectedId === role.id && "active")}
              onClick={() => setSelectedId(role.id)}
            >
              <span className="role-dot" style={{ background: role.color ?? "#8ea4c8" }} />
              <span>{role.name}</span>
              {role.is_everyone && <small>default</small>}
            </button>
          ))}
        <button
          type="button"
          className="ghost-btn small"
          onClick={async () => {
            try {
              await api(`/api/servers/${detail.server.id}/roles`, { method: "POST", body: { name: "New role", color: "#5fe3ff" } });
              await app.reloadServer(true);
            } catch (err) {
              app.toast(err instanceof Error ? err.message : "Could not create role", "error");
            }
          }}
        >
          <Plus size={13} /> Create role
        </button>
      </div>

      <div className="role-editor">
        {!selected && <p className="sidebar-empty">Pick a role to edit it.</p>}
        {selected && (
          <>
            <div className="form-inline">
              <label className="field">
                <span>Role name</span>
                <input value={name} disabled={!!selected.is_everyone} onChange={(e) => setName(e.target.value)} maxLength={32} />
              </label>
              <label className="field color-field">
                <span>Colour</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <button
                type="button"
                className="primary-btn small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/servers/roles/${selected.id}`, { method: "PATCH", body: { name, color } });
                    await app.reloadServer(true);
                    app.toast("Role updated", "success");
                  } catch (err) {
                    app.toast(err instanceof Error ? err.message : "Could not update role", "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Save size={13} /> Save
              </button>
              {!selected.is_everyone && (
                <button
                  type="button"
                  className="ghost-btn small danger-text"
                  onClick={async () => {
                    if (!window.confirm(`Delete the ${selected.name} role?`)) return;
                    await api(`/api/servers/roles/${selected.id}`, { method: "DELETE" });
                    setSelectedId(null);
                    await app.reloadServer(true);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <p className="form-hint">{permissionSummary(selected)} · role hierarchy position {selected.position}</p>

            {groups.map(([group, entries]) => (
              <div className="permission-group" key={group}>
                <span className={cls("permission-group-label", group === "Danger" && "danger-text")}>{group}</span>
                {entries.map((entry) => {
                  const bit = P[entry.key as keyof typeof P] ?? 0;
                  const enabled = selected.is_everyone ? true : (selected.permissions & bit) === bit;
                  return (
                    <label key={entry.key} className="permission-row">
                      <div>
                        <strong>{entry.label}</strong>
                        <span>{entry.description}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(enabled)}
                        disabled={Boolean(selected.is_everyone) || (selected.id !== detail.server.ownerId && entry.key === "ADMINISTRATOR")}
                        onChange={(e) => void togglePermission(entry, e.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function MembersTab() {
  const app = useApp();
  const detail = app.server!;
  const [bans, setBans] = useState<{ userId: string; username: string; reason: string | null; createdAt: number }[]>([]);
  const canBan = has(detail.permissions, P.BAN_MEMBERS);
  const canKick = has(detail.permissions, P.KICK_MEMBERS);

  const loadBans = () => {
    if (!canBan) return;
    api<{ bans: typeof bans }>(`/api/servers/${detail.server.id}/bans`)
      .then((data) => setBans(data.bans))
      .catch(() => undefined);
  };

  useEffect(loadBans, []);

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Members — {detail.members.length}</h3>
      <div className="member-admin-list">
        {detail.members.map((member) => (
          <div className="settings-row" key={member.id}>
            <Avatar user={member} size={30} showStatus />
            <div className="settings-row-copy">
              <strong style={{ color: detail.roles.find((r) => member.roleIds.includes(r.id) && !r.is_everyone)?.color ?? undefined }}>
                {member.nickname || member.displayName}
              </strong>
              <span>@{member.username}</span>
            </div>
            <button type="button" className="ghost-btn small" onClick={() => app.openModal({ type: "memberRoles", userId: member.id })}>
              Roles
            </button>
            {canKick && member.id !== detail.server.ownerId && member.id !== app.me.user.id && (
              <button
                type="button"
                className="ghost-btn small danger-text"
                onClick={async () => {
                  if (!window.confirm(`Kick ${member.displayName}?`)) return;
                  try {
                    await api(`/api/servers/${detail.server.id}/members/${member.id}`, { method: "DELETE" });
                    await app.reloadServer(true);
                  } catch (err) {
                    app.toast(err instanceof Error ? err.message : "Could not kick", "error");
                  }
                }}
              >
                Kick
              </button>
            )}
            {canBan && member.id !== detail.server.ownerId && member.id !== app.me.user.id && (
              <button
                type="button"
                className="ghost-btn small danger-text"
                onClick={async () => {
                  const reason = window.prompt(`Ban ${member.displayName}. Reason?`, "Server rules violation");
                  if (reason === null) return;
                  try {
                    await api(`/api/servers/${detail.server.id}/bans`, { method: "POST", body: { userId: member.id, reason } });
                    await app.reloadServer(true);
                    loadBans();
                    app.toast(`${member.displayName} banned`, "success");
                  } catch (err) {
                    app.toast(err instanceof Error ? err.message : "Could not ban", "error");
                  }
                }}
              >
                Ban
              </button>
            )}
          </div>
        ))}
      </div>

      {canBan && (
        <>
          <h3 className="settings-heading">Banned users — {bans.length}</h3>
          {bans.map((ban) => (
            <div className="settings-row" key={ban.userId}>
              <div className="settings-row-copy">
                <strong>{ban.username}</strong>
                <span>{ban.reason || "No reason given"} · {formatShort(ban.createdAt)}</span>
              </div>
              <button
                type="button"
                className="ghost-btn small"
                onClick={async () => {
                  await api(`/api/servers/${detail.server.id}/bans/${ban.userId}`, { method: "DELETE" });
                  loadBans();
                }}
              >
                Unban
              </button>
            </div>
          ))}
          {!bans.length && <p className="sidebar-empty">No banned users.</p>}
        </>
      )}
    </div>
  );
}

function InvitesTab() {
  const app = useApp();
  const detail = app.server!;
  const [invites, setInvites] = useState<{ code: string; uses: number; createdBy: string; expiresAt: number | null }[]>([]);

  const load = () => {
    api<{ invites: typeof invites }>(`/api/servers/${detail.server.id}/invites`)
      .then((data) => setInvites(data.invites))
      .catch(() => undefined);
  };

  useEffect(load, []);

  return (
    <div className="form-stack">
      <div className="settings-actions spread">
        <h3 className="settings-heading">Invite links</h3>
        <button
          type="button"
          className="primary-btn small"
          onClick={async () => {
            try {
              const data = await api<{ invite: { code: string } }>(`/api/servers/${detail.server.id}/invites`, {
                method: "POST",
                body: { expiresInHours: 24 },
              });
              await navigator.clipboard.writeText(`${window.location.origin}/invite/${data.invite.code}`);
              app.toast("New invite copied", "success");
              load();
            } catch (err) {
              app.toast(err instanceof Error ? err.message : "Could not create invite", "error");
            }
          }}
        >
          <Plus size={14} /> Create invite
        </button>
      </div>
      {invites.map((invite) => (
        <div className="settings-row" key={invite.code}>
          <div className="settings-row-copy">
            <strong className="mono">{invite.code}</strong>
            <span>
              {invite.uses} uses · {invite.createdBy} · {invite.expiresAt ? `expires ${formatShort(invite.expiresAt)}` : "never expires"}
            </span>
          </div>
          <IconButton
            label="Copy invite"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.code}`);
              app.toast("Copied", "success");
            }}
          >
            <Copy size={14} />
          </IconButton>
          <button
            type="button"
            className="ghost-btn small danger-text"
            onClick={async () => {
              await api(`/api/servers/${detail.server.id}/invites/${invite.code}`, { method: "DELETE" });
              load();
            }}
          >
            Revoke
          </button>
        </div>
      ))}
      {!invites.length && <p className="sidebar-empty">No active invites.</p>}
    </div>
  );
}

function EmojiTab() {
  const app = useApp();
  const detail = app.server!;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<ServerEmoji[]>(detail.emojis);
  const [busy, setBusy] = useState(false);

  useEffect(() => setEmoji(detail.emojis), [detail.emojis]);

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Custom emoji</h3>
      <div className="form-inline">
        <label className="field">
          <span>Emoji name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="zuno_glow" maxLength={24} />
        </label>
        <label className="ghost-btn small upload-btn">
          <Upload size={13} /> Upload image
          <input
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !name.trim()) {
                app.toast("Give the emoji a name first", "error");
                return;
              }
              setBusy(true);
              try {
                const uploaded = await uploadFile(file, "emoji");
                await api(`/api/servers/${detail.server.id}/emojis`, {
                  method: "POST",
                  body: { name: name.trim(), fileId: uploaded.file.id },
                });
                setName("");
                await app.reloadServer(true);
                app.toast("Emoji added", "success");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not add emoji", "error");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <p className="form-hint">Use emoji in chat with :name:. Up to 50 per server.</p>
      <div className="emoji-manage-grid">
        {emoji.map((item) => (
          <div className="emoji-manage" key={item.id}>
            <img src={`/api/files/${item.file_id}`} alt={item.name} />
            <span>:{item.name}:</span>
            <button
              type="button"
              aria-label={`Delete ${item.name}`}
              onClick={async () => {
                await api(`/api/servers/emojis/${item.id}`, { method: "DELETE" });
                setEmoji((prev) => prev.filter((e2) => e2.id !== item.id));
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!emoji.length && <p className="sidebar-empty">No custom emoji yet.</p>}
      </div>
      {busy && <p className="form-hint">Uploading…</p>}
    </div>
  );
}

function EventsTab() {
  const app = useApp();
  const detail = app.server!;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [events, setEvents] = useState(detail.events);

  useEffect(() => setEvents(detail.events), [detail.events]);

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Server events</h3>
      <div className="event-form-grid">
        <label className="field">
          <span>Event name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Neon Arena Weekly" />
        </label>
        <label className="field">
          <span>Starts</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Arena Stage" maxLength={80} />
        </label>
        <label className="field span">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={600} />
        </label>
      </div>
      <button
        type="button"
        className="primary-btn small"
        onClick={async () => {
          if (!name.trim() || !when) {
            app.toast("Event needs a name and a start time", "error");
            return;
          }
          try {
            await api(`/api/servers/${detail.server.id}/events`, {
              method: "POST",
              body: { name, description, location, startsAt: new Date(when).getTime() },
            });
            setName("");
            setDescription("");
            setWhen("");
            setLocation("");
            await app.reloadServer(true);
            app.toast("Event scheduled", "success");
          } catch (err) {
            app.toast(err instanceof Error ? err.message : "Could not create event", "error");
          }
        }}
      >
        <Plus size={14} /> Schedule event
      </button>

      <div className="event-list">
        {events.map((event) => (
          <div className="settings-row" key={event.id}>
            <div className="settings-row-copy">
              <strong>{event.name}</strong>
              <span>
                {formatShort(event.startsAt)} · {event.location || "No location"} · {event.description || "No description"}
              </span>
            </div>
            <button
              type="button"
              className="ghost-btn small danger-text"
              onClick={async () => {
                await api(`/api/servers/events/${event.id}`, { method: "DELETE" });
                setEvents((prev) => prev.filter((e2) => e2.id !== event.id));
                await app.reloadServer(true);
              }}
            >
              Cancel
            </button>
          </div>
        ))}
        {!events.length && <p className="sidebar-empty">No upcoming events.</p>}
      </div>
    </div>
  );
}

function AuditTab() {
  const app = useApp();
  const detail = app.server!;
  const [entries, setEntries] = useState<
    { id: string; action: string; actorName: string; targetType: string | null; targetId: string | null; createdAt: number; meta: string | null }[]
  >([]);

  useEffect(() => {
    api<{ entries: typeof entries }>(`/api/servers/${detail.server.id}/audit`)
      .then((data) => setEntries(data.entries))
      .catch((err) => app.toast(err instanceof Error ? err.message : "Could not load audit", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.server.id]);

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Audit log</h3>
      <p className="form-hint">Moderation actions, channel changes and role edits in this server.</p>
      <div className="audit-list">
        {entries.map((entry) => (
          <div className="audit-row" key={entry.id}>
            <span className="audit-time">{formatShort(entry.createdAt)}</span>
            <div>
              <strong>{humanAction(entry.action)}</strong>
              <span>
                {entry.actorName}
                {entry.targetType ? ` → ${entry.targetType} ${entry.targetId?.slice(0, 8) ?? ""}` : ""}
              </span>
            </div>
            {entry.meta && <code>{entry.meta.slice(0, 90)}</code>}
          </div>
        ))}
        {!entries.length && <p className="sidebar-empty">No audit entries yet.</p>}
      </div>
    </div>
  );
}

export function ChannelSettingsModal({ channelId }: { channelId: string }) {
  const app = useApp();
  const detail = app.server;
  const channel = detail?.channels.find((c) => c.id === channelId) ?? null;
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmode ?? 0);
  const [category, setCategory] = useState(channel?.category_id ?? "");
  const [isPrivate, setIsPrivate] = useState(!!channel?.is_private);
  const [roles, setRoles] = useState<{ id: string; name: string; color: string | null; is_everyone: number }[]>([]);
  const [overwrites, setOverwrites] = useState<Record<string, { allow: number; deny: number }>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    api<{ channel: Channel; permissions: number }>(`/api/channels/${channelId}`)
      .then((data) => {
        setName(data.channel.name);
        setTopic(data.channel.topic ?? "");
        setSlowmode(data.channel.slowmode);
        setCategory(data.channel.category_id ?? "");
        setIsPrivate(!!data.channel.is_private);
      })
      .catch(() => undefined);
    api<{ overwrites: { target_type: string; target_id: string; allow: number; deny: number }[]; roles: typeof roles }>(
      `/api/channels/${channelId}/overwrites`,
    )
      .then((data) => {
        setRoles(data.roles);
        const map: Record<string, { allow: number; deny: number }> = {};
        for (const row of data.overwrites) {
          if (row.target_type === "role") map[row.target_id] = { allow: row.allow, deny: row.deny };
        }
        setOverwrites(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [channelId]);

  if (!channel || !detail) {
    return (
      <Modal title="Channel settings" onClose={app.closeModal}>
        <p className="sidebar-empty">Channel unavailable.</p>
      </Modal>
    );
  }

  const setOverwrite = (roleId: string, bit: number, mode: "inherit" | "allow" | "deny") => {
    setOverwrites((prev) => {
      const current = prev[roleId] ?? { allow: 0, deny: 0 };
      let allow = current.allow & ~bit;
      let deny = current.deny & ~bit;
      if (mode === "allow") allow |= bit;
      if (mode === "deny") deny |= bit;
      return { ...prev, [roleId]: { allow, deny } };
    });
  };

  const modeFor = (roleId: string, bit: number): "inherit" | "allow" | "deny" => {
    const record = overwrites[roleId];
    if (!record) return "inherit";
    if (record.allow & bit) return "allow";
    if (record.deny & bit) return "deny";
    return "inherit";
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: { name, topic, slowmode, categoryId: category || null, isPrivate },
      });
      if (loaded && roles.length) {
        await api(`/api/channels/${channel.id}/overwrites`, {
          method: "PUT",
          body: {
            overwrites: Object.entries(overwrites)
              .filter(([, value]) => value.allow || value.deny)
              .map(([targetId, value]) => ({ targetType: "role", targetId, allow: value.allow, deny: value.deny })),
          },
        });
      }
      await app.reloadServer(true);
      app.closeModal();
      app.toast("Channel updated", "success");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not update channel", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`#${channel.name} · channel settings`}
      subtitle="Permissions are enforced by the ZUNO backend for every request."
      onClose={app.closeModal}
      wide
      footer={
        <>
          <button
            type="button"
            className="ghost-btn danger-text"
            onClick={async () => {
              if (!window.confirm(`Delete #${channel.name}? Messages will be removed.`)) return;
              try {
                await api(`/api/channels/${channel.id}`, { method: "DELETE" });
                await app.reloadServer(true);
                app.refreshMe(true);
                app.closeModal();
                app.navigate(`/channels/${detail.server.id}`);
                app.toast("Channel deleted");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not delete channel", "error");
              }
            }}
          >
            <Trash2 size={14} /> Delete channel
          </button>
          <button type="button" className="primary-btn" onClick={() => void save()} disabled={busy}>
            <Save size={15} /> {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="form-inline">
          <label className="field">
            <span>Channel name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">No category</option>
              {detail.categories.map((cat) => (
                <option value={cat.id} key={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Topic</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} />
        </label>
        <div className="form-inline">
          <label className="field">
            <span>Slow mode (seconds)</span>
            <input
              type="number"
              min={0}
              max={21600}
              value={slowmode}
              onChange={(e) => setSlowmode(Math.max(0, Math.min(21600, Number(e.target.value))))}
            />
          </label>
          <label className="switch-row inline">
            <div>
              <strong>Private channel</strong>
              <span>Hides this channel from @everyone.</span>
            </div>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          </label>
        </div>

        <h4 className="settings-heading">Role permissions</h4>
        <p className="form-hint">Inherit follows the role's server permission. Allow and deny apply only to this channel.</p>
        <div className="overwrite-table">
          <div className="overwrite-head">
            <span>Role</span>
            <span>View channel</span>
            <span>Send messages</span>
          </div>
          {roles.map((role) => (
            <div className="overwrite-row" key={role.id}>
              <span className="overwrite-role">
                <span className="role-dot" style={{ background: role.color ?? "#8ea4c8" }} />
                {role.name}
                {role.is_everyone ? " (default)" : ""}
              </span>
              {([P.VIEW_CHANNEL, P.SEND_MESSAGES] as number[]).map((bit) => (
                <select
                  key={bit}
                  value={modeFor(role.id, bit)}
                  onChange={(e) => setOverwrite(role.id, bit, e.target.value as "inherit" | "allow" | "deny")}
                  aria-label={`${role.name} permission`}
                >
                  <option value="inherit">Inherit</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function MemberRolesModal({ userId }: { userId: string }) {
  const app = useApp();
  const detail = app.server;
  const member = detail?.members.find((m) => m.id === userId);
  const [selected, setSelected] = useState<string[]>(member?.roleIds ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(member?.roleIds ?? []);
  }, [member?.id]);

  if (!detail || !member) {
    return (
      <Modal title="Member roles" onClose={app.closeModal}>
        <p className="sidebar-empty">Member not found.</p>
      </Modal>
    );
  }

  const canManage = has(detail.permissions, P.MANAGE_ROLES);
  const assignable = detail.roles.filter((role) => !role.is_everyone);

  return (
    <Modal
      title={`${member.nickname || member.displayName} · roles`}
      subtitle={`@${member.username} · joined ${formatShort(member.joinedAt)}`}
      onClose={app.closeModal}
      footer={
        canManage && (
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/servers/${detail.server.id}/members/${member.id}/roles`, {
                  method: "PUT",
                  body: { roleIds: selected },
                });
                await app.reloadServer(true);
                app.closeModal();
                app.toast("Roles updated", "success");
              } catch (err) {
                app.toast(err instanceof Error ? err.message : "Could not update roles", "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save roles
          </button>
        )
      }
    >
      <div className="member-modal-head">
        <Avatar user={member} size={54} showStatus />
        <div>
          <strong>{member.nickname || member.displayName}</strong>
          <span>{member.bio || "No bio yet."}</span>
        </div>
        <button type="button" className="ghost-btn small" onClick={() => void app.openProfile(member.id)}>
          Profile
        </button>
      </div>
      <div className="role-check-list">
        {assignable.map((role) => (
          <label key={role.id} className="role-check-row">
            <span className="role-dot" style={{ background: role.color ?? "#8ea4c8" }} />
            <span>
              {role.name}
              <small>position {role.position}</small>
            </span>
            <input
              type="checkbox"
              disabled={!canManage}
              checked={selected.includes(role.id)}
              onChange={(e) =>
                setSelected((prev) => (e.target.checked ? [...prev, role.id] : prev.filter((id) => id !== role.id)))
              }
            />
          </label>
        ))}
        {!assignable.length && <p className="sidebar-empty">No assignable roles.</p>}
      </div>
      {!canManage && <p className="form-hint">You need the Manage Roles permission to change this.</p>}
    </Modal>
  );
}
