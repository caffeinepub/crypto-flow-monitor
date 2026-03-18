import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AltcoinOpportunity,
  BTCMetrics,
  Interval,
  KlineData,
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

function computeBTCReversalScore(
  rsi: number,
  fundingRate: number,
  priceChange24h: number,
  openInterest: number,
  prevOI: number,
): number {
  let score = 0;
  if (rsi < 40) score += 25;
  else if (rsi < 50) score += 12;
  if (fundingRate < 0) score += 20;
  else if (fundingRate < 0.0001) score += 8;
  if (priceChange24h < -3) score += 15;
  else if (priceChange24h < -1) score += 7;
  if (openInterest > prevOI) score += 20;
  if (rsi < 35 && priceChange24h < -5) score += 20;
  else if (rsi < 45) score += 8;
  return Math.min(score, 100);
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

// Timeframe progression: smaller TFs tighten the SL (better R:R if TPs are fixed),
// larger TFs widen it to find a deeper structural low.
// Order: start at 15m, try smaller first (5m, 3m, 1m), then larger (30m, 1h)
const TF_SEARCH_ORDER = ["5m", "3m", "1m", "30m", "1h"] as const;

export function useBinanceData(interval: Interval = "1h") {
  const [btcMetrics, setBtcMetrics] = useState<BTCMetrics | null>(null);
  const [altcoins, setAltcoins] = useState<AltcoinOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const prevOIRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [klines, tickers, fundingRates, oi] = await Promise.all([
        fetchKlines("BTCUSDT", interval, 200),
        fetchAllTickers(),
        fetchFundingRates(),
        fetchOpenInterest("BTCUSDT"),
      ]);

      const closes = klines.map((k) => k.close);
      const rsi = calculateRSI(closes);

      const btcTicker = tickers.find(
        (t: { symbol: string }) => t.symbol === "BTCUSDT",
      );
      const btcFunding = fundingRates.find(
        (f: { symbol: string }) => f.symbol === "BTCUSDT",
      );
      const oiValue =
        Number.parseFloat(oi.openInterest || "0") *
        Number.parseFloat(btcTicker?.lastPrice || "0");
      const btcChange = Number.parseFloat(btcTicker?.priceChangePercent || "0");

      const reversalScore = computeBTCReversalScore(
        rsi,
        Number.parseFloat(btcFunding?.lastFundingRate || "0"),
        btcChange,
        oiValue,
        prevOIRef.current,
      );
      prevOIRef.current = oiValue;

      setBtcMetrics({
        price: Number.parseFloat(btcTicker?.lastPrice || "0"),
        priceChange24h: btcChange,
        volume24h: Number.parseFloat(btcTicker?.quoteVolume || "0"),
        fundingRate: Number.parseFloat(btcFunding?.lastFundingRate || "0"),
        openInterest: oiValue,
        rsi,
        reversalScore,
        klines,
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
          const price = Number.parseFloat(t.lastPrice);
          const low = Number.parseFloat(t.lowPrice);
          const high = Number.parseFloat(t.highPrice);
          const fr = fundingMap[t.symbol] ?? 0;
          const rangePos =
            high > low ? ((price - low) / (high - low)) * 100 : 50;
          const proxyRSI = 20 + rangePos * 0.6;
          const volumeRatio = Number.parseFloat(t.quoteVolume) / 1_000_000;
          const priceLowRatio = low > 0 ? price / low : 2;
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
            price,
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

      // Enrich top 10 with TP/SL using structural market analysis
      const top10 = opportunities.slice(0, 10);

      const enriched = await Promise.all(
        top10.map(async (alt) => {
          let klines15m: KlineData[];
          try {
            klines15m = await fetchKlines(`${alt.symbol}USDT`, "15m", 200);
          } catch {
            return alt;
          }

          const resistanceLevels = calculateResistanceLevels(
            klines15m,
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

          // Step 1: Calculate SL from 15m structural low (last swing low below entry)
          let stopLoss = calculateStopLoss(klines15m, alt.price);
          let timeframeUsed = "15m";
          let bestRR = stopLoss !== null ? calcRR(stopLoss) : 0;

          // Step 2: If R:R < 1:3 or no SL found, search other timeframes
          // Try smaller TFs first (tighter SL = better R:R), then larger TFs
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
                // Accept this TF if it gives a better R:R
                if (rr > bestRR) {
                  bestRR = rr;
                  bestSL = sl;
                  bestTF = tf;
                }
                // Stop searching once we achieve >= 1:3
                if (rr >= 3) break;
              } catch {
                // skip this timeframe
              }
            }

            if (bestSL !== null) {
              stopLoss = bestSL;
              timeframeUsed = bestTF;
            }
          }

          // Fallback: if no pivot low found in any TF, use 15m candle lows minimum
          if (stopLoss === null) {
            const recentLows = klines15m.slice(-20).map((k) => k.low);
            const minLow = Math.min(...recentLows);
            stopLoss = minLow * 0.995;
            timeframeUsed = "15m";
          }

          return {
            ...alt,
            klines: klines15m,
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
