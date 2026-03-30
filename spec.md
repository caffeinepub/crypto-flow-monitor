# Crypto Flow Monitor

## Current State
BTCChart shows accumulation zones as horizontal bars derived from kline volume clustering. All zones always appear with the same visual treatment regardless of whether the current BTC price has already passed through them. There is no concept of a zone being "swept" (liquidity taken).

## Requested Changes (Diff)

### Add
- `swept?: boolean` field to the `AccumZone` interface
- `sweptCentersRef` (a `useRef<Set<string>>`) to persist which price-midpoints have been visited across renders
- A `useEffect` that checks `currentPrice` against each active zone: when price falls within `priceMin..priceMax`, mark that zone as swept
- Logic to clear `sweptCentersRef` when the user changes the chart interval (fresh context = fresh zones)

### Modify
- `detectAccumZones`: when new zones are detected from klines, re-apply existing swept status from `sweptCentersRef` so zones that were already visited before a kline refresh remain swept
- `drawChart`: skip (do not render) any zone where `zone.swept === true` — keeps the visual map clean with only unvisited liquidity zones visible
- Interval-change handler: call `sweptCentersRef.current.clear()` before changing the interval so zones reset for the new timeframe

### Remove
- Nothing removed

## Implementation Plan
1. Add `swept?: boolean` to `AccumZone` interface in BTCChart.tsx
2. Add `sweptCentersRef` ref in `BTCChart` component
3. Change klines effect to apply swept status when regenerating zones from `sweptCentersRef`
4. Add `currentPrice` effect that, when price is inside a zone's range, adds zone midpoint key to `sweptCentersRef` and updates `accumZones` state
5. Add interval change handler that clears `sweptCentersRef` then changes interval
6. In `drawChart`, filter out swept zones before rendering the accumulation layer
