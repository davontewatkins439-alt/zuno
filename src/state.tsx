import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, api } from "./lib/api";
import { VoiceClient, type VoiceSnapshot } from "./lib/voice";
import { useLiveStream, type LiveEvent } from "./lib/live";
import { playJoinSound, playLeaveSound, startRingback, startRingtone, stopRingtone } from "./lib/ringtone";
import { notifyDesktop } from "./lib/desktop";
import { playOutputTest } from "./lib/audio-devices";
import type {
  CallInfo,
  Channel,
  DMChannel,
  DiscoverServer,
  Folder,
  FriendsData,
  Me,
  Message,
  Notification,
  ServerDetail,
  UserProfile,
} from "./lib/types";

export type Route =
  | { name: "home" }
  | { name: "friends" }
  | { name: "discover" }
  | { name: "plus" }
  | { name: "staff" }
  | { name: "owner" }
  | { name: "invite"; code: string }
  | { name: "server"; serverId: string; channelId?: string }
  | { name: "dm"; channelId: string };

export type Panel =
  | { type: "none" }
  | { type: "members" }
  | { type: "pins" }
  | { type: "search" }
  | { type: "thread"; channelId: string; messageId: string; name: string };

export type Modal =
  | { type: "createServer" }
  | { type: "joinServer" }
  | { type: "invite"; serverId?: string; channelId?: string }
  | { type: "serverSettings"; tab?: string }
  | { type: "createChannel"; categoryId?: string }
  | { type: "newDm" }
  | { type: "channelSettings"; channelId: string }
  | { type: "userSettings"; tab?: "profile" | "plus" | "appearance" | "voice" | "account" }
  | { type: "profile"; userId: string }
  | { type: "report"; targetUserId?: string; messageId?: string; serverId?: string }
  | { type: "notifications" }
  | { type: "memberRoles"; userId: string }
  | { type: "appeal" }
  | { type: "keyboard" };

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

interface Store {
  me: Me;
  folders: Folder[];
  setMe: React.Dispatch<React.SetStateAction<Me>>;
  refreshMe: (quiet?: boolean) => Promise<void>;
  route: Route;
  navigate: (path: string, replace?: boolean) => void;
  serverId: string | null;
  channelId: string | null;
  server: ServerDetail | null;
  serverLoading: boolean;
  channel: Channel | null;
  channelPermissions: number;
  messages: Message[];
  messagesLoading: boolean;
  hasMore: boolean;
  lastReadAt: number;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  reloadServer: (quiet?: boolean) => Promise<void>;
  friends: FriendsData | null;
  refreshFriends: () => Promise<void>;
  discover: DiscoverServer[] | null;
  loadDiscover: (query?: string) => Promise<void>;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  modal: Modal | null;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
  profile: UserProfile | null;
  profileLoading: boolean;
  openProfile: (userId: string) => Promise<void>;
  clearProfile: () => void;
  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  pendingReply: Message | null;
  setPendingReply: (message: Message | null) => void;
  sendMessage: (input: {
    content: string;
    attachmentIds?: string[];
    sticker?: string | null;
    gifUrl?: string | null;
  }) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string, mine: boolean) => Promise<void>;
  togglePin: (messageId: string, pinned: boolean) => Promise<void>;
  openThread: (message: Message) => Promise<void>;
  submitTyping: () => void;
  typingUsers: { userId: string; name: string; until: number }[];
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
  notifications: Notification[];
  loadNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  voice: VoiceSnapshot;
  micMuted: boolean;
  deafened: boolean;
  call: CallInfo | null;
  startCall: (kind: "audio" | "video") => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  resumeCallAudio: () => Promise<void>;
  testSpeaker: () => Promise<void>;
  applyVoiceOutput: () => void;
  localCamera: MediaStream | null;
  getRemoteVideo: (userId: string) => MediaStream | null;
  joinVoice: (channel: Channel) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  localScreen: MediaStream | null;
  remoteScreen: MediaStream | null;
  transport: "live" | "polling";
  openDm: (userId: string) => Promise<void>;
  selectFriendRequest: (id: string, accept: boolean) => Promise<void>;
  addFriend: (username: string, message?: string) => Promise<void>;
  logout: () => Promise<void>;
  serverCacheTick: number;
}

const AppContext = createContext<Store | null>(null);

export function useApp(): Store {
  const store = useContext(AppContext);
  if (!store) throw new Error("useApp must be used inside AppProvider");
  return store;
}

const emptyVoice: VoiceSnapshot = {
  connected: false,
  connecting: false,
  channelId: null,
  channelName: null,
  serverId: null,
  participants: [],
  muted: false,
  deafened: false,
  screenSharing: false,
  screenUserId: null,
  cameraOn: false,
  isCall: false,
  audioBlocked: false,
  error: null,
};

function parseRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "home" };
  if (path === "/friends") return { name: "friends" };
  if (path === "/discover") return { name: "discover" };
  if (path === "/plus") return { name: "plus" };
  if (path === "/staff") return { name: "staff" };
  if (path === "/owner") return { name: "owner" };
  const invite = path.match(/^\/invite\/([^/]+)$/);
  if (invite) return { name: "invite", code: decodeURIComponent(invite[1]) };
  const channel = path.match(/^\/channels\/([^/]+)(?:\/([^/]+))?$/);
  if (channel) return { name: "server", serverId: channel[1], channelId: channel[2] };
  const dm = path.match(/^\/dm\/([^/]+)$/);
  if (dm) return { name: "dm", channelId: dm[1] };
  return { name: "home" };
}

interface Props {
  initialMe: Me;
  onSessionLost: () => void;
  children: React.ReactNode;
}

export function AppProvider({ initialMe, onSessionLost, children }: Props) {
  const [me, setMe] = useState<Me>(initialMe);
  const [route, setRoute] = useState<Route>(parseRoute);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [channelPermissions, setChannelPermissions] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(0);
  const [friends, setFriends] = useState<FriendsData | null>(null);
  const [discover, setDiscover] = useState<DiscoverServer[] | null>(null);
  const [panel, setPanelState] = useState<Panel>({ type: "members" });
  const [modal, setModal] = useState<Modal | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingReply, setPendingReply] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string; until: number }[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [voice, setVoice] = useState<VoiceSnapshot>(emptyVoice);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [transport, setTransport] = useState<"live" | "polling">("live");
  const [serverCacheTick, setServerCacheTick] = useState(0);

  const meRef = useRef(me);
  meRef.current = me;
  const serverRef = useRef(server);
  serverRef.current = server;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const routeRef = useRef(route);
  routeRef.current = route;
  const channelIdRef = useRef<string | null>(null);
  const meRefreshTimer = useRef<number | undefined>(undefined);
  const serverRefreshTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);
  const voiceRef = useRef<VoiceClient | null>(null);
  const joinedVoiceRef = useRef<{ channelId: string | null }>({ channelId: null });

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setPanel = useCallback((next: Panel) => {
    setPanelState(next);
  }, []);

  const openModal = useCallback((next: Modal) => setModal(next), []);
  const closeModal = useCallback(() => setModal(null), []);

  const navigate = useCallback((path: string, replace = false) => {
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
    setRoute(parseRoute());
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refreshMe = useCallback(
    async (quiet = false) => {
      try {
        const data = await api<Me>("/api/me");
        setMe(data);
        setServerCacheTick((t) => t + 1);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onSessionLost();
        } else if (!quiet) {
          toast(err instanceof Error ? err.message : "Could not refresh your account", "error");
        }
      }
    },
    [onSessionLost, toast],
  );

  const scheduleMeRefresh = useCallback(
    (delay = 1800) => {
      if (meRefreshTimer.current) window.clearTimeout(meRefreshTimer.current);
      meRefreshTimer.current = window.setTimeout(() => void refreshMe(true), delay);
    },
    [refreshMe],
  );

  const reloadServer = useCallback(
    async (quiet = false) => {
      const id = serverRef.current?.server.id ?? (routeRef.current.name === "server" ? routeRef.current.serverId : null);
      if (!id) return;
      try {
        const data = await api<ServerDetail>(`/api/servers/${id}`);
        setServer(data);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          if (!quiet) toast("You no longer have access to that server.", "error");
          navigate("/");
        }
      }
    },
    [navigate, toast],
  );

  const scheduleServerRefresh = useCallback(
    (delay = 900) => {
      if (serverRefreshTimer.current) window.clearTimeout(serverRefreshTimer.current);
      serverRefreshTimer.current = window.setTimeout(() => void reloadServer(true), delay);
    },
    [reloadServer],
  );

  const refreshFriends = useCallback(async () => {
    try {
      const data = await api<FriendsData>("/api/friends");
      setFriends(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load friends", "error");
    }
  }, [toast]);

  const loadDiscover = useCallback(
    async (query = "") => {
      try {
        const data = await api<{ servers: DiscoverServer[] }>(
          `/api/servers/discover${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        );
        setDiscover(data.servers);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not load discovery", "error");
      }
    },
    [toast],
  );

  const loadMessages = useCallback(async (channelId: string, preserveRead = false) => {
    setMessagesLoading(true);
    try {
      const [info, history] = await Promise.all([
        api<{ channel: Channel; permissions: number; lastReadAt: number; unreadCount: number; serverId: string | null }>(
          `/api/channels/${channelId}`,
        ),
        api<{ messages: Message[]; hasMore: boolean }>(`/api/channels/${channelId}/messages?limit=50`),
      ]);
      channelIdRef.current = channelId;
      setChannel(info.channel);
      setChannelPermissions(info.permissions);
      if (!preserveRead) setLastReadAt(info.lastReadAt);
      setMessages(history.messages);
      setHasMore(history.hasMore);
      setPendingReply(null);
      setTypingUsers([]);
      void api(`/api/channels/${channelId}/read`, { method: "POST", body: {} }).then(() => {
        setMe((prev) => ({
          ...prev,
          servers: prev.servers.map((s) =>
            s.id === info.serverId
              ? { ...s, unreadCount: 0, mentionCount: 0 }
              : s,
          ),
          dms: prev.dms.map((d) => (d.id === channelId ? { ...d, unreadCount: 0 } : d)),
          requests: prev.requests.map((d) => (d.id === channelId ? { ...d, unreadCount: 0 } : d)),
        }));
      });
    } catch (err) {
      setMessages([]);
      setChannel(null);
      if (err instanceof ApiError && err.status === 404) {
        toast("That channel is not available.", "error");
        navigate("/");
      } else {
        toast(err instanceof Error ? err.message : "Could not load messages", "error");
      }
    } finally {
      setMessagesLoading(false);
    }
  }, [navigate, toast]);

  /* -------------------------- route driven loading -------------------------- */

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (route.name === "server") {
        let detail = serverRef.current;
        if (!detail || detail.server.id !== route.serverId) {
          setServerLoading(true);
          try {
            const data = await api<ServerDetail>(`/api/servers/${route.serverId}`);
            if (cancelled) return;
            setServer(data);
            detail = data;
          } catch (err) {
            if (cancelled) return;
            setServerLoading(false);
            toast(err instanceof Error ? err.message : "Server unavailable", "error");
            navigate("/", true);
            return;
          }
          setServerLoading(false);
        }
        if (!route.channelId) {
          const first = detail?.channels.find((c) => c.type === "text");
          const voiceFirst = detail?.channels.find((c) => c.type === "voice");
          const target = first ?? voiceFirst;
          if (target) {
            navigate(`/channels/${route.serverId}/${target.id}`, true);
          }
          return;
        }
        if (channelIdRef.current !== route.channelId) {
          await loadMessages(route.channelId);
        }
      } else if (route.name === "dm") {
        if (channelIdRef.current !== route.channelId) {
          await loadMessages(route.channelId);
        }
      } else {
        channelIdRef.current = null;
        setChannel(null);
        setChannelPermissions(0);
        setMessages([]);
        setMessagesLoading(false);
        if (route.name === "friends") await refreshFriends();
        if (route.name === "discover") await loadDiscover();
        if (route.name !== "owner") setServer(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  /* ------------------------------- presence ------------------------------- */

  useEffect(() => {
    const beat = () => {
      api<{ totals: { dms: number; mentions: number } }>("/api/presence", {
        method: "POST",
        body: { status: meRef.current.user.status },
      })
        .then((data) => {
          setMe((prev) => ({ ...prev, totals: data.totals }));
        })
        .catch(() => undefined);
    };
    const id = window.setInterval(beat, 25_000);
    const welcome = window.setTimeout(beat, 2500);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(welcome);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTypingUsers((prev) => prev.filter((t) => t.until > Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  /* -------------------------------- voice -------------------------------- */

  useEffect(() => {
    const client = new VoiceClient();
    client.onSnapshot = (snapshot) => setVoice(snapshot);
    voiceRef.current = client;
    return () => {
      void client.leave();
      voiceRef.current = null;
    };
  }, []);

  const joinVoice = useCallback(
    async (target: Channel) => {
      if (!voiceRef.current) return;
      if (voiceRef.current.currentChannelId === target.id) {
        setPanel({ type: "members" });
        return;
      }
      try {
        const existing = await api<{ participants: any[] }>(`/api/voice/${target.id}`);
        await voiceRef.current.join(
          { id: target.id, name: target.name, serverId: target.server_id },
          meRef.current.user.id,
          existing.participants,
        );
        joinedVoiceRef.current.channelId = target.id;
        await voiceRef.current.setMuted(micMuted);
        await voiceRef.current.setDeafened(deafened);
        playJoinSound();
        toast(`Connected to ${target.name}`, "success");
        scheduleServerRefresh(400);
      } catch (err) {
        if (err instanceof Error && err.name === "NotAllowedError") {
          toast("Microphone permission is required to join voice.", "error");
        } else {
          toast(err instanceof Error ? err.message : "Could not join voice", "error");
        }
      }
    },
    [deafened, micMuted, scheduleServerRefresh, toast, setPanel],
  );

  const leaveVoice = useCallback(async () => {
    await voiceRef.current?.leave();
    joinedVoiceRef.current.channelId = null;
    playLeaveSound();
    toast("Left the voice channel");
    scheduleServerRefresh(400);
  }, [scheduleServerRefresh, toast]);

  const toggleMute = useCallback(async () => {
    const next = !micMuted;
    setMicMuted(next);
    if (voiceRef.current?.currentChannelId) await voiceRef.current.setMuted(next);
  }, [micMuted]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafened;
    setDeafened(next);
    if (voiceRef.current?.currentChannelId) await voiceRef.current.setDeafened(next);
  }, [deafened]);

  const toggleScreenShare = useCallback(async () => {
    if (!voiceRef.current?.currentChannelId) {
      toast("Join a voice channel to share your screen.", "info");
      return;
    }
    await voiceRef.current.toggleScreenShare();
  }, [toast]);

  /* -------------------------------- calls -------------------------------- */

  const [call, setCall] = useState<CallInfo | null>(null);
  const callRef = useRef<CallInfo | null>(null);
  const applyCall = useCallback((next: CallInfo | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const dmFor = useCallback((channelId: string) => {
    const state = meRef.current;
    return state.dms.find((d) => d.id === channelId) ?? state.requests.find((d) => d.id === channelId) ?? null;
  }, []);

  const startCall = useCallback(
    async (kind: "audio" | "video") => {
      const targetId = channelIdRef.current;
      const client = voiceRef.current;
      if (!targetId || !client) return;
      const dm = dmFor(targetId);
      if (!dm) {
        toast("Calls are only available in direct messages.", "error");
        return;
      }
      if (dm.isRequest) {
        toast("Accept this conversation before calling.", "error");
        return;
      }
      try {
        if (client.currentChannelId !== dm.id) {
          const existing = await api<{ participants: any[] }>(`/api/voice/${dm.id}`);
          await client.join(
            { id: dm.id, name: dm.name, serverId: null },
            meRef.current.user.id,
            existing.participants,
            { call: true, video: kind === "video" },
          );
          await client.setMuted(micMuted);
          await client.setDeafened(deafened);
        } else if (kind === "video" && !client.getLocalCamera()) {
          await client.toggleCamera();
        }
        const res = await api<{ call: CallInfo }>("/api/calls", { method: "POST", body: { channelId: dm.id, kind } });
        applyCall(res.call);
      } catch (err) {
        await client.leave().catch(() => undefined);
        toast(err instanceof Error ? err.message : "Could not start the call", "error");
      }
    },
    [applyCall, deafened, dmFor, micMuted, toast],
  );

  const answerCall = useCallback(async () => {
    const current = callRef.current;
    const client = voiceRef.current;
    if (!current || !client || current.callerId === meRef.current.user.id) return;
    const dm = dmFor(current.channelId);
    try {
      if (client.currentChannelId !== current.channelId) {
        const existing = await api<{ participants: any[] }>(`/api/voice/${current.channelId}`);
        await client.join(
          { id: current.channelId, name: dm?.name ?? "Call", serverId: null },
          meRef.current.user.id,
          existing.participants,
          { call: true, video: current.kind === "video" },
        );
        await client.setMuted(micMuted);
        await client.setDeafened(deafened);
      }
      const res = await api<{ call: CallInfo }>(`/api/calls/${current.id}/answer`, { method: "POST", body: {} });
      stopRingtone();
      applyCall(res.call);
    } catch (err) {
      await client.leave().catch(() => undefined);
      applyCall(null);
      stopRingtone();
      toast(err instanceof Error ? err.message : "Could not answer the call", "error");
    }
  }, [applyCall, deafened, dmFor, micMuted, toast]);

  const declineCall = useCallback(async () => {
    const current = callRef.current;
    stopRingtone();
    applyCall(null);
    if (current) await api(`/api/calls/${current.id}/decline`, { method: "POST", body: {} }).catch(() => undefined);
  }, [applyCall]);

  const endCall = useCallback(async () => {
    const current = callRef.current;
    stopRingtone();
    applyCall(null);
    if (current) await api(`/api/calls/${current.id}/end`, { method: "POST", body: {} }).catch(() => undefined);
    if (current && voiceRef.current?.currentChannelId === current.channelId) {
      await voiceRef.current.leave();
    }
  }, [applyCall]);

  const applyVoiceOutput = useCallback(() => {
    voiceRef.current?.applyOutput();
  }, []);

  const resumeCallAudio = useCallback(async () => {
    await voiceRef.current?.resumeAudio();
  }, []);

  const testSpeaker = useCallback(async () => {
    await playOutputTest();
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!voiceRef.current?.currentChannelId) {
      toast("Start a call to turn your camera on.", "info");
      return;
    }
    await voiceRef.current.toggleCamera();
  }, [toast]);

  useEffect(() => {
    api<{ call: CallInfo | null }>("/api/calls/active")
      .then((data) => {
        if (data.call) applyCall(data.call);
      })
      .catch(() => undefined);
  }, [applyCall]);

  // Ring while an incoming call waits, and give up after 45 seconds.
  useEffect(() => {
    if (!call || call.status !== "ringing") {
      stopRingtone();
      return;
    }
    const mine = call.callerId === me.user.id;
    if (mine) startRingback();
    else startRingtone();
    const timeout = window.setTimeout(() => {
      if (mine) void endCall();
      else void declineCall();
    }, 45_000);
    return () => {
      stopRingtone();
      window.clearTimeout(timeout);
    };
  }, [call, declineCall, endCall, me.user.id]);

  // While a call is ringing, reconcile with the server so a dropped live event
  // can never leave someone stuck on the ringing screen.
  useEffect(() => {
    if (!call || call.status !== "ringing") return;
    const id = window.setInterval(() => {
      api<{ call: CallInfo | null }>("/api/calls/active")
        .then((data) => {
          const next = data.call;
          if (next && next.status === "active" && callRef.current?.id === next.id) applyCall(next);
        })
        .catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(id);
  }, [applyCall, call]);

  // Chime once when a call connects, and again softly when an active call ends.
  const callStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = call?.status ?? null;
    const previous = callStatusRef.current;
    if (status === "active" && previous !== "active") {
      playJoinSound();
      void voiceRef.current?.resumeAudio();
    }
    if (!status && previous === "active") playLeaveSound();
    callStatusRef.current = status;
  }, [call]);

  /* -------------------------------- live --------------------------------- */

  const handleLive = useCallback(
    (event: LiveEvent) => {
      const payload = event.payload || {};
      const activeChannel = channelIdRef.current;
      switch (event.kind) {
        case "message.create": {
          const message = payload.message as Message | undefined;
          if (message && message.channelId === activeChannel) {
            setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
            void api(`/api/channels/${message.channelId}/read`, { method: "POST", body: {} }).catch(() => undefined);
            setTypingUsers((prev) => prev.filter((t) => t.userId !== message.author.id));
          }
          scheduleMeRefresh(1200);
          break;
        }
        case "message.update": {
          if (payload.messageId && payload.content !== undefined) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.messageId ? { ...m, content: payload.content, editedAt: payload.editedAt } : m,
              ),
            );
          }
          break;
        }
        case "message.delete": {
          if (payload.messageId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.messageId ? { ...m, deleted: true, content: "", reactions: [] } : m)),
            );
          }
          break;
        }
        case "reaction.update":
        case "pin.update": {
          if (payload.messageId) {
            void api<{ message: Message }>(`/api/messages/${payload.messageId}`)
              .then((data) => setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m))))
              .catch(() => undefined);
          }
          break;
        }
        case "typing": {
          if (!payload.userId || payload.userId === meRef.current.user.id) break;
          if (event.refId !== activeChannel) break;
          setTypingUsers((prev) => {
            const others = prev.filter((t) => t.userId !== payload.userId);
            return [...others, { userId: payload.userId, name: payload.displayName || payload.username, until: Date.now() + 5000 }];
          });
          break;
        }
        case "message.activity": {
          if (payload.authorId === meRef.current.user.id) break;
          if (event.scope === "server") scheduleMeRefresh(1500);
          break;
        }
        case "dm.message":
        case "dm.request":
          scheduleMeRefresh(500);
          if (payload.channelId && payload.channelId !== activeChannel && event.kind === "dm.message") {
            void api<{ notifications: Notification[] }>("/api/notifications")
              .then((data) => {
                setNotifications(data.notifications);
                const fresh = data.notifications.find((n) => !n.read && n.channelId === payload.channelId);
                if (fresh) {
                  toast(`${fresh.title}: ${fresh.body ?? ""}`.slice(0, 140), "info");
                  notifyDesktop(fresh.title, fresh.body ?? "New message");
                }
              })
              .catch(() => undefined);
          }
          break;
        case "friend.request":
          toast("You have a new friend request", "info");
          scheduleMeRefresh(300);
          if (routeRef.current.name === "friends") void refreshFriends();
          break;
        case "friend.update":
        case "dm.update":
        case "dm.members":
          scheduleMeRefresh(600);
          if (routeRef.current.name === "friends") void refreshFriends();
          break;
        case "call.ring": {
          const incoming = payload.call as CallInfo | undefined;
          if (!incoming || incoming.callerId === meRef.current.user.id) break;
          if (callRef.current?.status === "active" || voiceRef.current?.currentChannelId === incoming.channelId) {
            void api(`/api/calls/${incoming.id}/decline`, { method: "POST", body: {} }).catch(() => undefined);
            break;
          }
          applyCall(incoming);
          const callerName = incoming.caller?.displayName || incoming.caller?.username || "A friend";
          toast(`${callerName} is calling`, "info");
          notifyDesktop(`${callerName} is calling`, incoming.kind === "video" ? "Incoming video call" : "Incoming voice call");
          break;
        }
        case "call.active": {
          const active = payload.call as CallInfo | undefined;
          if (active && callRef.current?.id === active.id) applyCall(active);
          break;
        }
        case "call.declined": {
          const current = callRef.current;
          if (!current || current.id !== payload.callId) break;
          stopRingtone();
          applyCall(null);
          if (voiceRef.current?.currentChannelId === current.channelId) void voiceRef.current?.leave();
          toast(`${payload.byName || "They"} declined the call`, "info");
          break;
        }
        case "call.ended": {
          const current = callRef.current;
          if (!current || current.id !== payload.callId) break;
          stopRingtone();
          applyCall(null);
          if (voiceRef.current?.currentChannelId === current.channelId) void voiceRef.current?.leave();
          break;
        }
        case "voice.state": {
          if (voiceRef.current?.currentChannelId) {
            void api<{ participants: any[] }>(`/api/voice/${voiceRef.current.currentChannelId}`)
              .then((data) => voiceRef.current?.setParticipants(data.participants))
              .catch(() => undefined);
          }
          scheduleServerRefresh(500);
          break;
        }
        case "voice.signal": {
          void voiceRef.current?.handleSignal(payload);
          break;
        }
        case "server.update":
        case "member.join":
        case "member.leave":
        case "member.update":
        case "channel.create":
        case "channel.update":
        case "channel.delete":
        case "role.update":
        case "emoji.update":
        case "event.update": {
          scheduleServerRefresh(600);
          scheduleMeRefresh(2200);
          break;
        }
        case "plus.update":
        case "badge.update":
        case "account.update":
          scheduleMeRefresh(300);
          break;
        case "access.revoked":
          toast("Your access to that conversation changed.", "info");
          navigate("/");
          break;
        case "server.kicked":
        case "server.banned":
          toast(event.kind === "server.banned" ? "You were banned from a server." : "You were removed from a server.", "error");
          navigate("/");
          scheduleMeRefresh(200);
          break;
        case "notification":
        case "announcement":
          scheduleMeRefresh(1200);
          break;
        default:
          break;
      }
    },
    [applyCall, navigate, refreshFriends, scheduleMeRefresh, scheduleServerRefresh, toast],
  );

  useLiveStream({
    channelId: route.name === "server" || route.name === "dm" ? (route.channelId ?? channelIdRef.current) : null,
    serverId: route.name === "server" ? route.serverId : null,
    onEvent: handleLive,
    onTransportChange: setTransport,
  });

  /* ------------------------------- actions ------------------------------- */

  const sendMessage = useCallback(
    async (input: { content: string; attachmentIds?: string[]; sticker?: string | null; gifUrl?: string | null }) => {
      const target = channelIdRef.current;
      if (!target) return;
      const result = await api<{ message: Message }>(`/api/channels/${target}/messages`, {
        method: "POST",
        body: {
          content: input.content,
          attachmentIds: input.attachmentIds ?? [],
          sticker: input.sticker ?? null,
          gifUrl: input.gifUrl ?? null,
          replyToId: pendingReply?.id ?? null,
        },
      });
      setMessages((prev) => (prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]));
      setPendingReply(null);
      scheduleMeRefresh(800);
    },
    [pendingReply, scheduleMeRefresh],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      await api(`/api/messages/${messageId}`, { method: "PATCH", body: { content } });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content, editedAt: Date.now() } : m)));
    },
    [],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: true, content: "", reactions: [] } : m)));
      scheduleServerRefresh(300);
    },
    [scheduleServerRefresh],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string, mine: boolean) => {
      if (mine) {
        await api(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
      } else {
        await api(`/api/messages/${messageId}/reactions`, { method: "POST", body: { emoji } });
      }
      const data = await api<{ message: Message }>(`/api/messages/${messageId}`);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
    },
    [],
  );

  const togglePin = useCallback(
    async (messageId: string, pinned: boolean) => {
      await api(`/api/messages/${messageId}/pin`, { method: pinned ? "DELETE" : "POST" });
      const data = await api<{ message: Message }>(`/api/messages/${messageId}`);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
      toast(pinned ? "Message unpinned" : "Message pinned", "success");
    },
    [toast],
  );

  const openThread = useCallback(
    async (message: Message) => {
      const data = await api<{ thread: Channel }>(`/api/messages/${message.id}/thread`, {
        method: "POST",
        body: {},
      });
      setPanel({ type: "thread", channelId: data.thread.id, messageId: message.id, name: data.thread.name });
    },
    [setPanel],
  );

  const submitTyping = useCallback(() => {
    const target = channelIdRef.current;
    if (!target) return;
    if (Date.now() - lastTypingSent.current < 3500) return;
    lastTypingSent.current = Date.now();
    void api(`/api/channels/${target}/typing`, { method: "POST", body: {} }).catch(() => undefined);
  }, []);

  const loadOlder = useCallback(async () => {
    const target = channelIdRef.current;
    if (!target || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/channels/${target}/messages?limit=50&before=${messages[0].createdAt}`,
      );
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, messages]);

  const openProfile = useCallback(async (userId: string) => {
    setModal({ type: "profile", userId });
    setProfile(null);
    setProfileLoading(true);
    try {
      const data = await api<UserProfile>(`/api/users/${userId}`);
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setProfileLoading(false);
  }, []);

  const loadNotifications = useCallback(async () => {
    const data = await api<{ notifications: Notification[] }>("/api/notifications");
    setNotifications(data.notifications);
  }, []);

  const markNotificationsRead = useCallback(async () => {
    await api("/api/notifications/read", { method: "POST", body: { all: true } });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setMe((prev) => ({ ...prev, totals: { ...prev.totals, mentions: 0 } }));
  }, []);

  const openDm = useCallback(
    async (userId: string) => {
      const result = await api<{ channel: Channel }>("/api/dms", { method: "POST", body: { userIds: [userId] } });
      setModal(null);
      navigate(`/dm/${result.channel.id}`);
      await refreshMe(true);
    },
    [navigate, refreshMe],
  );

  const selectFriendRequest = useCallback(
    async (id: string, accept: boolean) => {
      await api(`/api/friends/requests/${id}/${accept ? "accept" : "decline"}`, { method: "POST", body: {} });
      toast(accept ? "Friend request accepted" : "Friend request declined", "success");
      await refreshFriends();
      await refreshMe(true);
    },
    [refreshFriends, refreshMe, toast],
  );

  const addFriend = useCallback(
    async (username: string, message?: string) => {
      const result = await api<{ ok: boolean; accepted?: boolean }>("/api/friends/requests", {
        method: "POST",
        body: { username, message },
      });
      toast(result.accepted ? `You are now friends with ${username}` : `Friend request sent to ${username}`, "success");
      await refreshFriends();
      await refreshMe(true);
    },
    [refreshFriends, refreshMe, toast],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/logout", { method: "POST", body: {} });
    } catch {
      /* the cookie is cleared server-side when possible */
    }
    onSessionLost();
  }, [onSessionLost]);

  const serverId = route.name === "server" ? route.serverId : channel?.server_id ?? null;

  const store: Store = useMemo(
    () => ({
      me,
      setMe,
      refreshMe,
      route,
      navigate,
      serverId,
      channelId: channel?.id ?? null,
      server,
      serverLoading,
      channel,
      channelPermissions,
      messages,
      messagesLoading,
      hasMore,
      lastReadAt,
      loadingOlder,
      loadOlder,
      reloadServer,
      friends,
      refreshFriends,
      discover,
      loadDiscover,
      panel,
      setPanel,
      modal,
      openModal,
      closeModal,
      profile,
      profileLoading,
      openProfile,
      clearProfile,
      toasts,
      toast,
      dismissToast,
      pendingReply,
      setPendingReply,
      sendMessage,
      editMessage,
      deleteMessage,
      toggleReaction,
      togglePin,
      openThread,
      submitTyping,
      typingUsers,
      highlightId,
      setHighlightId,
      notifications,
      loadNotifications,
      markNotificationsRead,
      voice,
      micMuted,
      deafened,
      call,
      startCall,
      answerCall,
      declineCall,
      endCall,
      toggleCamera,
      resumeCallAudio,
      testSpeaker,
      applyVoiceOutput,
      localCamera: voiceRef.current?.getLocalCamera() ?? null,
      getRemoteVideo: (userId: string) => voiceRef.current?.getRemoteVideo(userId) ?? null,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      localScreen: voiceRef.current?.getLocalScreen() ?? null,
      remoteScreen: voiceRef.current?.getRemoteScreen(voice.screenUserId) ?? null,
      transport,
      openDm,
      selectFriendRequest,
      addFriend,
      logout,
      serverCacheTick,
      folders: me.folders,
    }),
    [
      me,
      refreshMe,
      route,
      navigate,
      serverId,
      channel,
      channelPermissions,
      server,
      serverLoading,
      messages,
      messagesLoading,
      hasMore,
      lastReadAt,
      loadingOlder,
      loadOlder,
      reloadServer,
      friends,
      refreshFriends,
      discover,
      loadDiscover,
      panel,
      setPanel,
      modal,
      openModal,
      closeModal,
      profile,
      profileLoading,
      openProfile,
      clearProfile,
      toasts,
      toast,
      dismissToast,
      pendingReply,
      sendMessage,
      editMessage,
      deleteMessage,
      toggleReaction,
      togglePin,
      openThread,
      submitTyping,
      typingUsers,
      highlightId,
      notifications,
      loadNotifications,
      markNotificationsRead,
      voice,
      micMuted,
      deafened,
      call,
      startCall,
      answerCall,
      declineCall,
      endCall,
      toggleCamera,
      resumeCallAudio,
      testSpeaker,
      applyVoiceOutput,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      transport,
      openDm,
      selectFriendRequest,
      addFriend,
      logout,
      serverCacheTick,
      me.folders,
    ],
  );

  return <AppContext.Provider value={store}>{children}</AppContext.Provider>;
}
