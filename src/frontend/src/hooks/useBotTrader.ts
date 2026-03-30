import { useCallback, useEffect, useRef, useState } from "react";
import type { AltcoinOpportunity, BTCMetrics } from "../types/binance";
import {
  type BotState,
  type ModalityId,
  type PatternSummary,
  type SimulatedTrade,
  addRecentTrade,
  loadBotState,
  saveBotState,
} from "../utils/botTraderStorage";
import {
  checkDangerPatterns,
  triggerStopLossAnalysis,
} from "../utils/stopLossLearner";

const MODALITIES: ModalityId[] = [
  "scalp",
  "daytrade",
  "swing",
  "tendencia",
  "holding",
];

// ─── Modality target multipliers ───────────────────────────────────────────
export const MODALITY_CONFIG: Record<
  ModalityId,
  {
    tp1Pct: number;
    tp2Pct: number;
    tp3Pct: number;
    slPct: number;
    minScore: number;
    minBtcScore: number;
    sortBy: "volume" | "score" | "funding" | "lowVolatility";
    maxVolatility?: number;
    minVolatility?: number;
    requireNegativeFunding?: boolean;
    allowReversal: boolean;
    description: string;
  }
> = {
  scalp: {
    tp1Pct: 0.5,
    tp2Pct: 1.0,
    tp3Pct: 1.8,
    slPct: 0.5,
    minScore: 50,
    minBtcScore: 0,
    sortBy: "volume",
    minVolatility: 1.0,
    allowReversal: true,
    description: "Alto volume e liquidez — alvos curtos para ganhos em minutos",
  },
  daytrade: {
    tp1Pct: 1.5,
    tp2Pct: 2.8,
    tp3Pct: 4.5,
    slPct: 1.5,
    minScore: 55,
    minBtcScore: 0,
    sortBy: "score",
    minVolatility: 2.0,
    maxVolatility: 15.0,
    allowReversal: true,
    description:
      "Volatilidade moderada — trades intraday fechados antes das 00h UTC",
  },
  swing: {
    tp1Pct: 3.0,
    tp2Pct: 5.5,
    tp3Pct: 9.0,
    slPct: 2.5,
    minScore: 60,
    minBtcScore: 20,
    sortBy: "funding",
    requireNegativeFunding: true,
    maxVolatility: 12.0,
    allowReversal: false,
    description: "Funding negativo + estrutura sólida — operações de dias",
  },
  tendencia: {
    tp1Pct: 8.0,
    tp2Pct: 14.0,
    tp3Pct: 22.0,
    slPct: 4.0,
    minScore: 65,
    minBtcScore: 35,
    sortBy: "score",
    allowReversal: false,
    description: "Tendência macro confirmada — alvos amplos em semanas",
  },
  holding: {
    tp1Pct: 20.0,
    tp2Pct: 38.0,
    tp3Pct: 65.0,
    slPct: 8.0,
    minScore: 68,
    minBtcScore: 45,
    sortBy: "lowVolatility",
    maxVolatility: 8.0,
    allowReversal: false,
    description: "Fundamentos sólidos e baixa volatilidade — posição de meses",
  },
};

function makeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function computePatterns(history: SimulatedTrade[]): PatternSummary {
  const byModality: PatternSummary["byModality"] = {
    scalp: { wins: 0, losses: 0, botClose: 0, avgPnl: 0 },
    daytrade: { wins: 0, losses: 0, botClose: 0, avgPnl: 0 },
    swing: { wins: 0, losses: 0, botClose: 0, avgPnl: 0 },
    tendencia: { wins: 0, losses: 0, botClose: 0, avgPnl: 0 },
    holding: { wins: 0, losses: 0, botClose: 0, avgPnl: 0 },
  };
  const symbolMap: Record<string, { wins: number; total: number }> = {};
  let totalWins = 0;

  for (const t of history) {
    const m = byModality[t.modality];
    const pnl = t.pnlPct ?? 0;
    const prevAvg = m.avgPnl;
    const prevCount = m.wins + m.losses + m.botClose;
    m.avgPnl =
      prevCount > 0 ? (prevAvg * prevCount + pnl) / (prevCount + 1) : pnl;

    if (t.closeReason === "TP3_WIN") {
      m.wins++;
      totalWins++;
    } else if (t.closeReason === "SL_LOSS") m.losses++;
    else m.botClose++;

    const sym = t.symbol;
    if (!symbolMap[sym]) symbolMap[sym] = { wins: 0, total: 0 };
    symbolMap[sym].total++;
    if (t.closeReason === "TP3_WIN") symbolMap[sym].wins++;
  }

  const topSymbols = Object.entries(symbolMap)
    .map(([symbol, v]) => ({ symbol, wins: v.wins, total: v.total }))
    .sort(
      (a, b) => b.wins / Math.max(b.total, 1) - a.wins / Math.max(a.total, 1),
    )
    .slice(0, 5);

  return {
    byModality,
    topSymbols,
    totalTrades: history.length,
    overallWinRate: history.length > 0 ? (totalWins / history.length) * 100 : 0,
  };
}

function filterCandidates(
  mod: ModalityId,
  eligible: AltcoinOpportunity[],
  reversalScore: number,
  fearGreedIndex?: number | null,
  recentSymbols?: Set<string>,
): AltcoinOpportunity[] {
  const cfg = MODALITY_CONFIG[mod];

  if (reversalScore < cfg.minBtcScore) return [];

  const minScore =
    fearGreedIndex !== null &&
    fearGreedIndex !== undefined &&
    fearGreedIndex < 20 &&
    (mod === "holding" || mod === "tendencia")
      ? Math.max(cfg.minScore, 80)
      : cfg.minScore;

  let candidates = eligible.filter((a) => a.score >= minScore);

  if (cfg.minVolatility !== undefined) {
    const minVol = cfg.minVolatility;
    candidates = candidates.filter((a) => Math.abs(a.priceChange24h) >= minVol);
  }
  if (cfg.maxVolatility !== undefined) {
    const maxVol = cfg.maxVolatility;
    candidates = candidates.filter((a) => Math.abs(a.priceChange24h) <= maxVol);
  }
  if (cfg.requireNegativeFunding) {
    candidates = candidates.filter((a) => a.fundingRate < 0);
  }

  // Smart Money filter: for quality modalities, require Smart Money setup
  if (mod === "swing" || mod === "tendencia" || mod === "holding") {
    const smCandidates = candidates.filter(
      (a) => a.smartMoney?.isSmartMoneySetup === true,
    );
    // Only apply hard filter if we have at least one qualifying asset
    if (smCandidates.length > 0) candidates = smCandidates;
  } else {
    // For scalp/daytrade: prefer Smart Money setups but don't require
    const smCandidates = candidates.filter(
      (a) => a.smartMoney?.isSmartMoneySetup === true,
    );
    if (smCandidates.length > 0) candidates = smCandidates;
  }

  // Prefer symbols not recently traded (avoid repeating last 3 failures)
  if (recentSymbols && recentSymbols.size > 0) {
    const preferFresh = candidates.filter((a) => !recentSymbols.has(a.symbol));
    if (preferFresh.length > 0) candidates = preferFresh;
  }

  switch (cfg.sortBy) {
    case "volume":
      candidates.sort((a, b) => b.volume24h - a.volume24h);
      break;
    case "funding":
      candidates.sort((a, b) => a.fundingRate - b.fundingRate);
      break;
    case "lowVolatility":
      candidates.sort(
        (a, b) => Math.abs(a.priceChange24h) - Math.abs(b.priceChange24h),
      );
      break;
    default:
      candidates.sort((a, b) => b.score - a.score);
      break;
  }

  return candidates;
}

function computeTargets(
  mod: ModalityId,
  entry: number,
  direction: "LONG" | "SHORT",
): { tp1: number; tp2: number; tp3: number; stopLoss: number } {
  const cfg = MODALITY_CONFIG[mod];
  if (direction === "LONG") {
    return {
      tp1: entry * (1 + cfg.tp1Pct / 100),
      tp2: entry * (1 + cfg.tp2Pct / 100),
      tp3: entry * (1 + cfg.tp3Pct / 100),
      stopLoss: entry * (1 - cfg.slPct / 100),
    };
  }
  return {
    tp1: entry * (1 - cfg.tp1Pct / 100),
    tp2: entry * (1 - cfg.tp2Pct / 100),
    tp3: entry * (1 - cfg.tp3Pct / 100),
    stopLoss: entry * (1 + cfg.slPct / 100),
  };
}

function buildOpenLog(
  mod: ModalityId,
  asset: AltcoinOpportunity,
  direction: "LONG" | "SHORT",
  fearGreedIndex?: number | null,
  bybitLSR?: number | null,
): string {
  const cfg = MODALITY_CONFIG[mod];
  const hints: string[] = [];
  if (mod === "scalp") {
    hints.push(`vol ${(asset.volume24h / 1e6).toFixed(1)}M`);
  } else if (mod === "swing") {
    hints.push(`funding ${(asset.fundingRate * 100).toFixed(4)}%`);
  } else if (mod === "holding") {
    hints.push(
      `volatilidade ${Math.abs(asset.priceChange24h).toFixed(1)}%/24h`,
    );
  }
  if (fearGreedIndex !== null && fearGreedIndex !== undefined) {
    if (fearGreedIndex < 25) hints.push(`F&G: Medo Extremo(${fearGreedIndex})`);
    else if (fearGreedIndex > 75)
      hints.push(`F&G: Ganância Extrema(${fearGreedIndex})`);
  }
  if (bybitLSR !== null && bybitLSR !== undefined) {
    const shortPct = ((1 - bybitLSR) * 100).toFixed(0);
    if (bybitLSR < 0.4) hints.push(`Bybit: ${shortPct}% short`);
  }
  const tpStr = `TP: +${cfg.tp1Pct}%/+${cfg.tp2Pct}%/+${cfg.tp3Pct}%`;
  const slStr = `SL: -${cfg.slPct}%`;
  return `${direction} em ${asset.symbol} @ ${asset.price.toFixed(4)} | ${tpStr} | ${slStr}${hints.length ? ` | ${hints.join(", ")}` : ""}`;
}

// ─── Fetch live prices for a list of symbols from Binance ─────────────────
async function fetchLivePrices(
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  try {
    const results: Record<string, number> = {};
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(
            `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`,
          );
          if (res.ok) {
            const data = await res.json();
            results[sym] = Number.parseFloat(data.price);
          }
        } catch {
          // ignore individual failures
        }
      }),
    );
    return results;
  } catch {
    return {};
  }
}

function applyTradeLogic(
  state: BotState,
  altcoins: AltcoinOpportunity[],
  btcMetrics: BTCMetrics | null,
  livePrices: Record<string, number>,
  priceUpdateOnly = false, // if true, only update prices, skip open/close logic
): BotState {
  const activeTrades = { ...state.activeTrades };
  let tradeHistory = [...state.tradeHistory];
  let recentByModality = { ...state.recentByModality };
  const reversalScore = btcMetrics?.reversalScore ?? 0;
  const reversalType = btcMetrics?.reversalDetails?.reversalType ?? "none";
  const fearGreedIndex = btcMetrics?.multiExchange?.fearGreedIndex ?? null;
  const bybitLSR = btcMetrics?.multiExchange?.bybitLongShortRatio ?? null;

  // Build price map from Scanner data
  const priceMap: Record<string, AltcoinOpportunity> = {};
  for (const a of altcoins) priceMap[a.symbol] = a;

  // ── Update and check active trades ──────────────────────────────────────
  for (const mod of MODALITIES) {
    const trade = activeTrades[mod];
    if (!trade || trade.status === "CLOSED") continue;

    // Use Scanner price first, then live-fetched price, then keep last known
    const scannerAltcoin = priceMap[trade.symbol];
    const livePrice = livePrices[trade.symbol];
    const currentPrice =
      scannerAltcoin?.price ?? livePrice ?? trade.currentPrice;

    let updated = {
      ...trade,
      currentPrice,
      lastPriceAt:
        currentPrice !== trade.currentPrice ? Date.now() : trade.lastPriceAt,
    };

    if (updated.direction === "LONG") {
      updated.pnlPct = ((currentPrice - updated.entry) / updated.entry) * 100;
    } else {
      updated.pnlPct = ((updated.entry - currentPrice) / updated.entry) * 100;
    }

    // If price-update-only mode (startup), skip open/close evaluations
    if (priceUpdateOnly) {
      activeTrades[mod] = updated;
      continue;
    }

    let closed = false;
    const cfg = MODALITY_CONFIG[mod];

    // BOT EARLY CLOSE: scalp/daytrade LONG on strong BTC top
    if (
      !closed &&
      cfg.allowReversal &&
      reversalScore > 70 &&
      reversalType === "top" &&
      updated.direction === "LONG"
    ) {
      const ct = {
        ...updated,
        status: "CLOSED" as const,
        closeReason: "BOT_CLOSE" as const,
        closedPrice: currentPrice,
        closeTime: Date.now(),
        botLog: "BTC com sinal de topo forte — trade fechado preventivamente",
      };
      tradeHistory = [ct, ...tradeHistory].slice(0, 200);
      recentByModality = addRecentTrade(recentByModality, ct);
      activeTrades[mod] = null;
      closed = true;
    }

    // BOT REVERSAL: scalp/daytrade only → flip to SHORT
    if (
      !closed &&
      cfg.allowReversal &&
      reversalScore > 80 &&
      reversalType === "top" &&
      updated.direction === "LONG"
    ) {
      const ct = {
        ...updated,
        status: "CLOSED" as const,
        closeReason: "BOT_REVERSE" as const,
        closedPrice: currentPrice,
        closeTime: Date.now(),
        botLog: "Reversão BTC detectada — trade invertido para SHORT",
      };
      tradeHistory = [ct, ...tradeHistory].slice(0, 200);
      recentByModality = addRecentTrade(recentByModality, ct);
      if (scannerAltcoin) {
        const entry = currentPrice;
        const targets = computeTargets(mod, entry, "SHORT");
        activeTrades[mod] = {
          id: makeId(),
          modality: mod,
          symbol: trade.symbol,
          direction: "SHORT",
          entry,
          currentPrice: entry,
          ...targets,
          status: "ACTIVE",
          openTime: Date.now(),
          pnlPct: 0,
          botLog: buildOpenLog(
            mod,
            scannerAltcoin,
            "SHORT",
            fearGreedIndex,
            bybitLSR,
          ),
          partialsTaken: 0,
          score: scannerAltcoin.score,
        };
      } else {
        activeTrades[mod] = null;
      }
      closed = true;
    }

    // BOT EXTREME GREED + REVERSAL
    if (
      !closed &&
      updated.direction === "LONG" &&
      (mod === "swing" || mod === "tendencia") &&
      fearGreedIndex !== null &&
      fearGreedIndex > 80 &&
      reversalScore > 65
    ) {
      const ct = {
        ...updated,
        status: "CLOSED" as const,
        closeReason: "BOT_CLOSE" as const,
        closedPrice: currentPrice,
        closeTime: Date.now(),
        botLog: `Ganância extrema (F&G: ${fearGreedIndex}) + BTC sobrecomprado — trade encerrado preventivamente`,
      };
      tradeHistory = [ct, ...tradeHistory].slice(0, 200);
      recentByModality = addRecentTrade(recentByModality, ct);
      activeTrades[mod] = null;
      closed = true;
    }

    // BOT ADVERSE FUNDING
    if (
      !closed &&
      updated.direction === "LONG" &&
      mod === "scalp" &&
      scannerAltcoin &&
      scannerAltcoin.fundingRate > 0.001
    ) {
      updated = {
        ...updated,
        status: "CLOSED",
        closeReason: "BOT_CLOSE",
        closedPrice: currentPrice,
        closeTime: Date.now(),
        botLog: "Funding rate adverso — scalp encerrado",
      };
      tradeHistory = [updated, ...tradeHistory].slice(0, 200);
      recentByModality = addRecentTrade(recentByModality, updated);
      activeTrades[mod] = null;
      closed = true;
    }

    if (!closed) {
      if (updated.direction === "LONG") {
        if (currentPrice >= updated.tp3 && updated.partialsTaken >= 2) {
          updated = {
            ...updated,
            status: "CLOSED",
            closeReason: "TP3_WIN",
            closedPrice: currentPrice,
            closeTime: Date.now(),
            pnlPct: ((updated.tp3 - updated.entry) / updated.entry) * 100,
            botLog: "TP3 atingido — trade encerrado com lucro total 🎯",
          };
          tradeHistory = [updated, ...tradeHistory].slice(0, 200);
          recentByModality = addRecentTrade(recentByModality, updated);
          activeTrades[mod] = null;
          closed = true;
        } else if (currentPrice >= updated.tp2 && updated.partialsTaken === 1) {
          updated = {
            ...updated,
            status: "PARTIAL_TP2",
            partialsTaken: 2,
            botLog: "TP2 atingido — parcial de 33% realizada",
          };
        } else if (currentPrice >= updated.tp1 && updated.partialsTaken === 0) {
          updated = {
            ...updated,
            status: "PARTIAL_TP1",
            partialsTaken: 1,
            botLog: "TP1 atingido — parcial de 33% realizada",
          };
        } else if (currentPrice <= updated.stopLoss) {
          updated = {
            ...updated,
            status: "CLOSED",
            closeReason: "SL_LOSS",
            closedPrice: currentPrice,
            closeTime: Date.now(),
            pnlPct: ((updated.stopLoss - updated.entry) / updated.entry) * 100,
            botLog: "Stop loss atingido — posição encerrada",
          };
          tradeHistory = [updated, ...tradeHistory].slice(0, 200);
          recentByModality = addRecentTrade(recentByModality, updated);
          activeTrades[mod] = null;
          closed = true;
        }
      } else {
        if (currentPrice <= updated.tp3 && updated.partialsTaken >= 2) {
          updated = {
            ...updated,
            status: "CLOSED",
            closeReason: "TP3_WIN",
            closedPrice: currentPrice,
            closeTime: Date.now(),
            pnlPct: ((updated.entry - updated.tp3) / updated.entry) * 100,
            botLog: "TP3 SHORT atingido — trade encerrado com lucro total 🎯",
          };
          tradeHistory = [updated, ...tradeHistory].slice(0, 200);
          recentByModality = addRecentTrade(recentByModality, updated);
          activeTrades[mod] = null;
          closed = true;
        } else if (currentPrice <= updated.tp2 && updated.partialsTaken === 1) {
          updated = {
            ...updated,
            status: "PARTIAL_TP2",
            partialsTaken: 2,
            botLog: "TP2 SHORT — parcial de 33% realizada",
          };
        } else if (currentPrice <= updated.tp1 && updated.partialsTaken === 0) {
          updated = {
            ...updated,
            status: "PARTIAL_TP1",
            partialsTaken: 1,
            botLog: "TP1 SHORT — parcial de 33% realizada",
          };
        } else if (currentPrice >= updated.stopLoss) {
          updated = {
            ...updated,
            status: "CLOSED",
            closeReason: "SL_LOSS",
            closedPrice: currentPrice,
            closeTime: Date.now(),
            pnlPct: -((updated.stopLoss - updated.entry) / updated.entry) * 100,
            botLog: "Stop loss SHORT atingido — posição encerrada",
          };
          tradeHistory = [updated, ...tradeHistory].slice(0, 200);
          recentByModality = addRecentTrade(recentByModality, updated);
          activeTrades[mod] = null;
          closed = true;
        }
      }
      if (!closed) {
        activeTrades[mod] = updated;
      }
    }
  }

  if (priceUpdateOnly) {
    return { activeTrades, tradeHistory, recentByModality };
  }

  // ── Open new trades for empty slots ───────────────────────────────────────
  const activeSymbols = new Set(
    MODALITIES.map((m) => activeTrades[m]?.symbol).filter(Boolean),
  );

  const eligible = altcoins.filter(
    (a) =>
      a.tp1 !== undefined &&
      a.tp2 !== undefined &&
      a.tp3 !== undefined &&
      a.stopLoss !== undefined &&
      !activeSymbols.has(a.symbol),
  );

  for (const mod of MODALITIES) {
    if (activeTrades[mod] !== null) continue;

    // Build a set of recently-traded symbols for this modality to avoid
    // immediately re-entering the same losing symbols
    const recentSymbols = new Set(
      (recentByModality[mod] ?? []).map((t) => t.symbol),
    );

    const candidates = filterCandidates(
      mod,
      eligible,
      reversalScore,
      fearGreedIndex,
      recentSymbols,
    );
    if (candidates.length === 0) continue;

    const best = candidates[0];
    const cfg = MODALITY_CONFIG[mod];

    let direction: "LONG" | "SHORT" = "LONG";
    if (cfg.allowReversal && reversalScore > 70 && reversalType === "top") {
      direction = "SHORT";
    }

    const targets = computeTargets(mod, best.price, direction);

    activeTrades[mod] = {
      id: makeId(),
      modality: mod,
      symbol: best.symbol,
      direction,
      entry: best.price,
      currentPrice: best.price,
      ...targets,
      status: "ACTIVE",
      openTime: Date.now(),
      pnlPct: 0,
      botLog: buildOpenLog(mod, best, direction, fearGreedIndex, bybitLSR),
      partialsTaken: 0,
      score: best.score,
      lastPriceAt: Date.now(),
    };
    activeSymbols.add(best.symbol);
  }

  return { activeTrades, tradeHistory, recentByModality };
}

export function useBotTrader(
  altcoins: AltcoinOpportunity[],
  btcMetrics: BTCMetrics | null,
) {
  const [state, setState] = useState<BotState>(() => loadBotState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const [dangerWarnings, setDangerWarnings] = useState<Record<string, string>>(
    {},
  );
  const lastDangerCheckRef = useRef<Record<string, number>>({});

  const altcoinsRef = useRef(altcoins);
  altcoinsRef.current = altcoins;

  const btcMetricsRef = useRef(btcMetrics);
  btcMetricsRef.current = btcMetrics;

  // On mount: fetch live prices for ALL active trades immediately,
  // then update prices without triggering TP/SL logic (priceUpdateOnly=true).
  // This ensures restored trades show current prices before any evaluation.
  useEffect(() => {
    const initializePrices = async () => {
      const current = stateRef.current;
      const activeSymbols = MODALITIES.map(
        (m) => current.activeTrades[m]?.symbol,
      ).filter((s): s is string => !!s);

      if (activeSymbols.length === 0) return;

      const livePrices = await fetchLivePrices(activeSymbols);
      if (Object.keys(livePrices).length === 0) return;

      setState((prev) => {
        const next = applyTradeLogic(prev, [], null, livePrices, true);
        saveBotState(next);
        return next;
      });
    };
    initializePrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get symbols of active trades that need direct price feeds
  const getActiveSymbols = useCallback((): string[] => {
    const current = stateRef.current;
    const scannerSymbols = new Set(altcoinsRef.current.map((a) => a.symbol));
    return MODALITIES.map((m) => current.activeTrades[m]?.symbol).filter(
      (sym): sym is string => !!sym && !scannerSymbols.has(sym),
    );
  }, []);

  // Main effect: runs when Scanner data changes
  useEffect(() => {
    if (altcoins.length === 0) return;
    setState((prev) => {
      const next = applyTradeLogic(prev, altcoins, btcMetrics, {});
      saveBotState(next);
      return next;
    });
  }, [altcoins, btcMetrics]);

  // Interval effect: every 5 seconds, fetch live prices for active trades
  // that are NOT in the Scanner list, then re-evaluate trade logic.
  useEffect(() => {
    const interval = setInterval(async () => {
      const symbolsToFetch = getActiveSymbols();
      const livePrices = await fetchLivePrices(symbolsToFetch);

      // Capture trades before update to detect new SL_LOSS events
      const prevActiveTrades = { ...stateRef.current.activeTrades };

      setState((prev) => {
        const needsUpdate = MODALITIES.some((m) => {
          const t = prev.activeTrades[m];
          if (!t) return false;
          const scannerPrice = altcoinsRef.current.find(
            (a) => a.symbol === t.symbol,
          )?.price;
          return (
            scannerPrice === undefined && livePrices[t.symbol] !== undefined
          );
        });

        if (!needsUpdate && symbolsToFetch.length === 0) return prev;

        const next = applyTradeLogic(
          prev,
          altcoinsRef.current,
          btcMetricsRef.current,
          livePrices,
        );

        // Detect SL_LOSS for newly closed trades and trigger pattern analysis
        for (const mod of MODALITIES) {
          const prevTrade = prevActiveTrades[mod];
          const nextTrade = next.activeTrades[mod];
          // trade was active and is now gone (closed)
          if (prevTrade && !nextTrade) {
            // find the closed trade in recent history
            const closed =
              next.recentByModality[mod as ModalityId]?.slice(-1)[0];
            if (closed?.closeReason === "SL_LOSS") {
              triggerStopLossAnalysis(
                closed.symbol,
                closed.modality,
                closed.entry,
                closed.openTime,
              ).catch(() => {});
            }
          }
        }

        saveBotState(next);
        return next;
      });

      // Danger pattern check for active trades (throttled: once per 60s per symbol)
      const now = Date.now();
      for (const mod of MODALITIES) {
        const trade = stateRef.current.activeTrades[mod];
        if (!trade) continue;
        const lastCheck = lastDangerCheckRef.current[trade.symbol] ?? 0;
        if (now - lastCheck < 60000) continue;
        lastDangerCheckRef.current[trade.symbol] = now;

        checkDangerPatterns(trade.symbol)
          .then(({ matchScore, warning }) => {
            if (matchScore >= 60 && warning) {
              setDangerWarnings((prev) => ({
                ...prev,
                [trade.symbol]: warning,
              }));

              const cfg = MODALITY_CONFIG[mod as ModalityId];
              setState((prev) => {
                const currentTrade = prev.activeTrades[mod as ModalityId];
                if (!currentTrade) return prev;

                const currentPrice = currentTrade.currentPrice;
                const closedTrade: SimulatedTrade = {
                  ...currentTrade,
                  status: "CLOSED",
                  closeReason: cfg.allowReversal ? "BOT_REVERSE" : "BOT_CLOSE",
                  closedPrice: currentPrice,
                  closeTime: Date.now(),
                  botLog: warning,
                  dangerPatternWarning: warning,
                };

                let tradeHistory = [closedTrade, ...prev.tradeHistory].slice(
                  0,
                  200,
                );
                let recentByModality = addRecentTrade(
                  prev.recentByModality,
                  closedTrade,
                );

                let activeTrades = {
                  ...prev.activeTrades,
                  [mod]: null as SimulatedTrade | null,
                };

                // For allowReversal modalities, open a SHORT
                if (cfg.allowReversal) {
                  const scannerAltcoin = altcoinsRef.current.find(
                    (a) => a.symbol === currentTrade.symbol,
                  );
                  if (scannerAltcoin) {
                    const targets = computeTargets(
                      mod as ModalityId,
                      currentPrice,
                      "SHORT",
                    );
                    activeTrades[mod as ModalityId] = {
                      id: makeId(),
                      modality: mod as ModalityId,
                      symbol: currentTrade.symbol,
                      direction: "SHORT",
                      entry: currentPrice,
                      currentPrice,
                      ...targets,
                      status: "ACTIVE",
                      openTime: Date.now(),
                      pnlPct: 0,
                      botLog: `SHORT aberto por padrão de risco: ${warning}`,
                      partialsTaken: 0,
                      score: scannerAltcoin.score,
                      lastPriceAt: Date.now(),
                    };
                  }
                }

                const next = {
                  ...prev,
                  activeTrades,
                  tradeHistory,
                  recentByModality,
                };
                saveBotState(next);
                return next;
              });
            }
          })
          .catch(() => {});
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [getActiveSymbols]);

  const patterns = computePatterns(state.tradeHistory);

  return {
    activeTrades: state.activeTrades,
    tradeHistory: state.tradeHistory,
    recentByModality: state.recentByModality,
    patterns,
    dangerWarnings,
  };
}
