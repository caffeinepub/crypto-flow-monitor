import { motion } from "motion/react";
import { useBTCLiquidations } from "../hooks/useBTCLiquidations";

function formatValue(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className="w-2 h-2 rounded-full inline-block"
      style={{
        background: connected ? "#22C55E" : "#6B7280",
        boxShadow: connected ? "0 0 6px #22C55E" : "none",
        animation: connected ? "pulse 2s infinite" : "none",
      }}
    />
  );
}

export function BTCLiquidationComparison() {
  const { futuresStats, spotStats, futuresConnected, spotConnected } =
    useBTCLiquidations();

  const volumeDisparity =
    futuresStats.totalValue > 0 && spotStats.totalValue > 0
      ? Math.abs(futuresStats.totalValue - spotStats.totalValue) /
          Math.max(futuresStats.totalValue, spotStats.totalValue) >
        0.5
      : false;
  const txDisparity =
    futuresStats.txPerMin > 0 || spotStats.txPerMin > 0
      ? Math.abs(futuresStats.txPerMin - spotStats.txPerMin) /
          (Math.max(futuresStats.txPerMin, spotStats.txPerMin) || 1) >
        0.5
      : false;
  const hasDisparity = volumeDisparity || txDisparity;

  const futuresDominates = futuresStats.totalValue > spotStats.totalValue;
  const disparityMsg = hasDisparity
    ? `Disparidade detectada: ${
        futuresDominates ? "Futuros" : "Spot"
      } com ${Math.round(
        Math.max(futuresStats.totalValue, spotStats.totalValue) /
          Math.max(Math.min(futuresStats.totalValue, spotStats.totalValue), 1),
      )}x mais volume`
    : null;

  const panelStyle = { background: "#0F1622", border: "2px solid #1F2A3A" };

  return (
    <div className="space-y-3" data-ocid="btc.liquidation.panel">
      {/* Disparity alert */}
      {disparityMsg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2"
          style={{
            background: "rgba(234,179,8,0.15)",
            border: "1px solid #EAB308",
            color: "#EAB308",
          }}
          data-ocid="btc.liquidation.error_state"
        >
          ⚠ {disparityMsg}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Futures Panel */}
        <div className="rounded-xl p-4" style={panelStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ConnectionDot connected={futuresConnected} />
              <h3
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "#22D3EE" }}
              >
                BTC Futuros
              </h3>
            </div>
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Últimos 5 min
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Liq. LONG
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#EF4444" }}
              >
                {formatValue(futuresStats.longValue)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Liq. SHORT
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#22C55E" }}
              >
                {formatValue(futuresStats.shortValue)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Tx/min
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#E7EEF8" }}
              >
                {futuresStats.txPerMin}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
              Volume total
            </div>
            <div
              className="text-lg font-bold font-mono"
              style={{ color: "#E7EEF8" }}
            >
              {formatValue(futuresStats.totalValue)}
            </div>
          </div>
          {futuresStats.totalValue > 0 && (
            <div
              className="mt-2 w-full rounded-full overflow-hidden"
              style={{ height: 4, background: "#1F2A3A" }}
            >
              <div
                style={{
                  width: `${(futuresStats.longValue / (futuresStats.totalValue || 1)) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #EF4444, #DC2626)",
                  float: "left",
                }}
              />
              <div
                style={{
                  width: `${(futuresStats.shortValue / (futuresStats.totalValue || 1)) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #16A34A, #22C55E)",
                  float: "left",
                }}
              />
            </div>
          )}
        </div>

        {/* Spot Panel */}
        <div className="rounded-xl p-4" style={panelStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ConnectionDot connected={spotConnected} />
              <h3
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "#22D3EE" }}
              >
                BTC Spot{" "}
                <span
                  className="text-xs normal-case"
                  style={{ color: "#9AA7B6" }}
                >
                  (trades &gt;$50k)
                </span>
              </h3>
            </div>
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Últimos 5 min
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Compra
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#22C55E" }}
              >
                {formatValue(spotStats.buyValue)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Venda
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#EF4444" }}
              >
                {formatValue(spotStats.sellValue)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
                Tx/min
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: "#E7EEF8" }}
              >
                {spotStats.txPerMin}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
              Volume total
            </div>
            <div
              className="text-lg font-bold font-mono"
              style={{ color: "#E7EEF8" }}
            >
              {formatValue(spotStats.totalValue)}
            </div>
          </div>
          {spotStats.totalValue > 0 && (
            <div
              className="mt-2 w-full rounded-full overflow-hidden"
              style={{ height: 4, background: "#1F2A3A" }}
            >
              <div
                style={{
                  width: `${(spotStats.buyValue / (spotStats.totalValue || 1)) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #16A34A, #22C55E)",
                  float: "left",
                }}
              />
              <div
                style={{
                  width: `${(spotStats.sellValue / (spotStats.totalValue || 1)) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #EF4444, #DC2626)",
                  float: "left",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
