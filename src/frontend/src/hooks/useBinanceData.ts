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
import { fetchMultiExchangeData } from "./useMultiExchangeData";

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

async function fetchTakerRatio(): Promise<number> {
  try {
    const res = await fetch(
      `${BASE}/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=5`,
    );
    const data: { buySellRatio: string }[] = await res.json();
    if (!data?.length) return 0.5;
    const avg =
      data.reduce((s, d) => s + Number.parseFloat(d.buySellRatio), 0) /
      data.length;
    return avg / (1 + avg);
  } catch {
    return 0.5;
  }
}

function computeCapitalFlowScore({
  takerBuyRatio,
  oiDeltaPct,
  priceChange24h,
  fundingRate,
  volumeSpike,
  priceAboveMA20,
  priceAboveMA50,
  fearGreedIndex,
  bybitFundingRate,
  okxFundingRate,
  bybitLongShortRatio,
  coinGeckoBTCVolume24h,
}: {
  takerBuyRatio: number;
  oiDeltaPct: number;
  priceChange24h: number;
  fundingRate: number;
  volumeSpike: number;
  priceAboveMA20: boolean;
  priceAboveMA50: boolean;
  fearGreedIndex: number | null;
  bybitFundingRate: number | null;
  okxFundingRate: number | null;
  bybitLongShortRatio: number | null;
  coinGeckoBTCVolume24h: number | null;
}): number {
  let score = 0;

  // Taker Buy Ratio (0-35 pts)
  if (takerBuyRatio > 0.65) score += 35;
  else if (takerBuyRatio > 0.55) score += 24;
  else if (takerBuyRatio > 0.52) score += 16;
  else if (takerBuyRatio >= 0.48) score += 8;

  // OI Delta + Price Direction (0-20 pts)
  if (oiDeltaPct > 0 && priceChange24h > 0) score += 20;
  else if (oiDeltaPct < 0 && priceChange24h > 0) score += 12;
  else if (oiDeltaPct > 0 && priceChange24h < 0) score += 5;

  // Cross-exchange Funding Rate avg (0-20 pts)
  const rates: number[] = [fundingRate];
  if (bybitFundingRate !== null) rates.push(bybitFundingRate);
  if (okxFundingRate !== null) rates.push(okxFundingRate);
  const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;

  if (avgRate < -0.0005) score += 20;
  else if (avgRate < -0.0001) score += 14;
  else if (avgRate < 0) score += 8;
  else if (avgRate < 0.0001) score += 4;

  // Fear & Greed — contrarian (0-10 pts)
  if (fearGreedIndex !== null) {
    if (fearGreedIndex < 25) score += 10;
    else if (fearGreedIndex < 40) score += 6;
    else if (fearGreedIndex <= 60) score += 3;
  }

  // CoinGecko global volume (0-5 pts)
  if (coinGeckoBTCVolume24h !== null) {
    if (coinGeckoBTCVolume24h > 50_000_000_000) score += 5;
    else if (coinGeckoBTCVolume24h > 30_000_000_000) score += 3;
  }

  // Volume Spike (0-8 pts)
  if (volumeSpike > 2.5) score += 8;
  else if (volumeSpike > 1.5) score += 4;

  // Price vs MAs (0-7 pts)
  if (priceAboveMA20 && priceAboveMA50) score += 7;
  else if (priceAboveMA20) score += 3;

  // Bybit long/short ratio bonus (0-5 pts)
  if (bybitLongShortRatio !== null) {
    if (bybitLongShortRatio > 0.6) score += 5;
    else if (bybitLongShortRatio > 0.52) score += 2;
  }

  return Math.min(100, Math.round(score));
}

// Returns the duration in milliseconds for a given Binance interval string.
function intervalToMs(interval: Interval): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "8h": 8 * 60 * 60_000,
    "12h": 12 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "3d": 3 * 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
  };
  return map[interval] ?? 60_000;
}

// ─── KNOWLEDGE BASE: PRICE ACTION & CANDLE PATTERN DETECTION ─────────────────

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

  if (lowerWickRatio > 0.5 && bodyRatio < 0.25 && lowerWick > upperWick * 2) {
    return { detected: true, label: "Wick Rejection", strength: 1.0 };
  }
  if (lowerWick >= 2 * body && lowerWickRatio > 0.35) {
    return { detected: true, label: "Hammer", strength: 0.65 };
  }
  return { detected: false, label: "Nenhum", strength: 0 };
}

function detectBullishEngulfing(klines: KlineData[]): boolean {
  if (klines.length < 2) return false;
  const curr = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const currBullish = curr.close > curr.open;
  const prevBearish = prev.close < prev.open;
  if (!currBullish || !prevBearish) return false;
  return curr.close > prev.open && curr.open < prev.close;
}

function detectLiquidityGrab(klines: KlineData[]): {
  detected: boolean;
  strength: number;
} {
  if (klines.length < 10) return { detected: false, strength: 0 };

  const last = klines[klines.length - 1];
  const lookback = klines.slice(-15, -1);
  const swingLow = Math.min(...lookback.map((k) => k.low));

  const sweptBelow = last.low < swingLow * 0.999;
  const recoveredAbove = last.close > swingLow;

  if (sweptBelow && recoveredAbove) {
    const depthPct = ((swingLow - last.low) / swingLow) * 100;
    const strength = Math.min(1, depthPct / 1.5);
    return { detected: true, strength };
  }
  return { detected: false, strength: 0 };
}

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

  const lastCandle = klines[klines.length - 1];
  const lastVolSpike = lastCandle.volume / (avgVol || 1);
  const lastBearish = lastCandle.close < lastCandle.open;
  if (lastVolSpike >= 2.5 && lastBearish) {
    return { type: "climax", label: `Capitulação ${lastVolSpike.toFixed(1)}x` };
  }

  if (priceDirection < 0 && volTrend < 0) {
    return { type: "exhaustion", label: "Exaustão vendedora" };
  }

  return { type: "none", label: "Neutro" };
}

function detectCHOCH(klines: KlineData[]): boolean {
  if (klines.length < 6) return false;

  const slice = klines.slice(-6);
  const downtrend = slice
    .slice(0, 4)
    .every((k, i, arr) => i === 0 || k.close < arr[i - 1].close);
  if (!downtrend) return false;

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
  multiExchange: {
    bybitFundingRate: number | null;
    okxFundingRate: number | null;
    bybitLongShortRatio: number | null;
    fearGreedIndex: number | null;
    fearGreedLabel: string | null;
    coinGeckoBTCVolume24h: number | null;
  } | null,
): ReversalDetails {
  const signals: ReversalSignal[] = [];

  // ── RSI signals ──────────────────────────────────────────────────────────
  let rsi4hScore = 0;
  if (rsi4h < 30) rsi4hScore = 25;
  else if (rsi4h < 40) rsi4hScore = 15;
  else if (rsi4h < 50) rsi4hScore = 5;
  signals.push({
    label: "RSI 4h",
    value: rsi4h.toFixed(1),
    score: rsi4hScore,
    maxScore: 25,
    active: rsi4hScore > 0,
    direction: rsi4h < 40 ? "bearish" : "neutral",
  });

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

  // ── Funding Rate — cross-exchange average ────────────────────────────────
  const fundingRatesArr: number[] = [fundingRate];
  if (multiExchange?.bybitFundingRate != null)
    fundingRatesArr.push(multiExchange.bybitFundingRate);
  if (multiExchange?.okxFundingRate != null)
    fundingRatesArr.push(multiExchange.okxFundingRate);
  const avgFundingRate =
    fundingRatesArr.reduce((s, r) => s + r, 0) / fundingRatesArr.length;
  const exchangeCount = fundingRatesArr.length;

  let frScore = 0;
  if (avgFundingRate < -0.0005) frScore = 20;
  else if (avgFundingRate < -0.0001) frScore = 12;
  else if (avgFundingRate < 0) frScore = 5;
  const frPct = (avgFundingRate * 100).toFixed(4);
  const frLabel =
    exchangeCount > 1 ? `${frPct}% (${exchangeCount} bolsas)` : `${frPct}%`;
  signals.push({
    label: "Funding Rate",
    value: frLabel,
    score: frScore,
    maxScore: 20,
    active: frScore > 0,
    direction: avgFundingRate < 0 ? "bullish" : "neutral",
  });

  // ── OI Delta ─────────────────────────────────────────────────────────────
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

  // ── Volume Spike ─────────────────────────────────────────────────────────
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

  // ── MA Positions ──────────────────────────────────────────────────────────
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

  // ── 24h Price Drop ───────────────────────────────────────────────────────
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

  // ── Candle Patterns ──────────────────────────────────────────────────────
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

  // ── Liquidity Grab ───────────────────────────────────────────────────────
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

  // ── Volume Divergence ────────────────────────────────────────────────────
  const volDiv = detectVolumeDivergence(klines15m);
  let volDivScore = 0;
  if (volDiv.type === "climax") volDivScore = 10;
  else if (volDiv.type === "exhaustion") volDivScore = 6;
  signals.push({
    label: "Vol. Divergência",
    value: volDiv.label,
    score: volDivScore,
    maxScore: 10,
    active: volDivScore > 0,
    direction: volDivScore > 0 ? "bullish" : "neutral",
  });

  // ── CHOCH ────────────────────────────────────────────────────────────────
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

  // ── Fear & Greed (multi-exchange signal) ─────────────────────────────────
  const fgIndex = multiExchange?.fearGreedIndex ?? null;
  const fgLabelText = multiExchange?.fearGreedLabel ?? null;
  let fgScore = 0;
  let fgValue = "—";
  if (fgIndex !== null) {
    fgValue = `${fgIndex} (${fgLabelText ?? "—"})`;
    if (fgIndex < 20)
      fgScore = 12; // extreme fear → strong reversal signal
    else if (fgIndex < 30) fgScore = 9;
    else if (fgIndex < 40)
      fgScore = 5; // fear
    else if (fgIndex <= 50) fgScore = 2; // neutral-low
  }
  signals.push({
    label: "Medo & Ganância",
    value: fgValue,
    score: fgScore,
    maxScore: 12,
    active: fgScore > 0,
    direction: fgScore > 0 ? "bullish" : "neutral",
  });

  // ── Bybit Long/Short Ratio (cross-exchange sentiment) ────────────────────
  const bybitRatio = multiExchange?.bybitLongShortRatio ?? null;
  let bybitScore = 0;
  let bybitValue = "—";
  if (bybitRatio !== null) {
    const shortRatio = 1 - bybitRatio;
    bybitValue = `L ${(bybitRatio * 100).toFixed(1)}% / S ${(shortRatio * 100).toFixed(1)}%`;
    // Majority short = sentiment washout = bullish reversal
    if (bybitRatio < 0.35)
      bybitScore = 8; // extreme short dominance
    else if (bybitRatio < 0.45)
      bybitScore = 5; // short majority
    else if (bybitRatio < 0.5) bybitScore = 2; // slight short bias
  }
  signals.push({
    label: "Sentimento Bybit",
    value: bybitValue,
    score: bybitScore,
    maxScore: 8,
    active: bybitScore > 0,
    direction: bybitScore > 0 ? "bullish" : "neutral",
  });

  // ── Bottom score total ───────────────────────────────────────────────────
  const bottomScore = Math.min(
    100,
    Math.round(signals.reduce((sum, s) => sum + s.score, 0)),
  );

  // ── Top (distribution) score ─────────────────────────────────────────────
  let topScore = 0;
  if (rsi4h > 70) topScore += 25;
  else if (rsi4h > 60) topScore += 15;
  if (rsi1h > 70) topScore += 20;
  else if (rsi1h > 60) topScore += 12;
  if (rsi15m > 70) topScore += 10;
  if (avgFundingRate > 0.0005) topScore += 20;
  else if (avgFundingRate > 0.0001) topScore += 12;
  if (priceChange24h > 10) topScore += 10;
  else if (priceChange24h > 5) topScore += 5;
  const aboveAll =
    maPositions.priceAboveMA20 &&
    maPositions.priceAboveMA50 &&
    maPositions.priceAboveMA100 &&
    maPositions.priceAboveMA180;
  if (aboveAll) topScore += 10;
  // Fear & Greed: extreme greed = top signal
  if (fgIndex !== null) {
    if (fgIndex > 80) topScore += 12;
    else if (fgIndex > 70) topScore += 7;
    else if (fgIndex > 60) topScore += 3;
  }
  // Bybit majority long = crowd too bullish = top signal
  if (bybitRatio !== null) {
    if (bybitRatio > 0.65) topScore += 8;
    else if (bybitRatio > 0.55) topScore += 4;
  }
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
  crossFundingRate?: number,
  fearGreedIndex?: number | null,
  bybitLongShortRatio?: number | null,
): number {
  let score = 0;
  // Use cross-exchange funding average when available, otherwise Binance only
  const effectiveFunding =
    crossFundingRate !== undefined ? crossFundingRate : fundingRate;
  if (effectiveFunding < -0.0005) score += 25;
  else if (effectiveFunding < 0) score += 18;
  if (rsi < 40) score += 20;
  if (altChange > btcChange + 2) score += 25;
  if (volumeRatio > 1.1) score += 12;
  if (priceLowRatio < 1.05) score += 15;
  // Market sentiment boost from cross-exchange signals
  if (fearGreedIndex !== null && fearGreedIndex !== undefined) {
    if (fearGreedIndex < 25)
      score += 8; // extreme fear => altcoin reversal opportunity
    else if (fearGreedIndex < 40) score += 4;
  }
  if (bybitLongShortRatio !== null && bybitLongShortRatio !== undefined) {
    if (bybitLongShortRatio < 0.4)
      score += 5; // extreme short dominance on Bybit
    else if (bybitLongShortRatio < 0.47) score += 2;
  }
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
      const [
        klines1h,
        klines15m,
        klines4h,
        tickers,
        fundingRates,
        oi,
        takerBuyRatio,
        multiExchangeData,
      ] = await Promise.all([
        fetchKlines("BTCUSDT", "1h", 200),
        fetchKlines("BTCUSDT", "15m", 200),
        fetchKlines("BTCUSDT", "4h", 200),
        fetchAllTickers(),
        fetchFundingRates(),
        fetchOpenInterest("BTCUSDT"),
        fetchTakerRatio(),
        fetchMultiExchangeData(),
      ]);

      const closes1h = klines1h.map((k) => k.close);
      const closes15m = klines15m.map((k) => k.close);
      const closes4h = klines4h.map((k) => k.close);

      const rsi1h = calculateRSI(closes1h);
      const rsi15m = calculateRSI(closes15m);
      const rsi4h = calculateRSI(closes4h);

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

      const recentVols = klines1h.slice(-21);
      const lastVol = recentVols[recentVols.length - 1]?.volume ?? 0;
      const avgVol =
        recentVols.slice(0, 20).reduce((s, k) => s + k.volume, 0) / 20 || 1;
      const volumeSpike = lastVol / avgVol;

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

      // Pass multi-exchange data into reversal score computation
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
        {
          bybitFundingRate: multiExchangeData.bybitFundingRate,
          okxFundingRate: multiExchangeData.okxFundingRate,
          bybitLongShortRatio: multiExchangeData.bybitLongShortRatio,
          fearGreedIndex: multiExchangeData.fearGreedIndex,
          fearGreedLabel: multiExchangeData.fearGreedLabel,
          coinGeckoBTCVolume24h: multiExchangeData.coinGeckoBTCVolume24h,
        },
      );

      // Compute avg funding rate across all available exchanges
      const fundingRates3: number[] = [fundingRate];
      if (multiExchangeData.bybitFundingRate !== null)
        fundingRates3.push(multiExchangeData.bybitFundingRate);
      if (multiExchangeData.okxFundingRate !== null)
        fundingRates3.push(multiExchangeData.okxFundingRate);
      const avgFundingRate =
        fundingRates3.reduce((s, r) => s + r, 0) / fundingRates3.length;

      const capitalFlowScore = computeCapitalFlowScore({
        takerBuyRatio,
        oiDeltaPct,
        priceChange24h: btcChange,
        fundingRate,
        volumeSpike,
        priceAboveMA20: maPositions.priceAboveMA20,
        priceAboveMA50: maPositions.priceAboveMA50,
        fearGreedIndex: multiExchangeData.fearGreedIndex,
        bybitFundingRate: multiExchangeData.bybitFundingRate,
        okxFundingRate: multiExchangeData.okxFundingRate,
        bybitLongShortRatio: multiExchangeData.bybitLongShortRatio,
        coinGeckoBTCVolume24h: multiExchangeData.coinGeckoBTCVolume24h,
      });

      setBtcMetrics({
        price,
        priceChange24h: btcChange,
        volume24h: Number.parseFloat(btcTicker?.quoteVolume || "0"),
        fundingRate,
        openInterest: oiValue,
        rsi: rsi1h,
        reversalScore: reversalDetails.totalScore,
        capitalFlowScore,
        takerBuyRatio,
        klines: klines1h,
        rsi15m,
        rsi4h,
        maPositions,
        volumeSpike,
        oiDeltaPct,
        reversalDetails,
        multiExchange: {
          fearGreedIndex: multiExchangeData.fearGreedIndex,
          fearGreedLabel: multiExchangeData.fearGreedLabel,
          bybitFundingRate: multiExchangeData.bybitFundingRate,
          bybitLongShortRatio: multiExchangeData.bybitLongShortRatio,
          okxFundingRate: multiExchangeData.okxFundingRate,
          avgFundingRate,
          coinGeckoBTCVolume24h: multiExchangeData.coinGeckoBTCVolume24h,
          sourcesActive: multiExchangeData.sourcesActive,
        },
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
          // Compute cross-exchange funding average for this altcoin
          const baseSymbol = t.symbol.replace(/USDT$/, "");
          const crossRates: number[] = [fr];
          const bFr = multiExchangeData.bybitAltFunding?.[baseSymbol];
          const oFr = multiExchangeData.okxAltFunding?.[baseSymbol];
          if (bFr !== undefined) crossRates.push(bFr);
          if (oFr !== undefined) crossRates.push(oFr);
          const crossFundingRate =
            crossRates.reduce((s, r) => s + r, 0) / crossRates.length;
          const score = scoreAltcoin(
            fr,
            proxyRSI,
            altChange,
            btcChange,
            volumeRatio,
            priceLowRatio,
            crossFundingRate,
            multiExchangeData.fearGreedIndex,
            multiExchangeData.bybitLongShortRatio,
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    load();

    const intervalMs = intervalToMs(interval);

    const schedule = () => {
      const now = Date.now();
      const msUntilNext = intervalMs - (now % intervalMs) + 500;
      timerRef.current = setTimeout(() => {
        load();
        schedule();
      }, msUntilNext);
    };

    schedule();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [load, interval]);

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
