import { api } from "./api";
import { applyOutputDevice, audioConstraints, getAudioPrefs, tuneCameraTrack, videoConstraints } from "./audio-devices";
import type { VoiceState } from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Without an explicit ceiling browsers settle around 1 Mbps and faces turn to
// mush. Camera lanes get 4 Mbps at 30fps, screen shares 6 Mbps.
const CAMERA_MAX_BITRATE = 4_000_000;
const SCREEN_MAX_BITRATE = 6_000_000;

export interface VoiceParticipant extends VoiceState {}

export interface VoiceSnapshot {
  connected: boolean;
  connecting: boolean;
  channelId: string | null;
  channelName: string | null;
  serverId: string | null;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  screenUserId: string | null;
  cameraOn: boolean;
  isCall: boolean;
  audioBlocked: boolean;
  error: string | null;
}

interface Peer {
  pc: RTCPeerConnection;
  stream: MediaStream;
  audio: HTMLAudioElement;
  pendingIce: RTCIceCandidateInit[];
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export class VoiceClient {
  private channelId: string | null = null;
  private channelName: string | null = null;
  private serverId: string | null = null;
  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private remoteScreens = new Map<string, MediaStream>();
  private heartbeat: number | undefined;
  private muted = false;
  private deafened = false;
  private myId = "";
  private screenSharing = false;
  private pendingParticipants: VoiceParticipant[] = [];
  // A direct-message call shares the same WebRTC pipeline as a voice channel,
  // but camera tiles replace the single screen-share surface.
  private isCall = false;
  private cameraStream: MediaStream | null = null;
  private remoteVideos = new Map<string, MediaStream>();
  // Browsers can refuse to play remote audio until the page has a fresh user
  // gesture. The call UI surfaces this instead of silently staying quiet.
  private audioBlocked = false;

  onSnapshot: (snapshot: VoiceSnapshot) => void = () => {};
  onSignal: (() => void) | null = null;

  constructor(private events: (event: any) => void = () => {}) {}

  get currentChannelId() {
    return this.channelId;
  }

  private emit(partial: Partial<VoiceSnapshot> = {}) {
    this.onSnapshot({
      connected: !!this.channelId,
      connecting: false,
      channelId: this.channelId,
      channelName: this.channelName,
      serverId: this.serverId,
      participants: this.pendingParticipants,
      muted: this.muted,
      deafened: this.deafened,
      screenSharing: this.screenSharing,
      screenUserId: this.screenSharing ? this.myId : [...this.remoteScreens.keys()][0] ?? null,
      cameraOn: !!this.cameraStream,
      isCall: this.isCall,
      audioBlocked: this.audioBlocked,
      error: null,
      ...partial,
    });
  }

  async join(
    channel: { id: string; name: string; serverId: string | null },
    meId: string,
    existing: VoiceParticipant[],
    options: { video?: boolean; call?: boolean } = {},
  ): Promise<void> {
    this.myId = meId;
    this.channelId = channel.id;
    this.channelName = channel.name;
    this.serverId = channel.serverId;
    this.isCall = !!options.call;
    this.pendingParticipants = existing;
    this.emit({ connecting: true });

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(),
        video: options.video ? videoConstraints() : false,
      });
      const videoTracks = this.localStream.getVideoTracks();
      this.cameraStream = options.video && videoTracks.length ? new MediaStream(videoTracks) : null;
      for (const track of videoTracks) void tuneCameraTrack(track);
    } catch (err) {
      this.channelId = null;
      this.emit({ error: "Microphone access was blocked. Allow the mic to join the call." });
      throw err;
    }

    const joined = await api<{ participants: VoiceParticipant[]; channel: any }>(`/api/voice/${channel.id}/join`, {
      method: "POST",
      body: { muted: this.muted, deafened: this.deafened },
    });
    this.pendingParticipants = joined.participants;
    this.emit();

    for (const participant of joined.participants) {
      if (participant.userId === this.myId) continue;
      await this.createOffer(participant.userId);
    }

    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => {
      if (!this.channelId) return;
      api(`/api/voice/${this.channelId}/state`, {
        method: "PATCH",
        body: { muted: this.muted, deafened: this.deafened, screen: this.screenSharing },
      }).catch(() => undefined);
    }, 25_000);
  }

  private ensurePeer(userId: string, initiator: boolean): Peer {
    const existing = this.peers.get(userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = new MediaStream();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.dataset.peer = userId;
    audio.volume = 1;
    audio.style.display = "none";
    document.body.appendChild(audio);
    void applyOutputDevice(audio);
    const peer: Peer = { pc, stream, audio, pendingIce: [], makingOffer: false, ignoreOffer: false };
    this.peers.set(userId, peer);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
      this.tuneVideo(pc);
    }
    // Always negotiate an audio lane, even if the microphone was blocked, so the
    // other side can still be heard.
    if (!this.localStream?.getAudioTracks().length) {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.ontrack = (event) => {
      const [remote] = event.streams;
      if (remote) {
        for (const track of remote.getTracks()) {
          if (track.kind === "audio") {
            if (!stream.getAudioTracks().some((t) => t.id === track.id)) stream.addTrack(track);
          } else if (track.kind === "video") {
            if (this.isCall) {
              this.remoteVideos.set(userId, remote);
            } else {
              this.remoteScreens.set(userId, remote);
              this.emit({ screenUserId: userId });
            }
          }
        }
        audio.srcObject = stream;
        audio.muted = this.deafened;
        void audio
          .play()
          .then(() => {
            if (this.audioBlocked) {
              this.audioBlocked = false;
              this.emit();
            }
          })
          .catch(() => {
            this.audioBlocked = true;
            this.emit();
          });
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      api("/api/voice/signal", {
        method: "POST",
        body: { channelId: this.channelId, to: userId, type: "ice", payload: event.candidate.toJSON() },
      }).catch(() => undefined);
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) this.closePeer(userId);
    };

    // Offers are created explicitly (join, camera, screen share) so two peers
    // can never race duplicate offers against each other.
    void initiator;

    this.localStream?.getAudioTracks().forEach((track) => {
      track.onmute = () => this.emit();
    });
    return peer;
  }

  /**
   * Raise the encoder budget for every video lane on a connection. Sender
   * parameters are only tunable once there is a local description, so this runs
   * again after each negotiation.
   */
  private tuneVideo(pc: RTCPeerConnection): void {
    for (const sender of pc.getSenders()) {
      const track = sender.track;
      if (!track || track.kind !== "video") continue;
      const sharing = this.screenStream?.getVideoTracks().some((entry) => entry.id === track.id) ?? false;
      if (!sharing && "contentHint" in track) track.contentHint = "motion";
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      for (const encoding of params.encodings) {
        encoding.maxBitrate = sharing ? SCREEN_MAX_BITRATE : CAMERA_MAX_BITRATE;
        encoding.scaleResolutionDownBy = 1;
        if (!sharing) encoding.maxFramerate = 30;
      }
      params.degradationPreference = "balanced";
      void sender.setParameters(params).catch(() => undefined);
    }
  }

  private async createOffer(userId: string) {
    const peer = this.ensurePeer(userId, true);
    try {
      peer.makingOffer = true;
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.tuneVideo(peer.pc);
      await api("/api/voice/signal", {
        method: "POST",
        body: { channelId: this.channelId, to: userId, type: "offer", payload: offer },
      });
    } catch (err) {
      console.warn("voice offer failed", err);
    } finally {
      peer.makingOffer = false;
    }
  }

  async handleSignal(payload: {
    channelId: string;
    from: string;
    fromName?: string;
    type: string;
    payload: any;
  }) {
    if (!this.channelId || payload.channelId !== this.channelId) return;
    if (payload.from === this.myId) return;
    if (payload.type === "offer" || payload.type === "renegotiate") {
      const peer = this.ensurePeer(payload.from, false);
      // Perfect negotiation: when both sides offer at once the "impolite" peer
      // keeps its offer and ignores the incoming one, so audio never deadlocks.
      const polite = this.myId.localeCompare(payload.from) < 0;
      const collision = peer.makingOffer || peer.pc.signalingState !== "stable";
      if (collision && !polite) {
        peer.ignoreOffer = true;
        return;
      }
      if (collision) {
        try {
          await peer.pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
        } catch {
          /* rollback can fail if the offer was already applied */
        }
      }
      peer.ignoreOffer = false;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.payload));
      for (const candidate of peer.pendingIce) {
        await peer.pc.addIceCandidate(candidate).catch(() => undefined);
      }
      peer.pendingIce = [];
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.tuneVideo(peer.pc);
      await api("/api/voice/signal", {
        method: "POST",
        body: { channelId: this.channelId, to: payload.from, type: "answer", payload: answer },
      });
      if (!this.pendingParticipants.some((p) => p.userId === payload.from)) {
        this.pendingParticipants = [
          ...this.pendingParticipants,
          {
            channelId: this.channelId,
            userId: payload.from,
            username: payload.fromName ?? "Member",
            displayName: payload.fromName ?? "Member",
            avatarId: null,
            accentColor: null,
            muted: false,
            deafened: false,
            video: false,
            screen: false,
            badges: [],
          },
        ];
        this.emit();
      }
    } else if (payload.type === "answer") {
      const peer = this.peers.get(payload.from);
      if (!peer) return;
      if (peer.pc.signalingState !== "have-local-offer") return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.payload));
      for (const candidate of peer.pendingIce) {
        await peer.pc.addIceCandidate(candidate).catch(() => undefined);
      }
      peer.pendingIce = [];
    } else if (payload.type === "ice") {
      const peer = this.peers.get(payload.from);
      if (!peer) return;
      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(payload.payload).catch(() => undefined);
      } else {
        peer.pendingIce.push(payload.payload);
      }
    } else if (payload.type === "leave") {
      this.closePeer(payload.from);
    }
  }

  setParticipants(participants: VoiceParticipant[]) {
    const ids = new Set(participants.map((p) => p.userId));
    for (const [userId] of this.peers) {
      if (!ids.has(userId)) this.closePeer(userId);
    }
    this.pendingParticipants = participants;
    this.emit();
  }

  private closePeer(userId: string) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(userId);
    this.remoteScreens.delete(userId);
    this.remoteVideos.delete(userId);
    this.emit();
  }

  async setMuted(muted: boolean) {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted && !this.deafened;
    });
    if (this.channelId) {
      await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { muted } }).catch(() => undefined);
    }
    this.emit();
  }

  async setDeafened(deafened: boolean) {
    this.deafened = deafened;
    for (const peer of this.peers.values()) peer.audio.muted = deafened;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !this.deafened && !this.muted;
    });
    if (this.channelId) {
      await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { deafened } }).catch(() => undefined);
    }
    this.emit();
  }

  async toggleScreenShare(): Promise<void> {
    if (this.screenSharing) {
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      for (const peer of this.peers.values()) {
        for (const sender of peer.pc.getSenders()) {
          if (sender.track?.kind === "video") peer.pc.removeTrack(sender);
        }
      }
      this.screenSharing = false;
      if (this.channelId) {
        await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { screen: false } }).catch(() => undefined);
      }
      this.emit({ screenSharing: false, screenUserId: null });
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.emit({ error: "Screen sharing is not supported in this browser." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      this.screenStream = stream;
      this.screenSharing = true;
      const track = stream.getVideoTracks()[0];
      for (const peer of this.peers.values()) peer.pc.addTrack(track, stream);
      for (const userId of this.peers.keys()) {
        await this.createOffer(userId);
      }
      track.onended = () => {
        void this.toggleScreenShare();
      };
      if (this.channelId) {
        await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { screen: true } }).catch(() => undefined);
      }
      this.emit({ screenSharing: true, screenUserId: this.myId });
    } catch {
      this.emit({ error: "Screen share was cancelled." });
    }
  }

  /** Retry playback after a gesture; browsers block remote audio until then. */
  async resumeAudio(): Promise<void> {
    let blocked = false;
    for (const peer of this.peers.values()) {
      peer.audio.muted = this.deafened;
      try {
        await peer.audio.play();
      } catch {
        blocked = true;
      }
    }
    if (this.audioBlocked !== blocked) {
      this.audioBlocked = blocked;
      this.emit();
    }
  }

  /** Re-route every remote voice stream after the output device changes. */
  applyOutput(): void {
    const outputId = getAudioPrefs().outputId;
    for (const peer of this.peers.values()) void applyOutputDevice(peer.audio, outputId);
  }

  getLocalScreen(): MediaStream | null {
    return this.screenStream;
  }

  getLocalCamera(): MediaStream | null {
    return this.cameraStream;
  }

  getRemoteVideo(userId: string): MediaStream | null {
    return this.remoteVideos.get(userId) ?? null;
  }

  async toggleCamera(): Promise<void> {
    if (this.cameraStream) {
      const tracks = this.cameraStream.getTracks();
      for (const peer of this.peers.values()) {
        for (const sender of peer.pc.getSenders()) {
          if (sender.track && tracks.includes(sender.track)) peer.pc.removeTrack(sender);
        }
      }
      tracks.forEach((track) => track.stop());
      this.cameraStream = null;
      if (this.channelId) {
        await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { video: false } }).catch(() => undefined);
      }
      this.emit();
      for (const userId of [...this.peers.keys()]) await this.createOffer(userId);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.emit({ error: "Your browser cannot access a camera." });
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints() });
      this.cameraStream = cam;
      for (const track of cam.getVideoTracks()) void tuneCameraTrack(track);
      for (const peer of this.peers.values()) {
        for (const track of cam.getVideoTracks()) peer.pc.addTrack(track, cam);
        this.tuneVideo(peer.pc);
      }
      if (this.channelId) {
        await api(`/api/voice/${this.channelId}/state`, { method: "PATCH", body: { video: true } }).catch(() => undefined);
      }
      this.emit();
      for (const userId of [...this.peers.keys()]) await this.createOffer(userId);
    } catch {
      this.emit({ error: "Camera permission was blocked." });
    }
  }

  getRemoteScreen(userId: string | null): MediaStream | null {
    if (!userId) return null;
    return this.remoteScreens.get(userId) ?? null;
  }

  async leave(): Promise<void> {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    for (const userId of [...this.peers.keys()]) this.closePeer(userId);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.audioBlocked = false;
    this.remoteScreens.clear();
    this.remoteVideos.clear();
    this.isCall = false;
    if (this.channelId) {
      await api("/api/voice/leave", { method: "POST", body: { channelId: this.channelId } }).catch(() => undefined);
    }
    this.channelId = null;
    this.channelName = null;
    this.serverId = null;
    this.screenSharing = false;
    this.emit({
      connected: false,
      connecting: false,
      channelId: null,
      channelName: null,
      serverId: null,
      participants: [],
      screenSharing: false,
      screenUserId: null,
      cameraOn: false,
      isCall: false,
      audioBlocked: false,
      error: null,
    });
  }
}
