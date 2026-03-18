# Crypto Flow Monitor

## Current State
The Mercado tab currently shows a static placeholder ("Em Breve") with no data or functionality. The rest of the app (BTC dashboard and Scanner) is fully functional using Binance public APIs.

## Requested Changes (Diff)

### Add
- `MercadoPanel` component: full implementation of the Mercado tab using Binance Futures REST API
  - **Visão Geral do Mercado**: BTC 24h price change, dominance proxy, total futures market volume
  - **Maiores Altas / Maiores Baixas**: Top 5 gainers and top 5 losers among USD-M perpetual futures (24h %)
  - **Funding Rates Extremos**: Top 5 assets with most positive funding (longs paying) and most negative funding (shorts paying) — signals overheated positioning
  - **Anomalias de Open Interest**: Assets with largest OI change in 24h (absolute and percentage) — signals large institutional inflows/outflows
  - **Anomalias de Volume**: Assets with volume spike ratio (current vs. average), highlighting unusual activity
  - **Narrativa de Mercado**: Auto-generated descriptive paragraph summarizing market conditions based on BTC direction, funding sentiment, OI flow, and volume anomalies
- All data fetched from Binance public REST endpoints (no auth required)

### Modify
- `App.tsx`: replace the placeholder `activeTab === 'market'` block with `<MercadoPanel />`

### Remove
- Static placeholder content (Globe icon, "Em Breve" text) in the market tab

## Implementation Plan
1. Create `src/frontend/src/components/MercadoPanel.tsx`
   - Fetch `/fapi/v1/ticker/24hr` for all futures pairs (price change, volume, quote volume)
   - Fetch `/fapi/v1/premiumIndex` for funding rates
   - Fetch `/fapi/v2/openInterest` per symbol (top movers only, batched)
   - Derive top gainers, losers, funding extremes, OI anomalies, volume spikes
   - Generate narrative text from computed signals
   - Auto-refresh every 60 seconds
   - Visual style: dark panels matching existing UI (#0F1622 bg, neon green/red/blue highlights, same card pattern as other components)
2. Update `App.tsx` to import and render `MercadoPanel` in the market tab
