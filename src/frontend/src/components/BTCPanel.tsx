import {
  Activity,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import type { BTCMetrics, ReversalDetails } from "../types/binance";
import {
  formatFundingRate,
  formatPrice,
  formatVolume,
} from "../utils/calculations";
import { BTCChart } from "./BTCChart";
import { KPICard } from "./KPICard";
import { ReversalScore } from "./ReversalScore";
import { SupportResistanceBar } from "./SupportResistanceBar";

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

const EMPTY_REVERSAL_DETAILS: ReversalDetails = {
  signals: [],
  totalScore: 0,
  reversalType: "none",
};

export function BTCPanel({ metrics, loading }: BTCPanelProps) {
  const reversalDetails = metrics?.reversalDetails ?? EMPTY_REVERSAL_DETAILS;

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
              label="RSI 1h"
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

      {metrics?.btcSMCPhase && (
        <div className="mb-3 flex items-center gap-2">
          <span
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{
              background:
                metrics.btcSMCPhase === "Distribuição Alta"
                  ? "rgba(34,197,94,0.15)"
                  : metrics.btcSMCPhase === "Distribuição Baixa"
                    ? "rgba(239,68,68,0.15)"
                    : metrics.btcSMCPhase === "Manipulação"
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(34,211,238,0.15)",
              color:
                metrics.btcSMCPhase === "Distribuição Alta"
                  ? "#22C55E"
                  : metrics.btcSMCPhase === "Distribuição Baixa"
                    ? "#EF4444"
                    : metrics.btcSMCPhase === "Manipulação"
                      ? "#F59E0B"
                      : "#22D3EE",
              border: `1px solid ${
                metrics.btcSMCPhase === "Distribuição Alta"
                  ? "rgba(34,197,94,0.35)"
                  : metrics.btcSMCPhase === "Distribuição Baixa"
                    ? "rgba(239,68,68,0.35)"
                    : metrics.btcSMCPhase === "Manipulação"
                      ? "rgba(245,158,11,0.35)"
                      : "rgba(34,211,238,0.35)"
              }`,
            }}
            data-ocid="btc.smc_phase.panel"
          >
            ⚡ Fase Institucional: {metrics.btcSMCPhase}
          </span>
        </div>
      )}

      <div className="mb-4">
        <ReversalScore details={reversalDetails} />
      </div>

      <div className="mb-4">
        <SupportResistanceBar metrics={metrics} />
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
