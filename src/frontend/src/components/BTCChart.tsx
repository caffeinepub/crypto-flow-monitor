import { useEffect, useRef, useState } from "react";
import { useBTCChart } from "../hooks/useBinanceData";
import type { Interval, KlineData } from "../types/binance";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

interface LargeOrder {
  price: number;
  qty: number;
  usdValue: number;
  side: "BUY" | "SELL";
}

interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: number; // 1-3
}

interface AccumZone {
  priceMin: number;
  priceMax: number;
  strength: number; // 0-1
}

function calcMA(klines: KlineData[], period: number): number[] {
  const result: number[] = new Array(klines.length).fill(Number.NaN);
  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += klines[i - j].close;
    result[i] = sum / period;
  }
  return result;
}

function detectSRLevels(
  klines: KlineData[],
  ma20: number[],
  ma50: number[],
): SRLevel[] {
  const levels: SRLevel[] = [];
  const lookback = 5;

  // Swing highs/lows
  for (let i = lookback; i < klines.length - lookback; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (klines[j].high >= high) isSwingHigh = false;
      if (klines[j].low <= low) isSwingLow = false;
    }
    if (isSwingHigh)
      levels.push({ price: high, type: "resistance", strength: 2 });
    if (isSwingLow) levels.push({ price: low, type: "support", strength: 2 });
  }

  // MA-based levels (last values)
  const lastMA20 = ma20.filter((v) => !Number.isNaN(v)).at(-1);
  const lastMA50 = ma50.filter((v) => !Number.isNaN(v)).at(-1);
  const lastClose = klines.at(-1)?.close ?? 0;

  if (lastMA20) {
    levels.push({
      price: lastMA20,
      type: lastClose > lastMA20 ? "support" : "resistance",
      strength: 1,
    });
  }
  if (lastMA50) {
    levels.push({
      price: lastMA50,
      type: lastClose > lastMA50 ? "support" : "resistance",
      strength: 1,
    });
  }

  // Cluster nearby levels (within 0.3%)
  const clustered: SRLevel[] = [];
  const used = new Set<number>();
  const sorted = levels.sort((a, b) => a.price - b.price);
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    let count = 1;
    let sumPrice = sorted[i].price;
    let maxStrength = sorted[i].strength;
    for (let j = i + 1; j < sorted.length; j++) {
      if (
        Math.abs(sorted[j].price - sorted[i].price) / sorted[i].price <
        0.003
      ) {
        count++;
        sumPrice += sorted[j].price;
        maxStrength = Math.max(maxStrength, sorted[j].strength);
        used.add(j);
      }
    }
    clustered.push({
      price: sumPrice / count,
      type: sorted[i].type,
      strength: Math.min(3, maxStrength + (count > 2 ? 1 : 0)),
    });
  }

  return clustered;
}

function detectAccumZones(klines: KlineData[]): AccumZone[] {
  if (klines.length < 10) return [];
  const zones: AccumZone[] = [];
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const vols = klines.map((k) => k.volume);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const bucketSize = (maxP - minP) / 20;

  for (let b = 0; b < 20; b++) {
    const bMin = minP + b * bucketSize;
    const bMax = bMin + bucketSize;
    let totalVol = 0;
    let count = 0;
    for (let i = 0; i < klines.length; i++) {
      const k = klines[i];
      if (k.high >= bMin && k.low <= bMax) {
        totalVol += vols[i];
        count++;
      }
    }
    if (count > 0 && totalVol / count > avgVol * 1.5) {
      zones.push({
        priceMin: bMin,
        priceMax: bMax,
        strength: Math.min(1, (totalVol / count / avgVol - 1.5) / 2),
      });
    }
  }
  return zones;
}

function drawChart(
  canvas: HTMLCanvasElement,
  klines: KlineData[],
  overlays: {
    showSR: boolean;
    showAccum: boolean;
    showOrders: boolean;
    srLevels: SRLevel[];
    accumZones: AccumZone[];
    largeOrders: LargeOrder[];
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || klines.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 10, right: 10, bottom: 30, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0F1622";
  ctx.fillRect(0, 0, W, H);

  const allPrices = [
    ...klines.map((k) => k.high),
    ...klines.map((k) => k.low),
    ...overlays.largeOrders.map((o) => o.price),
    ...overlays.srLevels.map((l) => l.price),
  ].filter((v) => v > 0);

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const rawRange = maxP - minP || 1;
  const padding = rawRange * 0.05;
  const priceMin = minP - padding;
  const priceMax = maxP + padding;
  const priceRange = priceMax - priceMin;

  const toY = (p: number) =>
    PAD.top + chartH - ((p - priceMin) / priceRange) * chartH;
  const toX = (i: number) => PAD.left + (i / (klines.length - 1 || 1)) * chartW;

  // Grid lines
  ctx.strokeStyle = "#1F2A3A";
  ctx.lineWidth = 0.5;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + (g / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    const price = priceMax - (g / 4) * priceRange;
    ctx.fillStyle = "#9AA7B6";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      price >= 1000 ? price.toFixed(0) : price.toFixed(2),
      PAD.left - 4,
      y + 3,
    );
  }

  // === LAYER 1: Accumulation zones ===
  if (overlays.showAccum) {
    for (const zone of overlays.accumZones) {
      const y1 = toY(zone.priceMax);
      const y2 = toY(zone.priceMin);
      const alpha = 0.06 + zone.strength * 0.12;
      ctx.fillStyle = `rgba(34,211,238,${alpha})`;
      ctx.fillRect(PAD.left, y1, chartW, y2 - y1);
      // Border top
      ctx.strokeStyle = `rgba(34,211,238,${alpha * 2})`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y1);
      ctx.lineTo(W - PAD.right, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD.left, y2);
      ctx.lineTo(W - PAD.right, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // === LAYER 2: Support/Resistance lines ===
  if (overlays.showSR) {
    for (const lvl of overlays.srLevels) {
      const y = toY(lvl.price);
      const isSupport = lvl.type === "support";
      const baseColor = isSupport ? "#22C55E" : "#EF4444";
      const alpha = lvl.strength === 1 ? 0.5 : lvl.strength === 2 ? 0.75 : 1.0;
      const lineWidth = lvl.strength;

      ctx.strokeStyle = `${baseColor}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(lvl.strength === 1 ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label on right
      const label = isSupport ? "S" : "R";
      ctx.fillStyle = baseColor;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `${label} $${lvl.price >= 1000 ? lvl.price.toFixed(0) : lvl.price.toFixed(2)}`,
        W - PAD.right + 2,
        y + 3,
      );
    }
  }

  // Candles
  const candleW = Math.max(1, Math.floor(chartW / klines.length) - 1);
  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const x = toX(i);
    const isUp = k.close >= k.open;
    const color = isUp ? "#22C55E" : "#EF4444";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, toY(k.high));
    ctx.lineTo(x, toY(k.low));
    ctx.stroke();

    const bodyTop = toY(Math.max(k.open, k.close));
    const bodyBot = toY(Math.min(k.open, k.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    ctx.fillStyle = color;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }

  // === LAYER 3: Large order markers ===
  if (overlays.showOrders) {
    for (const order of overlays.largeOrders) {
      const y = toY(order.price);
      if (y < PAD.top - 4 || y > PAD.top + chartH + 4) continue;
      const isBuy = order.side === "BUY";
      const color = isBuy ? "#22C55E" : "#EF4444";
      const size =
        order.usdValue >= 1_000_000 ? 8 : order.usdValue >= 500_000 ? 6 : 4;

      // Horizontal dashed line
      ctx.strokeStyle = `${color}55`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Diamond marker on left edge
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(PAD.left + 6, y);
      ctx.lineTo(PAD.left + 6 + size, y - size);
      ctx.lineTo(PAD.left + 6 + size * 2, y);
      ctx.lineTo(PAD.left + 6 + size, y + size);
      ctx.closePath();
      ctx.fill();

      // Value label
      const usd =
        order.usdValue >= 1_000_000
          ? `$${(order.usdValue / 1_000_000).toFixed(1)}M`
          : `$${(order.usdValue / 1_000).toFixed(0)}k`;
      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(usd, PAD.left + 6 + size * 2 + 3, y + 3);
    }
  }
}

async function fetchLargeOrders(minUsd: number): Promise<LargeOrder[]> {
  try {
    const [futRes, spotRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=100"),
      fetch("https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=100"),
    ]);
    const [fut, spot] = await Promise.all([futRes.json(), spotRes.json()]);
    const orders: LargeOrder[] = [];

    for (const src of [fut, spot]) {
      for (const [p, q] of (src.bids || []) as [string, string][]) {
        const price = Number.parseFloat(p);
        const qty = Number.parseFloat(q);
        const usd = price * qty;
        if (usd >= minUsd)
          orders.push({ price, qty, usdValue: usd, side: "BUY" });
      }
      for (const [p, q] of (src.asks || []) as [string, string][]) {
        const price = Number.parseFloat(p);
        const qty = Number.parseFloat(q);
        const usd = price * qty;
        if (usd >= minUsd)
          orders.push({ price, qty, usdValue: usd, side: "SELL" });
      }
    }

    // Deduplicate and keep top 20 by value
    const seen = new Set<number>();
    return orders
      .filter((o) => {
        if (seen.has(o.price)) return false;
        seen.add(o.price);
        return true;
      })
      .sort((a, b) => b.usdValue - a.usdValue)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function BTCChart() {
  const [interval, setChartInterval] = useState<Interval>("1m");
  const { klines, loading } = useBTCChart(interval);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Overlay toggles
  const [showSR, setShowSR] = useState(true);
  const [showAccum, setShowAccum] = useState(true);
  const [showOrders, setShowOrders] = useState(true);

  // Overlay data
  const [srLevels, setSrLevels] = useState<SRLevel[]>([]);
  const [accumZones, setAccumZones] = useState<AccumZone[]>([]);
  const [largeOrders, setLargeOrders] = useState<LargeOrder[]>([]);

  // Compute S/R and accum zones when klines update
  useEffect(() => {
    if (klines.length < 10) return;
    const ma20 = calcMA(klines, 20);
    const ma50 = calcMA(klines, 50);
    setSrLevels(detectSRLevels(klines, ma20, ma50));
    setAccumZones(detectAccumZones(klines));
  }, [klines]);

  // Fetch large orders periodically
  useEffect(() => {
    fetchLargeOrders(250_000).then(setLargeOrders);
    const id = setInterval(
      () => fetchLargeOrders(250_000).then(setLargeOrders),
      15_000,
    );
    return () => clearInterval(id);
  }, []);

  // Redraw
  useEffect(() => {
    if (!canvasRef.current || klines.length === 0) return;
    drawChart(canvasRef.current, klines, {
      showSR,
      showAccum,
      showOrders,
      srLevels,
      accumZones,
      largeOrders,
    });
  }, [
    klines,
    showSR,
    showAccum,
    showOrders,
    srLevels,
    accumZones,
    largeOrders,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;
    const ro = new ResizeObserver(() =>
      drawChart(canvas, klines, {
        showSR,
        showAccum,
        showOrders,
        srLevels,
        accumZones,
        largeOrders,
      }),
    );
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [
    klines,
    showSR,
    showAccum,
    showOrders,
    srLevels,
    accumZones,
    largeOrders,
  ]);

  const toggleBtn = (
    active: boolean,
    onClick: () => void,
    label: string,
    color: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all"
      style={{
        background: active ? `${color}22` : "transparent",
        color: active ? color : "#6B7280",
        border: `1px solid ${active ? `${color}55` : "#1F2A3A"}`,
        boxShadow: active ? `0 0 6px ${color}33` : "none",
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: active ? color : "#374151" }}
      />
      {label}
    </button>
  );

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      {/* Top bar: interval + overlays */}
      <div
        className="flex flex-wrap items-center gap-2 p-3 border-b"
        style={{ borderColor: "#1F2A3A" }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider mr-1"
          style={{ color: "#9AA7B6" }}
        >
          BTCUSDT
        </span>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              type="button"
              key={iv.value}
              onClick={() => setChartInterval(iv.value)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-all"
              style={{
                background:
                  interval === iv.value
                    ? "rgba(34,211,238,0.15)"
                    : "transparent",
                color: interval === iv.value ? "#22D3EE" : "#9AA7B6",
                border: `1px solid ${
                  interval === iv.value ? "rgba(34,211,238,0.5)" : "transparent"
                }`,
                boxShadow:
                  interval === iv.value
                    ? "0 0 8px rgba(34,211,238,0.2)"
                    : "none",
              }}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-4 mx-1" style={{ background: "#1F2A3A" }} />

        {/* Overlay toggles */}
        <div className="flex gap-1.5 flex-wrap">
          {toggleBtn(showSR, () => setShowSR((v) => !v), "Sup/Res", "#22C55E")}
          {toggleBtn(
            showAccum,
            () => setShowAccum((v) => !v),
            "Acumulação",
            "#22D3EE",
          )}
          {toggleBtn(
            showOrders,
            () => setShowOrders((v) => !v),
            "Ordens",
            "#F59E0B",
          )}
        </div>
      </div>

      <div className="relative" style={{ height: 380 }}>
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: "#0F1622cc" }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#22D3EE" }}
            />
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-t text-xs"
        style={{ borderColor: "#1F2A3A", color: "#6B7280" }}
      >
        {showSR && (
          <>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-0.5"
                style={{ background: "#22C55E" }}
              />
              Suporte
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-0.5"
                style={{ background: "#EF4444" }}
              />
              Resistência
            </span>
          </>
        )}
        {showAccum && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-3 rounded-sm"
              style={{ background: "rgba(34,211,238,0.2)" }}
            />
            Acumulação/Liquidez
          </span>
        )}
        {showOrders && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3"
              style={{
                background: "#F59E0B",
                clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              }}
            />
            Ordem grande (&gt;$250k)
          </span>
        )}
      </div>
    </div>
  );
}
