import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
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

// Color by notional value size
function getSizeColor(notional: number): {
  color: string;
  bg: string;
  label: string;
} {
  if (notional >= 1_000_000)
    return { color: "#22C55E", bg: "rgba(34,197,94,0.15)", label: "≥$1M" };
  if (notional >= 500_000)
    return { color: "#EAB308", bg: "rgba(234,179,8,0.15)", label: "≥$500K" };
  if (notional >= 250_000)
    return { color: "#F97316", bg: "rgba(249,115,22,0.15)", label: "≥$250K" };
  if (notional >= 100_000)
    return { color: "#EF4444", bg: "rgba(239,68,68,0.15)", label: "≥$100K" };
  return { color: "#9AA7B6", bg: "transparent", label: "<$100K" };
}

function LiqRow({ liq }: { liq: LiquidationData }) {
  const isLong = liq.side === "SELL";
  const sideColor = isLong ? "#EF4444" : "#22C55E";
  const sideLabel = isLong ? "LONG" : "SHORT";
  const sideBg = isLong ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)";
  const size = getSizeColor(liq.notionalValue);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="grid items-center py-1.5 px-2 rounded"
      style={{
        gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 0.8fr",
        borderBottom: "1px solid #1F2A3A",
        background: liq.notionalValue >= 100_000 ? size.bg : "transparent",
      }}
    >
      <span
        className="text-xs font-mono font-semibold"
        style={{ color: "#E7EEF8" }}
      >
        {liq.symbol.replace("USDT", "")}
      </span>
      <span>
        <span
          className="text-xs font-bold px-1 py-0.5 rounded"
          style={{ color: sideColor, background: sideBg }}
        >
          {sideLabel}
        </span>
      </span>
      <span className="text-xs font-mono" style={{ color: "#9AA7B6" }}>
        {formatPrice(liq.price)}
      </span>
      <span
        className="text-xs font-mono font-bold"
        style={{ color: liq.notionalValue >= 100_000 ? size.color : sideColor }}
      >
        {formatValue(liq.notionalValue)}
      </span>
      <span className="text-xs" style={{ color: "#9AA7B6" }}>
        {timeAgo(liq.time)}
      </span>
    </motion.div>
  );
}

// Bar chart: 10-minute buckets of LONG vs SHORT volume
function LiqBarChart({ liquidations }: { liquidations: LiquidationData[] }) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const NUM_BUCKETS = 10;
    const BUCKET_MS = 60_000; // 1 minute each
    const result = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
      label: `-${NUM_BUCKETS - i}m`,
      long: 0,
      short: 0,
    }));
    for (const liq of liquidations) {
      const age = now - liq.time;
      if (age > NUM_BUCKETS * BUCKET_MS) continue;
      const bucket = Math.floor(age / BUCKET_MS);
      const idx = NUM_BUCKETS - 1 - bucket;
      if (idx < 0 || idx >= NUM_BUCKETS) continue;
      if (liq.side === "SELL") result[idx].long += liq.notionalValue;
      else result[idx].short += liq.notionalValue;
    }
    return result;
  }, [liquidations]);

  const maxVal = Math.max(...buckets.map((b) => b.long + b.short), 1);

  return (
    <div
      className="rounded-xl p-4 h-full"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "#22D3EE" }}
        >
          Volume por Minuto
        </h3>
        <div
          className="flex items-center gap-3 text-xs"
          style={{ color: "#9AA7B6" }}
        >
          <span className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ background: "#EF4444" }}
            />
            LONG liq.
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ background: "#22C55E" }}
            />
            SHORT liq.
          </span>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex items-end gap-1" style={{ height: 140 }}>
        {buckets.map((b, i) => {
          const longH = (b.long / maxVal) * 120;
          const shortH = (b.short / maxVal) * 120;
          const isLast = i === buckets.length - 1;
          return (
            <div
              key={b.label}
              className="flex flex-col items-center gap-0.5"
              style={{ flex: 1 }}
              title={`${b.label} | Long: ${formatValue(b.long)} | Short: ${formatValue(b.short)}`}
            >
              <div
                className="flex flex-col justify-end w-full"
                style={{ height: 120, gap: 1 }}
              >
                {b.long > 0 && (
                  <div
                    style={{
                      height: longH,
                      background: isLast ? "#EF4444" : "rgba(239,68,68,0.6)",
                      borderRadius: "2px 2px 0 0",
                      minHeight: b.long > 0 ? 2 : 0,
                      transition: "height 0.4s ease",
                    }}
                  />
                )}
                {b.short > 0 && (
                  <div
                    style={{
                      height: shortH,
                      background: isLast ? "#22C55E" : "rgba(34,197,94,0.6)",
                      borderRadius: "0 0 2px 2px",
                      minHeight: b.short > 0 ? 2 : 0,
                      transition: "height 0.4s ease",
                    }}
                  />
                )}
                {b.long === 0 && b.short === 0 && (
                  <div
                    style={{
                      height: 2,
                      background: "#1F2A3A",
                      borderRadius: 2,
                    }}
                  />
                )}
              </div>
              <span
                className="text-xs"
                style={{ color: "#9AA7B6", fontSize: 9 }}
              >
                {b.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Size legend */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1F2A3A" }}>
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            { color: "#22C55E", label: "≥$1M" },
            { color: "#EAB308", label: "≥$500K" },
            { color: "#F97316", label: "≥$250K" },
            { color: "#EF4444", label: "≥$100K" },
          ].map((item) => (
            <span
              key={item.label}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
              style={{
                color: item.color,
                border: `1px solid ${item.color}44`,
                background: `${item.color}11`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Combined result panel
function CombinedPanel({
  liquidations,
  connected,
}: {
  liquidations: LiquidationData[];
  connected: boolean;
}) {
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recent = liquidations.filter((l) => l.time >= tenMinAgo);

  const longTotal = recent
    .filter((l) => l.side === "SELL")
    .reduce((s, l) => s + l.notionalValue, 0);
  const shortTotal = recent
    .filter((l) => l.side === "BUY")
    .reduce((s, l) => s + l.notionalValue, 0);
  const grandTotal = longTotal + shortTotal || 1;
  const longPct = (longTotal / grandTotal) * 100;

  // Count by tier
  const tiers = [
    {
      label: "≥$1M",
      color: "#22C55E",
      count: recent.filter((l) => l.notionalValue >= 1_000_000).length,
    },
    {
      label: "≥$500K",
      color: "#EAB308",
      count: recent.filter(
        (l) => l.notionalValue >= 500_000 && l.notionalValue < 1_000_000,
      ).length,
    },
    {
      label: "≥$250K",
      color: "#F97316",
      count: recent.filter(
        (l) => l.notionalValue >= 250_000 && l.notionalValue < 500_000,
      ).length,
    },
    {
      label: "≥$100K",
      color: "#EF4444",
      count: recent.filter(
        (l) => l.notionalValue >= 100_000 && l.notionalValue < 250_000,
      ).length,
    },
  ];

  const dominance =
    longTotal > shortTotal
      ? "LONG"
      : shortTotal > longTotal
        ? "SHORT"
        : "NEUTRO";
  const dominanceColor =
    dominance === "LONG"
      ? "#EF4444"
      : dominance === "SHORT"
        ? "#22C55E"
        : "#22D3EE";
  const ratio =
    grandTotal > 1
      ? (
          Math.max(longTotal, shortTotal) /
          Math.max(Math.min(longTotal, shortTotal), 1)
        ).toFixed(1)
      : "--";

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: connected ? "#22C55E" : "#6B7280",
              boxShadow: connected ? "0 0 6px #22C55E" : "none",
              animation: connected ? "pulse 2s infinite" : "none",
            }}
          />
          <h3
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "#22D3EE" }}
          >
            Resultado Combinado
          </h3>
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            (últimos 10 min)
          </span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1 rounded"
          style={{
            background: `${dominanceColor}18`,
            border: `1px solid ${dominanceColor}44`,
          }}
        >
          <span className="text-sm font-bold" style={{ color: dominanceColor }}>
            {dominance}
          </span>
          {ratio !== "--" && (
            <span className="text-xs" style={{ color: dominanceColor }}>
              {ratio}x
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Liq. LONG total
          </div>
          <div
            className="text-lg font-bold font-mono"
            style={{ color: "#EF4444" }}
          >
            {formatValue(longTotal)}
          </div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Liq. SHORT total
          </div>
          <div
            className="text-lg font-bold font-mono"
            style={{ color: "#22C55E" }}
          >
            {formatValue(shortTotal)}
          </div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Total liquidado
          </div>
          <div
            className="text-lg font-bold font-mono"
            style={{ color: "#E7EEF8" }}
          >
            {formatValue(longTotal + shortTotal)}
          </div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Eventos grandes
          </div>
          <div
            className="text-lg font-bold font-mono"
            style={{ color: "#E7EEF8" }}
          >
            {tiers.reduce((s, t) => s + t.count, 0)}
          </div>
        </div>
      </div>

      {/* Proportion bar */}
      <div className="mb-4">
        <div
          className="flex justify-between text-xs mb-1"
          style={{ color: "#9AA7B6" }}
        >
          <span>LONG {longPct.toFixed(0)}%</span>
          <span>SHORT {(100 - longPct).toFixed(0)}%</span>
        </div>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 8, background: "#1F2A3A" }}
        >
          <div
            style={{
              width: `${longPct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #EF4444, #DC2626)",
              float: "left",
              transition: "width 0.5s ease",
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

      {/* Tier counts */}
      <div className="grid grid-cols-4 gap-2">
        {tiers.map((tier) => (
          <div
            key={tier.label}
            className="rounded p-2 text-center"
            style={{
              background: `${tier.color}11`,
              border: `1px solid ${tier.color}44`,
            }}
          >
            <div
              className="text-lg font-bold font-mono"
              style={{ color: tier.color }}
            >
              {tier.count}
            </div>
            <div
              className="text-xs"
              style={{ color: tier.color, opacity: 0.8 }}
            >
              {tier.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiquidacoesTab() {
  const { liquidations, connected } = useLiquidations();
  const [filterText, setFilterText] = useState("");

  const filteredLiquidations = useMemo(() => {
    if (!filterText.trim()) return liquidations;
    const term = filterText.trim().toUpperCase();
    return liquidations.filter((liq) =>
      liq.symbol.toUpperCase().includes(term),
    );
  }, [liquidations, filterText]);

  return (
    <div className="space-y-4">
      {/* Filter input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <label
            htmlFor="liq-filter"
            className="block text-xs font-bold uppercase tracking-widest mb-1"
            style={{ color: "#22D3EE" }}
          >
            Filtrar ativo
          </label>
          <div className="relative">
            <input
              id="liq-filter"
              data-ocid="liquidacoes.search_input"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Ex: BTC, ETH, SOL..."
              className="w-full text-sm font-mono rounded-lg px-3 py-2 pr-8 outline-none transition-all"
              style={{
                background: "#0D1520",
                border: "1.5px solid #1F2A3A",
                color: "#E7EEF8",
                caretColor: "#22D3EE",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1.5px solid #22D3EE";
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px rgba(34,211,238,0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1.5px solid #1F2A3A";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            {filterText && (
              <button
                type="button"
                data-ocid="liquidacoes.close_button"
                onClick={() => setFilterText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                style={{ color: "#9AA7B6", background: "#1F2A3A" }}
                title="Limpar filtro"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 text-xs" style={{ color: "#9AA7B6" }}>
          <span
            style={{
              color: filterText ? "#22D3EE" : "#9AA7B6",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {filteredLiquidations.length}
          </span>
          {" liquidações"}
        </div>
      </div>

      {/* Feed + Chart side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Live Feed */}
        <div
          className="rounded-xl p-4"
          style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: connected ? "#22C55E" : "#6B7280",
                  boxShadow: connected ? "0 0 6px #22C55E" : "none",
                  animation: connected ? "pulse 2s infinite" : "none",
                }}
              />
              <h3
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "#22D3EE" }}
              >
                Feed ao Vivo
              </h3>
              <span
                className="text-xs"
                style={{ color: connected ? "#22C55E" : "#6B7280" }}
              >
                {connected ? "AO VIVO" : "OFFLINE"}
              </span>
            </div>
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              {filterText
                ? `Filtrado: ${filterText.toUpperCase()}`
                : "Todas as liquidações"}
            </span>
          </div>

          {/* Column headers */}
          <div
            className="grid text-xs mb-1 px-2"
            style={{
              gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 0.8fr",
              color: "#9AA7B6",
            }}
          >
            <span>Símbolo</span>
            <span>Lado</span>
            <span>Preço</span>
            <span>Valor</span>
            <span>Tempo</span>
          </div>

          <div style={{ height: 360, overflowY: "auto" }}>
            <AnimatePresence initial={false}>
              {filteredLiquidations.length === 0 ? (
                <div className="text-center py-12" style={{ color: "#9AA7B6" }}>
                  <span className="text-xs">
                    {filterText
                      ? `Nenhuma liquidação para "${filterText.toUpperCase()}"`
                      : "Aguardando liquidações..."}
                  </span>
                </div>
              ) : (
                filteredLiquidations
                  .slice(0, 80)
                  .map((liq, i) => (
                    <LiqRow key={`${liq.symbol}-${liq.time}-${i}`} liq={liq} />
                  ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bar Chart */}
        <LiqBarChart liquidations={filteredLiquidations} />
      </div>

      {/* Combined result */}
      <CombinedPanel
        liquidations={filteredLiquidations}
        connected={connected}
      />
    </div>
  );
}
