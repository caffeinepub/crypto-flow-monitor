import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useBTCChart } from "../hooks/useBinanceData";
import type { Interval } from "../types/binance";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

export function BTCChart() {
  const [interval, setInterval] = useState<Interval>("1h");
  const { klines, loading, emaData } = useBTCChart(interval);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0F1622" },
        textColor: "#9AA7B6",
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "#1F2A3A" },
        horzLines: { color: "#1F2A3A" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1F2A3A" },
      timeScale: {
        borderColor: "#1F2A3A",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 380,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderUpColor: "#22C55E",
      borderDownColor: "#EF4444",
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#22D3EE44",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || klines.length === 0) return;
    const chart = chartRef.current;

    const candleData = klines.map((k) => ({
      time: Math.floor(k.openTime / 1000) as number,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const volumeData = klines.map((k) => ({
      time: Math.floor(k.openTime / 1000) as number,
      value: k.volume,
      color: k.close >= k.open ? "#22C55E44" : "#EF444444",
    }));

    if (candleSeriesRef.current)
      candleSeriesRef.current.setData(
        candleData as Parameters<typeof candleSeriesRef.current.setData>[0],
      );
    if (volumeSeriesRef.current)
      volumeSeriesRef.current.setData(
        volumeData as Parameters<typeof volumeSeriesRef.current.setData>[0],
      );

    const emaConfigs = [
      { data: emaData.ema20, color: "#22D3EE", title: "EMA20" },
      { data: emaData.ema50, color: "#3B82F6", title: "EMA50" },
      { data: emaData.ema100, color: "#F97316", title: "EMA100" },
      { data: emaData.ema180, color: "#A855F7", title: "EMA180" },
    ];

    for (const { data, color, title } of emaConfigs) {
      if (data.length === 0) continue;
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        title,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const lineData = klines
        .map((k, i) => ({
          time: Math.floor(k.openTime / 1000) as number,
          value: data[i] ?? 0,
        }))
        .filter((d) => d.value > 0);
      line.setData(lineData as Parameters<typeof line.setData>[0]);
    }

    chart.timeScale().fitContent();
  }, [klines, emaData]);

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
                border: `1px solid ${interval === iv.value ? "rgba(34,211,238,0.5)" : "transparent"}`,
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
        <div
          className="ml-auto flex items-center gap-3 text-xs"
          style={{ color: "#9AA7B6" }}
        >
          <span style={{ color: "#22D3EE" }}>── EMA20</span>
          <span style={{ color: "#3B82F6" }}>── EMA50</span>
          <span style={{ color: "#F97316" }}>── EMA100</span>
          <span style={{ color: "#A855F7" }}>── EMA180</span>
        </div>
      </div>
      <div className="relative">
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
        <div ref={containerRef} />
      </div>
    </div>
  );
}
