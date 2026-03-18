import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { motion } from "motion/react";
import type { BTCMetrics } from "../types/binance";
import type { AltcoinOpportunity } from "../types/binance";

interface DollarFlowProps {
  btcMetrics: BTCMetrics | null;
  altcoins: AltcoinOpportunity[];
}

export function DollarFlow({ btcMetrics, altcoins }: DollarFlowProps) {
  const btcUp = (btcMetrics?.priceChange24h ?? 0) > 0;
  const btcChange = btcMetrics?.priceChange24h ?? 0;
  const avgAltChange =
    altcoins.length > 0
      ? altcoins.reduce((s, a) => s + a.priceChange24h, 0) / altcoins.length
      : 0;
  const altsUp = avgAltChange > 0;

  let mode: "risk-on" | "accumulating" | "risk-off";
  let label: string;
  let sublabel: string;
  let color: string;
  let glow: string;
  let Icon: typeof ArrowUpRight;

  if (btcUp && altsUp) {
    mode = "risk-on";
    label = "RISK-ON";
    sublabel = "BTC ↑ + Alts ↑ — Capital fluindo para cripto";
    color = "#22C55E";
    glow = "0 0 16px rgba(34,197,94,0.3)";
    Icon = ArrowUpRight;
  } else if (!btcUp && avgAltChange > btcChange + 1) {
    mode = "accumulating";
    label = "ACUMULAÇÃO";
    sublabel = "BTC caindo mas Alts segurando — Smart money entrando";
    color = "#3B82F6";
    glow = "0 0 16px rgba(59,130,246,0.3)";
    Icon = Minus;
  } else {
    mode = "risk-off";
    label = "RISK-OFF";
    sublabel = "BTC ↓ + Alts ↓ — Capital saindo para fiat/USDT";
    color = "#EF4444";
    glow = "0 0 16px rgba(239,68,68,0.3)";
    Icon = ArrowDownRight;
  }

  void mode;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl p-4 flex items-center gap-4"
      style={{
        background: "#0F1622",
        border: `2px solid ${color}55`,
        boxShadow: glow,
      }}
      data-ocid="dollarflow.panel"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}22`, border: `2px solid ${color}55` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "#9AA7B6" }}
          >
            Fluxo de Capital
          </span>
        </div>
        <div className="font-bold text-sm tracking-wider" style={{ color }}>
          {label}
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: "#9AA7B6" }}>
          {sublabel}
        </div>
      </div>
      <div className="ml-auto shrink-0 text-right">
        <div className="text-xs" style={{ color: "#9AA7B6" }}>
          BTC
        </div>
        <div
          className="font-mono text-sm font-bold"
          style={{ color: btcChange >= 0 ? "#22C55E" : "#EF4444" }}
        >
          {btcChange >= 0 ? "+" : ""}
          {btcChange.toFixed(2)}%
        </div>
        <div className="text-xs" style={{ color: "#9AA7B6" }}>
          Alts: {avgAltChange >= 0 ? "+" : ""}
          {avgAltChange.toFixed(2)}%
        </div>
      </div>
    </motion.div>
  );
}
