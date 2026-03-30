const STORAGE_KEY = "cfm_bot_trader_v3";
const RECENT_KEY = "cfm_bot_recent_v3";

export type ModalityId =
  | "scalp"
  | "daytrade"
  | "swing"
  | "tendencia"
  | "holding";
export type TradeDirection = "LONG" | "SHORT";
export type CloseReason =
  | "TP1_PARTIAL"
  | "TP2_PARTIAL"
  | "TP3_WIN"
  | "SL_LOSS"
  | "BOT_CLOSE"
  | "BOT_REVERSE";
export type TradeStatus = "ACTIVE" | "PARTIAL_TP1" | "PARTIAL_TP2" | "CLOSED";

export interface SimulatedTrade {
  id: string;
  modality: ModalityId;
  symbol: string;
  direction: TradeDirection;
  entry: number;
  currentPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  stopLoss: number;
  status: TradeStatus;
  openTime: number;
  closeTime?: number;
  closeReason?: CloseReason;
  closedPrice?: number;
  pnlPct?: number;
  botLog: string;
  partialsTaken: number;
  score: number;
  // Last time the price was refreshed from Binance
  lastPriceAt?: number;
  // Set if a danger pattern was detected while trade was active
  dangerPatternWarning?: string;
}

export interface PatternSummary {
  byModality: Record<
    ModalityId,
    { wins: number; losses: number; botClose: number; avgPnl: number }
  >;
  topSymbols: { symbol: string; wins: number; total: number }[];
  totalTrades: number;
  overallWinRate: number;
}

export interface BotState {
  activeTrades: Record<ModalityId, SimulatedTrade | null>;
  tradeHistory: SimulatedTrade[];
  // Last 3 completed trades per modality for learning
  recentByModality: Record<ModalityId, SimulatedTrade[]>;
}

const MODALITIES: ModalityId[] = [
  "scalp",
  "daytrade",
  "swing",
  "tendencia",
  "holding",
];

const emptyActiveTrades = (): Record<ModalityId, SimulatedTrade | null> => ({
  scalp: null,
  daytrade: null,
  swing: null,
  tendencia: null,
  holding: null,
});

const emptyRecentByModality = (): Record<ModalityId, SimulatedTrade[]> => ({
  scalp: [],
  daytrade: [],
  swing: [],
  tendencia: [],
  holding: [],
});

export function saveBotState(state: BotState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function loadBotState(): BotState {
  try {
    // Try new key first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BotState;
      const activeTrades = { ...emptyActiveTrades(), ...parsed.activeTrades };
      const recentByModality = {
        ...emptyRecentByModality(),
        ...parsed.recentByModality,
      };
      return {
        activeTrades,
        tradeHistory: parsed.tradeHistory ?? [],
        recentByModality,
      };
    }

    // Migrate from old key (v1)
    const oldRaw = localStorage.getItem("cfm_bot_trader_v1");
    if (oldRaw) {
      const parsed = JSON.parse(oldRaw) as Partial<BotState>;
      const activeTrades = { ...emptyActiveTrades(), ...parsed.activeTrades };
      const tradeHistory = parsed.tradeHistory ?? [];
      // Rebuild recentByModality from existing history
      const recentByModality = emptyRecentByModality();
      for (const mod of MODALITIES) {
        recentByModality[mod] = tradeHistory
          .filter((t) => t.modality === mod && t.status === "CLOSED")
          .slice(-3);
      }
      return { activeTrades, tradeHistory, recentByModality };
    }

    return {
      activeTrades: emptyActiveTrades(),
      tradeHistory: [],
      recentByModality: emptyRecentByModality(),
    };
  } catch {
    return {
      activeTrades: emptyActiveTrades(),
      tradeHistory: [],
      recentByModality: emptyRecentByModality(),
    };
  }
}

/**
 * Add a closed trade to recentByModality, keeping only last 3 per modality.
 */
export function addRecentTrade(
  recent: Record<ModalityId, SimulatedTrade[]>,
  trade: SimulatedTrade,
): Record<ModalityId, SimulatedTrade[]> {
  const updated = { ...recent };
  const mod = trade.modality;
  const existing = updated[mod] ?? [];
  updated[mod] = [...existing, trade].slice(-3);
  return updated;
}

/**
 * Get recent trades for a modality (last 3 completed).
 */
export function getRecentTrades(
  recent: Record<ModalityId, SimulatedTrade[]>,
  mod: ModalityId,
): SimulatedTrade[] {
  return recent[mod] ?? [];
}

export { RECENT_KEY };
