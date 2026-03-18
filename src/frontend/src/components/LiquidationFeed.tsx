import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "motion/react";
import { useLiquidations } from "../hooks/useLiquidations";
import type { LiquidationData } from "../types/binance";

function formatValue(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPrice(price: number): string {
  if (price >= 1000)
    return price.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function LiquidationRow({
  liq,
  index,
}: { liq: LiquidationData; index: number }) {
  const isLong = liq.side === "SELL"; // SELL = LONG liquidated
  const color = isLong ? "#EF4444" : "#22C55E";
  const label = isLong ? "LONG" : "SHORT";
  const bgColor = isLong ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)";

  return (
    <motion.div
      key={`${liq.symbol}-${liq.time}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="grid items-center py-1.5 px-2 rounded"
      style={{
        gridTemplateColumns: "2fr 1fr 2fr 1.5fr 1fr",
        borderBottom: "1px solid #1F2A3A",
      }}
      data-ocid={`liquidation.item.${index + 1}`}
    >
      <span
        className="text-xs font-mono font-semibold"
        style={{ color: "#E7EEF8" }}
      >
        {liq.symbol.replace("USDT", "")}
      </span>
      <span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ color, background: bgColor }}
        >
          {label}
        </span>
      </span>
      <span className="text-xs font-mono" style={{ color: "#9AA7B6" }}>
        {formatPrice(liq.price)}
      </span>
      <span className="text-xs font-mono font-semibold" style={{ color }}>
        {formatValue(liq.notionalValue)}
      </span>
      <span className="text-xs" style={{ color: "#9AA7B6" }}>
        {timeAgo(liq.time)}
      </span>
    </motion.div>
  );
}

export function LiquidationFeed() {
  const { liquidations, connected } = useLiquidations();

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recent = liquidations.filter((l) => l.time >= fiveMinAgo);
  const longLiqTotal = recent
    .filter((l) => l.side === "SELL")
    .reduce((sum, l) => sum + l.notionalValue, 0);
  const shortLiqTotal = recent
    .filter((l) => l.side === "BUY")
    .reduce((sum, l) => sum + l.notionalValue, 0);
  const total = longLiqTotal + shortLiqTotal || 1;
  const longPct = (longLiqTotal / total) * 100;

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2
            className="text-sm font-bold uppercase tracking-widest"
            style={{ color: "#22D3EE" }}
          >
            Liquidações
          </h2>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background: connected ? "#22C55E" : "#6B7280",
                boxShadow: connected ? "0 0 6px #22C55E" : "none",
                animation: connected ? "pulse 2s infinite" : "none",
              }}
              data-ocid="liquidation.toggle"
            />
            <span
              className="text-xs"
              style={{ color: connected ? "#22C55E" : "#6B7280" }}
            >
              {connected ? "AO VIVO" : "OFFLINE"}
            </span>
          </div>
        </div>
        <span className="text-xs" style={{ color: "#9AA7B6" }}>
          Posições forçadas em tempo real
        </span>
      </div>

      {/* Summary bar */}
      <div
        className="mb-3 p-2 rounded"
        style={{ background: "#070B10", border: "1px solid #1F2A3A" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              LONG Liq.
            </span>
            <span
              className="text-sm font-bold font-mono"
              style={{ color: "#EF4444" }}
            >
              {formatValue(longLiqTotal)}
            </span>
          </div>
          <div className="text-xs text-center" style={{ color: "#9AA7B6" }}>
            últimos 5 min
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              SHORT Liq.
            </span>
            <span
              className="text-sm font-bold font-mono"
              style={{ color: "#22C55E" }}
            >
              {formatValue(shortLiqTotal)}
            </span>
          </div>
        </div>
        {/* Proportion bar */}
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 6, background: "#1F2A3A" }}
        >
          <div
            style={{
              width: `${longPct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #EF4444, #DC2626)",
              transition: "width 0.5s ease",
              float: "left",
            }}
          />
          <div
            style={{
              width: `${100 - longPct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #16A34A, #22C55E)",
              float: "left",
            }}
          />
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid text-xs mb-1 px-2"
        style={{
          gridTemplateColumns: "2fr 1fr 2fr 1.5fr 1fr",
          color: "#9AA7B6",
        }}
      >
        <span>Símbolo</span>
        <span>Lado</span>
        <span>Preço</span>
        <span>Valor</span>
        <span>Tempo</span>
      </div>

      {/* Liquidation list */}
      <ScrollArea style={{ maxHeight: 200 }}>
        <AnimatePresence initial={false}>
          {liquidations.length === 0 ? (
            <div
              className="text-center py-8"
              style={{ color: "#9AA7B6" }}
              data-ocid="liquidation.empty_state"
            >
              <span className="text-xs">Aguardando liquidações...</span>
            </div>
          ) : (
            liquidations
              .slice(0, 50)
              .map((liq, i) => (
                <LiquidationRow
                  key={`${liq.symbol}-${liq.time}-${i}`}
                  liq={liq}
                  index={i}
                />
              ))
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
