# Crypto Flow Monitor

## Current State
- App has 3 tabs: Dashboard (full layout), Scanner (altcoin list), BTC Analysis
- Dashboard tab: DollarFlow + LiquidationFeed (all pairs) + BTCPanel + AltcoinScanner side-by-side
- BTC tab: DollarFlow + full-width BTCPanel
- Scanner tab: full-width AltcoinScanner (list only, no trade recommendations)
- LiquidationFeed shows all pairs via WebSocket
- AltcoinScanner shows top 20 altcoins with score, price, 24h change, funding rate - no TP/SL
- BTCPanel shows KPI cards + ReversalScore circle gauge + BTCChart

## Requested Changes (Diff)

### Add
- **BTCThermometer component**: horizontal gradient bar (red→yellow→green) with animated pointer
  - Score 0-100 derived from: RSI, funding rate, OI change, large BTC liquidations (shorts vs longs ratio)
  - Displays numeric score AND intensity label (Fraco/Médio/Forte) AND direction label (Baixista/Neutro/Altista)
  - Goes in BTC tab above the existing BTCPanel content
- **BTCLiquidationComparison component**: two stacked quadrants comparing Futures vs Spot BTC liquidations
  - Futures: existing WebSocket `!forceOrder@arr` filtered to BTCUSDT only
  - Spot: WebSocket `wss://stream.binance.com:9443/ws/btcusdt@aggTrade` - large trades (>$50k notional) as proxy
  - Each quadrant shows: volume, total value, transactions/minute
  - Comparison section highlights disparities (>50% difference in any metric) with neon highlight
  - Replaces old LiquidationFeed in BTC tab
- **Trade Recommendations in AltcoinScanner**: for each altcoin card, show collapsible TP1/TP2/TP3 and Stop Loss
  - TP calculation uses klines (fetched for top 20 alts): find pivot highs above entry as resistance levels
  - TP1 = first resistance > 3% above entry; TP2 = second resistance; TP3 = top of resistance zone
  - If <3 resistances found OR gaps < 3%, distribute TPs evenly among available resistance levels
  - Stop Loss = one candle's low below the most recent swing low before entry price
  - Stop Loss clamped: min 10% below entry, max 33% below entry
- **useBTCSpotTrades hook**: WebSocket for spot large BTC trades
- **useBTCFuturesLiquidations hook**: filters existing liquidations to BTCUSDT only + adds txPerMin calc
- **calculateResistanceLevels / calculateStopLoss** functions in calculations.ts

### Modify
- **App.tsx tabs**:
  - Tab "btc": Shows BTCThermometer + BTCLiquidationComparison + BTCPanel (KPIs + chart)
  - Tab "scanner": Shows AltcoinScanner with TP/SL recommendations
  - Tab "dashboard": Shows DollarFlow + BTCThermometer (compact) + AltcoinScanner
  - Tab "market" (new 3rd tab): Placeholder with "Em breve" message
- **useBinanceData**: fetch klines for top 20 altcoins to enable resistance/support calculations
- **AltcoinOpportunity type**: add fields `klines`, `resistanceLevels`, `supportLevel`, `tp1`, `tp2`, `tp3`, `stopLoss`
- **AltcoinScanner**: expand each row to show recommendations panel when clicked
- **Header**: rename 3rd tab icon from BTC Analysis to just BTC; add 4th tab for Market (clock/placeholder icon)

### Remove
- **LiquidationFeed component** (all-pairs feed): removed from all tabs; replaced by BTCLiquidationComparison in BTC tab
- **DollarFlow** from BTC tab (replaced by BTCThermometer which serves same capital flow purpose for BTC)

## Implementation Plan
1. Add `calculateResistanceLevels(klines, entryPrice)` and `calculateStopLoss(klines, entryPrice)` to `calculations.ts`
2. Create `useBTCSpotTrades` hook (aggTrade WebSocket, filter >$50k)
3. Create `useBTCFuturesLiquidations` hook (wraps existing useLiquidations, filters BTCUSDT, adds txPerMin)
4. Create `BTCThermometer` component: gradient bar + pointer + score + intensity + direction labels
5. Create `BTCLiquidationComparison` component: two stacked quadrants + comparison highlights
6. Update `useBinanceData`: after scoring top 20 alts, fetch their klines in parallel and calculate TP/SL
7. Update `AltcoinOpportunity` type with new fields
8. Update `AltcoinScanner`: make rows expandable, show TP1/TP2/TP3 and SL with color-coded levels
9. Update `App.tsx`: reorganize tabs as described above
10. Update `Header`: adjust tab icons/labels
