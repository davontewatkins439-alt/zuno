export const P = {
  ADMINISTRATOR: 1 << 0,
  MANAGE_SERVER: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  BAN_MEMBERS: 1 << 5,
  MANAGE_MESSAGES: 1 << 6,
  VIEW_AUDIT: 1 << 7,
  CREATE_INVITES: 1 << 8,
  MANAGE_EMOJIS: 1 << 9,
  MANAGE_EVENTS: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  ATTACH_FILES: 1 << 12,
  ADD_REACTIONS: 1 << 13,
  MENTION_EVERYONE: 1 << 14,
  READ_HISTORY: 1 << 15,
  VOICE_CONNECT: 1 << 16,
  VOICE_SPEAK: 1 << 17,
  STREAM: 1 << 18,
  MANAGE_THREADS: 1 << 19,
  VIEW_CHANNEL: 1 << 20,
} as const;

export const has = (perms: number, bit: number) => (perms & bit) === bit;

export function cls(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

const DAY = 86_400_000;

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDay(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export function formatShort(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function avatarGradient(seed: string, accent?: string | null): string {
  if (accent) {
    return `linear-gradient(140deg, ${accent} 0%, color-mix(in srgb, ${accent} 35%, #05070f) 100%)`;
  }
  const hue = hueFromString(seed);
  return `linear-gradient(140deg, hsl(${hue} 85% 62%) 0%, hsl(${(hue + 45) % 360} 70% 34%) 100%)`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Idle";
    case "dnd":
      return "Do Not Disturb";
    case "invisible":
      return "Invisible";
    default:
      return "Offline";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "online":
      return "#3ddc97";
    case "idle":
      return "#f5b544";
    case "dnd":
      return "#ff5f6d";
    default:
      return "#5d6b85";
  }
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function channelIcon(type: string): string {
  return type === "voice" ? "voice" : type === "thread" ? "thread" : "text";
}

export function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function humanAction(action: string): string {
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, " "))
    .join(" · ");
}

export const QUICK_EMOJI = ["🔥", "💙", "😂", "✨", "👀", "🎉", "🫡", "⚡"];

export const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "ZUNO",
    emoji: ["💙", "⚡", "🌌", "🛸", "🎧", "🕹️", "✨", "🌙"],
  },
  {
    label: "Reactions",
    emoji: ["👍", "👎", "🔥", "🎉", "😂", "😮", "😢", "🫡", "🙌", "👀", "💯", "🤝"],
  },
  {
    label: "Life",
    emoji: ["🌙", "🌃", "☕", "🍕", "🎮", "🎨", "🎵", "📚", "🏆", "🚀", "❤️", "🖤"],
  },
  {
    label: "Spooky",
    emoji: ["🎃", "👻", "🦇", "💀", "🕷️", "🕸️", "🕯️", "⚰️", "🧟", "🧛", "🍬", "🌕"],
  },
  {
    label: "Symbols",
    emoji: ["✅", "❌", "⚠️", "🔒", "📌", "🔗", "💡", "⭐", "🔷", "🔶", "⬆️", "⬇️"],
  },
];

export const STICKERS: { key: string; label: string }[] = [
  { key: "zuno-pumpkin", label: "Pumpkin" },
  { key: "zuno-bat", label: "Bats" },
  { key: "zuno-skull", label: "Skull" },
  { key: "zuno-candy", label: "Candy corn" },
  { key: "zuno-bolt", label: "Voltage" },
  { key: "zuno-crown", label: "Own it" },
  { key: "zuno-ghost", label: "Late night" },
  { key: "zuno-heart", label: "Big love" },
  { key: "zuno-rocket", label: "Ship it" },
  { key: "zuno-star", label: "Star of the show" },
  { key: "zuno-wave", label: "Hey there" },
];

export const PLUS_THEMES = [
  { key: "aurora", label: "Aurora", colors: ["#5fe3ff", "#8b5cf6"] },
  { key: "midnight", label: "Midnight", colors: ["#2f7cff", "#0b1533"] },
  { key: "ember", label: "Ember", colors: ["#ff7a59", "#ffcf6b"] },
  { key: "neon", label: "Neon City", colors: ["#f472b6", "#5fe3ff"] },
];

export const PLUS_DECORATIONS = [
  { key: "holo", label: "Holo ring" },
  { key: "pulse", label: "Pulse halo" },
  { key: "grid", label: "Grid frame" },
];
