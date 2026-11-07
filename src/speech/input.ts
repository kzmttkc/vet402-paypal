/**
 * Browser speech input. When the Web Speech API is missing or refuses to start,
 * callers keep the text field. This module never throws.
 */

export interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string } | undefined> | undefined>;
}

export interface SpeechEngine {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechHost {
  SpeechRecognition?: new () => SpeechEngine;
  webkitSpeechRecognition?: new () => SpeechEngine;
}

export interface SpeechSession {
  stop(): void;
}

export function speechConstructor(host: SpeechHost): (new () => SpeechEngine) | null {
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

/**
 * Start one utterance. Returns null when this host has no speech recognition,
 * or when constructing or starting it throws. The text field stays in charge.
 */
export function startSpeechInput(
  host: SpeechHost,
  opts: {
    lang: string;
    onTranscript: (text: string) => void;
    onEnd: () => void;
  },
): SpeechSession | null {
  const Ctor = speechConstructor(host);
  if (!Ctor) return null;
  let engine: SpeechEngine;
  try {
    engine = new Ctor();
  } catch {
    return null;
  }
  engine.lang = opts.lang;
  engine.continuous = false;
  engine.interimResults = false;
  engine.onresult = (event) => {
    const parts: string[] = [];
    const results = event.results;
    for (let i = 0; i < results.length; i++) {
      const transcript = results[i]?.[0]?.transcript;
      if (transcript) parts.push(transcript);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) opts.onTranscript(text);
  };
  engine.onerror = () => {
    try {
      engine.abort();
    } catch {
      /* the engine is already closed; the text field remains */
    }
  };
  engine.onend = () => opts.onEnd();
  try {
    engine.start();
  } catch {
    return null;
  }
  return {
    stop() {
      try {
        engine.stop();
      } catch {
        /* stopping a finished utterance is not an error */
      }
    },
  };
}
