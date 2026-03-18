import type { KlineData } from "../types/binance";

export const calculateRSI = (closes: number[], period = 14): number => {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

export const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  if (data.length === 0) return ema;
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
};

export const formatPrice = (price: number): string => {
  if (price >= 1000)
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(5);
  return price.toFixed(8);
};

export const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
};

export const formatFundingRate = (rate: number): string => {
  return `${(rate * 100).toFixed(4)}%`;
};

// Find pivot highs (resistance levels) above entry price from klines
export function calculateResistanceLevels(
  klines: KlineData[],
  entryPrice: number,
): number[] {
  const pivotHighs: number[] = [];
  for (let i = 2; i < klines.length - 2; i++) {
    const h = klines[i].high;
    if (
      h > klines[i - 1].high &&
      h > klines[i - 2].high &&
      h > klines[i + 1].high &&
      h > klines[i + 2].high &&
      h > entryPrice * 1.005
    ) {
      pivotHighs.push(h);
    }
  }
  const deduped: number[] = [];
  for (const h of pivotHighs.sort((a, b) => a - b)) {
    if (
      deduped.length === 0 ||
      (h - deduped[deduped.length - 1]) / deduped[deduped.length - 1] > 0.005
    ) {
      deduped.push(h);
    }
  }
  return deduped.slice(0, 5);
}

// Calculate TP1, TP2, TP3 from resistance levels
export function calculateTakeProfits(
  resistanceLevels: number[],
  entryPrice: number,
): { tp1: number; tp2: number; tp3: number } {
  const strongResistances = resistanceLevels.filter(
    (r) => r > entryPrice * 1.03,
  );

  if (strongResistances.length >= 3) {
    return {
      tp1: strongResistances[0],
      tp2: strongResistances[1],
      tp3: strongResistances[2],
    };
  }

  const allAbove = resistanceLevels.filter((r) => r > entryPrice * 1.005);

  if (allAbove.length === 0) {
    return {
      tp1: entryPrice * 1.03,
      tp2: entryPrice * 1.06,
      tp3: entryPrice * 1.1,
    };
  }

  if (allAbove.length === 1) {
    const r = allAbove[0];
    const gap = r - entryPrice;
    return {
      tp1: entryPrice + gap * 0.33,
      tp2: entryPrice + gap * 0.66,
      tp3: r,
    };
  }

  if (allAbove.length === 2) {
    return {
      tp1: allAbove[0],
      tp2: (allAbove[0] + allAbove[1]) / 2,
      tp3: allAbove[1],
    };
  }

  return { tp1: allAbove[0], tp2: allAbove[1], tp3: allAbove[2] };
}

/**
 * Calculate stop loss: placed 0.5% below the last pivot low (swing low)
 * that is below the entry price, searching from most recent candle backward.
 *
 * No percentage clamping -- the market structure defines the SL.
 * Returns null if no pivot low found (caller should try another timeframe).
 */
export function calculateStopLoss(
  klines: KlineData[],
  entryPrice: number,
): number | null {
  // Search from most recent to oldest for the last pivot low below entry
  for (let i = klines.length - 3; i >= 2; i--) {
    const l = klines[i].low;
    if (
      l < entryPrice &&
      l < klines[i - 1].low &&
      l < klines[i - 2].low &&
      l < klines[i + 1].low &&
      l < klines[i + 2].low
    ) {
      // Place SL 0.5% below the last swing low
      return l * 0.995;
    }
  }
  // No pivot low found in this timeframe
  return null;
}
