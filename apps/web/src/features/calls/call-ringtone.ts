"use client";

const ringtonePreferenceKey = "familychat.call-ringtone.enabled";
const vibratePattern = [420, 180, 420, 700];

let audioContext: AudioContext | null = null;
let ringTimer: number | null = null;
let vibrateTimer: number | null = null;
let activeOscillators: OscillatorNode[] = [];

function browserAudioContext() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

function context() {
  audioContext ??= browserAudioContext();
  return audioContext;
}

function setRingtonePreference(enabled: boolean) {
  window.localStorage.setItem(ringtonePreferenceKey, enabled ? "1" : "0");
}

export function callRingtoneEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(ringtonePreferenceKey) === "1";
}

export async function unlockCallRingtone() {
  const nextContext = context();
  if (!nextContext) {
    return false;
  }
  await nextContext.resume();

  const oscillator = nextContext.createOscillator();
  const gain = nextContext.createGain();
  gain.gain.value = 0.0001;
  oscillator.frequency.value = 440;
  oscillator.connect(gain);
  gain.connect(nextContext.destination);
  oscillator.start();
  oscillator.stop(nextContext.currentTime + 0.05);

  setRingtonePreference(true);
  return true;
}

function stopActiveOscillators() {
  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have stopped naturally.
    }
  }
  activeOscillators = [];
}

function playRingBurst() {
  const nextContext = context();
  if (!nextContext || nextContext.state === "suspended") {
    return;
  }

  stopActiveOscillators();

  const now = nextContext.currentTime;
  const gain = nextContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
  gain.connect(nextContext.destination);

  for (const frequency of [740, 932]) {
    const oscillator = nextContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 1.5);
    activeOscillators.push(oscillator);
  }
}

export async function startCallRingtone() {
  if (!callRingtoneEnabled()) {
    return false;
  }

  const nextContext = context();
  if (!nextContext) {
    return false;
  }
  await nextContext.resume().catch(() => undefined);
  if (nextContext.state !== "running") {
    return false;
  }

  if (ringTimer === null) {
    playRingBurst();
    ringTimer = window.setInterval(playRingBurst, 2400);
  }
  if (vibrateTimer === null && "vibrate" in window.navigator) {
    window.navigator.vibrate(vibratePattern);
    vibrateTimer = window.setInterval(() => window.navigator.vibrate(vibratePattern), 2600);
  }
  return true;
}

export function stopCallRingtone() {
  if (ringTimer !== null) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }
  if (vibrateTimer !== null) {
    window.clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  window.navigator.vibrate?.(0);
  stopActiveOscillators();
}
