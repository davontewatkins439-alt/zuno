import { useEffect, useRef } from "react";

const EVENT_NAMES = [
  "message.create",
  "message.update",
  "message.delete",
  "message.activity",
  "reaction.update",
  "pin.update",
  "typing",
  "thread.create",
  "dm.message",
  "dm.request",
  "dm.added",
  "dm.update",
  "dm.members",
  "friend.request",
  "friend.update",
  "notification",
  "announcement",
  "voice.state",
  "voice.signal",
  "call.ring",
  "call.active",
  "call.declined",
  "call.ended",
  "server.update",
  "member.join",
  "member.leave",
  "member.update",
  "channel.create",
  "channel.update",
  "channel.delete",
  "role.update",
  "emoji.update",
  "event.update",
  "plus.update",
  "badge.update",
  "account.update",
  "access.revoked",
  "server.kicked",
  "server.banned",
];

export interface LiveEvent {
  kind: string;
  scope: string;
  refId: string;
  payload: any;
  id?: number;
}

interface Options {
  channelId?: string | null;
  serverId?: string | null;
  onEvent: (event: LiveEvent) => void;
  onTransportChange?: (transport: "live" | "polling") => void;
}

/**
 * Subscribes to the ZUNO event stream (SSE backed by the D1 event log).
 * Falls back to short-interval sync polling if the stream cannot be established,
 * which keeps chats live on networks that buffer long-lived responses.
 */
export function useLiveStream({ channelId, serverId, onEvent, onTransportChange }: Options) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const transportRef = useRef(onTransportChange);
  transportRef.current = onTransportChange;

  useEffect(() => {
    let cursor = 0;
    let closed = false;
    let source: EventSource | null = null;
    let pollTimer: number | undefined;
    let fatalTimer: number | undefined;
    let lastReady = Date.now();

    const params = new URLSearchParams();
    if (channelId) params.set("channel", channelId);
    if (serverId) params.set("server", serverId);

    const dispatch = (kind: string, raw: string, id?: string) => {
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (id) {
        const numeric = Number(id);
        if (Number.isFinite(numeric)) cursor = Math.max(cursor, numeric);
      }
      if (typeof data.id === "number") cursor = Math.max(cursor, data.id);
      handlerRef.current({
        kind,
        scope: data.scope ?? "user",
        refId: data.refId ?? "",
        payload: data.payload ?? data,
        id: typeof data.id === "number" ? data.id : undefined,
      });
    };

    const startPolling = () => {
      if (closed || pollTimer) return;
      transportRef.current?.("polling");
      const tick = async () => {
        if (closed) return;
        try {
          const query = new URLSearchParams(params);
          query.set("cursor", String(cursor));
          const res = await fetch(`/api/sync?${query.toString()}`, { credentials: "same-origin" });
          if (!res.ok) return;
          const data = (await res.json()) as {
            events: { id: number; kind: string; scope: string; refId: string; payload: any }[];
            cursor: number;
          };
          for (const event of data.events ?? []) {
            cursor = Math.max(cursor, event.id);
            handlerRef.current({
              kind: event.kind,
              scope: event.scope,
              refId: event.refId,
              payload: event.payload,
              id: event.id,
            });
          }
        } catch {
          /* keep polling quietly */
        }
      };
      void tick();
      pollTimer = window.setInterval(tick, 3000);
    };

    const connect = () => {
      if (closed) return;
      try {
        source = new EventSource(`/api/stream?${params.toString()}&cursor=${cursor}`);
      } catch {
        startPolling();
        return;
      }
      source.addEventListener("ready", (raw) => {
        lastReady = Date.now();
        try {
          const data = JSON.parse((raw as MessageEvent).data);
          if (typeof data.cursor === "number" && !cursor) cursor = data.cursor;
        } catch {
          /* ignore */
        }
        transportRef.current?.("live");
      });
      for (const name of EVENT_NAMES) {
        source.addEventListener(name, (raw) => {
          const event = raw as MessageEvent;
          dispatch(name, event.data, event.lastEventId);
        });
      }
      source.onerror = () => {
        if (closed) return;
        if (source?.readyState === EventSource.CLOSED) {
          source = null;
          startPolling();
        } else if (Date.now() - lastReady > 25_000) {
          try {
            source?.close();
          } catch {
            /* noop */
          }
          source = null;
          startPolling();
        }
      };
    };

    connect();
    fatalTimer = window.setInterval(() => {
      if (closed) return;
      if (!source && !pollTimer) connect();
    }, 30_000);

    return () => {
      closed = true;
      if (source) source.close();
      if (pollTimer) window.clearInterval(pollTimer);
      if (fatalTimer) window.clearInterval(fatalTimer);
    };
  }, [channelId, serverId]);
}
