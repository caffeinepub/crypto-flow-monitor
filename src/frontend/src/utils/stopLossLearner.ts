// Stop Loss Learning System
// Analyzes candle patterns when a trade hits SL, stores danger patterns,
// and checks future entries against known failure patterns.

export interface DangerPattern {
  id: string;
  symbol: string;
  modality: string;
  detectedAt: number;
  entryPrice: number;
  patterns: {
    bearishEngulf: boolean;
    shootingStar: boolean;
    eveningStar: boolean;
    dojiAtTop: boolean;
    lowerHighFormed: boolean;
    bos_bearish: boolean;
    choch_bearish: boolean;
    distributionPhase: boolean;
    stopHuntUp: boolean;
    highVolumeRejection: boolean;
    fundingPositiveExtreme: boolean;
    rsiOverbought: boolean;
  };
  tfScores: Record<string, number>;
  summary: string;
}

const DANGER_PATTERNS_KEY = "cfm_danger_patterns_v1";
const MAX_DANGER_PATTERNS = 20;

export function saveDangerPatterns(patterns: DangerPattern[]): void {
  try {
    localStorage.setItem(DANGER_PATTERNS_KEY, JSON.stringify(patterns));
  } catch {
    // ignore
  }
}

export function loadDangerPatterns(): DangerPattern[] {
  try {
    const raw = localStorage.getItem(DANGER_PATTERNS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DangerPattern[];
  } catch {
    return [];
  }
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 100,
): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Klines fetch failed: ${res.status}`);
  const data = (await res.json()) as [
    number,
    string,
    string,
    string,
    string,
    string,
    ...unknown[],
  ][];
  return data.map((k) => ({
    open: Number.parseFloat(k[1]),
    high: Number.parseFloat(k[2]),
    low: Number.parseFloat(k[3]),
    close: Number.parseFloat(k[4]),
    volume: Number.parseFloat(k[5]),
  }));
}

function computeRSI(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function detectPatterns(
  candles: Candle[],
): Omit<DangerPattern["patterns"], "fundingPositiveExtreme" | "rsiOverbought"> {
  const n = candles.length;
  if (n < 5) {
    return {
      bearishEngulf: false,
      shootingStar: false,
      eveningStar: false,
      dojiAtTop: false,
      lowerHighFormed: false,
      bos_bearish: false,
      choch_bearish: false,
      distributionPhase: false,
      stopHuntUp: false,
      highVolumeRejection: false,
    };
  }

  const last = candles[n - 1];
  const prev = candles[n - 2];
  const prev2 = candles[n - 3];

  // Bearish engulfing
  const prevBullish = prev.close > prev.open;
  const lastBearish = last.close < last.open;
  const bearishEngulf =
    prevBullish &&
    lastBearish &&
    last.open >= prev.close &&
    last.close <= prev.open;

  // Shooting star
  const lastBody = Math.abs(last.close - last.open);
  const lastRange = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerBodyPos =
    (Math.min(last.open, last.close) - last.low) / Math.max(lastRange, 0.0001);
  const shootingStar =
    lastRange > 0 &&
    upperWick > 2 * lastBody &&
    lowerBodyPos <= 0.3 &&
    lastBearish;

  // Evening star
  const eveningStar =
    prev2.close > prev2.open &&
    Math.abs(prev.close - prev.open) < (prev2.high - prev2.low) * 0.3 &&
    last.close < last.open &&
    last.close < (prev2.open + prev2.close) / 2;

  // Doji at top: doji after 3 uptrending candles
  const bodyFraction = lastRange > 0 ? lastBody / lastRange : 0;
  const uptrend3 = candles[n - 2].close > candles[n - 4].close;
  const dojiAtTop = bodyFraction < 0.1 && uptrend3;

  // Lower high formed
  const swingHighs: number[] = [];
  for (let i = 2; i < n - 1; i++) {
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i + 1].high
    ) {
      swingHighs.push(candles[i].high);
    }
  }
  const lowerHighFormed =
    swingHighs.length >= 2 &&
    swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];

  // Bearish BOS: close breaks below previous swing low
  const swingLows: number[] = [];
  for (let i = 2; i < n - 1; i++) {
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i + 1].low
    ) {
      swingLows.push(candles[i].low);
    }
  }
  const prevSwingLow =
    swingLows.length >= 2 ? swingLows[swingLows.length - 2] : null;
  const bos_bearish = prevSwingLow !== null && last.close < prevSwingLow;

  // CHoCH bearish: after uptrend, first lower high + lower low
  const choch_bearish =
    lowerHighFormed &&
    swingLows.length >= 2 &&
    swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];

  // Distribution phase: price near recent highs with decreasing volume
  const last50 = candles.slice(Math.max(0, n - 50));
  const rangeHigh = Math.max(...last50.map((c) => c.high));
  const rangeLow = Math.min(...last50.map((c) => c.low));
  const rangeSize = rangeHigh - rangeLow;
  const priceInTopZone =
    rangeSize > 0 && (last.close - rangeLow) / rangeSize > 0.8;
  const recentVolAvg = last50.slice(-10).reduce((s, c) => s + c.volume, 0) / 10;
  const olderVolAvg =
    last50.slice(0, 20).reduce((s, c) => s + c.volume, 0) / 20;
  const distributionPhase = priceInTopZone && recentVolAvg < olderVolAvg * 0.85;

  // Stop hunt up: wick exceeds recent high then closes back below
  const recentHigh = Math.max(
    ...candles.slice(n - 10, n - 1).map((c) => c.high),
  );
  const stopHuntUp = last.high > recentHigh * 1.005 && last.close < recentHigh;

  // High volume rejection
  const avgVol =
    candles.slice(n - 20, n - 1).reduce((s, c) => s + c.volume, 0) / 19;
  const highVolumeRejection = last.volume > avgVol * 2 && lastBearish;

  return {
    bearishEngulf,
    shootingStar,
    eveningStar,
    dojiAtTop,
    lowerHighFormed,
    bos_bearish,
    choch_bearish,
    distributionPhase,
    stopHuntUp,
    highVolumeRejection,
  };
}

function buildSummary(
  patterns: DangerPattern["patterns"],
  tfScores: Record<string, number>,
): string {
  const parts: string[] = [];

  if (patterns.bearishEngulf) parts.push("engolfo bearish");
  if (patterns.shootingStar) parts.push("estrela cadente");
  if (patterns.eveningStar) parts.push("estrela da noite");
  if (patterns.dojiAtTop) parts.push("doji no topo");
  if (patterns.stopHuntUp) parts.push("stop hunt detectado");
  if (patterns.bos_bearish) parts.push("quebra de estrutura bearish (BOS)");
  if (patterns.choch_bearish) parts.push("mudança de caráter bearish (CHoCH)");
  if (patterns.distributionPhase) parts.push("fase de distribuição ativa");
  if (patterns.lowerHighFormed) parts.push("topos mais baixos formados");
  if (patterns.highVolumeRejection) parts.push("rejeição com alto volume");
  if (patterns.rsiOverbought) parts.push("RSI sobrecomprado");
  if (patterns.fundingPositiveExtreme)
    parts.push("funding extremamente positivo");

  const topTfs = Object.entries(tfScores)
    .filter(([, s]) => s >= 40)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([tf]) => tf);

  if (parts.length === 0)
    return "Padrões fracos detectados nos múltiplos timeframes.";

  let summary = "Entrada em zona de risco";
  if (topTfs.length > 0)
    summary += ` com ${parts.slice(0, 3).join(", ")} em ${topTfs.join(" e ")}`;
  else summary += ` com ${parts.slice(0, 3).join(", ")}`;
  summary += ".";

  return summary;
}

export async function triggerStopLossAnalysis(
  symbol: string,
  modality: string,
  entryPrice: number,
  _entryTime: number,
): Promise<void> {
  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];
  const TOTAL_PATTERNS = 10; // excluding funding and rsi (fetched separately)

  let rsiOverbought = false;
  let fundingPositiveExtreme = false;

  const tfScores: Record<string, number> = {};
  const aggregatedPatterns: Omit<
    DangerPattern["patterns"],
    "fundingPositiveExtreme" | "rsiOverbought"
  > = {
    bearishEngulf: false,
    shootingStar: false,
    eveningStar: false,
    dojiAtTop: false,
    lowerHighFormed: false,
    bos_bearish: false,
    choch_bearish: false,
    distributionPhase: false,
    stopHuntUp: false,
    highVolumeRejection: false,
  };

  await Promise.allSettled(
    timeframes.map(async (tf) => {
      try {
        const candles = await fetchKlines(symbol, tf, 100);
        const detected = detectPatterns(candles);

        // Aggregate: if detected in any TF, mark true
        for (const key of Object.keys(
          aggregatedPatterns,
        ) as (keyof typeof aggregatedPatterns)[]) {
          if (detected[key]) aggregatedPatterns[key] = true;
        }

        // TF score
        const count = Object.values(detected).filter(Boolean).length;
        tfScores[tf] = Math.round((count / TOTAL_PATTERNS) * 100);

        // RSI from 15m
        if (tf === "15m") {
          const rsi = computeRSI(candles);
          if (rsi > 70) rsiOverbought = true;
        }
      } catch {
        tfScores[tf] = 0;
      }
    }),
  );

  // Fetch funding
  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
    );
    if (res.ok) {
      const data = (await res.json()) as { fundingRate: string }[];
      if (data.length > 0 && Number.parseFloat(data[0].fundingRate) > 0.0005) {
        fundingPositiveExtreme = true;
      }
    }
  } catch {
    // ignore
  }

  const patterns: DangerPattern["patterns"] = {
    ...aggregatedPatterns,
    fundingPositiveExtreme,
    rsiOverbought,
  };

  const summary = buildSummary(patterns, tfScores);

  const dp: DangerPattern = {
    id: `dp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    symbol,
    modality,
    detectedAt: Date.now(),
    entryPrice,
    patterns,
    tfScores,
    summary,
  };

  const existing = loadDangerPatterns();
  const updated = [dp, ...existing].slice(0, MAX_DANGER_PATTERNS);
  saveDangerPatterns(updated);
}

export async function checkDangerPatterns(
  symbol: string,
): Promise<{ matchScore: number; matchedPatterns: string[]; warning: string }> {
  const stored = loadDangerPatterns();
  if (stored.length === 0)
    return { matchScore: 0, matchedPatterns: [], warning: "" };

  const patternNamesPt: Record<string, string> = {
    bearishEngulf: "Engolfo bearish",
    shootingStar: "Estrela cadente",
    eveningStar: "Estrela da noite",
    dojiAtTop: "Doji no topo",
    lowerHighFormed: "Topos mais baixos",
    bos_bearish: "BOS bearish",
    choch_bearish: "CHoCH bearish",
    distributionPhase: "Distribuição ativa",
    stopHuntUp: "Stop hunt",
    highVolumeRejection: "Rejeição com volume",
    fundingPositiveExtreme: "Funding extremo",
    rsiOverbought: "RSI sobrecomprado",
  };

  let rsiOverbought = false;
  const currentPatterns: Omit<
    DangerPattern["patterns"],
    "fundingPositiveExtreme" | "rsiOverbought"
  > = {
    bearishEngulf: false,
    shootingStar: false,
    eveningStar: false,
    dojiAtTop: false,
    lowerHighFormed: false,
    bos_bearish: false,
    choch_bearish: false,
    distributionPhase: false,
    stopHuntUp: false,
    highVolumeRejection: false,
  };

  try {
    await Promise.allSettled(
      ["15m", "1h", "4h"].map(async (tf) => {
        try {
          const candles = await fetchKlines(symbol, tf, 30);
          const detected = detectPatterns(candles);
          for (const key of Object.keys(
            currentPatterns,
          ) as (keyof typeof currentPatterns)[]) {
            if (detected[key]) currentPatterns[key] = true;
          }
          if (tf === "15m") {
            const rsi = computeRSI(candles);
            if (rsi > 70) rsiOverbought = true;
          }
        } catch {
          // ignore
        }
      }),
    );
  } catch {
    return { matchScore: 0, matchedPatterns: [], warning: "" };
  }

  const fullCurrent: DangerPattern["patterns"] = {
    ...currentPatterns,
    fundingPositiveExtreme: false,
    rsiOverbought,
  };

  let bestScore = 0;
  const matchedSet = new Set<string>();

  for (const dp of stored) {
    const trueInStored = Object.keys(dp.patterns).filter(
      (k) => dp.patterns[k as keyof DangerPattern["patterns"]],
    );
    if (trueInStored.length === 0) continue;

    const matches = trueInStored.filter(
      (k) => fullCurrent[k as keyof DangerPattern["patterns"]],
    );
    const overlap = Math.round((matches.length / trueInStored.length) * 100);

    if (overlap > bestScore) bestScore = overlap;
    for (const m of matches) matchedSet.add(m);
  }

  const matchedPatterns = [...matchedSet].map((k) => patternNamesPt[k] ?? k);

  let warning = "";
  if (bestScore >= 60 && matchedPatterns.length > 0) {
    warning = `Padrão de perda detectado: ${matchedPatterns.slice(0, 3).join(", ")}`;
  }

  return { matchScore: bestScore, matchedPatterns, warning };
}
