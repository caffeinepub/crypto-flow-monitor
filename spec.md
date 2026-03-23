# Crypto Flow Monitor

## Current State
The altcoin scanner uses proxyRSI (from price range, not klines). Top 10 altcoins have 15m klines fetched but no RSI/MAs calculated. Expanded card shows Entry, TP1-TP3, SL, R:R.

## Requested Changes (Diff)

### Add
- Real RSI(14) from 15m klines for top 10 altcoins
- MA20 and MA50 (EMA) from 15m klines for top 10 altcoins
- New optional fields on AltcoinOpportunity: ma20, ma50, rsi14
- Technical Indicators section in expanded Scanner card with RSI color coding and MA trend signal

### Modify
- useBinanceData.ts: calculate RSI14, MA20, MA50 in enriched top-10 loop
- AltcoinScanner.tsx: add indicators section in TPSLPanel
- types/binance.ts: add optional ma20, ma50, rsi14 fields

### Remove
- Nothing

## Implementation Plan
1. Add optional ma20, ma50, rsi14 fields to AltcoinOpportunity type
2. In enriched loop: calculate from fetched klines and attach to alt object
3. Add Technical Indicators section in TPSLPanel in AltcoinScanner.tsx
