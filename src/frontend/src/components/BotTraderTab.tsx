import { Clock, Navigation, Shield, TrendingUp, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MODALITY_CONFIG, useBotTrader } from "../hooks/useBotTrader";
import type { AltcoinOpportunity, BTCMetrics } from "../types/binance";
import type { ModalityId, SimulatedTrade } from "../utils/botTraderStorage";
import { formatPrice } from "../utils/calculations";

interface BotTraderTabProps {
  altcoins: AltcoinOpportunity[];
  btcMetrics: BTCMetrics | null;
}

const MODALITY_META: Record<
  ModalityId,
  {
    label: string;
    icon: React.ComponentType<{
      className?: string;
      style?: React.CSSProperties;
    }>;
    color: string;
    accent: string;
  }
> = {
  scalp: {
    label: "Scalp",
    icon: Zap,
    color: "#22D3EE",
    accent: "rgba(34,211,238,0.12)",
  },
  daytrade: {
    label: "Day Trade",
    icon: Clock,
    color: "#60A5FA",
    accent: "rgba(96,165,250,0.12)",
  },
  swing: {
    label: "Swing",
    icon: TrendingUp,
    color: "#A78BFA",
    accent: "rgba(167,139,250,0.12)",
  },
  tendencia: {
    label: "Tendência",
    icon: Navigation,
    color: "#FBBF24",
    accent: "rgba(251,191,36,0.12)",
  },
  holding: {
    label: "Holding",
    icon: Shield,
    color: "#FB923C",
    accent: "rgba(251,146,60,0.12)",
  },
};

const MODALITY_ORDER: ModalityId[] = [
  "scalp",
  "daytrade",
  "swing",
  "tendencia",
  "holding",
];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function closeReasonLabel(reason: string | undefined): string {
  switch (reason) {
    case "TP3_WIN":
      return "TP3 ✓";
    case "SL_LOSS":
      return "Stop Loss";
    case "BOT_CLOSE":
      return "Bot Fechou";
    case "BOT_REVERSE":
      return "Invertido";
    default:
      return reason ?? "—";
  }
}

function closeReasonColor(reason: string | undefined): string {
  switch (reason) {
    case "TP3_WIN":
      return "#22C55E";
    case "SL_LOSS":
      return "#EF4444";
    case "BOT_CLOSE":
      return "#FBBF24";
    case "BOT_REVERSE":
      return "#A78BFA";
    default:
      return "#9AA7B6";
  }
}

function ModalityCard({
  mod,
  trade,
}: { mod: ModalityId; trade: SimulatedTrade | null }) {
  const meta = MODALITY_META[mod];
  const Icon = meta.icon;

  if (!trade) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "#0F1622",
          border: "1px solid #1F2A3A",
          borderRadius: 12,
          padding: "16px",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              background: meta.accent,
              border: `1px solid ${meta.color}44`,
              borderRadius: 6,
              padding: "2px 8px",
              color: meta.color,
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon className="w-3 h-3" style={{ color: meta.color }} />
            {meta.label}
          </span>
        </div>
        <div style={{ marginTop: 4 }}>
          <p
            style={{
              color: "#9AA7B6",
              fontSize: 10,
              margin: "0 0 6px 0",
              fontStyle: "italic",
            }}
          >
            {MODALITY_CONFIG[mod].description}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "TP1", val: `+${MODALITY_CONFIG[mod].tp1Pct}%` },
              { label: "TP2", val: `+${MODALITY_CONFIG[mod].tp2Pct}%` },
              { label: "TP3", val: `+${MODALITY_CONFIG[mod].tp3Pct}%` },
              { label: "SL", val: `-${MODALITY_CONFIG[mod].slPct}%` },
            ].map(({ label, val }) => (
              <span
                key={label}
                style={{
                  background:
                    label === "SL"
                      ? "rgba(239,68,68,0.1)"
                      : "rgba(34,197,94,0.08)",
                  border: `1px solid ${label === "SL" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.25)"}`,
                  borderRadius: 4,
                  padding: "2px 6px",
                  color: label === "SL" ? "#EF4444" : "#22C55E",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {label} {val}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: 0.4,
            marginTop: 8,
          }}
        >
          <Clock className="w-5 h-5" style={{ color: "#9AA7B6" }} />
          <span style={{ color: "#9AA7B6", fontSize: 11 }}>
            Aguardando setup...
          </span>
        </div>
      </motion.div>
    );
  }

  const isLong = trade.direction === "LONG";
  const rangeMin = trade.stopLoss;
  const rangeMax = trade.tp3;
  const rangeSpan = rangeMax - rangeMin;
  const cursorPct =
    rangeSpan > 0
      ? Math.max(
          0,
          Math.min(100, ((trade.currentPrice - rangeMin) / rangeSpan) * 100),
        )
      : 50;
  const tp1Pct =
    rangeSpan > 0 ? ((trade.tp1 - rangeMin) / rangeSpan) * 100 : 33;
  const tp2Pct =
    rangeSpan > 0 ? ((trade.tp2 - rangeMin) / rangeSpan) * 100 : 66;

  const pnl = trade.pnlPct ?? 0;
  const pnlColor = pnl >= 0 ? "#22C55E" : "#EF4444";

  const statusBadge = () => {
    if (trade.status === "PARTIAL_TP1")
      return { label: "Parcial TP1", color: "#FBBF24" };
    if (trade.status === "PARTIAL_TP2")
      return { label: "Parcial TP2", color: "#FB923C" };
    return { label: "Ativo", color: "#22C55E" };
  };
  const badge = statusBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#0F1622",
        border: `1px solid ${meta.color}33`,
        borderRadius: 12,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: `0 0 20px ${meta.color}10`,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              background: meta.accent,
              border: `1px solid ${meta.color}44`,
              borderRadius: 6,
              padding: "2px 8px",
              color: meta.color,
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon className="w-3 h-3" style={{ color: meta.color }} />
            {meta.label}
          </span>
          <span
            style={{
              background: `${badge.color}22`,
              border: `1px solid ${badge.color}44`,
              borderRadius: 6,
              padding: "2px 8px",
              color: badge.color,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: pnlColor,
            letterSpacing: "0.01em",
          }}
        >
          {pnl >= 0 ? "+" : ""}
          {pnl.toFixed(2)}%
        </span>
      </div>

      {/* Symbol + direction + prices */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 15 }}>
          {trade.symbol}
        </span>
        <span
          style={{
            background: isLong ? "#22C55E22" : "#EF444422",
            border: `1px solid ${isLong ? "#22C55E" : "#EF4444"}44`,
            borderRadius: 4,
            padding: "1px 7px",
            color: isLong ? "#22C55E" : "#EF4444",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {trade.direction}
        </span>
        <span style={{ color: "#9AA7B6", fontSize: 11 }}>Entrada:</span>
        <span style={{ color: "#CBD5E1", fontSize: 11, fontWeight: 600 }}>
          {formatPrice(trade.entry)}
        </span>
        <span style={{ color: "#9AA7B6", fontSize: 11 }}>Atual:</span>
        <span style={{ color: pnlColor, fontSize: 11, fontWeight: 600 }}>
          {formatPrice(trade.currentPrice)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", marginTop: 4 }}>
        {/* TP labels */}
        <div style={{ position: "relative", height: 16, marginBottom: 2 }}>
          {[
            { pct: tp1Pct, label: "TP1", hit: trade.partialsTaken >= 1 },
            { pct: tp2Pct, label: "TP2", hit: trade.partialsTaken >= 2 },
            { pct: 100, label: "TP3", hit: false },
          ].map(({ pct, label, hit }) => (
            <span
              key={label}
              style={{
                position: "absolute",
                left: `${Math.min(pct, 97)}%`,
                transform: "translateX(-50%)",
                fontSize: 9,
                color: hit ? "#22C55E" : "#9AA7B6",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          ))}
          <span
            style={{
              position: "absolute",
              left: "0%",
              fontSize: 9,
              color: "#EF4444",
              fontWeight: 600,
            }}
          >
            SL
          </span>
        </div>

        {/* Bar */}
        <div
          style={{
            position: "relative",
            height: 8,
            borderRadius: 4,
            background:
              "linear-gradient(to right, #EF4444, #FBBF24 40%, #22C55E)",
            overflow: "visible",
          }}
        >
          {/* TP dots */}
          {[
            { pct: tp1Pct, label: "tp1" },
            { pct: tp2Pct, label: "tp2" },
            { pct: 100, label: "tp3" },
          ].map(({ pct, label }, i) => (
            <span
              key={label}
              style={{
                position: "absolute",
                left: `${Math.min(pct, 100)}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: trade.partialsTaken > i ? "#22C55E" : "#334155",
                border: `1px solid ${trade.partialsTaken > i ? "#22C55E" : "#64748B"}`,
              }}
            />
          ))}
          {/* Cursor */}
          <span
            style={{
              position: "absolute",
              left: `${cursorPct}%`,
              top: -3,
              transform: "translateX(-50%)",
              width: 2,
              height: 14,
              background: "#FFFFFF",
              borderRadius: 1,
              boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            }}
          />
        </div>

        {/* TP price labels below */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 9, color: "#EF4444" }}>
            {formatPrice(trade.stopLoss)}
          </span>
          <span style={{ fontSize: 9, color: "#9AA7B6" }}>
            {formatPrice(trade.tp1)}
          </span>
          <span style={{ fontSize: 9, color: "#9AA7B6" }}>
            {formatPrice(trade.tp2)}
          </span>
          <span style={{ fontSize: 9, color: "#22C55E" }}>
            {formatPrice(trade.tp3)}
          </span>
        </div>
      </div>

      {/* Bot log */}
      <p
        style={{
          color: "#64748B",
          fontSize: 10,
          fontStyle: "italic",
          margin: 0,
          lineHeight: 1.4,
        }}
      >
        🤖 {trade.botLog}
      </p>
    </motion.div>
  );
}

export function BotTraderTab({ altcoins, btcMetrics }: BotTraderTabProps) {
  const { activeTrades, tradeHistory, patterns } = useBotTrader(
    altcoins,
    btcMetrics,
  );

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
      data-ocid="bottrader.page"
    >
      {/* Header */}
      <div
        style={{
          background: "#0F1622",
          border: "1px solid #1F2A3A",
          borderRadius: 12,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              color: "#22D3EE",
              fontWeight: 700,
              fontSize: 18,
              margin: 0,
              letterSpacing: "0.05em",
            }}
          >
            🤖 Bot Trader
          </h2>
          <p
            style={{ color: "#9AA7B6", fontSize: 12, margin: 0, marginTop: 2 }}
          >
            Simulação de trades por modalidade — baseado nas recomendações do
            Scanner
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#22D3EE", fontWeight: 700, fontSize: 20 }}>
              {patterns.totalTrades}
            </div>
            <div style={{ color: "#9AA7B6", fontSize: 10 }}>Trades</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#22C55E", fontWeight: 700, fontSize: 20 }}>
              {patterns.overallWinRate.toFixed(0)}%
            </div>
            <div style={{ color: "#9AA7B6", fontSize: 10 }}>Win Rate</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                color:
                  btcMetrics?.reversalScore && btcMetrics.reversalScore > 60
                    ? "#EF4444"
                    : "#22C55E",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {btcMetrics?.reversalScore ?? 0}
            </div>
            <div style={{ color: "#9AA7B6", fontSize: 10 }}>BTC Score</div>
          </div>
        </div>
      </div>

      {/* Modality cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
        data-ocid="bottrader.panel"
      >
        <AnimatePresence>
          {MODALITY_ORDER.map((mod) => (
            <ModalityCard key={mod} mod={mod} trade={activeTrades[mod]} />
          ))}
        </AnimatePresence>
      </div>

      {/* Pattern analysis */}
      <div
        style={{
          background: "#0F1622",
          border: "1px solid #1F2A3A",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <h3
          style={{
            color: "#E2E8F0",
            fontWeight: 600,
            fontSize: 14,
            margin: "0 0 14px 0",
          }}
        >
          📊 Análise de Padrões
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {MODALITY_ORDER.map((mod) => {
            const meta = MODALITY_META[mod];
            const stats = patterns.byModality[mod];
            const total = stats.wins + stats.losses + stats.botClose;
            const wr =
              total > 0 ? ((stats.wins / total) * 100).toFixed(0) : "—";
            return (
              <div
                key={mod}
                style={{
                  background: "#070B10",
                  border: `1px solid ${meta.color}22`,
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    color: meta.color,
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  {meta.label}
                </div>
                <div
                  style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700 }}
                >
                  {wr}
                  {typeof wr === "string" && wr !== "—" ? "%" : ""}
                </div>
                <div style={{ color: "#9AA7B6", fontSize: 10 }}>Win Rate</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <span style={{ color: "#22C55E", fontSize: 10 }}>
                    {stats.wins}W
                  </span>
                  <span style={{ color: "#EF4444", fontSize: 10 }}>
                    {stats.losses}L
                  </span>
                  <span style={{ color: "#FBBF24", fontSize: 10 }}>
                    {stats.botClose}B
                  </span>
                </div>
                <div
                  style={{
                    color: stats.avgPnl >= 0 ? "#22C55E" : "#EF4444",
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  Avg: {stats.avgPnl >= 0 ? "+" : ""}
                  {stats.avgPnl.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Top symbols */}
        {patterns.topSymbols.length > 0 && (
          <div>
            <div style={{ color: "#9AA7B6", fontSize: 11, marginBottom: 8 }}>
              🏆 Símbolos com maior taxa de acerto
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {patterns.topSymbols.slice(0, 3).map((s, i) => (
                <div
                  key={s.symbol}
                  style={{
                    background: "#070B10",
                    border: "1px solid #1F2A3A",
                    borderRadius: 6,
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      color: ["#FFD700", "#C0C0C0", "#CD7F32"][i],
                      fontSize: 11,
                    }}
                  >
                    {["🥇", "🥈", "🥉"][i]}
                  </span>
                  <span
                    style={{ color: "#E2E8F0", fontWeight: 600, fontSize: 11 }}
                  >
                    {s.symbol}
                  </span>
                  <span style={{ color: "#22C55E", fontSize: 10 }}>
                    {s.total > 0 ? ((s.wins / s.total) * 100).toFixed(0) : 0}% (
                    {s.wins}/{s.total})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trade history */}
      <div
        style={{
          background: "#0F1622",
          border: "1px solid #1F2A3A",
          borderRadius: 12,
          padding: "16px 20px",
        }}
        data-ocid="bottrader.table"
      >
        <h3
          style={{
            color: "#E2E8F0",
            fontWeight: 600,
            fontSize: 14,
            margin: "0 0 14px 0",
          }}
        >
          📋 Histórico de Trades
        </h3>
        {tradeHistory.length === 0 ? (
          <div
            style={{
              color: "#9AA7B6",
              textAlign: "center",
              padding: "24px 0",
              fontSize: 12,
            }}
            data-ocid="bottrader.empty_state"
          >
            Nenhum trade encerrado ainda. O bot abrirá posições quando houver
            setups válidos no Scanner.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #1F2A3A" }}>
                  {[
                    "Modalidade",
                    "Par",
                    "Dir",
                    "Entrada",
                    "Saída",
                    "PnL%",
                    "Duração",
                    "Motivo",
                    "Hora",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        color: "#9AA7B6",
                        fontWeight: 600,
                        padding: "6px 8px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradeHistory.slice(0, 20).map((t, i) => {
                  const rowColor = (() => {
                    if (t.closeReason === "TP3_WIN")
                      return "rgba(34,197,94,0.07)";
                    if (t.closeReason === "SL_LOSS")
                      return "rgba(239,68,68,0.07)";
                    if (t.closeReason === "BOT_CLOSE")
                      return "rgba(251,191,36,0.07)";
                    if (t.closeReason === "BOT_REVERSE")
                      return "rgba(167,139,250,0.07)";
                    return "transparent";
                  })();
                  const dur = t.closeTime ? t.closeTime - t.openTime : 0;
                  const meta = MODALITY_META[t.modality];
                  return (
                    <tr
                      key={t.id}
                      style={{
                        background: rowColor,
                        borderBottom: "1px solid #1F2A3A22",
                      }}
                      data-ocid={`bottrader.row.${i + 1}`}
                    >
                      <td
                        style={{
                          padding: "6px 8px",
                          color: meta.color,
                          fontWeight: 600,
                        }}
                      >
                        {meta.label}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          color: "#E2E8F0",
                          fontWeight: 600,
                        }}
                      >
                        {t.symbol}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          color: t.direction === "LONG" ? "#22C55E" : "#EF4444",
                          fontWeight: 600,
                        }}
                      >
                        {t.direction}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#CBD5E1" }}>
                        {formatPrice(t.entry)}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#CBD5E1" }}>
                        {t.closedPrice ? formatPrice(t.closedPrice) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          color: (t.pnlPct ?? 0) >= 0 ? "#22C55E" : "#EF4444",
                          fontWeight: 700,
                        }}
                      >
                        {(t.pnlPct ?? 0) >= 0 ? "+" : ""}
                        {(t.pnlPct ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: "6px 8px", color: "#9AA7B6" }}>
                        {dur > 0 ? formatDuration(dur) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          color: closeReasonColor(t.closeReason),
                          fontWeight: 600,
                        }}
                      >
                        {closeReasonLabel(t.closeReason)}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#64748B" }}>
                        {t.closeTime
                          ? new Date(t.closeTime).toLocaleTimeString("pt-BR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
