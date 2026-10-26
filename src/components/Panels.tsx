import React, { useEffect, useMemo, useState } from "react";
import { Hash, MessageSquare, Pin, Search, X } from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import type { Channel, Message, ServerDetail } from "../lib/types";
import { cls, formatShort, formatTime } from "../lib/utils";
import { Avatar, IconButton } from "./ui";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import { MemberPanel } from "./MemberPanel";

export function PinsPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const channel = app.channel;
  const [pins, setPins] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    setLoading(true);
    api<{ pins: Message[] }>(`/api/channels/${channel.id}/pins`)
      .then((data) => !cancelled && setPins(data.pins))
      .catch(() => !cancelled && setPins([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [channel?.id, app.messages.length]);

  return (
    <aside className="side-panel">
      <header className="side-panel-head">
        <h3>
          <Pin size={15} /> Pinned messages
        </h3>
        <IconButton label="Close pins" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="side-panel-scroll">
        {loading && <p className="sidebar-empty">Loading pins…</p>}
        {!loading && !pins.length && (
          <div className="panel-empty">
            <Pin size={22} />
            <strong>Nothing pinned yet</strong>
            <span>Pin important messages so nobody loses them.</span>
          </div>
        )}
        {pins.map((message) => (
          <div className="pin-card" key={message.id}>
            <div className="pin-head">
              <Avatar user={message.author} size={22} />
              <strong>{message.author.displayName}</strong>
              <time>{formatShort(message.createdAt)}</time>
              {message.pinned && (
                <button
                  type="button"
                  className="pin-remove"
                  title="Unpin message"
                  onClick={async () => {
                    await app.togglePin(message.id, true);
                    setPins((prev) => prev.filter((p) => p.id !== message.id));
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <p>{message.content || (message.attachments.length ? "Attachment" : "Sticker")}</p>
            <button
              type="button"
              className="jump-btn"
              onClick={() => {
                app.setHighlightId(message.id);
                const el = document.querySelector(`[data-message-id="${message.id}"]`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Jump to message
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"channel" | "server">("channel");
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const channel = app.channel;

  useEffect(() => {
    if (!query.trim() || !channel) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const path =
          scope === "channel"
            ? `/api/channels/${channel.id}/search?q=${encodeURIComponent(query.trim())}`
            : `/api/servers/${channel.server_id}/search?q=${encodeURIComponent(query.trim())}`;
        const data = await api<{ results: Message[] }>(path);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 260);
    return () => window.clearTimeout(handle);
  }, [query, scope, channel?.id, channel?.server_id]);

  const jump = (message: Message) => {
    if (!channel) return;
    if (message.channelId === channel.id) {
      app.setHighlightId(message.id);
      const el = document.querySelector(`[data-message-id="${message.id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (channel.server_id) {
      app.setHighlightId(message.id);
      app.navigate(`/channels/${channel.server_id}/${message.channelId}`);
    }
    onClose();
  };

  return (
    <aside className="side-panel search-panel">
      <header className="side-panel-head">
        <h3>
          <Search size={15} /> Search
        </h3>
        <IconButton label="Close search" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="search-controls">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={channel ? `Search ${scope === "channel" ? `#${channel.name}` : app.server?.server.name ?? "server"}` : "Search"}
          aria-label="Search messages"
        />
        {channel?.server_id && (
          <div className="segmented">
            <button type="button" className={cls(scope === "channel" && "active")} onClick={() => setScope("channel")}>
              This channel
            </button>
            <button type="button" className={cls(scope === "server" && "active")} onClick={() => setScope("server")}>
              Whole server
            </button>
          </div>
        )}
      </div>
      <div className="side-panel-scroll">
        {loading && <p className="sidebar-empty">Searching…</p>}
        {!loading && query && !results.length && <p className="sidebar-empty">No messages matched “{query}”.</p>}
        {results.map((message) => (
          <button type="button" className="search-result" key={message.id} onClick={() => jump(message)}>
            <div className="search-result-head">
              <Hash size={12} />
              <span>{message.channelName ?? channel?.name}</span>
              <time>{formatShort(message.createdAt)}</time>
            </div>
            <p>{message.content || "Attachment"}</p>
            <span className="search-author">
              {message.author.displayName} · {formatTime(message.createdAt)}
            </span>
          </button>
        ))}
        {!query && (
          <div className="panel-empty">
            <Search size={22} />
            <strong>Find anything</strong>
            <span>Search messages, links and moments across this community.</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export function ThreadPanel({
  channelId,
  name,
  onClose,
}: {
  channelId: string;
  name: string;
  onClose: () => void;
}) {
  const app = useApp();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [info, history] = await Promise.all([
        api<{ channel: Channel; permissions: number }>(`/api/channels/${channelId}`),
        api<{ messages: Message[] }>(`/api/channels/${channelId}/messages?limit=50`),
      ]);
      setChannel(info.channel);
      setMessages(history.messages);
      await api(`/api/channels/${channelId}/read`, { method: "POST", body: {} }).catch(() => undefined);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return (
    <aside className="side-panel thread-panel">
      <header className="side-panel-head">
        <h3>
          <MessageSquare size={15} /> {channel?.name ?? name}
        </h3>
        <IconButton label="Close thread" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="side-panel-scroll thread-scroll">
        {loading && <p className="sidebar-empty">Loading thread…</p>}
        {!loading && !messages.length && <p className="sidebar-empty">No replies yet. Start the thread.</p>}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const grouped =
            !!previous &&
            previous.author.id === message.author.id &&
            message.createdAt - previous.createdAt < 5 * 60_000 &&
            !message.replyTo;
          return <MessageItem key={message.id} message={message} grouped={grouped} />;
        })}
      </div>
      <div className="thread-composer">
        <Composer channelId={channelId} placeholder="Reply in thread" compact onSent={() => void load()} />
      </div>
    </aside>
  );
}

export function RightPanel({ onCloseMembers }: { onCloseMembers: () => void }) {
  const { panel, server } = useApp();
  if (panel.type === "pins") return <PinsPanel onClose={onCloseMembers} />;
  if (panel.type === "search") return <SearchPanel onClose={onCloseMembers} />;
  if (panel.type === "thread") {
    return <ThreadPanel channelId={panel.channelId} name={panel.name} onClose={onCloseMembers} />;
  }
  if (panel.type === "members" && server) return <MemberPanel onClose={onCloseMembers} />;
  return null;
}
