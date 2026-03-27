// Smart Money Concepts (SMC) Engine
// Implements institutional market analysis: phases, structure breaks, liquidity zones

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SMCAnalysis {
  phase:
    | "Acumulação"
    | "Manipulação"
    | "Distribuição Alta"
    | "Distribuição Baixa";
  bos: boolean;
  bosDirection: "bullish" | "bearish" | null;
  choch: boolean;
  stopHunt: boolean;
  stopHuntDirection: "bullish" | "bearish" | null;
  liquidityZones: Array<{
    price: number;
    strength: number;
    type: "high" | "low";
  }>;
  orderBlocks: Array<{ price: number; type: "bull" | "bear"; size: number }>;
  fvgs: Array<{
    high: number;
    low: number;
    type: "bull" | "bear";
    mitigated: boolean;
  }>;
  confidence: number;
}

const SAFE_DEFAULT: SMCAnalysis = {
  phase: "Acumulação",
  bos: false,
  bosDirection: null,
  choch: false,
  stopHunt: false,
  stopHuntDirection: null,
  liquidityZones: [],
  orderBlocks: [],
  fvgs: [],
  confidence: 0,
};

function isValidCandle(c: Candle): boolean {
  return (
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close) &&
    c.high >= c.low
  );
}

interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

function detectSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) points.push({ index: i, price: c.high, type: "high" });
    if (isLow) points.push({ index: i, price: c.low, type: "low" });
  }
  return points;
}

function detectBOS(
  candles: Candle[],
  swings: SwingPoint[],
): { bos: boolean; direction: "bullish" | "bearish" | null } {
  if (swings.length < 2) return { bos: false, direction: null };

  const lastCandle = candles[candles.length - 1];
  const recentHighs = swings.filter((s) => s.type === "high").slice(-3);
  const recentLows = swings.filter((s) => s.type === "low").slice(-3);

  // Bullish BOS: price breaks above previous swing high
  if (recentHighs.length >= 1) {
    const prevHigh = recentHighs[recentHighs.length - 1].price;
    if (lastCandle.close > prevHigh) return { bos: true, direction: "bullish" };
  }

  // Bearish BOS: price breaks below previous swing low
  if (recentLows.length >= 1) {
    const prevLow = recentLows[recentLows.length - 1].price;
    if (lastCandle.close < prevLow) return { bos: true, direction: "bearish" };
  }

  return { bos: false, direction: null };
}

function detectCHoCH(candles: Candle[], swings: SwingPoint[]): boolean {
  if (swings.length < 4) return false;

  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  if (highs.length < 2 || lows.length < 2) return false;

  // Detect prevailing structure then look for first opposing BOS
  const lastHigh = highs[highs.length - 1].price;
  const prevHigh = highs[highs.length - 2].price;
  const lastLow = lows[lows.length - 1].price;
  const prevLow = lows[lows.length - 2].price;

  const isUptrend = lastHigh > prevHigh && lastLow > prevLow;
  const isDowntrend = lastHigh < prevHigh && lastLow < prevLow;

  const lastClose = candles[candles.length - 1].close;

  // CHoCH: in uptrend, breaks below last swing low (reversal signal)
  if (isUptrend && lastClose < lastLow) return true;
  // CHoCH: in downtrend, breaks above last swing high (reversal signal)
  if (isDowntrend && lastClose > lastHigh) return true;

  return false;
}

function detectStopHunt(
  candles: Candle[],
  swings: SwingPoint[],
): { detected: boolean; direction: "bullish" | "bearish" | null } {
  if (candles.length < 5 || swings.length < 2)
    return { detected: false, direction: null };

  const recent = candles.slice(-10);

  for (let i = 1; i < recent.length - 1; i++) {
    const c = recent[i];
    const next = recent[i + 1];
    const lows = swings.filter((s) => s.type === "low");
    const highs = swings.filter((s) => s.type === "high");

    // Bullish stop hunt: spike below swing low then reversal up within 3 candles
    if (lows.length > 0) {
      const nearestLow = Math.min(...lows.slice(-3).map((s) => s.price));
      if (c.low < nearestLow && next.close > nearestLow) {
        return { detected: true, direction: "bullish" };
      }
    }

    // Bearish stop hunt: spike above swing high then reversal down
    if (highs.length > 0) {
      const nearestHigh = Math.max(...highs.slice(-3).map((s) => s.price));
      if (c.high > nearestHigh && next.close < nearestHigh) {
        return { detected: true, direction: "bearish" };
      }
    }
  }

  return { detected: false, direction: null };
}

function detectLiquidityZones(
  swings: SwingPoint[],
): Array<{ price: number; strength: number; type: "high" | "low" }> {
  const zones: Array<{
    price: number;
    strength: number;
    type: "high" | "low";
  }> = [];
  const threshold = 0.005; // 0.5% cluster tolerance

  for (const swing of swings) {
    const existing = zones.find(
      (z) =>
        z.type === swing.type &&
        Math.abs(z.price - swing.price) / z.price < threshold,
    );
    if (existing) {
      existing.strength += 1;
      existing.price = (existing.price + swing.price) / 2; // average
    } else {
      zones.push({ price: swing.price, strength: 1, type: swing.type });
    }
  }

  return zones
    .filter((z) => z.strength >= 1)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);
}

function detectOrderBlocks(
  candles: Candle[],
): Array<{ price: number; type: "bull" | "bear"; size: number }> {
  const obs: Array<{ price: number; type: "bull" | "bear"; size: number }> = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const curr = candles[i];
    const next = candles[i + 1];
    const size = Math.abs(curr.close - curr.open);

    // Bullish OB: last bearish candle before strong bullish impulse
    if (
      curr.close < curr.open && // bearish candle
      next.close > next.open && // followed by bullish
      next.close > curr.high && // strong impulse
      size > 0
    ) {
      obs.push({ price: (curr.high + curr.low) / 2, type: "bull", size });
    }

    // Bearish OB: last bullish candle before strong bearish impulse
    if (
      curr.close > curr.open && // bullish candle
      next.close < next.open && // followed by bearish
      next.close < curr.low && // strong impulse
      size > 0
    ) {
      obs.push({ price: (curr.high + curr.low) / 2, type: "bear", size });
    }
  }

  // Return most recent and largest OBs
  return obs.slice(-6);
}

function detectFVG(candles: Candle[]): Array<{
  high: number;
  low: number;
  type: "bull" | "bear";
  mitigated: boolean;
}> {
  const fvgs: Array<{
    high: number;
    low: number;
    type: "bull" | "bear";
    mitigated: boolean;
  }> = [];

  for (let i = 0; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c3 = candles[i + 2];

    // Bullish FVG: gap between c1.high and c3.low (c2 candle jumps up)
    if (c3.low > c1.high) {
      const mitigated = candles
        .slice(i + 3)
        .some((c) => c.low <= c1.high + (c3.low - c1.high) * 0.5);
      fvgs.push({ high: c3.low, low: c1.high, type: "bull", mitigated });
    }

    // Bearish FVG: gap between c3.high and c1.low
    if (c1.low > c3.high) {
      const mitigated = candles
        .slice(i + 3)
        .some((c) => c.high >= c3.high + (c1.low - c3.high) * 0.5);
      fvgs.push({ high: c1.low, low: c3.high, type: "bear", mitigated });
    }
  }

  // Return most recent unmitigated FVGs
  return fvgs.filter((f) => !f.mitigated).slice(-5);
}

function detectPhase(
  candles: Candle[],
  swings: SwingPoint[],
  bos: boolean,
  bosDirection: "bullish" | "bearish" | null,
  stopHunt: boolean,
): SMCAnalysis["phase"] {
  const last20 = candles.slice(-20);
  if (last20.length < 5) return "Acumulação";

  const highs = last20.map((c) => c.high);
  const lows = last20.map((c) => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const rangePercent = maxHigh > 0 ? ((maxHigh - minLow) / maxHigh) * 100 : 0;

  // Distribuição Alta: bullish BOS + price making HH
  if (bos && bosDirection === "bullish") {
    const recentHighs = swings.filter((s) => s.type === "high").slice(-3);
    const isHH =
      recentHighs.length >= 2 &&
      recentHighs[recentHighs.length - 1].price >
        recentHighs[recentHighs.length - 2].price;
    if (isHH) return "Distribuição Alta";
  }

  // Distribuição Baixa: bearish BOS + price making LL
  if (bos && bosDirection === "bearish") {
    const recentLows = swings.filter((s) => s.type === "low").slice(-3);
    const isLL =
      recentLows.length >= 2 &&
      recentLows[recentLows.length - 1].price <
        recentLows[recentLows.length - 2].price;
    if (isLL) return "Distribuição Baixa";
  }

  // Manipulação: stop hunt detected + sudden BOS
  if (stopHunt && bos) return "Manipulação";
  if (stopHunt && rangePercent < 5) return "Manipulação";

  // Acumulação: compressed range, no clear BOS
  if (rangePercent < 3 && !bos) return "Acumulação";

  // Default: check price momentum
  if (bos && bosDirection === "bullish") return "Distribuição Alta";
  if (bos && bosDirection === "bearish") return "Distribuição Baixa";

  return "Acumulação";
}

export function analyzeSMC(candles: Candle[]): SMCAnalysis {
  try {
    const valid = candles.filter(isValidCandle);
    if (valid.length < 20) return { ...SAFE_DEFAULT };

    const swings = detectSwingPoints(valid);
    const { bos, direction: bosDirection } = detectBOS(valid, swings);
    const choch = detectCHoCH(valid, swings);
    const { detected: stopHunt, direction: stopHuntDirection } = detectStopHunt(
      valid,
      swings,
    );
    const liquidityZones = detectLiquidityZones(swings);
    const orderBlocks = detectOrderBlocks(valid);
    const fvgs = detectFVG(valid);
    const phase = detectPhase(valid, swings, bos, bosDirection, stopHunt);

    // Confidence: more signals = higher confidence
    let confidence = 30;
    if (swings.length >= 4) confidence += 20;
    if (bos) confidence += 15;
    if (stopHunt) confidence += 15;
    if (orderBlocks.length > 0) confidence += 10;
    if (fvgs.length > 0) confidence += 10;
    confidence = Math.min(100, confidence);

    return {
      phase,
      bos,
      bosDirection,
      choch,
      stopHunt,
      stopHuntDirection,
      liquidityZones,
      orderBlocks,
      fvgs,
      confidence,
    };
  } catch {
    return { ...SAFE_DEFAULT };
  }
}

export function computeSMCScore(
  analysis15m: SMCAnalysis,
  analysis1h: SMCAnalysis,
  analysis4h: SMCAnalysis,
  btcPhase: SMCAnalysis["phase"],
): number {
  function scoreForAnalysis(
    a: SMCAnalysis,
    btcPh: SMCAnalysis["phase"],
  ): number {
    let score = 0;

    // BTC phase alignment: altcoin phase matches or confirms BTC phase
    const bullishPhases = ["Distribuição Alta", "Manipulação"];
    const btcBullish = bullishPhases.includes(btcPh);
    const altBullish = bullishPhases.includes(a.phase);
    if (btcBullish === altBullish)
      score += 30; // aligned
    else if (a.phase === "Acumulação" && btcBullish) score += 15; // loading

    // Stop hunt detected (recent manipulation = entry opportunity)
    if (a.stopHunt) score += 20;

    // BOS/CHoCH present (structure confirmation)
    if (a.bos) score += 15;
    if (a.choch) score += 5;

    // Near liquidity zone (within 1.5% of a liquidity cluster)
    if (a.liquidityZones.length > 0) score += 15;

    // Order Block present
    if (a.orderBlocks.length > 0) score += 15;

    return Math.min(100, score);
  }

  const s15m = scoreForAnalysis(analysis15m, btcPhase);
  const s1h = scoreForAnalysis(analysis1h, btcPhase);
  const s4h = scoreForAnalysis(analysis4h, btcPhase);

  // Weight: 15m=30%, 1h=40%, 4h=30%
  const weighted = s15m * 0.3 + s1h * 0.4 + s4h * 0.3;
  return Math.min(100, Math.round(weighted));
}
