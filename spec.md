# Crypto Flow Monitor

## Current State
App has 5 tabs: BTC Fluxo de Capital, Scanner, Mercado, Liquidações, Bot Trader.
No order book / institutional order monitoring exists.

## Requested Changes (Diff)

### Add
- New tab "Ordens" (OrderFlowTab component) with two sub-tabs: Spot (BTCUSDT) and Futuros (BTCUSDT perp)
- Each sub-tab shows a live feed of large orders detected in the order book
- Large order threshold: configurable by user (default $100k for spot, $500k for futures)
- Order entry shows: side (BUY/SELL), price, quantity, USD value, timestamp of first appearance
- Spoofing/manipulation detection: when a large order disappears from the book WITHOUT being executed (price never reached), mark it as "REMOVIDA" with a warning badge
- Edge order detection: orders that are placed far from market price (>2% away) are flagged as possible manipulation
- Real-time updates via Binance WebSocket for both spot and futures depth streams
- Summary stats: total large buy wall value, total large sell wall value, buy/sell wall ratio
- Visual: dark theme consistent with existing app, neon green for buy orders, neon red for sell orders, yellow/orange for removed/suspicious orders

### Modify
- Header.tsx: add new "Ordens" tab with appropriate icon
- App.tsx: render OrderFlowTab for the new tab

### Remove
- Nothing

## Implementation Plan
1. Create `src/frontend/src/components/OrderFlowTab.tsx` - main component with spot/futures sub-tabs, WebSocket connections, large order detection, spoofing detection, real-time feed
2. Update `src/frontend/src/components/Header.tsx` to add the Ordens tab
3. Update `src/frontend/src/App.tsx` to render OrderFlowTab
