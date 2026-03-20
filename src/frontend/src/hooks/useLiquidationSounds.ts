import { useCallback, useEffect, useRef, useState } from "react";
import type { LiquidationData } from "../types/binance";
import { loadUiState, saveUiState } from "../utils/binanceCycleStorage";

const FRENZY_THRESHOLD = 5;
const FRENZY_WINDOW_MS = 30_000;
const SOUND_KEY = "liq_sound_enabled";
const SPIKE_CHECK_WINDOW_MS = 5 * 60 * 1000; // last 5 min
const SPIKE_MIN_HISTORY_MS = SPIKE_CHECK_WINDOW_MS * 2; // need at least 10min of data
const SPIKE_COOLDOWN_MS = 60_000; // 60s between alerts per asset
const SPIKE_MIN_RECENT = 3; // minimum 3 liquidations in window to qualify

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

/** Dramatic, energetic spike alert — rising sawtooth sweep + impact chord */
function playAssetSpikeSound(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Rising sweep — 4 rapid pulses escalating in pitch
  const freqs = [300, 500, 750, 1050];
  for (let i = 0; i < freqs.length; i++) {
    const delay = i * 0.13;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freqs[i], now + delay);
    osc.frequency.exponentialRampToValueAtTime(
      freqs[i] * 1.4,
      now + delay + 0.11,
    );
    gain.gain.setValueAtTime(0.55, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
    osc.start(now + delay);
    osc.stop(now + delay + 0.22);
  }
  // Impact chord at the end — low + high simultaneous hit
  playTone(ctx, 180, 0.6, 0.55, "sawtooth", 0.58);
  playTone(ctx, 900, 0.5, 0.5, "square", 0.58);
  playTone(ctx, 1350, 0.35, 0.4, "square", 0.62);
  // Final sharp cut-off click for energy
  playTone(ctx, 2200, 0.06, 0.3, "square", 1.05);
}

export interface SpikeAlert {
  symbol: string;
  timestamp: number;
}

export function useLiquidationSounds(liquidations: LiquidationData[]) {
  const [soundEnabled, setSoundEnabled] = useState(() =>
    loadUiState<boolean>(SOUND_KEY, false),
  );
  const [frenzyActive, setFrenzyActive] = useState(false);
  const [spikeAlert, setSpikeAlert] = useState<SpikeAlert | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevCountRef = useRef<number>(liquidations.length);
  const lastFrenzyRef = useRef<number>(0);
  const lastSoundTimeRef = useRef<Record<string, number>>({});
  const lastSpikeSoundRef = useRef<Record<string, number>>({});
  const spikeClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Attach a one-time listener that creates + resumes the AudioContext on the
   * first user interaction. This is required by desktop Chrome which blocks
   * AudioContext creation until a gesture has occurred.
   */
  const attachUnlockListener = useCallback(() => {
    const handler = () => {
      const ctx = getOrCreateAudioContext(audioCtxRef);
      if (ctx) {
        ensureResumed(ctx).then(() => {
          playUnlockBeep(ctx);
        });
      }
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
    document.addEventListener("click", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  /**
   * When soundEnabled is restored as true from localStorage (e.g. on page
   * reload) but audioCtxRef is still null, attach the one-time unlock listener
   * so the AudioContext is created + resumed on the very next user click.
   */
  useEffect(() => {
    if (!soundEnabled) return;
    if (audioCtxRef.current) return; // already initialised
    const cleanup = attachUnlockListener();
    return cleanup;
  }, [soundEnabled, attachUnlockListener]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      saveUiState(SOUND_KEY, next);
      if (next) {
        const ctx = getOrCreateAudioContext(audioCtxRef);
        if (ctx) {
          ensureResumed(ctx).then(() => {
            playUnlockBeep(ctx);
          });
        } else {
          // Fallback: attach one-time listener in case immediate creation failed
          // (some desktop browsers block even during the click handler)
          attachUnlockListener();
        }
      }
      return next;
    });
  }, [attachUnlockListener]);

  // Tier-based sound alerts (≥$100K thresholds)
  useEffect(() => {
    if (!soundEnabled) return;
    if (liquidations.length <= prevCountRef.current) {
      prevCountRef.current = liquidations.length;
      return;
    }

    const delta = liquidations.length - prevCountRef.current;
    prevCountRef.current = liquidations.length;

    // Try to obtain (or re-create) the context if it was lost
    const ctx = audioCtxRef.current ?? getOrCreateAudioContext(audioCtxRef);
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

  // Frenzy detection
  useEffect(() => {
    const windowStart = Date.now() - FRENZY_WINDOW_MS;
    const bigRecent = liquidations.filter(
      (l) => l.notionalValue >= 100_000 && l.time >= windowStart,
    );
    const isFrenzy = bigRecent.length >= FRENZY_THRESHOLD;
    setFrenzyActive(isFrenzy);

    if (isFrenzy && soundEnabled) {
      // Try to obtain (or re-create) the context if it was lost
      const ctx = audioCtxRef.current ?? getOrCreateAudioContext(audioCtxRef);
      const now = Date.now();
      if (ctx && now - lastFrenzyRef.current > 8_000) {
        lastFrenzyRef.current = now;
        ensureResumed(ctx).then(() => playFrenzySound(ctx));
      }
    }
  }, [liquidations, soundEnabled]);

  // Per-asset spike detection: 2x the 24h average rate in the last 5 min
  useEffect(() => {
    if (liquidations.length < 2) return;

    const now = Date.now();
    const oldest = liquidations[liquidations.length - 1].time;
    const totalHistoryMs = now - oldest;

    // Need enough history to compute a meaningful average
    if (totalHistoryMs < SPIKE_MIN_HISTORY_MS) return;

    // Group by asset
    const byAsset: Record<string, LiquidationData[]> = {};
    for (const liq of liquidations) {
      if (!byAsset[liq.symbol]) byAsset[liq.symbol] = [];
      byAsset[liq.symbol].push(liq);
    }

    const recentCutoff = now - SPIKE_CHECK_WINDOW_MS;

    for (const [symbol, assetLiqs] of Object.entries(byAsset)) {
      const recentLiqs = assetLiqs.filter((l) => l.time >= recentCutoff);
      const olderLiqs = assetLiqs.filter((l) => l.time < recentCutoff);

      if (recentLiqs.length < SPIKE_MIN_RECENT) continue;
      if (olderLiqs.length === 0) continue;

      const oldWindowMs = Math.max(totalHistoryMs - SPIKE_CHECK_WINDOW_MS, 1);

      // Rates in liquidations-per-minute
      const recentRate = recentLiqs.length / (SPIKE_CHECK_WINDOW_MS / 60_000);
      const avgRate = olderLiqs.length / (oldWindowMs / 60_000);

      if (avgRate === 0) continue;
      if (recentRate < avgRate * 2) continue;

      const lastSpike = lastSpikeSoundRef.current[symbol] ?? 0;
      if (now - lastSpike < SPIKE_COOLDOWN_MS) continue;

      lastSpikeSoundRef.current[symbol] = now;

      // Trigger sound
      if (soundEnabled) {
        // Try to obtain (or re-create) the context if it was lost
        const ctx = audioCtxRef.current ?? getOrCreateAudioContext(audioCtxRef);
        if (ctx) {
          ensureResumed(ctx).then(() => playAssetSpikeSound(ctx));
        }
      }

      // Show visual alert
      setSpikeAlert({ symbol: symbol.replace("USDT", ""), timestamp: now });
      if (spikeClearTimer.current) clearTimeout(spikeClearTimer.current);
      spikeClearTimer.current = setTimeout(() => setSpikeAlert(null), 12_000);

      // Only alert for the first spiking asset per cycle
      break;
    }
  }, [liquidations, soundEnabled]);

  return { soundEnabled, toggleSound, frenzyActive, spikeAlert };
}
