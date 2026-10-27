import React, { useEffect, useRef, useState } from "react";
import { Headphones, LogOut, Mic, MicOff, Monitor, PhoneOff, Settings, VolumeX } from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import { cls, statusColor, statusLabel } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { PlateArt } from "./PlateArt";
import { Avatar, IconButton, StatusDot, Verified } from "./ui";

const STATUS_OPTIONS: { value: "online" | "idle" | "dnd" | "invisible"; label: string; hint: string }[] = [
  { value: "online", label: "Online", hint: "Active and available" },
  { value: "idle", label: "Idle", hint: "Away from keyboard" },
  { value: "dnd", label: "Do Not Disturb", hint: "Mute notifications" },
  { value: "invisible", label: "Invisible", hint: "Appear offline" },
];

export function AccountPanel() {
  const { me, refreshMe, toast, openModal, openProfile, micMuted, deafened, toggleMute, toggleDeafen, logout } = useApp();
  const [statusOpen, setStatusOpen] = useState(false);
  const user = me.user;

  const setStatus = async (status: string) => {
    try {
      await api("/api/me", { method: "PATCH", body: { status } });
      setStatusOpen(false);
      await refreshMe(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update status", "error");
    }
  };

  return (
    <div className={cls("account-panel", plateClass(user.nameplate))}>
      <PlateArt id={user.nameplate} />
      <button type="button" className="account-identity" onClick={() => void openProfile(user.id)}>
        <Avatar user={user} size={32} showStatus decoration={user.plusDecoration} />
        <span className="account-meta">
          <span className="account-name">
            <span className="plate-label">{user.displayName}</span>
            {(user.isOwner || user.badges.some((b) => b.slug === "verified")) && <Verified />}
          </span>
          <span className="account-sub">{user.customStatus || `@${user.username}`}</span>
        </span>
      </button>

      <div className="account-actions">
        <IconButton label={micMuted ? "Unmute microphone" : "Mute microphone"} active={micMuted} onClick={() => void toggleMute()}>
          {micMuted ? <MicOff size={17} /> : <Mic size={17} />}
        </IconButton>
        <IconButton label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={() => void toggleDeafen()}>
          {deafened ? <VolumeX size={17} /> : <Headphones size={17} />}
        </IconButton>
        <IconButton label="User settings" onClick={() => openModal({ type: "userSettings", tab: "profile" })}>
          <Settings size={17} />
        </IconButton>
      </div>

      {statusOpen && (
        <div className="status-menu" onMouseLeave={() => setStatusOpen(false)}>
          <div className="context-title">Set status</div>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cls(user.status === option.value && "selected")}
              onClick={() => void setStatus(option.value)}
            >
              <span className="status-swatch" style={{ background: statusColor(option.value) }} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => openModal({ type: "userSettings", tab: "profile" })}>
            <span className="status-swatch" style={{ background: "#5fe3ff" }} />
            <span>
              <strong>Edit custom status</strong>
              <small>Tell people what you are up to</small>
            </span>
          </button>
        </div>
      )}

      <span className="account-status-label" onClick={() => setStatusOpen((v) => !v)} role="button" tabIndex={0}>
        <StatusDot status={user.status} size={8} /> {statusLabel(user.status)}
      </span>
      <button type="button" className="account-logout" title="Sign out" aria-label="Sign out" onClick={() => void logout()}>
        <LogOut size={14} />
      </button>
    </div>
  );
}

function VideoSurface({ stream, muted = true, label }: { stream: MediaStream | null; muted?: boolean; label?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => undefined);
    }
  }, [stream]);
  if (!stream) return null;
  return (
    <div className="voice-screen">
      <video ref={ref} autoPlay playsInline muted={muted} />
      {label && <span className="voice-screen-label">{label}</span>}
    </div>
  );
}

export function VoiceDock() {
  const {
    voice,
    leaveVoice,
    micMuted,
    deafened,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    localScreen,
    remoteScreen,
  } = useApp();
  const [expanded, setExpanded] = useState(true);

  if (!voice.connected && !voice.connecting && !voice.error) return null;

  const screenStream = localScreen ?? remoteScreen;
  const label = voice.screenSharing ? "Your screen" : voice.participants.find((p) => p.userId === voice.screenUserId)?.displayName ?? "Screen share";

  return (
    <div className={cls("voice-dock", screenStream && "has-screen")}>
      <div className="voice-dock-head">
        <span className="voice-live">
          <span className="live-dot" /> {voice.connecting ? "Connecting…" : voice.screenSharing ? "Screen live" : "Voice connected"}
        </span>
        <strong>{voice.channelName ?? "Voice"}</strong>
        <button type="button" className="voice-collapse" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {voice.error && <p className="voice-error">{voice.error}</p>}

      {expanded && (
        <>
          {screenStream && <VideoSurface stream={screenStream} label={label} muted={!!localScreen} />}
          <div className="voice-people">
            {voice.participants.map((participant) => (
              <div className="voice-person" key={participant.userId}>
                <Avatar
                  user={{
                    id: participant.userId,
                    displayName: participant.displayName || participant.username,
                    username: participant.username,
                    avatarId: participant.avatarId,
                    accentColor: participant.accentColor,
                  }}
                  size={24}
                  showStatus
                  decoration={participant.badges.find((b) => b.slug === "plus") ? "pulse" : null}
                />
                <span>{participant.displayName || participant.username}</span>
                {participant.muted && <MicOff size={13} className="muted-icon" />}
                {participant.screen && <Monitor size={13} className="screen-icon" />}
              </div>
            ))}
            {!voice.participants.length && <span className="voice-empty">Waiting for others to join…</span>}
          </div>
        </>
      )}

      <div className="voice-controls">
        <IconButton label={micMuted ? "Unmute" : "Mute"} active={micMuted} onClick={() => void toggleMute()}>
          {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </IconButton>
        <IconButton label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={() => void toggleDeafen()}>
          {deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
        </IconButton>
        <IconButton
          label={voice.screenSharing ? "Stop sharing" : "Share screen"}
          active={voice.screenSharing}
          onClick={() => void toggleScreenShare()}
        >
          <Monitor size={16} />
        </IconButton>
        <IconButton label="Disconnect" danger onClick={() => void leaveVoice()}>
          <PhoneOff size={16} />
        </IconButton>
      </div>
    </div>
  );
}
