# Crypto Flow Monitor

## Current State
New project -- no existing application files.

## Requested Changes (Diff)

### Add
- Full Binance USD-M Futures monitor dashboard
- Bitcoin main panel with real-time price, RSI(14), Open Interest, Funding Rate, 24h Volume
- Candlestick chart for BTC with timeframe selector (1m, 5m, 15m, 1H, 4H, 1D)
- Moving averages: 20, 50, 100, 180 periods on chart
- Altcoin scanner: fetch all USD-M perpetual pairs, filter and score them
- Altcoin scoring metrics:
  - Volume >= $30k daily (filter fakes)
  - RSI(14) < 40 and rising
  - Negative funding rate
  - Open interest increasing
  - Price change relative to BTC (altcoin not falling as much as BTC = bullish divergence)
  - MA 20 and 50 below MA 100 and 180 (deep bottom)
  - Large liquidations above current price
  - Significant historical price drop (near historical lows)
- BTC Reversal Signal panel: composite score based on RSI < 40, OI rising, funding negative, double bottom pattern, hammer candles, oversold signals
- Color coding: green=positive/bullish, red=negative/bearish, blue=indecision/neutral
- Dollar flow indicator: DXY or USDT dominance proxy to track dollar direction
- Auto-refresh every 30 seconds
- All Binance API calls made from frontend (not backend)

### Modify
N/A

### Remove
N/A

## Implementation Plan
1. Minimal Motoko backend (just actor with health check, no Binance calls)
2. Frontend:
   - Binance REST API integration (wss for real-time, REST for historical)
   - BTC Main Panel component (price KPIs, chart with candlesticks + MAs)
   - Altcoin Scanner component (filtered/scored table)
   - BTC Reversal Signal component (composite readiness score)
   - Dollar Flow indicator
   - Dark neon UI: #070B10 background, neon green/red/blue borders with glow
   - Lightweight-charts (TradingView) or custom canvas chart for candlesticks
   - Auto-refresh loop (30s interval)
   - Timeframe selector chips
   - Altcoin rows colored by signal strength
