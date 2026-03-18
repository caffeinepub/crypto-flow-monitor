import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "motion/react";
import type { AltcoinOpportunity } from "../types/binance";
import {
  formatFundingRate,
  formatPrice,
  formatVolume,
} from "../utils/calculations";

interface AltcoinScannerProps {
  altcoins: AltcoinOpportunity[];
  loading: boolean;
}

function getScoreStyle(score: number) {
  if (score >= 70)
    return {
      border: "rgba(34,197,94,0.7)",
      glow: "0 0 12px rgba(34,197,94,0.25)",
      badge: "#22C55E",
      bg: "rgba(34,197,94,0.08)",
    };
  if (score >= 50)
    return {
      border: "rgba(59,130,246,0.5)",
      glow: "0 0 12px rgba(59,130,246,0.2)",
      badge: "#3B82F6",
      bg: "rgba(59,130,246,0.06)",
    };
  return {
    border: "rgba(239,68,68,0.4)",
    glow: "none",
    badge: "#EF4444",
    bg: "transparent",
  };
}

function CoinAvatar({ symbol }: { symbol: string }) {
  const colors = [
    "#22C55E",
    "#3B82F6",
    "#22D3EE",
    "#F97316",
    "#A855F7",
    "#EF4444",
    "#EAB308",
    "#14B8A6",
  ];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

const SKELETON_IDS = ["sk1", "sk2", "sk3", "sk4", "sk5", "sk6", "sk7", "sk8"];

export function AltcoinScanner({ altcoins, loading }: AltcoinScannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-xl flex flex-col"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
      data-ocid="scanner.panel"
    >
      <div className="p-4 border-b" style={{ borderColor: "#1F2A3A" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="font-bold text-sm uppercase tracking-wider"
              style={{ color: "#22D3EE" }}
            >
              Altcoin Scanner
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#9AA7B6" }}>
              Top oportunidades de reversão
            </p>
          </div>
          <div
            className="text-xs flex items-center gap-1"
            style={{ color: "#9AA7B6" }}
          >
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ background: "#22C55E" }}
            />{" "}
            &gt;70
            <span
              className="w-2 h-2 rounded-sm inline-block ml-1"
              style={{ background: "#3B82F6" }}
            />{" "}
            50–70
            <span
              className="w-2 h-2 rounded-sm inline-block ml-1"
              style={{ background: "#EF4444" }}
            />{" "}
            &lt;50
          </div>
        </div>
        <div
          className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 mt-3 text-xs uppercase tracking-wider"
          style={{ color: "#9AA7B6" }}
        >
          <div className="w-7" />
          <div>Par</div>
          <div className="text-right">Preço</div>
          <div className="text-right">24h</div>
          <div className="text-right">FR</div>
          <div className="text-right">Score</div>
        </div>
      </div>

      <ScrollArea
        className="flex-1"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {loading ? (
          <div className="p-4 space-y-2" data-ocid="scanner.loading_state">
            {SKELETON_IDS.map((id) => (
              <div
                key={id}
                className="h-10 rounded-lg animate-pulse"
                style={{ background: "#1F2A3A" }}
              />
            ))}
          </div>
        ) : altcoins.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ color: "#9AA7B6" }}
            data-ocid="scanner.empty_state"
          >
            <p className="text-sm">Nenhum ativo encontrado</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {altcoins.map((alt, i) => {
              const s = getScoreStyle(alt.score);
              return (
                <motion.div
                  key={alt.symbol}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    boxShadow: s.glow,
                  }}
                  data-ocid={`scanner.item.${i + 1}`}
                >
                  <CoinAvatar symbol={alt.symbol} />
                  <div>
                    <div
                      className="text-xs font-bold"
                      style={{ color: "#E7EEF8" }}
                    >
                      {alt.symbol}
                    </div>
                    <div className="text-xs" style={{ color: "#9AA7B6" }}>
                      {formatVolume(alt.volume24h)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-xs font-mono"
                      style={{ color: "#E7EEF8" }}
                    >
                      {formatPrice(alt.price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-xs font-mono font-bold"
                      style={{
                        color: alt.priceChange24h >= 0 ? "#22C55E" : "#EF4444",
                      }}
                    >
                      {alt.priceChange24h >= 0 ? "+" : ""}
                      {alt.priceChange24h.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-xs font-mono"
                      style={{
                        color: alt.fundingRate < 0 ? "#22C55E" : "#EF4444",
                      }}
                    >
                      {formatFundingRate(alt.fundingRate)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold"
                      style={{
                        background: `${s.badge}22`,
                        color: s.badge,
                        border: `1px solid ${s.badge}55`,
                      }}
                    >
                      {alt.score}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
