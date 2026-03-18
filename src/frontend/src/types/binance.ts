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
}

export interface BTCMetrics {
  price: number;
  priceChange24h: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
  rsi: number;
  reversalScore: number;
  klines: KlineData[];
}

export type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
