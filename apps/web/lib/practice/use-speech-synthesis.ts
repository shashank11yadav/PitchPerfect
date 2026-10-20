"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const VOICE_KEY = "pp.practice.voice";
const MUTED_KEY = "pp.practice.muted";
const LANG_PREFIX = "en";

/** Storage can be missing or throw (private mode, blocked site data); a setting is then simply not kept. */
function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not kept for next time; it still applies now.
  }
}

const synth = () =>
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

let cachedKey = "";
let cachedVoices: SpeechSynthesisVoice[] = [];
const NO_VOICES: SpeechSynthesisVoice[] = [];

/** English voices, the same array until the list really changes (voices load late in Chrome). */
function englishVoices(): SpeechSynthesisVoice[] {
  const all = synth()?.getVoices() ?? [];
  const english = all.filter((voice) => voice.lang.toLowerCase().startsWith(LANG_PREFIX));
  const key = english.map((voice) => voice.voiceURI).join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = english;
  }
  return cachedVoices;
}

function subscribeVoices(onChange: () => void) {
  const speech = synth();
  speech?.addEventListener("voiceschanged", onChange);
  return () => {
    speech?.removeEventListener("voiceschanged", onChange);
  };
}

const noSubscription = () => () => undefined;

/**
 * The partner's voice, with the browser's `speechSynthesis`. The chosen voice and mute are kept
 * in this browser only. Captions are always on screen, so muting loses nothing.
 */
export function useSpeechSynthesis() {
  const supported = useSyncExternalStore(
    noSubscription,
    () => synth() !== null,
    () => false,
  );
  const voices = useSyncExternalStore(subscribeVoices, englishVoices, () => NO_VOICES);
  // The room only renders in the browser (after the session check), so storage is readable here.
  const [voiceURI, setVoiceURI] = useState<string | null>(() => readSetting(VOICE_KEY));
  const [muted, setMutedState] = useState(() => readSetting(MUTED_KEY) === "true");

  const voice =
    voices.find((candidate) => candidate.voiceURI === voiceURI) ??
    voices.find((candidate) => candidate.default) ??
    voices[0] ??
    null;

  const setVoice = useCallback((uri: string) => {
    setVoiceURI(uri);
    writeSetting(VOICE_KEY, uri);
  }, []);

  const cancel = useCallback(() => {
    synth()?.cancel();
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeSetting(MUTED_KEY, next ? "true" : null);
    if (next) synth()?.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      const speech = synth();
      if (!speech || muted || !text.trim()) return;
      speech.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice;
      speech.speak(utterance);
    },
    [muted, voice],
  );

  return { supported, voices, voice, setVoice, speak, cancel, muted, setMuted };
}
