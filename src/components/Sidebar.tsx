import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Compass,
  Crown,
  Hash,
  Inbox,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import type { Channel } from "../lib/types";
import { cls, formatEventTime, formatShort, has, P } from "../lib/utils";
import { AccountPanel, VoiceDock } from "./AccountPanel";
import { Avatar, IconButton, ZunoMark, ZunoWordmark } from "./ui";

export function Sidebar() {
  const { route, me, server, serverId, openModal, toast, refreshMe, setPanel, voice } = useApp();
  const isServer = route.name === "server";
  return (
    <aside className="sidebar">
      {isServer ? <ServerSidebar /> : <HomeSidebar />}
      <div className="sidebar-bottom">
        {voice.channelName && <VoiceDock />}
        <AccountPanel />
      </div>
    </aside>
  );
}

function HomeSidebar() {
  const { me, route, navigate, openModal, friends, openDm, toast, refreshMe } = useApp();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return me.dms;
    const q = query.toLowerCase();
    return me.dms.filter((dm) => dm.name.toLowerCase().includes(q) || dm.participants.some((p) => p.username.includes(q)));
  }, [me.dms, query]);

  const plusActive = me.user.plusActive;
  const unreadTotal = me.totals.mentions;

  return (
    <>
      <header className="sidebar-head home-head">
        <ZunoWordmark />
        <div className="head-actions">
          <IconButton label="New direct message" onClick={() => openModal({ type: "newDm" })}>
            <Plus size={17} />
          </IconButton>
          <IconButton label="Join a server" onClick={() => openModal({ type: "joinServer" })}>
            <UserPlus size={16} />
          </IconButton>
        </div>
      </header>

      <div className="sidebar-scroll">
        <label className="dm-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a conversation"
            aria-label="Find a conversation"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !filtered.length && query.trim()) openModal({ type: "newDm" });
            }}
          />
        </label>

        <nav className="sidebar-nav">
          <button type="button" className={cls(route.name === "friends" && "active")} onClick={() => navigate("/friends")}>
            <Users size={17} /> <span>Friends</span>
            {friends && friends.incoming.length > 0 && <em className="nav-badge">{friends.incoming.length}</em>}
          </button>
          <button
            type="button"
            className={cls(route.name === "home" && "active")}
            onClick={() => {
              navigate("/");
              setMenuOpen(false);
            }}
          >
            <MessageSquare size={17} /> <span>Message requests</span>
            {me.requests.length > 0 && <em className="nav-badge">{me.requests.length}</em>}
          </button>
          <button type="button" onClick={() => openModal({ type: "notifications" })}>
            <Bell size={17} /> <span>Notifications</span>
            {unreadTotal > 0 && <em className="nav-badge">{unreadTotal > 9 ? "9+" : unreadTotal}</em>}
          </button>
          <button type="button" className={cls(route.name === "discover" && "active")} onClick={() => navigate("/discover")}>
            <Compass size={17} /> <span>Discover</span>
          </button>
          <button
            type="button"
            className={cls("plus-nav", route.name === "plus" && "active")}
            onClick={() => navigate("/plus")}
          >
            <Sparkles size={17} /> <span>ZUNO PLUS</span>
            {!plusActive && <em className="plus-pill">NEW</em>}
          </button>
          <button
            type="button"
            className={cls(route.name === "staff" && "active")}
            onClick={() => navigate("/staff")}
          >
            <Briefcase size={17} /> <span>Staff applications</span>
          </button>
          {me.user.isOwner && (
            <button type="button" className={cls("owner-nav", route.name === "owner" && "active")} onClick={() => navigate("/owner")}>
              <Crown size={17} /> <span>Owner console</span>
              <em className="owner-pill">OWNER</em>
            </button>
          )}
        </nav>

        <div className="dm-lists">
          {me.requests.length > 0 && (
            <>
              <div className="section-label">
                <span>MESSAGE REQUESTS</span>
              </div>
              {me.requests.map((dm) => (
                <button
                  type="button"
                  key={dm.id}
                  className="dm-row request"
                  onClick={() => navigate(`/dm/${dm.id}`)}
                >
                  <Avatar user={dm.participants[0] ?? me.user} size={30} />
                  <span className="dm-copy">
                    <span className="dm-name">{dm.name}</span>
                    <span className="dm-preview">Wants to message you</span>
                  </span>
                  {dm.unreadCount > 0 && <span className="unread-pill">{dm.unreadCount}</span>}
                </button>
              ))}
            </>
          )}

          <div className="section-label">
            <span>DIRECT MESSAGES</span>
            <button type="button" className="section-add" title="New conversation" onClick={() => openModal({ type: "newDm" })}>
              <Plus size={13} />
            </button>
          </div>

          {filtered.map((dm) => (
            <div key={dm.id} className="dm-wrap">
              <button
                type="button"
                className={cls("dm-row", route.name === "dm" && route.channelId === dm.id && "active", dm.unreadCount > 0 && "unread")}
                onClick={() => navigate(`/dm/${dm.id}`)}
              >
                {dm.participants.length > 1 ? (
                  <span className="group-avatar">
                    {dm.participants.slice(0, 2).map((p) => (
                      <Avatar key={p.id} user={p} size={20} />
                    ))}
                  </span>
                ) : (
                  <Avatar user={dm.participants[0] ?? me.user} size={30} showStatus />
                )}
                <span className="dm-copy">
                  <span className="dm-name">
                    {dm.name}
                    {dm.participants[0]?.isOwner && <Crown size={11} className="mini-crown" />}
                  </span>
                  <span className="dm-preview">
                    {dm.lastMessage
                      ? `${dm.lastMessage.isMine ? "You: " : ""}${dm.lastMessage.preview || "Attachment"}`
                      : "Start the conversation"}
                  </span>
                </span>
                {dm.unreadCount > 0 && <span className="unread-pill">{dm.unreadCount}</span>}
                <span className="dm-time">{dm.lastMessageAt ? formatShort(dm.lastMessageAt) : ""}</span>
              </button>
              <button
                type="button"
                className="dm-close"
                title="Close conversation"
                aria-label={`Close ${dm.name}`}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api(`/api/dms/${dm.id}/members/${me.user.id}`, { method: "DELETE" });
                    await refreshMe(true);
                    toast("Conversation hidden from your list");
                  } catch {
                    toast("Could not close that conversation", "error");
                  }
                }}
              >
                <LogOut size={12} />
              </button>
            </div>
          ))}

          {!filtered.length && <p className="sidebar-empty">No conversations match “{query}”.</p>}
        </div>

      </div>
    </>
  );
}

function ServerSidebar() {
  const {
    server,
    me,
    route,
    navigate,
    openModal,
    joinVoice,
    voice,
    setPanel,
    toast,
    refreshMe,
    reloadServer,
  } = useApp();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const detail = server;
  const summary = me.servers.find((s) => s.id === detail?.server.id);
  const canManageChannels = detail ? has(detail.permissions, P.MANAGE_CHANNELS) : false;
  const canManageServer = detail ? has(detail.permissions, P.MANAGE_SERVER) : false;
  const canManageRoles = detail ? has(detail.permissions, P.MANAGE_ROLES) : false;
  const canManageEvents = detail ? has(detail.permissions, P.MANAGE_EVENTS) : false;
  const canInvite = detail ? has(detail.permissions, P.CREATE_INVITES) : false;
  const isOwner = detail?.server.isOwner;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || target.closest(".server-title")) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const grouped = useMemo(() => {
    if (!detail) return [];
    const categories = detail.categories
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        channels: detail.channels
          .filter((c) => c.category_id === cat.id && c.type !== "thread")
          .sort((a, b) => a.position - b.position),
      }));
    const loose = detail.channels
      .filter((c) => !categories.some((cat) => cat.id === c.category_id) && c.type !== "thread")
      .sort((a, b) => a.position - b.position);
    if (loose.length) categories.push({ id: "loose", name: "", channels: loose });
    return categories;
  }, [detail]);

  const voiceFor = (channelId: string) => detail?.voiceStates.filter((s) => s.channelId === channelId) ?? [];

  const handleDeleteServer = async () => {
    if (!detail) return;
    if (!window.confirm(`Delete ${detail.server.name}? Every channel, message and membership will be removed.`)) return;
    try {
      await api(`/api/servers/${detail.server.id}`, { method: "DELETE" });
      toast("Server deleted");
      await refreshMe(true);
      navigate("/");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete server", "error");
    }
  };

  if (!detail) {
    return (
      <div className="sidebar-loading">
        <ZunoMark size={28} />
        <span>Loading server…</span>
      </div>
    );
  }

  return (
    <>
      <header className="sidebar-head server-head">
        <button type="button" className="server-title" onClick={() => setMenuOpen((v) => !v)}>
          <span>{detail.server.name}</span>
          <ChevronDown size={15} />
        </button>
        <div className="head-actions">
          {canInvite && (
            <IconButton label="Invite people" onClick={() => openModal({ type: "invite", serverId: detail.server.id })}>
              <UserPlus size={16} />
            </IconButton>
          )}
        </div>
        {menuOpen && (
          <div className="server-menu" ref={menuRef} role="menu" aria-label={`${detail.server.name} menu`}>
            <div className="server-menu-hero">
              <span className="server-menu-icon">
                {detail.server.iconId ? (
                  <img src={`/api/files/${detail.server.iconId}`} alt="" />
                ) : (
                  detail.server.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="server-menu-identity">
                <strong>{detail.server.name}</strong>
                <span className="server-menu-meta">
                  <Users size={11} /> {detail.server.memberCount} members
                  <i className="server-menu-dot" />
                  {detail.server.onlineCount} online
                </span>
              </div>
              <button type="button" className="server-menu-close" aria-label="Close server menu" onClick={() => setMenuOpen(false)}>
                <X size={15} />
              </button>
            </div>
            {detail.server.description && <p className="server-menu-desc">{detail.server.description}</p>}

            <div className="server-menu-grid">
              {canInvite && (
                <button
                  type="button"
                  className="server-menu-tile"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal({ type: "invite", serverId: detail.server.id });
                  }}
                >
                  <span className="server-menu-tile-icon"><UserPlus size={17} /></span>
                  <span>Invite people</span>
                </button>
              )}
              {canManageChannels && (
                <button
                  type="button"
                  className="server-menu-tile"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal({ type: "createChannel" });
                  }}
                >
                  <span className="server-menu-tile-icon"><Plus size={17} /></span>
                  <span>Create channel</span>
                </button>
              )}
              {canManageServer && (
                <button
                  type="button"
                  className="server-menu-tile"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal({ type: "serverSettings", tab: "overview" });
                  }}
                >
                  <span className="server-menu-tile-icon"><Settings size={17} /></span>
                  <span>Server settings</span>
                </button>
              )}
              {canManageRoles && (
                <button
                  type="button"
                  className="server-menu-tile"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal({ type: "serverSettings", tab: "roles" });
                  }}
                >
                  <span className="server-menu-tile-icon"><Users size={17} /></span>
                  <span>Roles</span>
                </button>
              )}
              {canManageEvents && (
                <button
                  type="button"
                  className="server-menu-tile"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal({ type: "serverSettings", tab: "events" });
                  }}
                >
                  <span className="server-menu-tile-icon"><CalendarDays size={17} /></span>
                  <span>Events</span>
                </button>
              )}
              <button
                type="button"
                className="server-menu-tile"
                onClick={() => {
                  setMenuOpen(false);
                  setPanel({ type: "members" });
                }}
              >
                <span className="server-menu-tile-icon"><Users size={17} /></span>
                <span>Members</span>
              </button>
            </div>

            <div className="server-menu-foot">
              <button
                type="button"
                className="server-menu-leave"
                onClick={async () => {
                  setMenuOpen(false);
                  try {
                    await api(`/api/servers/${detail.server.id}/leave`, { method: "POST", body: {} });
                    await refreshMe(true);
                    navigate("/");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Could not leave", "error");
                  }
                }}
              >
                <LogOut size={14} /> Leave server
              </button>
              {isOwner && (
                <button type="button" className="server-menu-delete" onClick={() => void handleDeleteServer()}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="sidebar-scroll channel-scroll">
        {detail.events.length > 0 && (
          <div className="event-card">
            <span className="event-eyebrow">NEXT EVENT</span>
            <strong>{detail.events[0].name}</strong>
            <span>{formatEventTime(detail.events[0].startsAt)}</span>
            {detail.events[0].location && <span className="event-location">in {detail.events[0].location}</span>}
          </div>
        )}

        {grouped.map((category) => {
          const isCollapsed = collapsed[category.id];
          return (
            <div className="channel-group" key={category.id}>
              {category.name && (
                <div className="category-head">
                  <button
                    type="button"
                    className="category-toggle"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                  >
                    {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    <span>{category.name}</span>
                  </button>
                  {canManageChannels && category.id !== "loose" && (
                    <button
                      type="button"
                      className="category-add"
                      title="Create channel in this category"
                      onClick={() => openModal({ type: "createChannel", categoryId: category.id })}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
              )}
              {!isCollapsed &&
                category.channels.map((channel) => {
                  const active = route.name === "server" && route.channelId === channel.id;
                  const unread = (channel as Channel & { unreadCount?: number }).unreadCount ?? 0;
                  if (channel.type === "voice") {
                    const people = voiceFor(channel.id);
                    return (
                      <div key={channel.id} className="voice-channel-wrap">
                        <button
                          type="button"
                          className={cls("channel-row voice", active && "active", voice.channelId === channel.id && "connected")}
                          onClick={() => void joinVoice(channel)}
                        >
                          <Volume2 size={16} />
                          <span className="channel-name">{channel.name}</span>
                          {people.length > 0 && <span className="voice-count">{people.length}</span>}
                        </button>
                        {people.length > 0 && (
                          <div className="voice-people-list">
                            {people.map((person) => (
                              <div key={person.userId} className="voice-mini">
                                <Avatar
                                  user={{
                                    id: person.userId,
                                    displayName: person.displayName || person.username,
                                    username: person.username,
                                    avatarId: person.avatarId,
                                    accentColor: person.accentColor,
                                  }}
                                  size={20}
                                />
                                <span className={cls(person.screen && "screen-flag")}>{person.displayName || person.username}</span>
                                {person.muted && <MicOff size={11} />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={channel.id} className="channel-wrap">
                      <button
                        type="button"
                        className={cls("channel-row", active && "active", unread > 0 && "unread")}
                        onClick={() => navigate(`/channels/${detail.server.id}/${channel.id}`)}
                      >
                        {channel.is_private ? <Lock size={14} /> : <Hash size={16} />}
                        <span className="channel-name">{channel.name}</span>
                        {unread > 0 && <span className="unread-pill small">{unread > 9 ? "9+" : unread}</span>}
                        {canManageChannels && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="channel-gear"
                            title="Edit channel"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal({ type: "channelSettings", channelId: channel.id });
                            }}
                          >
                            <Settings size={12} />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })}

        {canManageChannels && (
          <div className="channel-actions">
            <button type="button" onClick={() => openModal({ type: "createChannel" })}>
              <Plus size={14} /> Create channel
            </button>
            <button
              type="button"
              onClick={async () => {
                const name = window.prompt("New category name");
                if (!name) return;
                try {
                  await api(`/api/servers/${detail.server.id}/categories`, { method: "POST", body: { name } });
                  await reloadServer(true);
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Could not create category", "error");
                }
              }}
            >
              <Plus size={14} /> Category
            </button>
          </div>
        )}

        {!canManageChannels && detail.channels.length === 0 && (
          <p className="sidebar-empty">No channels are visible to you yet.</p>
        )}

        <button type="button" className="sidebar-server-settings" onClick={() => setPanel({ type: "members" })}>
          <Users size={14} /> {detail.server.memberCount} members · {detail.server.onlineCount} online
        </button>
      </div>
    </>
  );
}
