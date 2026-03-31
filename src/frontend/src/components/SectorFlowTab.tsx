import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Brain,
  Calendar,
  Clock,
  Coins,
  Cpu,
  DollarSign,
  Gamepad2,
  Globe,
  Layers,
  Link,
  Lock,
  Minus,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Sector Taxonomy ───────────────────────────────────────────────────────
const SECTORS = [
  {
    id: "layer1",
    name: "Layer 1",
    icon: Globe,
    assets: [
      "ETH",
      "SOL",
      "BNB",
      "AVAX",
      "ADA",
      "DOT",
      "ATOM",
      "NEAR",
      "SUI",
      "APT",
      "TRX",
    ],
  },
  {
    id: "layer2",
    name: "Layer 2",
    icon: Layers,
    assets: ["MATIC", "ARB", "OP", "STRK", "IMX", "ZK"],
  },
  {
    id: "defi",
    name: "DeFi",
    icon: Coins,
    assets: ["AAVE", "UNI", "CRV", "DYDX", "GMX", "LDO", "JUP", "PENDLE"],
  },
  {
    id: "ai",
    name: "AI / Data",
    icon: Brain,
    assets: ["FET", "RNDR", "GRT", "TAO", "INJ", "WLD"],
  },
  {
    id: "gamefi",
    name: "GameFi",
    icon: Gamepad2,
    assets: ["AXS", "SAND", "MANA", "GALA", "ENJ", "MAGIC"],
  },
  {
    id: "meme",
    name: "Meme",
    icon: Zap,
    assets: ["DOGE", "SHIB", "FLOKI", "PEPE", "BONK", "WIF"],
  },
  {
    id: "infra",
    name: "Infra / Oráculos",
    icon: Link,
    assets: ["LINK", "PYTH", "TIA", "BAND"],
  },
  {
    id: "exchange",
    name: "Exchange Tokens",
    icon: DollarSign,
    assets: ["BNB", "OKB", "CRO"],
  },
  {
    id: "storage",
    name: "Storage / Web3",
    icon: Box,
    assets: ["FIL", "AR", "STORJ"],
  },
  {
    id: "privacy",
    name: "Privacidade",
    icon: Shield,
    assets: ["XMR", "ZEC"],
  },
] as const;

type SectorId = (typeof SECTORS)[number]["id"];

interface AssetTicker {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
  takerBuyQuoteVolume: string;
}

interface FundingEntry {
  symbol: string;
  lastFundingRate: string;
}

interface AssetFlow {
  symbol: string;
  score: number;
  priceChangePct: number;
  takerRatio: number;
  fundingRate: number;
  volume: number;
}

interface SectorData {
  id: SectorId;
  name: string;
  score: number;
  direction: "INFLOW" | "OUTFLOW" | "NEUTRO";
  totalVolume: number;
  avgFunding: number;
  topAssets: AssetFlow[];
  assets: AssetFlow[];
  rank: number;
}

interface FlowAlert {
  id: string;
  sectorName: string;
  newDirection: string;
  prevDirection: string;
  scoreDelta: number;
  timestamp: number;
}

function calcAssetScore(ticker: AssetTicker, funding: number): AssetFlow {
  const pct = Number.parseFloat(ticker.priceChangePercent);
  const qVol = Number.parseFloat(ticker.quoteVolume);
  const takerBuy = Number.parseFloat(ticker.takerBuyQuoteVolume);
  const takerRatio = qVol > 0 ? takerBuy / qVol : 0.5;

  // price contribution 0-40
  const pricePts = Math.min(40, Math.max(0, ((pct + 10) / 20) * 40));
  // taker contribution 0-30
  const takerPts =
    takerRatio >= 0.6
      ? 30
      : takerRatio <= 0.4
        ? 0
        : ((takerRatio - 0.4) / 0.2) * 30;
  // funding contribution 0-20
  const fundingPts = funding <= -0.0001 ? 20 : funding >= 0.0001 ? 0 : 10;
  // imbalance bonus 0-10
  const bonusPts = takerRatio > 0.55 ? 10 : 0;

  const score = Math.round(pricePts + takerPts + fundingPts + bonusPts);

  return {
    symbol: ticker.symbol.replace("USDT", ""),
    score: Math.min(100, score),
    priceChangePct: pct,
    takerRatio,
    fundingRate: funding,
    volume: qVol,
  };
}

function scoreToDirection(score: number): "INFLOW" | "OUTFLOW" | "NEUTRO" {
  if (score >= 55) return "INFLOW";
  if (score <= 45) return "OUTFLOW";
  return "NEUTRO";
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ─── Market Sessions ────────────────────────────────────────────────────────
const SESSIONS = [
  { name: "Ásia", emoji: "🌏", startH: 0, endH: 8 },
  { name: "Europa", emoji: "🌍", startH: 7, endH: 15 },
  {
    name: "NY Pré-abertura",
    emoji: "🇺🇸",
    startH: 13,
    endH: 14,
    endM: 30,
    startM: 30,
  },
  { name: "NY Abertura", emoji: "🇺🇸", startH: 14, endH: 22, startM: 30 },
] as const;

function getSessionStatus(
  h: number,
  m: number,
  session: (typeof SESSIONS)[number],
) {
  const nowMin = h * 60 + m;
  const startMin =
    session.startH * 60 + ("startM" in session ? (session.startM ?? 0) : 0);
  const endMin =
    session.endH * 60 + ("endM" in session ? (session.endM ?? 0) : 0);
  if (nowMin >= startMin && nowMin < endMin) return "ATIVA";
  if (nowMin < startMin && startMin - nowMin <= 30) return "PRÓXIMA";
  return "FECHADA";
}

// ─── Main Hook ─────────────────────────────────────────────────────────────
function useSectorFlow() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [alerts, setAlerts] = useState<FlowAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const prevScores = useRef<
    Record<string, { score: number; direction: string }>
  >({});

  const fetchAndCompute = useCallback(async () => {
    try {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch("https://fapi.binance.com/fapi/v1/ticker/24hr"),
        fetch("https://fapi.binance.com/fapi/v1/premiumIndex"),
      ]);

      const tickers: AssetTicker[] = await tickerRes.json();
      const fundings: FundingEntry[] = await fundingRes.json();

      const tickerMap = new Map<string, AssetTicker>();
      for (const t of tickers) tickerMap.set(t.symbol, t);

      const fundingMap = new Map<string, number>();
      for (const f of fundings)
        fundingMap.set(f.symbol, Number.parseFloat(f.lastFundingRate));

      const newAlerts: FlowAlert[] = [];

      const computed: SectorData[] = SECTORS.map((sector) => {
        const assetFlows: AssetFlow[] = [];

        for (const asset of sector.assets) {
          const sym = `${asset}USDT`;
          const ticker = tickerMap.get(sym);
          if (!ticker) continue;
          const funding = fundingMap.get(sym) ?? 0;
          assetFlows.push(calcAssetScore(ticker, funding));
        }

        if (assetFlows.length === 0) {
          return {
            id: sector.id,
            name: sector.name,
            score: 50,
            direction: "NEUTRO" as const,
            totalVolume: 0,
            avgFunding: 0,
            topAssets: [],
            assets: [],
            rank: 0,
          };
        }

        const avgScore = Math.round(
          assetFlows.reduce((s, a) => s + a.score, 0) / assetFlows.length,
        );
        const direction = scoreToDirection(avgScore);
        const totalVolume = assetFlows.reduce((s, a) => s + a.volume, 0);
        const avgFunding =
          assetFlows.reduce((s, a) => s + a.fundingRate, 0) / assetFlows.length;
        const topAssets = [...assetFlows]
          .sort(
            (a, b) => Math.abs(b.priceChangePct) - Math.abs(a.priceChangePct),
          )
          .slice(0, 2);

        // Detect changes
        const prev = prevScores.current[sector.id];
        if (prev) {
          const scoreDelta = Math.abs(avgScore - prev.score);
          if (prev.direction !== direction || scoreDelta > 15) {
            newAlerts.push({
              id: `${sector.id}-${Date.now()}`,
              sectorName: sector.name,
              newDirection: direction,
              prevDirection: prev.direction,
              scoreDelta,
              timestamp: Date.now(),
            });
          }
        }

        prevScores.current[sector.id] = { score: avgScore, direction };

        return {
          id: sector.id,
          name: sector.name,
          score: avgScore,
          direction,
          totalVolume,
          avgFunding,
          topAssets,
          assets: assetFlows,
          rank: 0,
        };
      });

      // Sort and assign rank
      computed.sort((a, b) => b.score - a.score);
      computed.forEach((s, i) => {
        s.rank = i + 1;
      });

      setSectors(computed);
      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 10));
      }
      setLastUpdate(new Date());
    } catch (err) {
      console.error("SectorFlow fetch error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndCompute();
    const interval = setInterval(fetchAndCompute, 60_000);
    return () => clearInterval(interval);
  }, [fetchAndCompute]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    sectors,
    alerts,
    loading,
    lastUpdate,
    dismissAlert,
    refresh: fetchAndCompute,
  };
}

// ─── Alert Banner Component ─────────────────────────────────────────────────
function AlertBanner({
  alerts,
  onDismiss,
}: { alerts: FlowAlert[]; onDismiss: (id: string) => void }) {
  // Auto-dismiss after 10s
  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    const timer = setTimeout(() => onDismiss(latest.id), 10_000);
    return () => clearTimeout(timer);
  }, [alerts, onDismiss]);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid #EF4444",
              boxShadow:
                "0 0 20px rgba(239,68,68,0.2), inset 0 0 20px rgba(239,68,68,0.03)",
              animation: "pulse-border 2s ease-in-out infinite",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ color: "#F59E0B" }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: "#F59E0B" }}
              >
                🚨 {alert.sectorName}:
              </span>
              <span className="text-sm" style={{ color: "#E2E8F0" }}>
                Mudança de fluxo →{" "}
                <span
                  style={{
                    color:
                      alert.newDirection === "INFLOW"
                        ? "#22C55E"
                        : alert.newDirection === "OUTFLOW"
                          ? "#EF4444"
                          : "#9AA7B6",
                    fontWeight: 700,
                  }}
                >
                  {alert.newDirection}
                </span>
                {alert.scoreDelta > 15 && (
                  <span style={{ color: "#9AA7B6", fontSize: "0.75rem" }}>
                    {" "}
                    (Δ{alert.scoreDelta} pts)
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(alert.id)}
              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
              style={{ color: "#9AA7B6" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Sector Card ─────────────────────────────────────────────────────────────
function SectorCard({ sector }: { sector: SectorData }) {
  const SectorIcon = SECTORS.find((s) => s.id === sector.id)?.icon ?? Globe;

  const dirColor =
    sector.direction === "INFLOW"
      ? "#22C55E"
      : sector.direction === "OUTFLOW"
        ? "#EF4444"
        : "#9AA7B6";

  const barGradient =
    sector.direction === "INFLOW"
      ? "linear-gradient(90deg, #16A34A, #22C55E)"
      : sector.direction === "OUTFLOW"
        ? "linear-gradient(90deg, #991B1B, #EF4444)"
        : "linear-gradient(90deg, #374151, #6B7280)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "#0D1520",
        border: `1px solid ${sector.direction === "INFLOW" ? "rgba(34,197,94,0.25)" : sector.direction === "OUTFLOW" ? "rgba(239,68,68,0.25)" : "#1F2A3A"}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `${dirColor}18`,
              border: `1px solid ${dirColor}44`,
            }}
          >
            <SectorIcon className="w-4 h-4" style={{ color: dirColor }} />
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#E2E8F0" }}>
              {sector.name}
            </div>
            <div className="text-xs" style={{ color: "#9AA7B6" }}>
              {sector.assets.length} ativos
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${dirColor}20`,
              color: dirColor,
              border: `1px solid ${dirColor}40`,
            }}
          >
            {sector.direction}
          </span>
          <span
            className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "#1F2A3A", color: "#9AA7B6" }}
          >
            #{sector.rank}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Intensidade
          </span>
          <span className="text-sm font-bold" style={{ color: dirColor }}>
            {sector.score}
          </span>
        </div>
        <div
          className="w-full h-2 rounded-full"
          style={{ background: "#1F2A3A" }}
        >
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{ width: `${sector.score}%`, background: barGradient }}
          />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2" style={{ background: "#070B10" }}>
          <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
            Volume 24h
          </div>
          <div className="text-sm font-semibold" style={{ color: "#22D3EE" }}>
            {formatVolume(sector.totalVolume)}
          </div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "#070B10" }}>
          <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
            Funding Médio
          </div>
          <div
            className="text-sm font-semibold"
            style={{
              color:
                sector.avgFunding <= -0.0001
                  ? "#22C55E"
                  : sector.avgFunding >= 0.0001
                    ? "#EF4444"
                    : "#9AA7B6",
            }}
          >
            {(sector.avgFunding * 100).toFixed(4)}%
          </div>
        </div>
      </div>

      {/* Top assets */}
      {sector.topAssets.length > 0 && (
        <div className="space-y-1">
          {sector.topAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="flex items-center justify-between"
            >
              <span className="text-xs font-mono" style={{ color: "#9AA7B6" }}>
                {asset.symbol}
              </span>
              <div className="flex items-center gap-1">
                {asset.priceChangePct >= 0 ? (
                  <ArrowUp className="w-3 h-3" style={{ color: "#22C55E" }} />
                ) : (
                  <ArrowDown className="w-3 h-3" style={{ color: "#EF4444" }} />
                )}
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: asset.priceChangePct >= 0 ? "#22C55E" : "#EF4444",
                  }}
                >
                  {asset.priceChangePct >= 0 ? "+" : ""}
                  {asset.priceChangePct.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Monthly Cycle Panel ─────────────────────────────────────────────────────
function MonthlyCycleCard() {
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const isFirstHalf = day <= 15;
  const progress = isFirstHalf
    ? ((day - 1) / 14) * 100
    : ((day - 16) / (daysInMonth - 15)) * 100;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#0D1520", border: "1px solid #1F2A3A" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4" style={{ color: "#22D3EE" }} />
        <span className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
          Ciclo Mensal
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full ml-auto"
          style={{ background: "rgba(34,211,238,0.1)", color: "#22D3EE" }}
        >
          Dia {day}/{daysInMonth}
        </span>
      </div>

      <div
        className="text-base font-bold mb-1"
        style={{ color: isFirstHalf ? "#22C55E" : "#F59E0B" }}
      >
        {isFirstHalf ? "1ª Quinzena" : "2ª Quinzena"} (dias{" "}
        {isFirstHalf ? "1-15" : "16-31"})
      </div>
      <div className="text-sm mb-3" style={{ color: "#9AA7B6" }}>
        {isFirstHalf
          ? "Padrão histórico: influxo forte — instituições posicionando."
          : "Padrão histórico: retração/consolidação — realização de lucros."}
      </div>

      <div>
        <div
          className="flex justify-between text-xs mb-1"
          style={{ color: "#9AA7B6" }}
        >
          <span>Início</span>
          <span>{Math.round(progress)}% da quinzena</span>
          <span>Fim</span>
        </div>
        <div
          className="w-full h-2 rounded-full"
          style={{ background: "#1F2A3A" }}
        >
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: isFirstHalf
                ? "linear-gradient(90deg, #16A34A, #22C55E)"
                : "linear-gradient(90deg, #B45309, #F59E0B)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sessions Card ────────────────────────────────────────────────────────────
function SessionsCard() {
  const [utcTime, setUtcTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setUtcTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  const h = utcTime.getUTCHours();
  const m = utcTime.getUTCMinutes();
  const s = utcTime.getUTCSeconds();

  const hasInstitutionalWindow = SESSIONS.some((sess) => {
    const startMin =
      sess.startH * 60 + ("startM" in sess ? ((sess as any).startM ?? 0) : 0);
    const nowMin = h * 60 + m;
    return nowMin < startMin && startMin - nowMin <= 30;
  });

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#0D1520", border: "1px solid #1F2A3A" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4" style={{ color: "#22D3EE" }} />
        <span className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
          Sessões de Mercado
        </span>
        <span
          className="text-xs font-mono ml-auto"
          style={{ color: "#22D3EE" }}
        >
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:
          {String(s).padStart(2, "0")} UTC
        </span>
      </div>

      {hasInstitutionalWindow && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3"
          style={{
            background: "rgba(245,158,11,0.1)",
            border: "1px solid #F59E0B",
            boxShadow: "0 0 12px rgba(245,158,11,0.2)",
          }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
          <span className="text-xs font-bold" style={{ color: "#F59E0B" }}>
            ⚡ Janela Institucional — abertura em &lt;30min
          </span>
        </div>
      )}

      <div className="space-y-2">
        {SESSIONS.map((sess) => {
          const status = getSessionStatus(h, m, sess);
          const statusColor =
            status === "ATIVA"
              ? "#22C55E"
              : status === "PRÓXIMA"
                ? "#F59E0B"
                : "#4B5563";
          const startLabel = `${String(sess.startH).padStart(2, "0")}:${String("startM" in sess ? ((sess as any).startM ?? 0) : 0).padStart(2, "0")}`;
          const endLabel = `${String(sess.endH).padStart(2, "0")}:${String("endM" in sess ? ((sess as any).endM ?? 0) : 0).padStart(2, "0")}`;

          return (
            <div
              key={sess.name}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{
                background:
                  status === "ATIVA" ? "rgba(34,197,94,0.06)" : "#070B10",
                border: `1px solid ${status === "ATIVA" ? "rgba(34,197,94,0.3)" : "#1F2A3A"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{sess.emoji}</span>
                <span className="text-sm" style={{ color: "#E2E8F0" }}>
                  {sess.name}
                </span>
                <span className="text-xs" style={{ color: "#4B5563" }}>
                  {startLabel}–{endLabel} UTC
                </span>
              </div>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${statusColor}20`, color: statusColor }}
              >
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Flow Summary Bar ─────────────────────────────────────────────────────────
function FlowSummaryBar({ sectors }: { sectors: SectorData[] }) {
  const inflow = sectors.filter((s) => s.direction === "INFLOW").length;
  const outflow = sectors.filter((s) => s.direction === "OUTFLOW").length;
  const neutro = sectors.filter((s) => s.direction === "NEUTRO").length;
  const total = sectors.length || 1;

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "#0D1520", border: "1px solid #1F2A3A" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4" style={{ color: "#22D3EE" }} />
          <span className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
            Panorama de Fluxo — {sectors.length} Setores
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: "#22C55E" }}>▲ {inflow} INFLOW</span>
          <span style={{ color: "#EF4444" }}>▼ {outflow} OUTFLOW</span>
          <span style={{ color: "#9AA7B6" }}>— {neutro} NEUTRO</span>
        </div>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {inflow > 0 && (
          <div
            style={{
              width: `${(inflow / total) * 100}%`,
              background: "linear-gradient(90deg, #16A34A, #22C55E)",
              transition: "width 0.7s ease",
            }}
          />
        )}
        {neutro > 0 && (
          <div
            style={{
              width: `${(neutro / total) * 100}%`,
              background: "#374151",
              transition: "width 0.7s ease",
            }}
          />
        )}
        {outflow > 0 && (
          <div
            style={{
              width: `${(outflow / total) * 100}%`,
              background: "linear-gradient(90deg, #991B1B, #EF4444)",
              transition: "width 0.7s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SectorFlowTab() {
  const { sectors, alerts, loading, lastUpdate, dismissAlert, refresh } =
    useSectorFlow();

  return (
    <div className="space-y-4 pb-8">
      {/* Alert Banner */}
      <AlertBanner alerts={alerts} onDismiss={dismissAlert} />

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#E2E8F0" }}>
            Fluxo de Capital por Setor
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#9AA7B6" }}>
            Binance USD-M Futuros Perpétuos — atualiza a cada 60s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            style={{ border: "1px solid #1F2A3A" }}
            disabled={loading}
            data-ocid="setores.refresh.button"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              style={{ color: "#22D3EE" }}
            />
          </button>
        </div>
      </div>

      {/* Flow Summary */}
      {sectors.length > 0 && <FlowSummaryBar sectors={sectors} />}

      {/* Loading state */}
      {loading && sectors.length === 0 && (
        <div
          className="flex items-center justify-center py-20"
          data-ocid="setores.loading_state"
        >
          <div className="text-center">
            <RefreshCw
              className="w-8 h-8 animate-spin mx-auto mb-3"
              style={{ color: "#22D3EE" }}
            />
            <p className="text-sm" style={{ color: "#9AA7B6" }}>
              Carregando dados de fluxo...
            </p>
          </div>
        </div>
      )}

      {/* Sector Cards Grid */}
      {sectors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectors.map((sector) => (
            <SectorCard key={sector.id} sector={sector} />
          ))}
        </div>
      )}

      {/* Patterns Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <MonthlyCycleCard />
        <SessionsCard />
      </div>

      {/* Legend */}
      <div
        className="rounded-xl p-4"
        style={{ background: "#0D1520", border: "1px solid #1F2A3A" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#22D3EE" }} />
          <span className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
            Como interpretar
          </span>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
          style={{ color: "#9AA7B6" }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "#22C55E" }}>▲</span>
            <span>
              <strong style={{ color: "#22C55E" }}>INFLOW (≥55)</strong> —
              capital entrando no setor: preço subindo, compradores agressivos
              dominando, funding negativo (posição de smart money).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span style={{ color: "#9AA7B6" }}>—</span>
            <span>
              <strong style={{ color: "#9AA7B6" }}>NEUTRO (45–55)</strong> —
              capital sem direção definida: mercado em indecisão ou acumulação
              silenciosa.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span style={{ color: "#EF4444" }}>▼</span>
            <span>
              <strong style={{ color: "#EF4444" }}>OUTFLOW (≤45)</strong> —
              capital saindo do setor: queda de preço, vendedores dominando,
              distribuição institucional.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
