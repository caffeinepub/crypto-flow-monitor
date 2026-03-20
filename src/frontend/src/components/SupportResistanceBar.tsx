import { motion } from "motion/react";
import type { BTCMetrics } from "../types/binance";
import { formatPrice } from "../utils/calculations";

interface Props {
  metrics: BTCMetrics | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calcLevels(metrics: BTCMetrics): {
  support: number;
  resistance: number;
  positionPct: number;
} {
  const klines = metrics.klines.slice(-50);
  const price = metrics.price;
  const { ma20, ma50, ma100, ma180 } = metrics.maPositions;

  // Swing highs and lows (simple neighbor comparison)
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 1; i < klines.length - 1; i++) {
    if (
      klines[i].high > klines[i - 1].high &&
      klines[i].high > klines[i + 1].high
    ) {
      swingHighs.push(klines[i].high);
    }
    if (
      klines[i].low < klines[i - 1].low &&
      klines[i].low < klines[i + 1].low
    ) {
      swingLows.push(klines[i].low);
    }
  }

  const maValues = [ma20, ma50, ma100, ma180];

  // Support candidates: swing lows + MAs below price
  const supportCandidates = [
    ...swingLows.filter((v) => v < price),
    ...maValues.filter((v) => v < price),
  ];

  // Resistance candidates: swing highs + MAs above price
  const resistanceCandidates = [
    ...swingHighs.filter((v) => v > price),
    ...maValues.filter((v) => v > price),
  ];

  const support =
    supportCandidates.length > 0
      ? Math.max(...supportCandidates)
      : Math.min(...klines.map((k) => k.low));

  const resistance =
    resistanceCandidates.length > 0
      ? Math.min(...resistanceCandidates)
      : Math.max(...klines.map((k) => k.high));

  const range = resistance - support;
  const positionPct =
    range > 0 ? clamp(((price - support) / range) * 100, 0, 100) : 50;

  return { support, resistance, positionPct };
}

export function SupportResistanceBar({ metrics }: Props) {
  if (!metrics || metrics.klines.length === 0) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse"
        style={{
          background: "#0F1622",
          border: "2px solid #1F2A3A",
          height: 96,
        }}
      />
    );
  }

  const { support, resistance, positionPct } = calcLevels(metrics);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      {/* Title */}
      <div className="mb-3">
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: "#9AA7B6" }}
        >
          SUPORTE / RESISTÊNCIA
        </span>
        <div className="mt-1" style={{ height: 1, background: "#1F2A3A" }} />
      </div>

      {/* Bar */}
      <div className="relative mb-2" style={{ height: 20 }}>
        {/* Gradient track */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(to right, #EF4444 0%, #3B82F6 50%, #22C55E 100%)",
            opacity: 0.85,
          }}
        />

        {/* Pointer */}
        <motion.div
          className="absolute top-0 bottom-0 flex flex-col items-center"
          style={{ left: `${positionPct}%`, translateX: "-50%" }}
          animate={{ left: `${positionPct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          {/* Vertical line */}
          <div
            className="w-0.5 h-full"
            style={{
              background: "#22D3EE",
              boxShadow: "0 0 6px #22D3EE, 0 0 12px #22D3EE",
            }}
          />
          {/* Triangle below */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "6px solid #22D3EE",
              filter: "drop-shadow(0 0 4px #22D3EE)",
              marginTop: -1,
            }}
          />
        </motion.div>
      </div>

      {/* Labels row */}
      <div className="flex items-start justify-between mt-3">
        {/* Left: Support */}
        <div className="flex flex-col">
          <span
            className="text-xs font-semibold uppercase"
            style={{ color: "#EF4444" }}
          >
            SUPORTE
          </span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: "#EF4444" }}
          >
            ${formatPrice(support)}
          </span>
        </div>

        {/* Center: position pct */}
        <div className="flex flex-col items-center">
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            posição
          </span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: "#22D3EE" }}
          >
            {positionPct.toFixed(0)}%
          </span>
        </div>

        {/* Right: Resistance */}
        <div className="flex flex-col items-end">
          <span
            className="text-xs font-semibold uppercase"
            style={{ color: "#22C55E" }}
          >
            RESISTÊNCIA
          </span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: "#22C55E" }}
          >
            ${formatPrice(resistance)}
          </span>
        </div>
      </div>
    </div>
  );
}
