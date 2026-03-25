export interface Ticker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface PremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  interestRate: string;
  nextFundingTime: number;
  time: number;
}

export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface OpenInterestData {
  openInterest: string;
  symbol: string;
  time: number;
}

export interface SmartMoneyMetrics {
  /** Long/Short Ratio — abaixo de 0.5 = muito vendido */
  lsr: number | null;
  /** Acumulação 15m score (1-5, 5 = acumulação forte) */
  range15m: number;
  /** Quantos TFs (15m, 1h, 4h) o ativo tem correlação positiva com BTC */
  expBtcCount: number;
  /** Nomes dos TFs com exp_btc positivo */
  expBtcTFs: string[];
  /** Score Smart Money composto (0-100) */
  smartMoneyScore: number;
  /** Setup textbook: FR negativo + LSR baixo + range alto + expBtc positivo */
  isSmartMoneySetup: boolean;
}

export interface AltcoinOpportunity {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  fundingRate: number;
  rsi: number;
  score: number;
  highPrice: string;
  lowPrice: string;
  klines?: KlineData[];
  resistanceLevels?: number[];
  tp1?: number;
  tp2?: number;
  tp3?: number;
  stopLoss?: number;
  timeframeUsed?: string;
  rsi14?: number;
  ma20?: number;
  ma50?: number;
  // Smart Money metrics (available for top 10 enriched assets)
  smartMoney?: SmartMoneyMetrics;
}

export interface ReversalSignal {
  label: string;
  value: string;
  score: number;
  maxScore: number;
  active: boolean;
  direction: "bullish" | "bearish" | "neutral";
}

export interface ReversalDetails {
  signals: ReversalSignal[];
  totalScore: number;
  reversalType: "bottom" | "top" | "none";
}

export interface BTCMetrics {
  price: number;
  priceChange24h: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
  rsi: number;
  reversalScore: number;
  capitalFlowScore: number;
  takerBuyRatio: number;
  klines: KlineData[];
  rsi15m: number;
  rsi4h: number;
  maPositions: {
    ma20: number;
    ma50: number;
    ma100: number;
    ma180: number;
    priceAboveMA20: boolean;
    priceAboveMA50: boolean;
    priceAboveMA100: boolean;
    priceAboveMA180: boolean;
  };
  volumeSpike: number;
  oiDeltaPct: number;
  reversalDetails: ReversalDetails;
  multiExchange?: {
    fearGreedIndex: number | null;
    fearGreedLabel: string | null;
    bybitFundingRate: number | null;
    bybitLongShortRatio: number | null;
    okxFundingRate: number | null;
    avgFundingRate: number;
    coinGeckoBTCVolume24h: number | null;
    sourcesActive: string[];
  };
}

export type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export interface LiquidationData {
  symbol: string;
  side: "BUY" | "SELL"; // BUY = SHORT position liquidated (bullish), SELL = LONG position liquidated (bearish)
  price: number;
  origQty: number;
  notionalValue: number; // price * origQty
  time: number;
}
