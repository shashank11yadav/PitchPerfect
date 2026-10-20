"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpeechErrorCode } from "./practice-reducer";

/**
 * The Web Speech API's recognizer, as far as this hook uses it. TypeScript's DOM library has the
 * event types but not the constructor, which browsers ship prefixed or not at all.
 */
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** Chrome's on-device mode: audio never leaves the machine. */
  processLocally?: boolean;
  onresult: ((event: Pick<SpeechRecognitionEvent, "results">) => void) | null;
  onerror: ((event: Pick<SpeechRecognitionErrorEvent, "error">) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognizerConstructor {
  new (): Recognizer;
  /** Whether on-device recognition is installed for these languages (Chrome 139+). */
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
}

type SpeechWindow = Window & {
  SpeechRecognition?: RecognizerConstructor;
  webkitSpeechRecognition?: RecognizerConstructor;
};

function recognizerConstructor(): RecognizerConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

/** Whether this browser has speech recognition at all (Firefox doesn't). */
export const speechRecognitionSupported = () => recognizerConstructor() !== undefined;

const KNOWN: ReadonlySet<string> = new Set<SpeechErrorCode>([
  "not-allowed",
  "service-not-allowed",
  "network",
  "no-speech",
  "aborted",
]);

/** Browser error names onto the five the room handles. No microphone counts as not allowed. */
function errorCode(raw: string): SpeechErrorCode {
  if (KNOWN.has(raw)) return raw as SpeechErrorCode;
  return raw === "audio-capture" ? "not-allowed" : "service-not-allowed";
}

/** Everything heard in this session, finished phrases and the one still being spoken. */
function heardText(results: SpeechRecognitionResultList): string {
  let text = "";
  for (const result of Array.from(results)) text += result[0]?.transcript ?? "";
  return text.replace(/\s+/g, " ").trim();
}

const noSubscription = () => () => undefined;

interface Options {
  lang: string;
  /** Called with everything heard so far; `final` once listening has stopped. */
  onResult?: (text: string, final: boolean) => void;
  onError?: (code: SpeechErrorCode) => void;
}

/**
 * Push-to-talk speech to text with the browser's own recognizer. It only ever reports text: the
 * caller decides what to do with it, and nothing is sent anywhere by this hook. Where the browser
 * can recognize speech on the device, that is used so the audio stays on the machine.
 */
export function useSpeechRecognition({ lang, onResult, onError }: Options) {
  // The constructor never changes once the page has loaded; false on the server.
  const supported = useSyncExternalStore(noSubscription, speechRecognitionSupported, () => false);
  const [onDevice, setOnDevice] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechErrorCode | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const callbacks = useRef({ onResult, onError });

  useEffect(() => {
    callbacks.current = { onResult, onError };
  });

  const checked = useRef(false);
  /**
   * Asks once whether on-device recognition is installed. Called when the student reaches for the
   * mic rather than on load: the query is cheap, but some headless builds crash on it, and a page
   * that never uses voice has no reason to ask.
   */
  const prepare = useCallback(() => {
    if (checked.current) return;
    checked.current = true;
    const Constructor = recognizerConstructor();
    if (typeof Constructor?.available !== "function") return;
    // Called on the constructor: a detached static method throws in Chrome.
    Constructor.available({ langs: [lang], processLocally: true }).then(
      (status) => {
        // Only when it's ready: "downloadable" would start a large download nobody asked for.
        setOnDevice(status === "available");
      },
      () => undefined,
    );
  }, [lang]);

  useEffect(
    () => () => {
      const active = recognizer.current;
      if (!active) return;
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      active.abort();
    },
    [],
  );

  const start = useCallback(() => {
    const Constructor = recognizerConstructor();
    if (!Constructor || recognizer.current) return;
    prepare();
    const instance = new Constructor();
    instance.lang = lang;
    instance.continuous = true;
    instance.interimResults = true;
    if (onDevice) instance.processLocally = true;

    let heard = "";
    instance.onresult = (event) => {
      heard = heardText(event.results);
      setInterim(heard);
      callbacks.current.onResult?.(heard, false);
    };
    instance.onerror = (event) => {
      const code = errorCode(event.error);
      setError(code);
      callbacks.current.onError?.(code);
    };
    // Also fires when the browser stops by itself after a silence: keep what it heard.
    instance.onend = () => {
      recognizer.current = null;
      setListening(false);
      callbacks.current.onResult?.(heard, true);
    };

    recognizer.current = instance;
    setError(null);
    setInterim("");
    setListening(true);
    try {
      instance.start();
    } catch {
      recognizer.current = null;
      setListening(false);
      setError("service-not-allowed");
      callbacks.current.onError?.("service-not-allowed");
    }
  }, [lang, onDevice, prepare]);

  const stop = useCallback(() => {
    recognizer.current?.stop();
  }, []);

  return { supported, onDevice, listening, interim, prepare, start, stop, error };
}
