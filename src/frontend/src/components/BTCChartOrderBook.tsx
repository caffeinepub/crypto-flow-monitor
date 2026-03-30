import { useCallback, useEffect, useRef, useState } from "react";
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

interface OrderLine {
  price: number;
  side: "BUY" | "SELL";
  status: "ACTIVE" | "REMOVIDA" | "EXECUTADA";
  usdValue: number;
  isEdge?: boolean;
}

interface Props {
  orders: OrderLine[];
  currentMarketPrice: number;
  label?: string;
}

const PAD = { top: 10, right: 80, bottom: 30, left: 65 };

function calcMA(klines: KlineData[], period: number): number[] {
  const result: number[] = new Array(klines.length).fill(Number.NaN);
  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += klines[i - j].close;
    result[i] = sum / period;
  }
  return result;
}

function drawBaseChart(
  canvas: HTMLCanvasElement,
  klines: KlineData[],
  currentPrice: number,
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
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0F1622";
  ctx.fillRect(0, 0, W, H);

  const allPrices = [
    ...klines.map((k) => k.high),
    ...klines.map((k) => k.low),
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

  // Grid
  ctx.strokeStyle = "#1F2A3A";
  ctx.lineWidth = 0.5;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + (g / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    const price = priceMax - (g / 4) * priceRange;
    ctx.fillStyle = "#6B7A8D";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      price >= 1000 ? price.toFixed(0) : price.toFixed(2),
      PAD.left - 5,
      y + 4,
    );
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

  // Current price indicator
  if (currentPrice > 0) {
    const py = toY(currentPrice);
    const lastCandle = klines.at(-1);
    const priceColor = lastCandle
      ? currentPrice >= lastCandle.open
        ? "#22C55E"
        : "#EF4444"
      : "#22D3EE";

    ctx.strokeStyle = priceColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(PAD.left, py);
    ctx.lineTo(W - PAD.right, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const priceLabel = currentPrice.toFixed(1);
    ctx.font = "bold 12px monospace";
    const labelW = ctx.measureText(priceLabel).width + 10;
    const boxX = W - PAD.right + 2;
    const boxY = py - 9;
    ctx.fillStyle = priceColor;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, labelW, 18, 3);
    ctx.fill();
    ctx.fillStyle = "#0F1622";
    ctx.textAlign = "left";
    ctx.fillText(priceLabel, boxX + 5, py + 5);
  }
}

function drawBookOrders(
  canvas: HTMLCanvasElement,
  orders: OrderLine[],
  klines: KlineData[],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || klines.length === 0 || orders.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const chartH = H - PAD.top - PAD.bottom;

  const allPrices = [
    ...klines.map((k) => k.high),
    ...klines.map((k) => k.low),
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

  for (const order of orders) {
    // Only draw if in visible range
    if (order.price < priceMin || order.price > priceMax) continue;

    const y = toY(order.price);
    const isActive = order.status === "ACTIVE";
    const isBuy = order.side === "BUY";

    let lineColor: string;
    let dashPattern: number[];
    let lineWidth: number;
    let labelColor: string;

    if (isActive) {
      lineColor = isBuy ? "#22C55E" : "#EF4444";
      dashPattern = [];
      lineWidth = 1.5;
      labelColor = lineColor;
    } else {
      // REMOVIDA or EXECUTADA → white dashed
      lineColor = "#FFFFFF";
      dashPattern = [4, 4];
      lineWidth = 1;
      labelColor = "#9AA7B6";
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);
    ctx.globalAlpha = isActive ? 0.85 : 0.45;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Label on right side
    const usdStr =
      order.usdValue >= 1_000_000
        ? `$${(order.usdValue / 1_000_000).toFixed(1)}M`
        : `$${(order.usdValue / 1_000).toFixed(0)}k`;
    const priceStr =
      order.price >= 1000 ? order.price.toFixed(0) : order.price.toFixed(2);
    const statusSuffix =
      order.status === "REMOVIDA"
        ? " ✕"
        : order.status === "EXECUTADA"
          ? " ✓"
          : "";
    const text = `${priceStr} ${usdStr}${statusSuffix}`;

    ctx.font = "10px monospace";
    const tw = ctx.measureText(text).width;
    const lx = W - PAD.right + 4;
    const ly = y + 4;

    // Dark bg box
    ctx.fillStyle = "rgba(15,22,34,0.85)";
    ctx.fillRect(lx - 2, ly - 11, tw + 4, 14);

    ctx.fillStyle = labelColor;
    ctx.textAlign = "left";
    ctx.fillText(text, lx, ly);
  }
}

async function fetchCurrentPrice(): Promise<number> {
  try {
    const r = await fetch(
      "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT",
    );
    const d = await r.json();
    return Number.parseFloat(d.price);
  } catch {
    return 0;
  }
}

export function BTCChartOrderBook({
  orders,
  currentMarketPrice,
  label,
}: Props) {
  const [interval, setChartInterval] = useState<Interval>("1m");
  const { klines, loading } = useBTCChart(interval);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [livePrice, setLivePrice] = useState(0);

  const effectivePrice = livePrice > 0 ? livePrice : currentMarketPrice;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  // Live price via WebSocket
  useEffect(() => {
    fetchCurrentPrice().then(setLivePrice);
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade");
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.p) setLivePrice(Number.parseFloat(d.p));
      };
    } catch {
      /* ignore */
    }
    const poll = setInterval(
      () =>
        fetchCurrentPrice().then((p) => {
          if (p > 0) setLivePrice(p);
        }),
      5_000,
    );
    return () => {
      ws?.close();
      clearInterval(poll);
    };
  }, []);

  const draw = useCallback(() => {
    if (!canvasRef.current || klines.length === 0) return;
    drawBaseChart(canvasRef.current, klines, effectivePrice);
    drawBookOrders(canvasRef.current, orders, klines);
  }, [klines, effectivePrice, orders]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, klines.length]);

  const priceColor =
    klines.length > 0 && effectivePrice > 0
      ? effectivePrice >= (klines.at(-1)?.open ?? 0)
        ? "#22C55E"
        : "#EF4444"
      : "#22D3EE";

  const activeCount = orders.filter((o) => o.status === "ACTIVE").length;
  const ma20 = klines.length >= 20 ? calcMA(klines, 20) : [];
  const lastMA20 = ma20.filter((v) => !Number.isNaN(v)).at(-1);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden"
      style={{
        background: "#0F1622",
        border: "2px solid #1F2A3A",
        ...(isFullscreen
          ? {
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              borderRadius: 0,
            }
          : {}),
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center gap-2 p-3 border-b"
        style={{ borderColor: "#1F2A3A" }}
      >
        {label && (
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "#9AA7B6" }}
          >
            {label}
          </span>
        )}
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "#6B7A8D" }}
        >
          BTCUSDT
        </span>

        {effectivePrice > 0 && (
          <span
            className="px-2.5 py-1 rounded text-sm font-bold tracking-wide"
            style={{
              color: priceColor,
              background: `${priceColor}18`,
              border: `1px solid ${priceColor}44`,
            }}
          >
            $
            {effectivePrice.toLocaleString("en-US", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
          </span>
        )}

        {/* Interval selector */}
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
              }}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-1">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-5 h-0.5"
              style={{ background: "#22C55E" }}
            />
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Compra
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-5 h-0.5"
              style={{ background: "#EF4444" }}
            />
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Venda
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-5"
              style={{ borderTop: "1px dashed #FFFFFF", opacity: 0.6 }}
            />
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Rem/Exec
            </span>
          </span>
        </div>

        {activeCount > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded ml-1"
            style={{ background: "rgba(34,211,238,0.1)", color: "#22D3EE" }}
          >
            {activeCount} ativas
          </span>
        )}

        {lastMA20 && (
          <span className="text-xs" style={{ color: "#6B7280" }}>
            MA20:{" "}
            <span style={{ color: "#F59E0B" }}>${lastMA20.toFixed(0)}</span>
          </span>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="flex items-center justify-center w-7 h-7 rounded transition-all"
            style={{
              background: isFullscreen
                ? "rgba(34,211,238,0.15)"
                : "transparent",
              color: isFullscreen ? "#22D3EE" : "#6B7280",
              border: `1px solid ${isFullscreen ? "rgba(34,211,238,0.4)" : "#1F2A3A"}`,
            }}
          >
            {isFullscreen ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Sair da tela cheia</title>
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Tela cheia</title>
                <path d="M3 7V3h4" />
                <path d="M21 7V3h-4" />
                <path d="M3 17v4h4" />
                <path d="M21 17v4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative"
        style={isFullscreen ? { flex: 1 } : { height: 340 }}
      >
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
    </div>
  );
}
