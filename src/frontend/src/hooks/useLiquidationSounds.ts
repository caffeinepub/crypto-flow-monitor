import { useCallback, useEffect, useRef, useState } from "react";
import type { LiquidationData } from "../types/binance";

const FRENZY_THRESHOLD = 5;
const FRENZY_WINDOW_MS = 30_000;

function getOrCreateAudioContext(
  ref: React.MutableRefObject<AudioContext | null>,
): AudioContext | null {
  if (ref.current) return ref.current;
  try {
    ref.current = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    return ref.current;
  } catch {
    return null;
  }
}

async function ensureResumed(ctx: AudioContext) {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + delay + duration,
  );
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

function playUnlockBeep(ctx: AudioContext) {
  playTone(ctx, 440, 0.05, 0.01, "sine", 0);
}

function playSound100k(ctx: AudioContext) {
  playTone(ctx, 440, 0.15, 0.3, "square");
}

function playSound250k(ctx: AudioContext) {
  playTone(ctx, 550, 0.18, 0.35, "square", 0);
  playTone(ctx, 700, 0.18, 0.35, "square", 0.12);
}

function playSound500k(ctx: AudioContext) {
  playTone(ctx, 660, 0.15, 0.4, "sawtooth", 0);
  playTone(ctx, 880, 0.15, 0.4, "sawtooth", 0.15);
  playTone(ctx, 1100, 0.2, 0.4, "sawtooth", 0.3);
}

function playSound1M(ctx: AudioContext) {
  playTone(ctx, 220, 0.5, 0.5, "sawtooth", 0);
  playTone(ctx, 440, 0.5, 0.45, "sawtooth", 0);
  playTone(ctx, 660, 0.5, 0.4, "sawtooth", 0);
  playTone(ctx, 880, 0.4, 0.35, "sawtooth", 0.1);
}

function playFrenzySound(ctx: AudioContext) {
  for (let i = 0; i < 5; i++) {
    playTone(ctx, 880, 0.08, 0.5, "square", i * 0.12);
    playTone(ctx, 660, 0.08, 0.5, "square", i * 0.12 + 0.06);
  }
}

export function useLiquidationSounds(liquidations: LiquidationData[]) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [frenzyActive, setFrenzyActive] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevCountRef = useRef<number>(0);
  const lastFrenzyRef = useRef<number>(0);
  const lastSoundTimeRef = useRef<Record<string, number>>({});

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        // Must create AND unlock AudioContext inside the user gesture handler
        const ctx = getOrCreateAudioContext(audioCtxRef);
        if (ctx) {
          ensureResumed(ctx).then(() => {
            // Silent beep to fully unlock audio on mobile/PWA
            playUnlockBeep(ctx);
          });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!soundEnabled) return;
    if (liquidations.length <= prevCountRef.current) {
      prevCountRef.current = liquidations.length;
      return;
    }

    const delta = liquidations.length - prevCountRef.current;
    prevCountRef.current = liquidations.length;

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    ensureResumed(ctx).then(() => {
      const newLiqs = liquidations.slice(0, delta);
      const now = Date.now();

      for (const liq of newLiqs) {
        const val = liq.notionalValue;
        if (val < 100_000) continue;

        let tier: string;
        if (val >= 1_000_000) tier = "1M";
        else if (val >= 500_000) tier = "500K";
        else if (val >= 250_000) tier = "250K";
        else tier = "100K";

        const lastTime = lastSoundTimeRef.current[tier] ?? 0;
        if (now - lastTime < 800) continue;
        lastSoundTimeRef.current[tier] = now;

        if (val >= 1_000_000) playSound1M(ctx);
        else if (val >= 500_000) playSound500k(ctx);
        else if (val >= 250_000) playSound250k(ctx);
        else playSound100k(ctx);
      }
    });
  }, [liquidations, soundEnabled]);

  useEffect(() => {
    const windowStart = Date.now() - FRENZY_WINDOW_MS;
    const bigRecent = liquidations.filter(
      (l) => l.notionalValue >= 100_000 && l.time >= windowStart,
    );
    const isFrenzy = bigRecent.length >= FRENZY_THRESHOLD;
    setFrenzyActive(isFrenzy);

    if (isFrenzy && soundEnabled) {
      const ctx = audioCtxRef.current;
      const now = Date.now();
      if (ctx && now - lastFrenzyRef.current > 8_000) {
        lastFrenzyRef.current = now;
        ensureResumed(ctx).then(() => playFrenzySound(ctx));
      }
    }
  }, [liquidations, soundEnabled]);

  return { soundEnabled, toggleSound, frenzyActive };
}
