/**
 * Voice/video device preferences, persisted per browser.
 * Empty device ids mean "system default".
 */
export interface AudioPrefs {
  inputId: string;
  outputId: string;
  cameraId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

const KEY = "zuno:audio-prefs";

const DEFAULTS: AudioPrefs = {
  inputId: "",
  outputId: "",
  cameraId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function getAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAudioPrefs(patch: Partial<AudioPrefs>): AudioPrefs {
  const next = { ...getAudioPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked; the session still uses the returned value.
  }
  return next;
}

export function audioConstraints(): MediaTrackConstraints {
  const prefs = getAudioPrefs();
  return {
    ...(prefs.inputId ? { deviceId: { exact: prefs.inputId } } : {}),
    echoCancellation: prefs.echoCancellation,
    noiseSuppression: prefs.noiseSuppression,
    autoGainControl: prefs.autoGainControl,
  };
}

export function videoConstraints(): MediaTrackConstraints {
  const prefs = getAudioPrefs();
  // Phones default to whichever camera the browser feels like, which is often
  // the rear one — pointing at the ceiling during a call. Ask for the selfie
  // camera unless an explicit camera was chosen, and match the device's own
  // orientation so portrait calls are not cropped into a letterbox strip.
  const portrait =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(orientation: portrait)").matches
      : false;
  return {
    ...(prefs.cameraId ? { deviceId: { exact: prefs.cameraId } } : { facingMode: { ideal: "user" } }),
    // Full HD at 30fps where the device can do it. `ideal` means a weaker phone
    // steps down instead of failing to start the camera at all.
    width: { ideal: portrait ? 1080 : 1920 },
    height: { ideal: portrait ? 1920 : 1080 },
    frameRate: { ideal: 30, max: 30 },
    aspectRatio: { ideal: portrait ? 9 / 16 : 16 / 9 },
  };
}

/**
 * Ask the camera for continuous focus / exposure when the hardware exposes
 * those modes, and mark the track as motion video so encoders favour frame
 * rate over still-image detail.
 */
export async function tuneCameraTrack(track: MediaStreamTrack): Promise<void> {
  if ("contentHint" in track) track.contentHint = "motion";
  const capabilities = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const advanced: Record<string, string>[] = [];
  for (const key of ["focusMode", "exposureMode", "whiteBalanceMode"]) {
    const values = capabilities[key];
    if (Array.isArray(values) && values.includes("continuous")) advanced.push({ [key]: "continuous" });
  }
  if (!advanced.length) return;
  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    // The device refused the hint; its default camera tuning still applies.
  }
}

export interface DeviceList {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
}

export async function listDevices(): Promise<DeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [], cameras: [] };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: devices.filter((d) => d.kind === "audioinput"),
    outputs: devices.filter((d) => d.kind === "audiooutput"),
    cameras: devices.filter((d) => d.kind === "videoinput"),
  };
}

export function canSelectOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** Route an audio/video element to the chosen output device when the browser allows it. */
export async function applyOutputDevice(element: HTMLMediaElement, outputId = getAudioPrefs().outputId): Promise<void> {
  const sink = (element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof sink !== "function") return;
  try {
    await sink.call(element, outputId || "");
  } catch {
    // A stale device id should not break playback; fall back to the default.
    if (outputId) await sink.call(element, "").catch(() => undefined);
  }
}

function wavFile(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);
  return buffer;
}

/** Plays a short chime through the selected speaker so routing can be checked. */
export async function playOutputTest(): Promise<void> {
  const sampleRate = 44100;
  const duration = 0.55;
  const frames = Math.floor(sampleRate * duration);
  const samples = new Int16Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const fade = Math.min(1, t / 0.02) * Math.min(1, (duration - t) / 0.12);
    const wave = Math.sin(2 * Math.PI * 660 * t) * 0.5 + Math.sin(2 * Math.PI * 990 * t) * 0.25;
    samples[i] = Math.max(-1, Math.min(1, wave * fade)) * 32767;
  }
  const url = URL.createObjectURL(new Blob([wavFile(samples, sampleRate)], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.volume = 1;
  await applyOutputDevice(audio);
  try {
    await audio.play();
  } catch {
    // A blocked autoplay attempt should not throw into the settings UI.
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function deviceLabel(device: MediaDeviceInfo, index: number, fallback: string): string {
  const label = device.label?.trim();
  return label ? label : `${fallback} ${index + 1}`;
}
