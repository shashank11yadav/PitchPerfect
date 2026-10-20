import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeechRecognition } from "./use-speech-recognition";

/** One alternative per result, like the browser's `SpeechRecognitionResultList`. */
function resultEvent(parts: { text: string; final: boolean }[]) {
  return {
    resultIndex: 0,
    results: parts.map((part) =>
      Object.assign([{ transcript: part.text }], { isFinal: part.final }),
    ),
  };
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static available?: (options: unknown) => Promise<string>;
  lang = "";
  continuous = false;
  interimResults = false;
  processLocally = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
}

function installRecognition(name: "SpeechRecognition" | "webkitSpeechRecognition") {
  FakeRecognition.instances = [];
  vi.stubGlobal(name, FakeRecognition);
}

const latest = () => {
  const instance = FakeRecognition.instances.at(-1);
  if (!instance) throw new Error("no recognition started");
  return instance;
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete FakeRecognition.available;
});

describe("useSpeechRecognition", () => {
  it("is unsupported without a recognition constructor", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US" }));
    expect(result.current.supported).toBe(false);
    act(() => {
      result.current.start();
    });
    expect(result.current.listening).toBe(false);
  });

  it("uses the prefixed constructor and reports interim then final text", () => {
    installRecognition("webkitSpeechRecognition");
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US", onResult }));
    expect(result.current.supported).toBe(true);

    act(() => {
      result.current.start();
    });
    const recognition = latest();
    expect(recognition).toMatchObject({ lang: "en-US", continuous: true, interimResults: true });
    expect(recognition.start).toHaveBeenCalled();
    expect(result.current.listening).toBe(true);

    act(() => {
      recognition.onresult?.(
        resultEvent([
          { text: "We help", final: true },
          { text: " freight teams", final: false },
        ]),
      );
    });
    expect(result.current.interim).toBe("We help freight teams");
    expect(onResult).toHaveBeenLastCalledWith("We help freight teams", false);

    act(() => {
      result.current.stop();
    });
    expect(result.current.listening).toBe(false);
    expect(onResult).toHaveBeenLastCalledWith("We help freight teams", true);
  });

  it("keeps what was heard when the browser stops on its own after silence", () => {
    installRecognition("SpeechRecognition");
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US", onResult }));
    act(() => {
      result.current.start();
    });
    act(() => {
      latest().onresult?.(resultEvent([{ text: "Quick question", final: false }]));
      latest().onend?.();
    });
    expect(onResult).toHaveBeenLastCalledWith("Quick question", true);
    expect(result.current.listening).toBe(false);
  });

  it.each([
    ["not-allowed", "not-allowed"],
    ["service-not-allowed", "service-not-allowed"],
    ["network", "network"],
    ["no-speech", "no-speech"],
    ["aborted", "aborted"],
    ["audio-capture", "not-allowed"],
    ["language-not-supported", "service-not-allowed"],
  ])("maps the %s error to %s", (raw, code) => {
    installRecognition("SpeechRecognition");
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US", onError }));
    act(() => {
      result.current.start();
    });
    act(() => {
      latest().onerror?.({ error: raw });
      latest().onend?.();
    });
    expect(result.current.error).toBe(code);
    expect(result.current.listening).toBe(false);
    expect(onError).toHaveBeenCalledWith(code);
  });

  it("prefers on-device recognition when the browser has it for the language", async () => {
    installRecognition("SpeechRecognition");
    const available = vi.fn(() => Promise.resolve("available"));
    FakeRecognition.available = available;
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US" }));
    // Nothing is asked until the student reaches for the mic.
    expect(available).not.toHaveBeenCalled();
    act(() => {
      result.current.prepare();
      result.current.prepare();
    });

    await waitFor(() => {
      expect(result.current.onDevice).toBe(true);
    });
    expect(available).toHaveBeenCalledTimes(1);
    expect(available).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
    act(() => {
      result.current.start();
    });
    expect(latest().processLocally).toBe(true);
  });

  it("falls back to the browser's default when on-device isn't installed", async () => {
    installRecognition("SpeechRecognition");
    FakeRecognition.available = () => Promise.resolve("downloadable");
    const { result } = renderHook(() => useSpeechRecognition({ lang: "en-US" }));
    await act(async () => {
      result.current.prepare();
      await Promise.resolve();
    });
    expect(result.current.onDevice).toBe(false);
    act(() => {
      result.current.start();
    });
    expect(latest().processLocally).toBe(false);
  });

  it("stops listening when the component goes away", () => {
    installRecognition("SpeechRecognition");
    const { result, unmount } = renderHook(() => useSpeechRecognition({ lang: "en-US" }));
    act(() => {
      result.current.start();
    });
    const recognition = latest();
    unmount();
    expect(recognition.abort).toHaveBeenCalled();
  });
});
