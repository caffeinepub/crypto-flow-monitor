import { motion } from "motion/react";
import type { BTCMetrics } from "../types/binance";

interface BTCThermometerProps {
  btcMetrics: BTCMetrics | null;
  loading?: boolean;
}

export function BTCThermometer({
  btcMetrics,
  loading = false,
}: BTCThermometerProps) {
  const score = btcMetrics?.capitalFlowScore ?? 50;
  const takerBuyRatio = btcMetrics?.takerBuyRatio ?? 0.5;
  const clampedScore = Math.max(0, Math.min(100, score));

  const directionLabel =
    clampedScore <= 35
      ? "SAÍDA DE CAPITAL"
      : clampedScore <= 55
        ? "NEUTRO"
        : "ENTRADA DE CAPITAL";
  const intensity =
    clampedScore <= 33 ? "Fraco" : clampedScore <= 66 ? "Médio" : "Forte";
  const dirColor =
    clampedScore <= 35 ? "#EF4444" : clampedScore <= 55 ? "#3B82F6" : "#22C55E";
  const intColor =
    clampedScore <= 33 ? "#EF4444" : clampedScore <= 66 ? "#F97316" : "#22C55E";

  const takerPct = (takerBuyRatio * 100).toFixed(1);
  const takerColor =
    takerBuyRatio > 0.52
      ? "#22C55E"
      : takerBuyRatio < 0.48
        ? "#EF4444"
        : "#9AA7B6";

  if (loading) {
    return (
      <div
        className="rounded-xl p-5 animate-pulse"
        style={{
          background: "#0F1622",
          border: "2px solid #1F2A3A",
          height: 120,
        }}
        data-ocid="btc.thermometer.loading_state"
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-5"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
      data-ocid="btc.thermometer.panel"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "#22D3EE" }}
          >
            BTC FLUXO DE CAPITAL
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#9AA7B6" }}>
            Taker Ratio · OI · Funding · Momentum
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-3xl font-bold font-mono"
            style={{ color: dirColor, textShadow: `0 0 12px ${dirColor}66` }}
          >
            {clampedScore}
          </div>
          <div className="text-xs font-semibold" style={{ color: intColor }}>
            {intensity}
          </div>
        </div>
      </div>

      {/* Gradient bar + pointer */}
      <div className="relative mb-6">
        <div
          className="w-full rounded-full"
          style={{
            height: 16,
            background:
              "linear-gradient(90deg, #EF4444 0%, #F97316 25%, #EAB308 50%, #84CC16 75%, #22C55E 100%)",
            boxShadow: "0 0 8px rgba(0,0,0,0.5)",
          }}
        />
        {/* Pointer/needle */}
        <motion.div
          animate={{ left: `calc(${clampedScore}% - 8px)` }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          style={{ position: "absolute", top: -6, width: 16 }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "10px solid white",
              filter: "drop-shadow(0 0 4px rgba(255,255,255,0.8))",
            }}
          />
          <div
            style={{
              width: 2,
              height: 20,
              background: "white",
              margin: "0 auto",
              opacity: 0.8,
            }}
          />
        </motion.div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
        <span style={{ color: "#EF4444" }}>Saída USD←BTC</span>
        <span style={{ color: "#3B82F6" }}>Neutro</span>
        <span style={{ color: "#22C55E" }}>Entrada USD→BTC</span>
      </div>

      {/* Direction badge + taker ratio */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span
          className="px-3 py-1 rounded text-sm font-bold uppercase tracking-wider"
          style={{
            background: `${dirColor}22`,
            color: dirColor,
            border: `1px solid ${dirColor}55`,
          }}
        >
          {directionLabel}
        </span>
        <span className="text-xs" style={{ color: "#9AA7B6" }}>
          · Intensidade: <span style={{ color: intColor }}>{intensity}</span>
        </span>
      </div>
      <div className="mt-2 text-xs" style={{ color: "#9AA7B6" }}>
        Taker Buy:{" "}
        <span style={{ color: takerColor, fontWeight: 600 }}>{takerPct}%</span>
      </div>
    </motion.div>
  );
}
