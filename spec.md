# Crypto Flow Monitor

## Current State
- Multi-API aggregation (Binance + Bybit + OKX + Fear & Greed + CoinGecko) is used in BTC Fluxo de Capital and BTC Reversal Score.
- `scoreAltcoin()` in `useBinanceData.ts` only uses Binance data (funding rate, proxy RSI, volume, price range).
- Bot Trader uses `btcMetrics` (which contains `multiExchange`) but altcoin selection logic does not leverage cross-exchange signals.
- `fetchMultiExchangeData()` fetches BTC-specific data only (BTCUSDT pair).

## Requested Changes (Diff)

### Add
- Bybit all-linear-tickers endpoint call to get bulk funding rates for altcoin symbols from Bybit.
- OKX all-tickers endpoint call to get bulk funding rates for altcoin symbols from OKX.
- Cross-exchange funding rate average per altcoin (Binance + Bybit + OKX where available).
- Pass `fearGreedIndex`, `bybitLongShortRatio`, and per-altcoin cross-exchange funding into `scoreAltcoin()`.
- Bot Trader to use `fearGreedIndex` and `bybitLongShortRatio` when evaluating whether to open/avoid trades and when generating bot log messages.

### Modify
- `useMultiExchangeData.ts`: Add `fetchBybitAllTickers()` and `fetchOKXAllTickers()` functions returning maps of `symbol -> fundingRate` for all altcoins.
- `useBinanceData.ts`: Update `scoreAltcoin()` to accept cross-exchange signals; pass the new bulk maps to altcoin scoring so each altcoin gets a cross-exchange average funding rate.
- `useBotTrader.ts`: Use `btcMetrics.multiExchange.fearGreedIndex` and `bybitLongShortRatio` in trade open decisions and bot log messages.

### Remove
- Nothing removed.

## Implementation Plan
1. Add `fetchBybitAllLinearFunding()` to `useMultiExchangeData.ts` — calls `https://api.bybit.com/v5/market/tickers?category=linear` and returns `Record<string, number>` (symbol without USDT → funding rate).
2. Add `fetchOKXAllFunding()` to `useMultiExchangeData.ts` — calls `https://www.okx.com/api/v5/public/funding-rate-summary` (or iterate tickers) and returns `Record<string, number>`.
3. Extend `MultiExchangeData` interface with `bybitAltFunding: Record<string, number>` and `okxAltFunding: Record<string, number>`.
4. Update `scoreAltcoin()` to accept `{ crossFundingRate, fearGreedIndex, bybitLongShortRatio }` and incorporate those into the score.
5. In `useBinanceData.ts` altcoin mapping loop, compute `crossFundingRate` for each symbol using Bybit/OKX maps, then pass to updated `scoreAltcoin()`.
6. In `useBotTrader.ts`, read `btcMetrics.multiExchange.fearGreedIndex` and `bybitLongShortRatio` in the `shouldOpenTrade()` and log generation logic to add context-aware decision making.
