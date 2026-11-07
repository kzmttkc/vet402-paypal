import { describe, expect, it } from "vitest";
import { startSpeechInput, type SpeechEngine, type SpeechHost, type SpeechResultEvent } from "../src/speech/input.js";

class FakeEngine implements SpeechEngine {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: SpeechResultEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
    this.onend?.();
  }
  abort() {
    this.aborted += 1;
    this.onend?.();
  }
}

describe("speech input", () => {
  it("falls back to text input when the browser has no speech recognition", () => {
    const host: SpeechHost = {};
    const heard: string[] = [];
    expect(() =>
      startSpeechInput(host, {
        lang: "en-US",
        onTranscript: (text) => heard.push(text),
        onEnd: () => heard.push("end"),
      }),
    ).not.toThrow();
    expect(startSpeechInput(host, { lang: "en-US", onTranscript: () => undefined, onEnd: () => undefined })).toBeNull();
    expect(heard).toEqual([]);
  });

  it("returns to text input when recognition fails to start", () => {
    class Boom extends FakeEngine {
      override start(): void {
        throw new Error("not allowed");
      }
    }
    const session = startSpeechInput(
      { SpeechRecognition: Boom },
      { lang: "en-US", onTranscript: () => undefined, onEnd: () => undefined },
    );
    expect(session).toBeNull();
  });

  it("puts the spoken transcript into the request and ignores recognition errors", () => {
    let engine: FakeEngine | null = null;
    class Recording extends FakeEngine {
      override start(): void {
        engine = this;
        super.start();
      }
    }
    const heard: string[] = [];
    let ended = 0;
    const session = startSpeechInput(
      { webkitSpeechRecognition: Recording },
      {
        lang: "ja-JP",
        onTranscript: (text) => heard.push(text),
        onEnd: () => {
          ended += 1;
        },
      },
    );
    expect(session).not.toBeNull();
    expect(engine).not.toBeNull();
    const live = engine as FakeEngine | null;
    expect(live?.lang).toBe("ja-JP");
    expect(live?.started).toBe(1);
    live?.onresult?.({ results: [[{ transcript: "  会社の記録を集めて  " }]] });
    expect(heard).toEqual(["会社の記録を集めて"]);
    expect(() => live?.onerror?.({ error: "not-allowed" })).not.toThrow();
    expect(live?.aborted).toBe(1);
    session?.stop();
    expect(ended).toBeGreaterThan(0);
  });
});
