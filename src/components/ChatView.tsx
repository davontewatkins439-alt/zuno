import React, { useEffect, useMemo, useRef } from "react";
import {
  Hash,
  Lock,
  MessageSquare,
  Phone,
  Pin,
  Search,
  Settings,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import { useApp } from "../state";
import type { Message } from "../lib/types";
import { cls, formatDay, has, P } from "../lib/utils";
import { Avatar, IconButton, ZunoMark } from "./ui";
import { MessageItem, TypingIndicator } from "./MessageItem";
import { Composer } from "./Composer";

interface Item {
  kind: "day" | "unread" | "message";
  key: string;
  ts?: number;
  message?: Message;
  grouped?: boolean;
}

export function ChatView() {
  const app = useApp();
  const {
    channel,
    server,
    messages,
    messagesLoading,
    lastReadAt,
    hasMore,
    loadingOlder,
    loadOlder,
    panel,
    setPanel,
    highlightId,
    setHighlightId,
    me,
  } = app;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousChannel = useRef<string | null>(null);
  const wasNearBottom = useRef(true);

  const dm = channel && !channel.server_id ? me.dms.find((d) => d.id === channel.id) ?? me.requests.find((d) => d.id === channel.id) : null;
  const request = channel && !channel.server_id ? me.requests.find((d) => d.id === channel.id) : null;
  const peer = dm?.participants[0];

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    let lastDay = "";
    let lastAuthor = "";
    let lastTs = 0;
    let insertedUnread = false;
    const showUnread = lastReadAt > 0 && messages.some((m) => m.createdAt > lastReadAt) && messages.some((m) => m.createdAt <= lastReadAt);

    for (const message of messages) {
      const day = formatDay(message.createdAt);
      if (day !== lastDay) {
        list.push({ kind: "day", key: `day-${day}-${message.id}`, ts: message.createdAt });
        lastDay = day;
        lastAuthor = "";
      }
      if (showUnread && !insertedUnread && message.createdAt > lastReadAt) {
        list.push({ kind: "unread", key: `unread-${message.id}` });
        insertedUnread = true;
        lastAuthor = "";
      }
      const grouped =
        lastAuthor === message.author.id &&
        message.createdAt - lastTs < 5 * 60_000 &&
        !message.replyTo &&
        !message.system;
      list.push({ kind: "message", key: message.id, message, grouped });
      lastAuthor = message.author.id;
      lastTs = message.createdAt;
    }
    return list;
  }, [messages, lastReadAt]);

  const roleColors = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!server) return map;
    const rolesById = new Map(server.roles.map((r) => [r.id, r]));
    for (const member of server.members) {
      const owned = member.roleIds
        .map((id) => rolesById.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r && !r.is_everyone)
        .sort((a, b) => b.position - a.position);
      map.set(member.id, owned[0]?.color ?? null);
    }
    return map;
  }, [server]);

  useEffect(() => {
    if (channel?.id !== previousChannel.current) {
      previousChannel.current = channel?.id ?? null;
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
      return;
    }
    if (wasNearBottom.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [channel?.id, messages.length]);

  useEffect(() => {
    const onScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    };
    const el = scrollRef.current;
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => el?.removeEventListener("scroll", onScroll);
  }, [channel?.id]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${highlightId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => setHighlightId(null), 2400);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [highlightId, messages.length, setHighlightId]);

  useEffect(() => {
    if (window.location.hash.length > 2) {
      const id = window.location.hash.slice(1);
      setHighlightId(id);
      history.replaceState({}, "", window.location.pathname + window.location.search);
    }
    // Only run when the channel changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  if (!channel) {
    return (
      <section className="chat empty-chat">
        <div className="empty-chat-art">
          <ZunoMark size={72} />
          <h2>{messagesLoading ? "Opening your city…" : "Pick a conversation"}</h2>
          <p>Choose a server channel or a direct message on the left to start talking.</p>
        </div>
      </section>
    );
  }

  const isServerChannel = !!channel.server_id;
  const canManageChannel = isServerChannel && has(app.channelPermissions, P.MANAGE_CHANNELS);
  const canManageMembers = isServerChannel && has(app.channelPermissions, P.VIEW_CHANNEL);
  const topic = channel.topic;
  const isVoice = channel.type === "voice";

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-head-main">
          <span className="chat-head-icon">
            {isVoice ? <Volume2 size={20} /> : channel.is_private ? <Lock size={18} /> : <Hash size={20} />}
          </span>
          <h1>
            {dm ? dm.name : channel.name}
            {channel.is_private ? <Lock size={12} className="head-lock" /> : null}
          </h1>
          {dm && peer && (
            <span className="dm-head-status">
              <span className={cls("presence-text", peer.status)}>{peer.status === "offline" ? "Offline" : peer.status}</span>
            </span>
          )}
          {isServerChannel && topic && (
            <>
              <span className="head-divider" />
              <p className="chat-topic" title={topic}>
                {topic}
              </p>
            </>
          )}
        </div>
        <div className="chat-head-actions">
          <IconButton
            label="Search messages"
            active={panel.type === "search"}
            onClick={() => setPanel({ type: panel.type === "search" ? "none" : "search" })}
          >
            <Search size={17} />
          </IconButton>
          <IconButton
            label="Pinned messages"
            active={panel.type === "pins"}
            onClick={() => setPanel({ type: panel.type === "pins" ? "none" : "pins" })}
          >
            <Pin size={17} />
          </IconButton>
          {dm && !request && (
            <>
              <IconButton label="Start voice call" onClick={() => void app.startCall("audio")}>
                <Phone size={17} />
              </IconButton>
              <IconButton label="Start video call" onClick={() => void app.startCall("video")}>
                <Video size={17} />
              </IconButton>
            </>
          )}
          {isServerChannel && (
            <IconButton
              label="Members"
              active={panel.type === "members"}
              onClick={() => setPanel({ type: panel.type === "members" ? "none" : "members" })}
            >
              <Users size={17} />
            </IconButton>
          )}
          {canManageChannel && (
            <IconButton label="Channel settings" onClick={() => app.openModal({ type: "channelSettings", channelId: channel.id })}>
              <Settings size={17} />
            </IconButton>
          )}
        </div>
      </header>

      {request && (
        <div className="request-banner">
          <div>
            <strong>{request.name} wants to message you.</strong>
            <span>Accept to move this conversation into your inbox, or decline to dismiss it.</span>
          </div>
          <div className="request-actions">
            <button
              type="button"
              className="primary-btn small"
              onClick={async () => {
                await import("../lib/api").then(({ api }) =>
                  api(`/api/dms/${channel.id}/accept`, { method: "POST", body: {} }).then(() => app.refreshMe(true)),
                );
              }}
            >
              Accept
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={async () => {
                const { api } = await import("../lib/api");
                await api(`/api/dms/${channel.id}/members/${me.user.id}`, { method: "DELETE" });
                await app.refreshMe(true);
                app.navigate("/");
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="message-scroll" ref={scrollRef}>
        {hasMore && (
          <div className="load-older">
            <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        <div className="channel-intro">
          <span className="intro-icon">
            {isVoice ? <Volume2 size={30} /> : channel.is_private ? <Lock size={26} /> : <Hash size={32} />}
          </span>
          <h2>
            Welcome to {isVoice ? "" : "#"}
            {channel.name}
          </h2>
          <p>
            {dm
              ? `This is the beginning of your direct message history with ${dm.name}. Say something worth remembering.`
              : topic || `This is the start of the #${channel.name} channel.`}
          </p>
          {isServerChannel && (
            <button
              type="button"
              className="intro-member"
              onClick={() => app.openModal({ type: "invite", serverId: channel.server_id ?? undefined })}
            >
              <Users size={13} /> Invite a friend into this channel
            </button>
          )}
        </div>

        {items.map((item) => {
          if (item.kind === "day") {
            return (
              <div className="day-divider" key={item.key}>
                <span>{formatDay(item.ts ?? Date.now())}</span>
              </div>
            );
          }
          if (item.kind === "unread") {
            return (
              <div className="unread-divider" key={item.key}>
                <span>NEW MESSAGES</span>
              </div>
            );
          }
          return (
            <MessageItem
              key={item.key}
              message={item.message!}
              grouped={!!item.grouped}
              roleColor={roleColors.get(item.message!.author.id) ?? null}
              highlighted={highlightId === item.message!.id}
            />
          );
        })}

        {isVoice && (
          <div className="voice-channel-prompt">
            <Volume2 size={22} />
            <div>
              <strong>{channel.name}</strong>
              <p>Join this voice room to talk and share your screen with everyone inside.</p>
            </div>
            <button type="button" className="primary-btn small" onClick={() => void app.joinVoice(channel)}>
              Join voice
            </button>
          </div>
        )}

        {!messages.length && !messagesLoading && !isVoice && (
          <div className="empty-messages">
            <MessageSquare size={20} />
            <span>No messages yet. Be the first to say something.</span>
          </div>
        )}

        {messagesLoading && (
          <div className="messages-loading">
            <span className="spinner" /> Loading messages…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-composer-area">
        <TypingIndicator />
        {dm && (
          <div className="dm-header-note">
            {peer && <Avatar user={peer} size={26} showStatus />}
            <span>
              {dm.participants.length > 1
                ? `${dm.participants.length} people in this conversation`
                : `This is the start of your conversation with ${dm.name}`}
            </span>
          </div>
        )}
        <Composer />
      </div>
    </section>
  );
}
