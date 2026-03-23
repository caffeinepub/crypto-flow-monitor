# Crypto Flow Monitor

## Current State
O quadrante `BTCThermometer` exibido no topo da aba BTC Fluxo de Capital recebe `btcMetrics.reversalScore` como score e o apresenta com rótulo "BTC FLUXO DE CAPITAL". Isso está incorreto: o score de reversão mede probabilidade de reversão de preço (RSI/OI/padrões), não o fluxo real de capital entre USD e BTC.

## Requested Changes (Diff)

### Add
- Fetch de `takerBuyRatio` na Binance Futures API (`/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=5`) dentro de `useBinanceData`
- Função `computeCapitalFlowScore` que calcula score 0–100 baseado em: Taker Buy Ratio (0–40 pts), OI delta + direção de preço (0–20 pts), Funding Rate (0–20 pts), Volume spike (0–10 pts), Preço vs MAs (0–10 pts)
- Campo `capitalFlowScore: number` e `takerBuyRatio: number` em `BTCMetrics`

### Modify
- `BTCThermometer`: aceitar `btcMetrics: BTCMetrics | null` em vez de `score: number`; usar `capitalFlowScore` para o ponteiro; atualizar sublabel para "Taker Ratio · OI · Funding · Momentum"; atualizar rótulos extremos para "Saída USD←BTC" (esquerda) e "Entrada USD→BTC" (direita); labels de direção: SAÍDA DE CAPITAL / NEUTRO / ENTRADA DE CAPITAL
- `App.tsx`: passar `btcMetrics` ao `BTCThermometer` em vez de `score`

### Remove
- Uso de `reversalScore` no `BTCThermometer`

## Implementation Plan
1. Adicionar fetch do taker ratio em `useBinanceData`
2. Adicionar `computeCapitalFlowScore` no hook
3. Adicionar `capitalFlowScore` e `takerBuyRatio` ao tipo `BTCMetrics`
4. Atualizar `BTCThermometer` para receber `btcMetrics` e usar `capitalFlowScore`
5. Atualizar `App.tsx` para passar `btcMetrics` ao termômetro
