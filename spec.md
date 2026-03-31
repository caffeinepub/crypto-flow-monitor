# Crypto Flow Monitor

## Current State
The app has 6 tabs. Tab navigation is in Header.tsx and content is rendered in App.tsx. The app uses Binance futures API for most data. Existing tabs: Análise do Mercado, BTC Fluxo de Capital, Livro de Ordens - BTC, Feed Ao Vivo, Altcoin Scanner, Bot Trader.

## Requested Changes (Diff)

### Add
- New 7th tab: **"Setores"** (tab id: `setores`) with icon `Layers` from lucide-react
- New component `SectorFlowTab.tsx` -- the full panel for sector capital flow analysis
- Sector taxonomy using standard crypto market classification:
  - Layer 1 (ETH, SOL, BNB, AVAX, ADA, DOT, ATOM, NEAR, FTM, SUI, APT, TRX)
  - Layer 2 / Scaling (MATIC, ARB, OP, STRK, IMX, METIS, ZK, MANTA)
  - DeFi (AAVE, UNI, CRV, COMP, SNX, DYDX, GMX, LDO, JUP, PENDLE)
  - AI / Data (FET, RNDR, GRT, TAO, INJ, WLD, AGLD)
  - GameFi / Metaverso (AXS, SAND, MANA, GALA, ENJ, ILV, MAGIC, SUPER)
  - Meme (DOGE, SHIB, FLOKI, PEPE, BONK, WIF, BRETT, NEIRO)
  - Infra / Oráculos (LINK, BAND, API3, PYTH, TIA, CELESTIA)
  - Exchange Tokens (BNB, OKB, CRO)
  - Storage / Web3 (FIL, AR, STORJ)
  - Privacy (XMR, ZEC, DASH)
- For each sector, fetch from Binance futures API: 24h ticker stats (price change %, volume, quoteVolume), funding rates, and taker buy/sell volume to compute a capital flow score
- Alert banner at the very top of the tab: animates in when a significant sector shift is detected (flow direction reversal or intensity spike >20% change in 5min)
- Each sector card shows:
  - Sector name and icon
  - Flow direction badge: INFLOW / OUTFLOW / NEUTRO (with color: green/red/gray)
  - Flow intensity bar (gradient neon)
  - Total 24h volume in USDT
  - Average funding rate across sector assets
  - Top 2 assets driving the flow (with % change)
  - Ranking position by flow intensity (1 = strongest inflow, bottom = strongest outflow)
- Patterns panel below sector cards:
  - Quinzena indicator: "1ª Quinzena" (days 1-15) vs "2ª Quinzena" (days 16-31) with historical pattern note
  - Market session clock with current session highlighted: Asia (00:00-08:00 UTC), Europa (07:00-15:00 UTC), NY Pré-abertura (13:30-14:30 UTC), NY Abertura (14:30-22:00 UTC)
  - Institutional flow windows: alert if current time is within known high-volume windows
- Data refreshes every 60 seconds; sectors are re-ranked on each refresh
- When a sector's flow direction changes between refreshes, an alert banner appears at top with sector name and new direction

### Modify
- `Header.tsx`: add tab `{ id: "setores", label: "Setores", icon: Layers }` as 7th tab
- `App.tsx`: add rendering block for `setores` tab using `<SectorFlowTab />`

### Remove
- Nothing removed

## Implementation Plan
1. Create `src/frontend/src/components/SectorFlowTab.tsx` with:
   - Sector definitions (name, icon, asset symbols)
   - `useSectorFlow` custom hook that fetches Binance futures ticker data for all sector assets in parallel, calculates per-sector flow score (weighted: price change 30%, volume 30%, funding 20%, taker buy ratio 20%), and ranks sectors
   - Alert banner state: triggers when sector direction flips or intensity changes >20%
   - Sector cards grid (2 columns on mobile, 3 on desktop)
   - Patterns panel at bottom (quinzena + sessions)
2. Update `Header.tsx` to add 7th tab
3. Update `App.tsx` to render `SectorFlowTab` for `setores` tab
