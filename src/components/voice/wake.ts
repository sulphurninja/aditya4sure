"use client";

/**
 * Wake-word standby using the browser's built-in speech recognition (free; in Chrome/Edge the audio is
 * processed by the browser vendor). Only used to catch the wake phrase while ADITYA is asleep; real
 * conversation audio still goes through ElevenLabs Scribe.
 */

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function wakeSupported() {
  return Boolean(ctor());
}

/** "yo wassup gang", "what's up gang", "hey aditya", "hey jarvis", "ok aditya"... */
export const WAKE =
  /\b(?:(?:hey|hi|hello|yo|ok(?:ay)?)\s+(?:aditya|jarvis|gang)|(?:yo\s+)?(?:wh?at'?s?\s*up|wass+u+p|wazz+u+p|sup)\s+(?:gang|aditya|jarvis))\b[\s,.!?]*/i;

/** Ways to end a conversation and send it back to standby. */
export const SLEEP = /^\s*(?:ok(?:ay)?\s+)?(?:bye+|good\s*bye|that'?s (?:all|it)|go to sleep|stop listening|later|see ya|chal bye|bas|that'?ll be all|thanks?,? that'?s (?:all|it))\b[\s.!,]*(?:man|dude|bro|gang|bubu)?[\s.!]*$/i;

export class WakeListener {
  private rec: Rec | null = null;
  private wanted = false;
  private fired = false;

  constructor(private onWake: (rest: string) => void, private onBlocked: (reason: string) => void) {}

  start() {
    const C = ctor();
    if (!C || this.wanted) return;
    this.wanted = true;
    this.fired = false;
    this.spawn(C);
  }

  stop() {
    this.wanted = false;
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
  }

  private spawn(C: RecCtor) {
    const rec = new C();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    let pendingWake = false;
    rec.onresult = (e) => {
      if (this.fired) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        const m = WAKE.exec(text);
        if (!m) continue;
        pendingWake = true;
        // Wait for the final version so "yo wassup gang what's on today" arrives whole.
        if (r.isFinal) {
          this.fire(text.slice(m.index + m[0].length).trim());
          return;
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wanted = false;
        this.onBlocked("the browser blocked speech recognition for the wake word");
      }
    };
    rec.onend = () => {
      // Chrome ends continuous recognition every so often; keep standby alive.
      if (pendingWake && !this.fired) this.fire("");
      if (this.wanted && !this.fired) setTimeout(() => this.wanted && !this.fired && this.spawn(C), 300);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      /* start while starting: ignore, onend will retry */
    }
  }

  private fire(rest: string) {
    if (this.fired) return;
    this.fired = true;
    this.stop();
    this.onWake(rest);
  }
}

/** Tiny two-note chime (free, generated locally). up = waking, down = going to sleep. */
export function chime(ctx: AudioContext, up = true) {
  const t = ctx.currentTime;
  const notes = up ? [660, 990] : [880, 520];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.25);
  });
}
