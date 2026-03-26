# Crypto Flow Monitor

## Current State
AltcoinScanner lists top 10 altcoin opportunities with TP/SL, Smart Money indicators (funding, LSR, range15m, exp_btc), and technical indicators (RSI, MA20, MA50). Expanding a card shows all these details. No structural chart analysis exists.

## Requested Changes (Diff)

### Add
- New `StructuralAnalysis` component (or section within AltcoinScanner expanded panel) that performs on-demand multi-timeframe graphical/structural analysis for a selected altcoin
- Analysis button labeled "Análise Estrutural" inside the expanded card panel (below existing TP/SL/Smart Money info)
- When clicked, fetch klines from Binance for 15m, 1h and 4h (last 100 candles each)
- Run analysis algorithms:
  1. **Candlestick Patterns**: detect bullish/bearish engulfing, hammer, inverted hammer, doji, shooting star, morning star, evening star on the last 3-5 candles of each TF
  2. **Market Structure**: detect trend direction via HH/HL (uptrend), LH/LL (downtrend), or mixed (sideways) by comparing swing highs/lows over last 20 candles on each TF
  3. **Classic Chart Patterns**: detect double top, double bottom, triangle (ascending/descending/symmetrical), wedge (rising/falling), head and shoulders based on price action over each TF
- Each TF produces a structural sub-score (0-100) and signal (bullish/bearish/neutral)
- Consolidated structural score = weighted average (15m: 20%, 1h: 40%, 4h: 40%)
- Display in a styled panel below the existing expanded card content:
  - Loading spinner while fetching
  - 3 TF rows showing: timeframe label, market structure label, main candlestick pattern detected, classic pattern if any, sub-score badge
  - Overall structural score with color coding and label ("Estrutura Altista", "Estrutura Neutra", "Estrutura Baixista")
  - Summary sentence in Portuguese describing the overall structure

### Modify
- `AltcoinScanner.tsx`: add state `structuralAnalysisSymbol` and `structuralResults` map; add "Análise Estrutural" button inside each expanded card; show StructuralAnalysis results panel when available
- Altcoin structural score should be shown as additional info, NOT as a filter/blocker — it is informational only

### Remove
- Nothing removed

## Implementation Plan
1. Create utility function `analyzeStructure(symbol, timeframe, candles)` with all three analysis algorithms
2. Create `StructuralAnalysisPanel` component that handles fetch + display
3. Add button and panel to expanded card in AltcoinScanner
4. Validate build
