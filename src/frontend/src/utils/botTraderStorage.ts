const STORAGE_KEY = "cfm_bot_trader_v1";

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
}

const emptyActiveTrades = (): Record<ModalityId, SimulatedTrade | null> => ({
  scalp: null,
  daytrade: null,
  swing: null,
  tendencia: null,
  holding: null,
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeTrades: emptyActiveTrades(), tradeHistory: [] };
    const parsed = JSON.parse(raw) as BotState;
    // Ensure all modality keys exist
    const activeTrades = { ...emptyActiveTrades(), ...parsed.activeTrades };
    return { activeTrades, tradeHistory: parsed.tradeHistory ?? [] };
  } catch {
    return { activeTrades: emptyActiveTrades(), tradeHistory: [] };
  }
}
