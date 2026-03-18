# Crypto Flow Monitor

## Current State
App functional with BTC panel, Altcoin Scanner, PWA, Binance REST data. Dark neon theme.

## Requested Changes (Diff)

### Add
- LiquidationData type in binance.ts
- useLiquidations hook: WebSocket wss://fstream.binance.com/ws/!forceOrder@arr + REST /fapi/v1/forceOrders init
- LiquidationFeed component: real-time liquidation list, LONG liq = red, SHORT liq = green, 5min summary bars

### Modify
- App.tsx: add LiquidationFeed between DollarFlow and main grid (full width)
- types/binance.ts: add LiquidationData interface

### Remove
- Nothing

## Implementation Plan
1. Add LiquidationData type (symbol, side, price, origQty, notionalValue, time)
2. useLiquidations hook: fetch REST for initial 50 events, open WebSocket, rolling 100-event buffer, auto-reconnect
3. LiquidationFeed: 5min LONG vs SHORT bars, scrollable event list, same dark style as other panels
4. Wire into App.tsx without touching existing panels
