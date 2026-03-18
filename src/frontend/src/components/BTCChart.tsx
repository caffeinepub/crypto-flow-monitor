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

function drawChart(canvas: HTMLCanvasElement, klines: KlineData[]) {
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

  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const priceRange = maxP - minP || 1;

  const toY = (p: number) =>
    PAD.top + chartH - ((p - minP) / priceRange) * chartH;
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
    const price = maxP - (g / 4) * priceRange;
    ctx.fillStyle = "#9AA7B6";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      price >= 1000 ? price.toFixed(0) : price.toFixed(2),
      PAD.left - 4,
      y + 3,
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
    // Wick
    ctx.beginPath();
    ctx.moveTo(x, toY(k.high));
    ctx.lineTo(x, toY(k.low));
    ctx.stroke();

    // Body
    const bodyTop = toY(Math.max(k.open, k.close));
    const bodyBot = toY(Math.min(k.open, k.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    ctx.fillStyle = color;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }
}

export function BTCChart() {
  const [interval, setInterval] = useState<Interval>("1h");
  const { klines, loading } = useBTCChart(interval);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || klines.length === 0) return;
    drawChart(canvasRef.current, klines);
  }, [klines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;
    const ro = new ResizeObserver(() => drawChart(canvas, klines));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [klines]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      <div
        className="flex items-center gap-2 p-3 border-b"
        style={{ borderColor: "#1F2A3A" }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider mr-2"
          style={{ color: "#9AA7B6" }}
        >
          BTCUSDT
        </span>
        <div className="flex gap-1" data-ocid="chart.tab">
          {INTERVALS.map((iv) => (
            <button
              type="button"
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              data-ocid={`chart.${iv.value}.tab`}
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
    </div>
  );
}
