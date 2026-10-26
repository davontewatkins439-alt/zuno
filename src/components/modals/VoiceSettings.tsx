import React, { useEffect, useRef, useState } from "react";
import { Camera, Mic, RefreshCw, Volume2 } from "lucide-react";
import { useApp } from "../../state";
import {
  audioConstraints,
  canSelectOutput,
  deviceLabel,
  getAudioPrefs,
  listDevices,
  setAudioPrefs,
  videoConstraints,
  type AudioPrefs,
  type DeviceList,
} from "../../lib/audio-devices";

const EMPTY: DeviceList = { inputs: [], outputs: [], cameras: [] };

export function VoiceSettings() {
  const app = useApp();
  const [prefs, setPrefs] = useState<AudioPrefs>(() => getAudioPrefs());
  const [devices, setDevices] = useState<DeviceList>(EMPTY);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const refresh = async () => {
    try {
      setDevices(await listDevices());
    } catch {
      setError("ZUNO could not list your devices.");
    }
  };

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, []);

  // Live input meter so people can pick the mic that actually works.
  useEffect(() => {
    let cancelled = false;
    let loop = 0;
    let audio: AudioContext | null = null;
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        void refresh();
        audio = new AudioContext();
        const source = audio.createMediaStreamSource(stream);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
          setLevel(peak);
          loop = requestAnimationFrame(tick);
        };
        tick();
        setError(null);
      } catch {
        if (!cancelled) setError("Microphone access was blocked, so the input meter cannot run.");
      }
    };

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(loop);
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.inputId, prefs.echoCancellation, prefs.noiseSuppression, prefs.autoGainControl]);

  // Camera preview uses the exact device people selected.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    if (!previewing) {
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints() });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        void refresh();
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setError("Camera access was blocked, so the preview cannot start.");
        setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, prefs.cameraId]);

  const update = (patch: Partial<AudioPrefs>) => {
    const next = setAudioPrefs(patch);
    setPrefs(next);
    if ("outputId" in patch) app.applyVoiceOutput();
  };

  const outputSupported = canSelectOutput();

  return (
    <div className="form-stack">
      <h3 className="settings-heading">Voice &amp; video</h3>
      <p className="form-hint">Devices apply the next time you join a voice channel or start a call in this browser.</p>

      {error && <p className="form-error">{error}</p>}

      <label className="field">
        <span>
          <Mic size={13} /> Input device
        </span>
        <select value={prefs.inputId} onChange={(event) => update({ inputId: event.target.value })}>
          <option value="">System default</option>
          {devices.inputs.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {deviceLabel(device, index, "Microphone")}
            </option>
          ))}
        </select>
      </label>

      <div className="mic-meter">
        <div className="mic-meter-head">
          <span>Mic test</span>
          <button type="button" className="ghost-btn small" onClick={() => setMuted((value) => !value)}>
            {muted ? "Resume test" : "Mute test"}
          </button>
        </div>
        <div className="mic-meter-bar">
          <i style={{ width: `${muted ? 0 : Math.min(100, Math.round(level * 160))}%` }} />
        </div>
        <span className="form-hint">{muted ? "Test paused." : "Speak to check this microphone picks you up."}</span>
      </div>

      <label className="field">
        <span>
          <Volume2 size={13} /> Output device
        </span>
        <select
          value={prefs.outputId}
          disabled={!outputSupported}
          onChange={(event) => update({ outputId: event.target.value })}
        >
          <option value="">System default</option>
          {devices.outputs.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {deviceLabel(device, index, "Speaker")}
            </option>
          ))}
        </select>
      </label>
      {!outputSupported && (
        <p className="form-hint">This browser cannot route audio to a specific speaker. Chrome or Edge on desktop can.</p>
      )}
      <button type="button" className="ghost-btn small" onClick={() => void app.testSpeaker()}>
        <Volume2 size={13} /> Play test sound
      </button>

      <label className="field">
        <span>
          <Camera size={13} /> Camera
        </span>
        <select value={prefs.cameraId} onChange={(event) => update({ cameraId: event.target.value })}>
          <option value="">System default</option>
          {devices.cameras.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {deviceLabel(device, index, "Camera")}
            </option>
          ))}
        </select>
      </label>

      <div className="camera-preview">
        <div className="camera-preview-head">
          <span>Camera preview</span>
          <button type="button" className="ghost-btn small" onClick={() => setPreviewing((value) => !value)}>
            {previewing ? "Stop preview" : "Start preview"}
          </button>
        </div>
        <video ref={videoRef} autoPlay playsInline muted className={previewing ? "live" : ""} />
      </div>

      <h4 className="settings-heading">Audio processing</h4>
      <label className="switch-row">
        <div>
          <strong>Echo cancellation</strong>
          <span>Stops your speakers from feeding back into the mic.</span>
        </div>
        <input
          type="checkbox"
          checked={prefs.echoCancellation}
          onChange={(event) => update({ echoCancellation: event.target.checked })}
        />
      </label>
      <label className="switch-row">
        <div>
          <strong>Noise suppression</strong>
          <span>Filters background hum, fans and keyboards.</span>
        </div>
        <input
          type="checkbox"
          checked={prefs.noiseSuppression}
          onChange={(event) => update({ noiseSuppression: event.target.checked })}
        />
      </label>
      <label className="switch-row">
        <div>
          <strong>Automatic gain control</strong>
          <span>Keeps your volume steady if you move away from the mic.</span>
        </div>
        <input
          type="checkbox"
          checked={prefs.autoGainControl}
          onChange={(event) => update({ autoGainControl: event.target.checked })}
        />
      </label>

      <button type="button" className="ghost-btn" onClick={() => void refresh()}>
        <RefreshCw size={14} /> Refresh device list
      </button>
    </div>
  );
}
