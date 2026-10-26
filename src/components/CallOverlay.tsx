import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Monitor, Phone, PhoneOff, Video, VideoOff, Volume2, VolumeX, Headphones } from "lucide-react";
import { useApp } from "../state";
import type { User } from "../lib/types";
import { Avatar } from "./ui";

function VideoTile({
  stream,
  label,
  muted,
  self,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  self?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={self ? "call-tile self" : "call-tile"}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} />
      ) : (
        <div className="call-tile-fallback">
          <span className="call-initial">{label.slice(0, 1).toUpperCase()}</span>
        </div>
      )}
      <span className="call-tile-label">{label}</span>
    </div>
  );
}

function useCallTimer(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CallOverlay() {
  const app = useApp();
  const {
    call,
    me,
    voice,
    getRemoteVideo,
    localCamera,
    micMuted,
    deafened,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    endCall,
    answerCall,
    declineCall,
    resumeCallAudio,
  } = app;
  const dm = call ? me.dms.find((d) => d.id === call.channelId) ?? me.requests.find((d) => d.id === call.channelId) ?? null : null;
  const timer = useCallTimer(call?.answeredAt ?? null);

  if (!call) return null;

  const incoming = call.status === "ringing" && call.callerId !== me.user.id;
  const outgoing = call.status === "ringing" && call.callerId === me.user.id;

  if (incoming) {
    const caller = (call.caller ?? {
      id: call.callerId,
      username: "ZUNO",
      displayName: dm?.name ?? "Someone",
      avatarId: null,
      accentColor: null,
    }) as unknown as User;
    return (
      <div className="call-card incoming" role="dialog" aria-label="Incoming call">
        <span className="call-card-pulse" />
        <Avatar user={caller} size={46} showStatus />
        <div className="call-card-copy">
          <strong>{caller.displayName || caller.username}</strong>
          <span>Incoming {call.kind === "video" ? "video" : "voice"} call</span>
        </div>
        <div className="call-card-actions">
          <button type="button" className="call-round decline" aria-label="Decline call" onClick={() => void declineCall()}>
            <PhoneOff size={17} />
          </button>
          <button type="button" className="call-round accept" aria-label="Answer call" onClick={() => void answerCall()}>
            <Phone size={17} />
          </button>
        </div>
      </div>
    );
  }

  const others = voice.participants.filter((p) => p.userId !== me.user.id);
  const local = localCamera;
  const remoteTiles = others.length
    ? others
    : (dm?.participants.filter((p) => p.id !== me.user.id) ?? []).map((p) => ({
        userId: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarId: p.avatarId,
        accentColor: p.accentColor,
        muted: false,
        deafened: false,
        video: false,
        screen: false,
        badges: [],
      }));

  return (
    <div
      className={outgoing ? "call-stage ringing" : "call-stage"}
      onPointerDown={() => void resumeCallAudio()}
    >
      <header className="call-stage-head">
        <span className="call-live">
          <span className="live-dot" /> {outgoing ? "Ringing" : call.kind === "video" ? "Video call" : "Voice call"}
        </span>
        <strong>{dm?.name ?? "Direct call"}</strong>
        {!outgoing && <span className="call-timer">{timer}</span>}
      </header>

      {voice.audioBlocked && (
        <div className="call-alert">
          <Volume2 size={15} />
          <span>Your browser is holding back call audio.</span>
          <button type="button" className="ghost-btn small" onClick={() => void resumeCallAudio()}>
            Enable sound
          </button>
        </div>
      )}
      {deafened && (
        <div className="call-alert muted">
          <VolumeX size={15} />
          <span>You are deafened, so the call is muted for you.</span>
          <button type="button" className="ghost-btn small" onClick={() => void toggleDeafen()}>
            Undeafen
          </button>
        </div>
      )}

      {outgoing ? (
        <div className="call-ringing">
          {call.caller && <Avatar user={call.caller} size={62} showStatus />}
          <strong>Calling {dm?.name ?? "them"}…</strong>
          <span>Waiting for them to answer. You are already connected.</span>
        </div>
      ) : (
        <div className={local || remoteTiles.some((p) => getRemoteVideo(p.userId)) ? "call-tiles video" : "call-tiles"}>
          {call.kind === "video" && local && <VideoTile stream={local} label="You" muted self />}
          {remoteTiles.map((participant) => {
            const stream = getRemoteVideo(participant.userId);
            return (
              <VideoTile
                key={participant.userId}
                stream={call.kind === "video" ? stream : null}
                label={participant.displayName || participant.username}
                muted
              />
            );
          })}
        </div>
      )}

      <div className="call-controls">
        <button type="button" className={micMuted ? "call-control active" : "call-control"} onClick={() => void toggleMute()} title="Mute">
          {micMuted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button type="button" className={deafened ? "call-control active" : "call-control"} onClick={() => void toggleDeafen()} title="Deafen">
          {deafened ? <VolumeX size={17} /> : <Headphones size={17} />}
        </button>
        <button
          type="button"
          className={voice.cameraOn ? "call-control active" : "call-control"}
          onClick={() => void toggleCamera()}
          title={voice.cameraOn ? "Turn camera off" : "Turn camera on"}
        >
          {voice.cameraOn ? <Video size={17} /> : <VideoOff size={17} />}
        </button>
        <button
          type="button"
          className={voice.screenSharing ? "call-control active" : "call-control"}
          onClick={() => void toggleScreenShare()}
          title="Share screen"
        >
          <Monitor size={17} />
        </button>
        <button type="button" className="call-control end" onClick={() => void endCall()} title={outgoing ? "Cancel call" : "Leave call"}>
          <PhoneOff size={17} />
        </button>
      </div>
    </div>
  );
}
