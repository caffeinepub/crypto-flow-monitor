import {
  Activity,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import type { BTCMetrics } from "../types/binance";
import {
  formatFundingRate,
  formatPrice,
  formatVolume,
} from "../utils/calculations";
import { BTCChart } from "./BTCChart";
import { KPICard } from "./KPICard";
import { ReversalScore } from "./ReversalScore";

type NeonColor = "green" | "red" | "blue" | "cyan" | "orange";

interface BTCPanelProps {
  metrics: BTCMetrics | null;
  loading: boolean;
}

function getRSIColor(rsi: number): NeonColor {
  if (rsi < 30) return "red";
  if (rsi < 40) return "orange";
  if (rsi < 60) return "blue";
  return "green";
}

function getRSILabel(rsi: number): string {
  if (rsi < 30) return "Sobrevendido";
  if (rsi < 40) return "Fraqueza";
  if (rsi < 60) return "Neutro";
  if (rsi < 70) return "Força";
  return "Sobrecomprado";
}

const SKELETON_IDS = ["s1", "s2", "s3", "s4", "s5"];

export function BTCPanel({ metrics, loading }: BTCPanelProps) {
  return (
    <section data-ocid="btc.panel">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {loading || !metrics ? (
          SKELETON_IDS.map((id) => (
            <div
              key={id}
              className="rounded-xl p-4 animate-pulse"
              style={{
                background: "#0F1622",
                border: "2px solid #1F2A3A",
                height: 100,
              }}
            />
          ))
        ) : (
          <>
            <KPICard
              label="BTC Price"
              value={`$${formatPrice(metrics.price)}`}
              sub={`${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}% 24h`}
              color={metrics.priceChange24h >= 0 ? "green" : "red"}
              icon={<DollarSign className="w-4 h-4" />}
              index={0}
            />
            <KPICard
              label="RSI 14"
              value={metrics.rsi.toFixed(1)}
              sub={getRSILabel(metrics.rsi)}
              color={getRSIColor(metrics.rsi)}
              icon={<Activity className="w-4 h-4" />}
              index={1}
            />
            <KPICard
              label="Open Interest"
              value={formatVolume(metrics.openInterest)}
              sub="BTC Futures"
              color="blue"
              icon={<Zap className="w-4 h-4" />}
              index={2}
            />
            <KPICard
              label="Funding Rate"
              value={formatFundingRate(metrics.fundingRate)}
              sub={metrics.fundingRate < 0 ? "Bears pagando" : "Bulls pagando"}
              color={metrics.fundingRate < 0 ? "green" : "red"}
              icon={
                metrics.fundingRate < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )
              }
              index={3}
            />
            <KPICard
              label="Volume 24h"
              value={formatVolume(metrics.volume24h)}
              sub="USDT"
              color="cyan"
              icon={<Activity className="w-4 h-4" />}
              index={4}
            />
          </>
        )}
      </div>

      <div className="mb-4">
        <ReversalScore score={metrics?.reversalScore ?? 0} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <BTCChart />
      </motion.div>
    </section>
  );
}
