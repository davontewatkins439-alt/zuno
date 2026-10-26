/**
 * Call audio. Browsers only allow audio after a user gesture, so a blocked
 * AudioContext silently no-ops instead of throwing.
 */
let context: AudioContext | null = null;
let ringTimer: number | undefined;

function ctx(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

function tone(freqs: number[], gainValue: number, spacing = 0.16, duration = 0.18, type: OscillatorType = "sine") {
  const audio = ctx();
  if (!audio) return;
  const gain = audio.createGain();
  gain.connect(audio.destination);
  const start = audio.currentTime;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + spacing * freqs.length + duration);
  freqs.forEach((freq, index) => {
    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    const at = start + index * spacing;
    osc.start(at);
    osc.stop(at + duration);
  });
}

/* Incoming call: brighter, louder two-tone ring. */
function incomingPulse() {
  tone([660, 880], 0.12, 0.28, 0.22);
}

/* Outgoing call: the quieter, lower ringback the caller hears while waiting. */
function ringbackPulse() {
  tone([440, 480], 0.05, 0.34, 0.3);
}

export function startRingtone(interval = 2200) {
  if (ringTimer) return;
  incomingPulse();
  ringTimer = window.setInterval(incomingPulse, interval);
}

export function startRingback(interval = 3000) {
  if (ringTimer) return;
  ringbackPulse();
  ringTimer = window.setInterval(ringbackPulse, interval);
}

export function stopRingtone() {
  if (ringTimer) window.clearInterval(ringTimer);
  ringTimer = undefined;
}

/* Connected: a quick rising chime. */
export function playJoinSound() {
  stopRingtone();
  tone([523.25, 659.25, 783.99], 0.09, 0.09, 0.22);
}

/* Hung up / left: a soft falling chime. */
export function playLeaveSound() {
  stopRingtone();
  tone([493.88, 349.23], 0.08, 0.12, 0.24);
}
