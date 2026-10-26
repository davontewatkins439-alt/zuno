import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Compass,
  Crown,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import { compact, formatShort } from "../lib/utils";
import { Avatar, BadgeRow, IconButton, StatusDot, Verified, ZunoMark, ZunoWordmark } from "./ui";
import { DownloadCard } from "./DownloadCard";

export function HomeView() {
  const { me, navigate, openModal, openDm } = useApp();
  const onlineFriends = useApp().friends?.friends.filter((f) => f.status !== "offline") ?? [];

  return (
    <section className="home-view">
      <div className="home-hero">
        <div className="home-hero-glow" />
        <div className="home-hero-copy">
          <span className="eyebrow">
            <ZunoMark size={16} /> {me.config.siteName}
          </span>
          <h1>
            Your city <span>after dark.</span>
          </h1>
          <p>
            {me.config.tagline} Jump into a community, start a voice room, or slide into a friend's DMs. Everything here is
            live and real.
          </p>
          <div className="home-hero-actions">
            <button type="button" className="primary-btn" onClick={() => openModal({ type: "createServer" })}>
              <Plus size={16} /> Create a server
            </button>
            <button type="button" className="ghost-btn" onClick={() => navigate("/discover")}>
              <Compass size={16} /> Discover communities
            </button>
          </div>
        </div>
        <div className="home-hero-stats">
          <div>
            <strong>{me.servers.length}</strong>
            <span>communities</span>
          </div>
          <div>
            <strong>{me.dms.length}</strong>
            <span>conversations</span>
          </div>
          <div>
            <strong>{me.totals.mentions}</strong>
            <span>unread pings</span>
          </div>
        </div>
      </div>

      <div className="home-grid">
        <section className="home-column">
          <div className="home-section-head">
            <h2>From the ZUNO team</h2>
            <span className="home-section-note">Platform announcements</span>
          </div>
          <div className="announcement-list">
            {me.announcements.length === 0 && (
              <div className="panel-empty">
                <Sparkles size={22} />
                <strong>Quiet on the wire</strong>
                <span>Platform announcements will show up here.</span>
              </div>
            )}
            {me.announcements.map((item) => (
              <article className="announcement-card" key={item.id}>
                <div className="announcement-meta">
                  <span className="announcement-avatar">
                    <ZunoMark size={18} />
                  </span>
                  <strong>ZUNO</strong>
                  <span className="official-tag">OFFICIAL</span>
                  <time>{formatShort(item.createdAt)}</time>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>

          {me.user.isOwner && (
            <button type="button" className="owner-banner" onClick={() => navigate("/owner")}>
              <span className="owner-banner-icon">
                <Crown size={22} />
              </span>
              <span className="owner-banner-copy">
                <strong>You are the ZUNO Owner</strong>
                <span>Staff tools, badges, moderation, PLUS and platform configuration are waiting.</span>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
        </section>

        <section className="home-column">
          <div className="home-section-head">
            <h2>Your communities</h2>
            <button type="button" className="link-btn" onClick={() => navigate("/discover")}>
              Browse all
            </button>
          </div>
          <div className="community-list">
            {me.servers.map((server) => (
              <button
                type="button"
                key={server.id}
                className="community-card"
                onClick={() => navigate(`/channels/${server.id}`)}
              >
                <span className="community-icon">
                  {server.iconId ? <img src={`/api/files/${server.iconId}`} alt="" /> : server.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="community-copy">
                  <strong>{server.name}</strong>
                  <span>{server.description || "A ZUNO community"}</span>
                </span>
                {server.unreadCount > 0 && <span className="unread-pill">{server.unreadCount}</span>}
                <ArrowRight size={15} />
              </button>
            ))}
            {!me.servers.length && (
              <div className="panel-empty">
                <Users size={22} />
                <strong>No communities yet</strong>
                <span>Create your own or join one from Discover.</span>
              </div>
            )}
          </div>

          <div className="home-section-head">
            <h2>Recent conversations</h2>
          </div>
          <div className="recent-dms">
            {me.dms.slice(0, 4).map((dm) => (
              <button type="button" key={dm.id} className="recent-dm" onClick={() => navigate(`/dm/${dm.id}`)}>
                <Avatar user={dm.participants[0] ?? me.user} size={32} showStatus />
                <span>
                  <strong>{dm.name}</strong>
                  <small>{dm.lastMessage?.preview || "Start the conversation"}</small>
                </span>
                <time>{dm.lastMessageAt ? formatShort(dm.lastMessageAt) : ""}</time>
              </button>
            ))}
            {!me.dms.length && (
              <button type="button" className="ghost-btn" onClick={() => openModal({ type: "newDm" })}>
                <MessageSquare size={15} /> Start your first conversation
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="home-desktop">
        <div className="home-section-head">
          <h2>Get ZUNO on your desktop</h2>
          <span className="home-section-note">Same account, native window</span>
        </div>
        <DownloadCard />
      </section>
    </section>
  );
}

export function FriendsView() {
  const app = useApp();
  const { friends, refreshFriends, openDm, addFriend, selectFriendRequest, toast, me } = app;
  const [tab, setTab] = useState<"online" | "all" | "pending" | "blocked" | "add">("online");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!friends) void refreshFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = useMemo(() => friends?.friends.filter((f) => f.status !== "offline") ?? [], [friends]);
  const list = tab === "online" ? online : friends?.friends ?? [];

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    try {
      await addFriend(username.trim());
      setUsername("");
      setTab("pending");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send request", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="friends-view">
      <header className="friends-head">
        <div className="friends-title">
          <Users size={20} />
          <h1>Friends</h1>
          <div className="segmented">
            {(["online", "all", "pending", "blocked"] as const).map((value) => (
              <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
                {value === "online" ? `Online (${online.length})` : value.charAt(0).toUpperCase() + value.slice(1)}
                {value === "pending" && (friends?.incoming.length ?? 0) > 0 && (
                  <em className="nav-badge">{(friends?.incoming.length ?? 0)}</em>
                )}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={tab === "add" ? "primary-btn" : "primary-btn"} onClick={() => setTab("add")}>
          <UserPlus size={16} /> Add friend
        </button>
      </header>

      {tab === "add" && (
        <div className="add-friend-card">
          <h2>Add a friend</h2>
          <p>You can add friends with their ZUNO username. It is as easy as that.</p>
          <form onSubmit={submitAdd}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter a username, e.g. nova"
              aria-label="Friend username"
            />
            <button type="submit" className="primary-btn" disabled={busy || username.trim().length < 3}>
              Send friend request
            </button>
          </form>
          {friends?.outgoing.length ? (
            <div className="pending-block">
              <span className="section-label">SENT REQUESTS</span>
              {friends.outgoing.map((request) => (
                <div className="friend-row" key={request.id}>
                  <Avatar user={request.user} size={34} showStatus />
                  <div className="friend-copy">
                    <strong>{request.user.displayName}</strong>
                    <span>@{request.user.username}</span>
                  </div>
                  <span className="pending-pill">Pending</span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={async () => {
                      await selectFriendRequest(request.id, false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {tab === "pending" && (
        <div className="friend-section">
          <span className="section-label">INCOMING — {friends?.incoming.length ?? 0}</span>
          {(friends?.incoming ?? []).map((request) => (
            <div className="friend-row" key={request.id}>
              <Avatar user={request.user} size={38} showStatus />
              <div className="friend-copy">
                <strong>
                  {request.user.displayName}
                  {request.user.isOwner && <Verified />}
                </strong>
                <span>{request.message || `@${request.user.username} wants to be friends`}</span>
                <BadgeRow badges={request.user.badges} max={3} compact />
              </div>
              <div className="friend-actions">
                <button type="button" className="accept-btn" onClick={() => void selectFriendRequest(request.id, true)}>
                  <Check size={15} /> Accept
                </button>
                <button type="button" className="decline-btn" onClick={() => void selectFriendRequest(request.id, false)}>
                  <X size={15} /> Ignore
                </button>
              </div>
            </div>
          ))}
          {!friends?.incoming.length && <p className="sidebar-empty">No pending requests right now.</p>}

          <span className="section-label">OUTGOING — {friends?.outgoing.length ?? 0}</span>
          {(friends?.outgoing ?? []).map((request) => (
            <div className="friend-row" key={request.id}>
              <Avatar user={request.user} size={38} showStatus />
              <div className="friend-copy">
                <strong>{request.user.displayName}</strong>
                <span>@{request.user.username}</span>
              </div>
              <span className="pending-pill">Pending</span>
              <button type="button" className="ghost-btn" onClick={() => void selectFriendRequest(request.id, false)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "blocked" && (
        <div className="friend-section">
          <span className="section-label">BLOCKED — {friends?.blocked.length ?? 0}</span>
          {(friends?.blocked ?? []).map((user) => (
            <div className="friend-row" key={user.id}>
              <Avatar user={user} size={38} />
              <div className="friend-copy">
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={async () => {
                  await api(`/api/users/${user.id}/block`, { method: "POST", body: { blocked: false } });
                  await refreshFriends();
                  toast(`${user.displayName} unblocked`, "success");
                }}
              >
                Unblock
              </button>
            </div>
          ))}
          {!friends?.blocked.length && <p className="sidebar-empty">Nobody is blocked.</p>}
        </div>
      )}

      {(tab === "online" || tab === "all") && (
        <div className="friend-section">
          <span className="section-label">
            {tab === "online" ? "ONLINE" : "ALL FRIENDS"} — {list.length}
          </span>
          {list.map((friend) => (
            <div className="friend-row" key={friend.id}>
              <Avatar user={friend} size={40} showStatus decoration={friend.plusDecoration} />
              <div className="friend-copy">
                <strong>
                  {friend.displayName}
                  {friend.isOwner && <Verified />}
                  {friend.plusActive && <Sparkles size={12} className="plus-icon" />}
                </strong>
                <span>
                  {friend.customStatus || (friend.status === "offline" ? "Offline" : `@${friend.username}`)}
                </span>
                <BadgeRow badges={friend.badges} max={3} compact />
              </div>
              <div className="friend-actions">
                <button type="button" className="icon-action" title="Message" onClick={() => void openDm(friend.id)}>
                  <MessageSquare size={16} />
                </button>
                <button
                  type="button"
                  className="icon-action danger"
                  title="Remove friend"
                  onClick={async () => {
                    if (!window.confirm(`Remove ${friend.displayName} from your friends?`)) return;
                    await api(`/api/friends/${friend.id}`, { method: "DELETE" });
                    await refreshFriends();
                    await app.refreshMe(true);
                    toast("Friend removed");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
          {!list.length && (
            <div className="panel-empty">
              <Users size={24} />
              <strong>{tab === "online" ? "Nobody is around right now" : "Your friend list is empty"}</strong>
              <span>Add people by username or meet them in a community.</span>
              <button type="button" className="primary-btn small" onClick={() => setTab("add")}>
                <UserPlus size={14} /> Add a friend
              </button>
            </div>
          )}
        </div>
      )}

      {friends && friends.friends.length > 0 && (
        <div className="friends-self-note">
          <StatusDot status={me.user.status} /> You are {me.user.status === "offline" ? "appearing offline" : `visible as ${me.user.status}`} ·{" "}
          {compact(friends.friends.length)} friends
        </div>
      )}
    </section>
  );
}

export function DiscoverView() {
  const app = useApp();
  const { discover, loadDiscover, navigate, refreshMe, openModal, toast, me } = app;
  const [query, setQuery] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "joined">("all");

  useEffect(() => {
    if (!discover) void loadDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = (discover ?? []).filter((server) => {
    if (filter === "joined" && !server.joined) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return server.name.toLowerCase().includes(q) || (server.description ?? "").toLowerCase().includes(q);
  });

  return (
    <section className="discover-view">
      <div className="discover-hero">
        <span className="eyebrow">
          <Compass size={15} /> COMMUNITY DISCOVERY
        </span>
        <h1>Find your people.</h1>
        <p>Public ZUNO communities, from midnight studios to neon arenas. Join with one click.</p>
        <div className="discover-controls">
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities"
              aria-label="Search communities"
            />
          </label>
          <div className="segmented">
            <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              All
            </button>
            <button type="button" className={filter === "joined" ? "active" : ""} onClick={() => setFilter("joined")}>
              Already joined
            </button>
          </div>
          <button type="button" className="primary-btn" onClick={() => openModal({ type: "createServer" })}>
            <Plus size={15} /> Create
          </button>
        </div>
      </div>

      <div className="discover-grid">
        {filtered.map((server) => (
          <article className="discover-card" key={server.id}>
            <div className="discover-banner" style={{ background: `linear-gradient(120deg, ${server.id ? "#2f7cff33" : "#000"}, transparent)` }} />
            <div className="discover-card-body">
              <div className="discover-card-head">
                <span className="discover-icon">
                  {server.iconId ? <img src={`/api/files/${server.iconId}`} alt="" /> : server.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3>
                    {server.name}
                    {server.joined && <Check size={14} className="joined-check" />}
                  </h3>
                  <span className="discover-meta">
                    <StatusDot status="online" size={7} /> {compact(server.onlineCount)} online · {compact(server.memberCount)} members
                  </span>
                </div>
              </div>
              <p>{server.description || "A ZUNO community."}</p>
              {server.categories.length > 0 && (
                <div className="tag-row">
                  {server.categories.slice(0, 3).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="discover-channels">
                {server.channels.slice(0, 5).map((channel, index) => (
                  <span key={`${server.id}-${index}`}>
                    {channel.type === "voice" ? "🔊" : "#"} {channel.name}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className={server.joined ? "ghost-btn full" : "primary-btn full"}
                disabled={joining === server.id}
                onClick={async () => {
                  if (server.joined) {
                    navigate(`/channels/${server.id}`);
                    return;
                  }
                  setJoining(server.id);
                  try {
                    if (!server.isPublic) {
                      toast("This community is invite-only. Ask a member for an invite link.", "info");
                      return;
                    }
                    await api(`/api/servers/${server.id}/join`, { method: "POST", body: {} });
                    await refreshMe(true);
                    await loadDiscover(query);
                    navigate(`/channels/${server.id}`);
                    toast(`Joined ${server.name}`, "success");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Could not join", "error");
                  } finally {
                    setJoining(null);
                  }
                }}
              >
                {server.joined ? "Open community" : joining === server.id ? "Joining…" : "Join community"}
              </button>
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className="panel-empty discover-empty">
            <Compass size={26} />
            <strong>{discover ? "No communities match that search" : "Loading communities…"}</strong>
            <span>Try another keyword, or create your own ZUNO server.</span>
          </div>
        )}
      </div>
    </section>
  );
}
