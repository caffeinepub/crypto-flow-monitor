import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AltcoinOpportunity,
  BTCMetrics,
  Interval,
  KlineData,
  ReversalDetails,
  ReversalSignal,
} from "../types/binance";
import {
  calculateEMA,
  calculateRSI,
  calculateResistanceLevels,
  calculateStopLoss,
  calculateTakeProfits,
} from "../utils/calculations";

const BASE = "https://fapi.binance.com";

async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 200,
): Promise<KlineData[]> {
  const res = await fetch(
    `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  );
  const raw: number[][] = await res.json();
  return raw.map((k) => ({
    openTime: k[0],
    open: Number.parseFloat(String(k[1])),
    high: Number.parseFloat(String(k[2])),
    low: Number.parseFloat(String(k[3])),
    close: Number.parseFloat(String(k[4])),
    volume: Number.parseFloat(String(k[5])),
    closeTime: k[6],
    quoteVolume: Number.parseFloat(String(k[7])),
    trades: k[8],
  }));
}

async function fetchAllTickers() {
  const res = await fetch(`${BASE}/fapi/v1/ticker/24hr`);
  return res.json();
}

async function fetchFundingRates() {
  const res = await fetch(`${BASE}/fapi/v1/premiumIndex`);
  return res.json();
}

async function fetchOpenInterest(symbol: string) {
  const res = await fetch(`${BASE}/fapi/v1/openInterest?symbol=${symbol}`);
  return res.json();
}

// ─── KNOWLEDGE BASE: PRICE ACTION & CANDLE PATTERN DETECTION ─────────────────

/**
 * Detects a Hammer or Long Lower Wick Rejection candle.
 * Logic: lower wick >= 2x body size, close in upper 40% of candle range.
 * Based on: corpo pequeno + pavio longo inferior = rejeição de preços baixos.
 */
function detectHammerOrWickRejection(klines: KlineData[]): {
  detected: boolean;
  label: string;
  strength: number;
} {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last || !prev) return { detected: false, label: "Nenhum", strength: 0 };

  const body = Math.abs(last.close - last.open);
  const totalRange = last.high - last.low;
  if (totalRange === 0)
    return { detected: false, label: "Nenhum", strength: 0 };

  const lowerWick = Math.min(last.close, last.open) - last.low;
  const upperWick = last.high - Math.max(last.close, last.open);
  const bodyRatio = body / totalRange;
  const lowerWickRatio = lowerWick / totalRange;

  // Strong wick rejection: lower wick > 50% of range, body < 25%
  if (lowerWickRatio > 0.5 && bodyRatio < 0.25 && lowerWick > upperWick * 2) {
    return { detected: true, label: "Wick Rejection", strength: 1.0 };
  }
  // Moderate hammer: lower wick >= 2x body
  if (lowerWick >= 2 * body && lowerWickRatio > 0.35) {
    return { detected: true, label: "Hammer", strength: 0.65 };
  }
  return { detected: false, label: "Nenhum", strength: 0 };
}

/**
 * Detects Bullish Engulfing pattern.
 * Logic: current candle is bullish and fully engulfs previous bearish candle body.
 * Based on: engolfo bullish = agressão dos compradores sobrepondo vendedores.
 */
function detectBullishEngulfing(klines: KlineData[]): boolean {
  if (klines.length < 2) return false;
  const curr = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const currBullish = curr.close > curr.open;
  const prevBearish = prev.close < prev.open;
  if (!currBullish || !prevBearish) return false;
  return curr.close > prev.open && curr.open < prev.close;
}

/**
 * Detects a Liquidity Grab (Stop Hunt) followed by recovery.
 * Logic: candle sweeps below recent swing low then closes back above it.
 * Based on: caça a stops + reversão = sinal de reversão institucional de alta probabilidade.
 */
function detectLiquidityGrab(klines: KlineData[]): {
  detected: boolean;
  strength: number;
} {
  if (klines.length < 10) return { detected: false, strength: 0 };

  const last = klines[klines.length - 1];
  const lookback = klines.slice(-15, -1);
  const swingLow = Math.min(...lookback.map((k) => k.low));

  // Price swept below swing low but closed above it
  const sweptBelow = last.low < swingLow * 0.999;
  const recoveredAbove = last.close > swingLow;

  if (sweptBelow && recoveredAbove) {
    const depthPct = ((swingLow - last.low) / swingLow) * 100;
    const strength = Math.min(1, depthPct / 1.5); // stronger grab = deeper sweep
    return { detected: true, strength };
  }
  return { detected: false, strength: 0 };
}

/**
 * Detects Volume Divergence (declining volume during price decline = exhaustion of sellers).
 * Based on: preço cai + volume cai = queda fraca = potencial exaustão.
 * Also checks for volume clímax (spike at bottom = capitulação).
 */
function detectVolumeDivergence(klines: KlineData[]): {
  type: "exhaustion" | "climax" | "none";
  label: string;
} {
  if (klines.length < 10) return { type: "none", label: "Neutro" };

  const recent = klines.slice(-10);
  const avgVol = recent.reduce((s, k) => s + k.volume, 0) / recent.length;
  const last5 = recent.slice(-5);

  const priceDirection = last5[last5.length - 1].close - last5[0].close;
  const volTrend = last5[last5.length - 1].volume - last5[0].volume;

  // Volume clímax: last candle volume >= 2.5x average with a red candle = capitulação
  const lastCandle = klines[klines.length - 1];
  const lastVolSpike = lastCandle.volume / (avgVol || 1);
  const lastBearish = lastCandle.close < lastCandle.open;
  if (lastVolSpike >= 2.5 && lastBearish) {
    return { type: "climax", label: `Capitulação ${lastVolSpike.toFixed(1)}x` };
  }

  // Exhaustion: price falling but volume declining
  if (priceDirection < 0 && volTrend < 0) {
    return { type: "exhaustion", label: "Exaustão vendedora" };
  }

  return { type: "none", label: "Neutro" };
}

/**
 * Detects potential CHOCH (Change of Character) on the 15m chart.
 * Simplified: after sequence of lower highs/lows, the last candle closes
 * above the previous high of the most recent down-leg.
 * Based on: CHOCH = reversão estrutural confirmada.
 */
function detectCHOCH(klines: KlineData[]): boolean {
  if (klines.length < 6) return false;

  const slice = klines.slice(-6);
  // Check for prior downtrend: each candle's close below previous
  const downtrend = slice
    .slice(0, 4)
    .every((k, i, arr) => i === 0 || k.close < arr[i - 1].close);
  if (!downtrend) return false;

  // CHOCH: last candle closes above the high of candle from 2 bars ago
  const last = slice[slice.length - 1];
  const prevHigh = slice[slice.length - 3].high;
  return last.close > prevHigh;
}

// ─── MAIN REVERSAL SCORE COMPUTATION ─────────────────────────────────────────

function computeBTCReversalDetails(
  rsi1h: number,
  rsi15m: number,
  rsi4h: number,
  fundingRate: number,
  priceChange24h: number,
  oiDeltaPct: number,
  volumeSpike: number,
  maPositions: {
    priceAboveMA20: boolean;
    priceAboveMA50: boolean;
    priceAboveMA100: boolean;
    priceAboveMA180: boolean;
  },
  klines15m: KlineData[],
  klines1h: KlineData[],
): ReversalDetails {
  const signals: ReversalSignal[] = [];

  // ── SIGNAL 1: RSI 4h (max 25pts) ───────────────────────────────────────────
  // Peso maior porque confirma tendência estrutural (4h = timeframe institucional)
  let rsi4hScore = 0;
  if (rsi4h < 30)
    rsi4hScore = 25; // Sobrevendido extremo
  else if (rsi4h < 40)
    rsi4hScore = 15; // Fraqueza estrutural
  else if (rsi4h < 50) rsi4hScore = 5; // Esfriando
  signals.push({
    label: "RSI 4h",
    value: rsi4h.toFixed(1),
    score: rsi4hScore,
    maxScore: 25,
    active: rsi4hScore > 0,
    direction: rsi4h < 40 ? "bearish" : "neutral",
  });

  // ── SIGNAL 2: RSI 1h (max 20pts) ───────────────────────────────────────────
  let rsi1hScore = 0;
  if (rsi1h < 30) rsi1hScore = 20;
  else if (rsi1h < 40) rsi1hScore = 12;
  else if (rsi1h < 50) rsi1hScore = 4;
  signals.push({
    label: "RSI 1h",
    value: rsi1h.toFixed(1),
    score: rsi1hScore,
    maxScore: 20,
    active: rsi1hScore > 0,
    direction: rsi1h < 40 ? "bearish" : "neutral",
  });

  // ── SIGNAL 3: RSI 15m (max 10pts) ──────────────────────────────────────────
  let rsi15mScore = 0;
  if (rsi15m < 30) rsi15mScore = 10;
  else if (rsi15m < 40) rsi15mScore = 6;
  signals.push({
    label: "RSI 15m",
    value: rsi15m.toFixed(1),
    score: rsi15mScore,
    maxScore: 10,
    active: rsi15mScore > 0,
    direction: rsi15m < 40 ? "bearish" : "neutral",
  });

  // ── SIGNAL 4: Funding Rate (max 20pts) ─────────────────────────────────────
  // Funding muito negativo = shorts pagando caro = combustível para squeeze de alta
  let frScore = 0;
  const frPct = fundingRate * 100;
  if (fundingRate < -0.0005)
    frScore = 20; // Capitulação extrema
  else if (fundingRate < -0.0001)
    frScore = 12; // Negativo relevante
  else if (fundingRate < 0) frScore = 5; // Leve negativo
  signals.push({
    label: "Funding Rate",
    value: `${frPct.toFixed(4)}%`,
    score: frScore,
    maxScore: 20,
    active: frScore > 0,
    direction: fundingRate < 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 5: OI Delta (max 15pts) ─────────────────────────────────────────
  // OI crescendo com preço caindo = novas posições short = potencial short squeeze
  let oiScore = 0;
  if (oiDeltaPct > 2 && priceChange24h < 0) oiScore = 15;
  else if (oiDeltaPct > 0) oiScore = 5;
  signals.push({
    label: "OI Delta",
    value: `${oiDeltaPct >= 0 ? "+" : ""}${oiDeltaPct.toFixed(2)}%`,
    score: oiScore,
    maxScore: 15,
    active: oiScore > 0,
    direction: oiDeltaPct > 2 && priceChange24h < 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 6: Volume Spike 1h (max 10pts) ──────────────────────────────────
  let volScore = 0;
  if (volumeSpike > 2.5) volScore = 10;
  else if (volumeSpike > 1.5) volScore = 5;
  signals.push({
    label: "Vol. Spike 1h",
    value: `${volumeSpike.toFixed(2)}x`,
    score: volScore,
    maxScore: 10,
    active: volScore > 0,
    direction: volScore > 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 7: MA Position (max 10pts) ──────────────────────────────────────
  // Preço abaixo de todas as MAs = excesso de baixa = zona de demanda potencial
  const belowAll =
    !maPositions.priceAboveMA20 &&
    !maPositions.priceAboveMA50 &&
    !maPositions.priceAboveMA100 &&
    !maPositions.priceAboveMA180;
  const belowMajority =
    !maPositions.priceAboveMA50 && !maPositions.priceAboveMA100;
  let maScore = 0;
  let maValue = "Acima das MAs";
  if (belowAll) {
    maScore = 10;
    maValue = "Abaixo de todas";
  } else if (belowMajority) {
    maScore = 6;
    maValue = "Abaixo MA50/100";
  } else if (!maPositions.priceAboveMA20) {
    maScore = 2;
    maValue = "Abaixo MA20";
  }
  signals.push({
    label: "Posição vs MAs",
    value: maValue,
    score: maScore,
    maxScore: 10,
    active: maScore > 0,
    direction: maScore > 0 ? "bearish" : "neutral",
  });

  // ── SIGNAL 8: Queda 24h (max 10pts) ────────────────────────────────────────
  let dropScore = 0;
  if (priceChange24h < -10) dropScore = 10;
  else if (priceChange24h < -5) dropScore = 5;
  else if (priceChange24h < -3) dropScore = 2;
  signals.push({
    label: "Queda 24h",
    value: `${priceChange24h.toFixed(2)}%`,
    score: dropScore,
    maxScore: 10,
    active: dropScore > 0,
    direction: priceChange24h < -3 ? "bearish" : "neutral",
  });

  // ── SIGNAL 9: Padrão de Candle 15m (max 15pts) ─────────────────────────────
  // Detecta hammer, wick rejection e engolfo bullish
  // Baseado em: pavio longo = absorção/rejeição; engolfo = agressão de compradores
  const wickResult = detectHammerOrWickRejection(klines15m);
  const engulfing15m = detectBullishEngulfing(klines15m);
  const engulfing1h = detectBullishEngulfing(klines1h);
  let candleScore = 0;
  let candleLabel = "Nenhum";
  if (wickResult.detected && engulfing15m) {
    candleScore = 15;
    candleLabel = `${wickResult.label} + Engolfo`;
  } else if (engulfing1h) {
    candleScore = 12;
    candleLabel = "Engolfo Bullish 1h";
  } else if (wickResult.detected) {
    candleScore = Math.round(wickResult.strength * 10);
    candleLabel = wickResult.label;
  } else if (engulfing15m) {
    candleScore = 8;
    candleLabel = "Engolfo Bullish 15m";
  }
  signals.push({
    label: "Padrão Candle",
    value: candleLabel,
    score: candleScore,
    maxScore: 15,
    active: candleScore > 0,
    direction: candleScore > 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 10: Liquidity Grab / Stop Hunt (max 15pts) ──────────────────────
  // Caça a stops + reversão = sinal institucional de altíssima probabilidade
  // Baseado em: liquidity grab = mercado elimina stops antes de reverter
  const lgResult15m = detectLiquidityGrab(klines15m);
  const lgResult1h = detectLiquidityGrab(klines1h);
  let lgScore = 0;
  let lgLabel = "Não detectado";
  if (lgResult1h.detected) {
    lgScore = Math.round(12 + lgResult1h.strength * 3);
    lgLabel = "Stop Hunt 1h";
  } else if (lgResult15m.detected) {
    lgScore = Math.round(8 + lgResult15m.strength * 4);
    lgLabel = "Stop Hunt 15m";
  }
  lgScore = Math.min(lgScore, 15);
  signals.push({
    label: "Liquidity Grab",
    value: lgLabel,
    score: lgScore,
    maxScore: 15,
    active: lgScore > 0,
    direction: lgScore > 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 11: Divergência de Volume 15m (max 10pts) ───────────────────────
  // Preço cai + volume cai = exaustão vendedora (queda fraca, reversão próxima)
  // Volume clímax = capitulação = pico de desespero antes da virada
  const volDiv = detectVolumeDivergence(klines15m);
  let volDivScore = 0;
  if (volDiv.type === "climax")
    volDivScore = 10; // Capitulação de volume
  else if (volDiv.type === "exhaustion") volDivScore = 6; // Exaustão vendedora
  signals.push({
    label: "Vol. Divergência",
    value: volDiv.label,
    score: volDivScore,
    maxScore: 10,
    active: volDivScore > 0,
    direction: volDivScore > 0 ? "bullish" : "neutral",
  });

  // ── SIGNAL 12: CHOCH 15m (max 10pts) ───────────────────────────────────────
  // Change of Character = primeira quebra da estrutura de baixa
  // Baseado em: CHOCH = sinal de reversão estrutural no price action
  const choch15m = detectCHOCH(klines15m);
  const choch1h = detectCHOCH(klines1h);
  let chochScore = 0;
  let chochLabel = "Não detectado";
  if (choch1h) {
    chochScore = 10;
    chochLabel = "CHOCH 1h";
  } else if (choch15m) {
    chochScore = 6;
    chochLabel = "CHOCH 15m";
  }
  signals.push({
    label: "CHOCH",
    value: chochLabel,
    score: chochScore,
    maxScore: 10,
    active: chochScore > 0,
    direction: chochScore > 0 ? "bullish" : "neutral",
  });

  const bottomScore = Math.min(
    100,
    Math.round(signals.reduce((sum, s) => sum + s.score, 0)),
  );

  // ── TOP REVERSAL (inverted logic) ──────────────────────────────────────────
  let topScore = 0;
  if (rsi4h > 70) topScore += 25;
  else if (rsi4h > 60) topScore += 15;
  if (rsi1h > 70) topScore += 20;
  else if (rsi1h > 60) topScore += 12;
  if (rsi15m > 70) topScore += 10;
  if (fundingRate > 0.0005) topScore += 20;
  else if (fundingRate > 0.0001) topScore += 12;
  if (priceChange24h > 10) topScore += 10;
  else if (priceChange24h > 5) topScore += 5;
  const aboveAll =
    maPositions.priceAboveMA20 &&
    maPositions.priceAboveMA50 &&
    maPositions.priceAboveMA100 &&
    maPositions.priceAboveMA180;
  if (aboveAll) topScore += 10;
  // Bearish wick rejection at top
  const bearishWick = (() => {
    const last = klines15m[klines15m.length - 1];
    if (!last) return false;
    const body = Math.abs(last.close - last.open);
    const totalRange = last.high - last.low;
    if (totalRange === 0) return false;
    const upperWick = last.high - Math.max(last.close, last.open);
    const upperWickRatio = upperWick / totalRange;
    return upperWickRatio > 0.5 && body / totalRange < 0.25;
  })();
  if (bearishWick) topScore += 10;
  topScore = Math.min(100, topScore);

  let reversalType: "bottom" | "top" | "none" = "none";
  if (topScore > bottomScore && topScore > 40) {
    reversalType = "top";
  } else if (bottomScore > 40) {
    reversalType = "bottom";
  }

  return {
    signals,
    totalScore: reversalType === "top" ? topScore : bottomScore,
    reversalType,
  };
}

function scoreAltcoin(
  fundingRate: number,
  rsi: number,
  altChange: number,
  btcChange: number,
  volumeRatio: number,
  priceLowRatio: number,
): number {
  let score = 0;
  if (fundingRate < 0) score += 20;
  if (rsi < 40) score += 20;
  if (altChange > btcChange + 2) score += 25;
  if (volumeRatio > 1.1) score += 15;
  if (priceLowRatio < 1.05) score += 20;
  return Math.min(score, 100);
}

const TF_SEARCH_ORDER = ["5m", "3m", "1m", "30m", "1h"] as const;

export function useBinanceData(interval: Interval = "1h") {
  const [btcMetrics, setBtcMetrics] = useState<BTCMetrics | null>(null);
  const [altcoins, setAltcoins] = useState<AltcoinOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const prevOIRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: interval not used inside, only for stable dep identity
  const refresh = useCallback(async () => {
    try {
      const [klines1h, klines15m, klines4h, tickers, fundingRates, oi] =
        await Promise.all([
          fetchKlines("BTCUSDT", "1h", 200),
          fetchKlines("BTCUSDT", "15m", 200),
          fetchKlines("BTCUSDT", "4h", 200),
          fetchAllTickers(),
          fetchFundingRates(),
          fetchOpenInterest("BTCUSDT"),
        ]);

      const closes1h = klines1h.map((k) => k.close);
      const closes15m = klines15m.map((k) => k.close);
      const closes4h = klines4h.map((k) => k.close);

      const rsi1h = calculateRSI(closes1h);
      const rsi15m = calculateRSI(closes15m);
      const rsi4h = calculateRSI(closes4h);

      // MA positions (EMA on 1h closes)
      const ema20arr = calculateEMA(closes1h, 20);
      const ema50arr = calculateEMA(closes1h, 50);
      const ema100arr = calculateEMA(closes1h, 100);
      const ema180arr = calculateEMA(closes1h, 180);
      const ma20 = ema20arr[ema20arr.length - 1] ?? 0;
      const ma50 = ema50arr[ema50arr.length - 1] ?? 0;
      const ma100 = ema100arr[ema100arr.length - 1] ?? 0;
      const ma180 = ema180arr[ema180arr.length - 1] ?? 0;

      const btcTicker = tickers.find(
        (t: { symbol: string }) => t.symbol === "BTCUSDT",
      );
      const btcFunding = fundingRates.find(
        (f: { symbol: string }) => f.symbol === "BTCUSDT",
      );
      const price = Number.parseFloat(btcTicker?.lastPrice || "0");
      const oiValue = Number.parseFloat(oi.openInterest || "0") * price;
      const btcChange = Number.parseFloat(btcTicker?.priceChangePercent || "0");
      const fundingRate = Number.parseFloat(btcFunding?.lastFundingRate || "0");

      // Volume spike: last candle vol / avg of previous 20 candles
      const recentVols = klines1h.slice(-21);
      const lastVol = recentVols[recentVols.length - 1]?.volume ?? 0;
      const avgVol =
        recentVols.slice(0, 20).reduce((s, k) => s + k.volume, 0) / 20 || 1;
      const volumeSpike = lastVol / avgVol;

      // OI delta %
      const oiDeltaPct =
        prevOIRef.current > 0
          ? ((oiValue - prevOIRef.current) / prevOIRef.current) * 100
          : 0;
      prevOIRef.current = oiValue;

      const maPositions = {
        ma20,
        ma50,
        ma100,
        ma180,
        priceAboveMA20: price > ma20,
        priceAboveMA50: price > ma50,
        priceAboveMA100: price > ma100,
        priceAboveMA180: price > ma180,
      };

      const reversalDetails = computeBTCReversalDetails(
        rsi1h,
        rsi15m,
        rsi4h,
        fundingRate,
        btcChange,
        oiDeltaPct,
        volumeSpike,
        maPositions,
        klines15m,
        klines1h,
      );

      setBtcMetrics({
        price,
        priceChange24h: btcChange,
        volume24h: Number.parseFloat(btcTicker?.quoteVolume || "0"),
        fundingRate,
        openInterest: oiValue,
        rsi: rsi1h,
        reversalScore: reversalDetails.totalScore,
        klines: klines1h,
        rsi15m,
        rsi4h,
        maPositions,
        volumeSpike,
        oiDeltaPct,
        reversalDetails,
      });

      const fundingMap: Record<string, number> = {};
      for (const f of fundingRates as {
        symbol: string;
        lastFundingRate: string;
      }[]) {
        fundingMap[f.symbol] = Number.parseFloat(f.lastFundingRate);
      }

      const opportunities: AltcoinOpportunity[] = (
        tickers as {
          symbol: string;
          lastPrice: string;
          priceChangePercent: string;
          quoteVolume: string;
          highPrice: string;
          lowPrice: string;
        }[]
      )
        .filter(
          (t) =>
            t.symbol.endsWith("USDT") &&
            t.symbol !== "BTCUSDT" &&
            t.symbol !== "ETHUSDT" &&
            Number.parseFloat(t.quoteVolume) >= 30_000,
        )
        .map((t) => {
          const altChange = Number.parseFloat(t.priceChangePercent);
          const p = Number.parseFloat(t.lastPrice);
          const low = Number.parseFloat(t.lowPrice);
          const high = Number.parseFloat(t.highPrice);
          const fr = fundingMap[t.symbol] ?? 0;
          const rangePos = high > low ? ((p - low) / (high - low)) * 100 : 50;
          const proxyRSI = 20 + rangePos * 0.6;
          const volumeRatio = Number.parseFloat(t.quoteVolume) / 1_000_000;
          const priceLowRatio = low > 0 ? p / low : 2;
          const score = scoreAltcoin(
            fr,
            proxyRSI,
            altChange,
            btcChange,
            volumeRatio,
            priceLowRatio,
          );
          return {
            symbol: t.symbol.replace("USDT", ""),
            price: p,
            priceChange24h: altChange,
            volume24h: Number.parseFloat(t.quoteVolume),
            fundingRate: fr,
            rsi: Math.round(proxyRSI),
            score,
            highPrice: t.highPrice,
            lowPrice: t.lowPrice,
          };
        })
        .sort(
          (a: AltcoinOpportunity, b: AltcoinOpportunity) => b.score - a.score,
        )
        .slice(0, 20);

      const top10 = opportunities.slice(0, 10);

      const enriched = await Promise.all(
        top10.map(async (alt) => {
          let klines15mAlt: KlineData[];
          try {
            klines15mAlt = await fetchKlines(`${alt.symbol}USDT`, "15m", 200);
          } catch {
            return alt;
          }

          const resistanceLevels = calculateResistanceLevels(
            klines15mAlt,
            alt.price,
          );
          const { tp1, tp2, tp3 } = calculateTakeProfits(
            resistanceLevels,
            alt.price,
          );

          const calcRR = (sl: number) => {
            const risk = alt.price - sl;
            if (risk <= 0) return 0;
            return (tp2 - alt.price) / risk;
          };

          let stopLoss = calculateStopLoss(klines15mAlt, alt.price);
          let timeframeUsed = "15m";
          let bestRR = stopLoss !== null ? calcRR(stopLoss) : 0;

          if (bestRR < 3 || stopLoss === null) {
            let bestSL = stopLoss;
            let bestTF = timeframeUsed;

            for (const tf of TF_SEARCH_ORDER) {
              try {
                const tfKlines = await fetchKlines(
                  `${alt.symbol}USDT`,
                  tf,
                  200,
                );
                const sl = calculateStopLoss(tfKlines, alt.price);
                if (sl === null) continue;

                const rr = calcRR(sl);
                if (rr > bestRR) {
                  bestRR = rr;
                  bestSL = sl;
                  bestTF = tf;
                }
                if (rr >= 3) break;
              } catch {
                // skip
              }
            }

            if (bestSL !== null) {
              stopLoss = bestSL;
              timeframeUsed = bestTF;
            }
          }

          if (stopLoss === null) {
            const recentLows = klines15mAlt.slice(-20).map((k) => k.low);
            const minLow = Math.min(...recentLows);
            stopLoss = minLow * 0.995;
            timeframeUsed = "15m";
          }

          return {
            ...alt,
            klines: klines15mAlt,
            resistanceLevels,
            tp1,
            tp2,
            tp3,
            stopLoss,
            timeframeUsed,
          };
        }),
      );

      const finalOpportunities = [...enriched, ...opportunities.slice(10)];
      setAltcoins(finalOpportunities);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError("Erro ao conectar com Binance. Verifique sua conexão.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [interval]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { btcMetrics, altcoins, loading, error, lastUpdate, refresh };
}

export function useBTCChart(interval: Interval) {
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: interval is used inside fetchKlines
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKlines("BTCUSDT", interval, 200);
      setKlines(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [interval]);

  useEffect(() => {
    load();
  }, [load]);

  const emaData = (() => {
    const closes = klines.map((k) => k.close);
    return {
      ema20: calculateEMA(closes, 20),
      ema50: calculateEMA(closes, 50),
      ema100: calculateEMA(closes, 100),
      ema180: calculateEMA(closes, 180),
    };
  })();

  return { klines, loading, emaData, reload: load };
}
