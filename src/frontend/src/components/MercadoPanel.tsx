import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Bitcoin,
  Flame,
  MinusCircle,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MercadoPanelProps {
  isActive: boolean;
  btcSMCPhase?: string;
}

interface Ticker {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
  quoteVolume: string;
  volume: string;
}

interface PremiumIndex {
  symbol: string;
  lastFundingRate: string;
  markPrice: string;
}

interface FngResponse {
  data: Array<{ value: string; value_classification: string }>;
}

interface ProcessedTicker {
  symbol: string;
  pct: number;
  price: number;
  quoteVolume: number;
}

interface SectorData {
  name: string;
  avgPct: number;
  totalVolume: number;
  tokens: Array<{ symbol: string; pct: number }>;
}

interface Opportunity {
  icon: string;
  title: string;
  asset: string;
  reason: string;
}

interface Risk {
  severity: "high" | "medium";
  title: string;
  description: string;
}

interface FullAnalysis {
  sentimentLabel: "ALTISTA" | "BAIXISTA" | "NEUTRO";
  sentimentScore: number;
  sentimentColor: string;
  sentimentGlow: string;
  confidence: number;
  fngValue: number;
  fngLabel: string;
  btcDominanceMode: string;
  btcVolumeShare: number;
  sectors: SectorData[];
  narrative: string[];
  opportunities: Opportunity[];
  risks: Risk[];
  gainers: ProcessedTicker[];
  losers: ProcessedTicker[];
  topVolume: ProcessedTicker[];
  fetchedAt: Date;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PANEL = {
  background: "#0F1622",
  border: "1px solid #1F2A3A",
  borderRadius: "12px",
  padding: "16px",
};

const REFRESH_INTERVAL = 60;

const SECTOR_MAP: Record<string, string> = {
  BTC: "Layer 1",
  ETH: "Layer 1",
  SOL: "Layer 1",
  AVAX: "Layer 1",
  NEAR: "Layer 1",
  ATOM: "Layer 1",
  DOT: "Layer 1",
  ADA: "Layer 1",
  TRX: "Layer 1",
  SUI: "Layer 1",
  APT: "Layer 1",
  SEI: "Layer 1",
  INJ: "Layer 1",
  MATIC: "Layer 2",
  OP: "Layer 2",
  ARB: "Layer 2",
  IMX: "Layer 2",
  ZK: "Layer 2",
  STRK: "Layer 2",
  MANTA: "Layer 2",
  BLAST: "Layer 2",
  SCROLL: "Layer 2",
  AAVE: "DeFi",
  UNI: "DeFi",
  CRV: "DeFi",
  SUSHI: "DeFi",
  BAL: "DeFi",
  COMP: "DeFi",
  MKR: "DeFi",
  SNX: "DeFi",
  LDO: "DeFi",
  RPL: "DeFi",
  PENDLE: "DeFi",
  GMX: "DeFi",
  DOGE: "Meme",
  SHIB: "Meme",
  PEPE: "Meme",
  FLOKI: "Meme",
  BONK: "Meme",
  WIF: "Meme",
  MEME: "Meme",
  BOME: "Meme",
  FET: "IA",
  AGIX: "IA",
  OCEAN: "IA",
  RENDER: "IA",
  WLD: "IA",
  TAO: "IA",
  ALT: "IA",
  ARKM: "IA",
  GRT: "IA",
  AXS: "Gaming",
  SAND: "Gaming",
  MANA: "Gaming",
  GALA: "Gaming",
  ILV: "Gaming",
  ENJ: "Gaming",
  GODS: "Gaming",
  RON: "Gaming",
  BEAM: "Gaming",
  WBTC: "BTC Derivados",
  HBTC: "BTC Derivados",
  LBTC: "BTC Derivados",
};

const SECTOR_COLORS: Record<string, string> = {
  "Layer 1": "#22D3EE",
  "Layer 2": "#A855F7",
  DeFi: "#00FF88",
  Meme: "#F59E0B",
  IA: "#FF3366",
  Gaming: "#F97316",
  "BTC Derivados": "#F59E0B",
};

// ─── Action Phrase Config ──────────────────────────────────────────────────

const ACTION_PHRASE: Record<
  "ALTISTA" | "BAIXISTA" | "NEUTRO",
  {
    label: string;
    description: string;
    color: string;
    rgbValues: string;
    Icon: React.ElementType;
  }
> = {
  BAIXISTA: {
    label: "Hora de Pensar em Comprar",
    description:
      "Momentos de correções de baixa, retoques e retestes em fundos duplos, zonas de suporte e áreas de grandes liquidações.",
    color: "#00FF88",
    rgbValues: "0,255,136",
    Icon: ShoppingCart,
  },
  NEUTRO: {
    label: "Não Faça Nada",
    description:
      "Momentos de indecisão, ativo já em movimento buscando alvos, liquidações em curso ou movimentos já definidos.",
    color: "#22D3EE",
    rgbValues: "34,211,238",
    Icon: MinusCircle,
  },
  ALTISTA: {
    label: "Hora de Pensar em Vender",
    description:
      "Topos duplos, áreas de grandes liquidações de posições short, vendas institucionais, topos históricos e resistências.",
    color: "#FF3366",
    rgbValues: "255,51,102",
    Icon: TrendingDown,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function isPerp(symbol: string): boolean {
  if (!symbol.endsWith("USDT")) return false;
  if (symbol.includes("_")) return false;
  return true;
}

function fmtSymbol(symbol: string): string {
  return symbol.replace("USDT", "");
}

// ─── Analysis Engine ───────────────────────────────────────────────────────

function generateFullAnalysis(
  tickers: Ticker[],
  funding: PremiumIndex[],
  fngValue: number,
  fngLabel: string,
  btcSMCPhase?: string,
): FullAnalysis {
  const filtered: ProcessedTicker[] = tickers
    .filter(
      (t) => isPerp(t.symbol) && Number.parseFloat(t.quoteVolume) >= 5_000_000,
    )
    .map((t) => ({
      symbol: t.symbol,
      pct: Number.parseFloat(t.priceChangePercent),
      price: Number.parseFloat(t.lastPrice),
      quoteVolume: Number.parseFloat(t.quoteVolume),
    }));

  const gainers = [...filtered]
    .sort((a, b) => b.pct - a.pct)
    .filter((t) => t.pct > 0 && t.pct <= 50)
    .slice(0, 5);
  const losers = [...filtered]
    .sort((a, b) => a.pct - b.pct)
    .filter((t) => t.pct < 0)
    .slice(0, 5);
  const topVolume = [...filtered]
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 6);

  const fundingFiltered = funding.filter((f) => isPerp(f.symbol));
  const avgFunding =
    fundingFiltered.reduce(
      (s, f) => s + Number.parseFloat(f.lastFundingRate) * 100,
      0,
    ) / (fundingFiltered.length || 1);

  const btcTicker = filtered.find((t) => t.symbol === "BTCUSDT");
  const btcPct = btcTicker?.pct ?? 0;
  const totalVolume = filtered.reduce((s, t) => s + t.quoteVolume, 0);
  const btcVolumeShare =
    ((btcTicker?.quoteVolume ?? 0) / (totalVolume || 1)) * 100;

  const gainerCount = filtered.filter((t) => t.pct > 0).length;
  const loserCount = filtered.filter((t) => t.pct < 0).length;

  // ── Sentiment Score ──────────────────────────────────────────────────────
  const gainerRatio = gainerCount / (gainerCount + loserCount || 1);
  const gainersScore = gainerRatio * 40;
  const fundingScore = avgFunding > 0.01 ? 20 : avgFunding < -0.01 ? 0 : 10;
  const btcScore = btcPct > 0 ? 20 : btcPct < 0 ? 0 : 10;
  const fngScore = (fngValue / 100) * 20;
  const sentimentScore = gainersScore + fundingScore + btcScore + fngScore;

  let sentimentLabel: "ALTISTA" | "BAIXISTA" | "NEUTRO";
  let sentimentColor: string;
  let sentimentGlow: string;
  if (sentimentScore > 60) {
    sentimentLabel = "ALTISTA";
    sentimentColor = "#00FF88";
    sentimentGlow =
      "0 0 40px rgba(0,255,136,0.4), 0 0 80px rgba(0,255,136,0.15)";
  } else if (sentimentScore < 40) {
    sentimentLabel = "BAIXISTA";
    sentimentColor = "#FF3366";
    sentimentGlow =
      "0 0 40px rgba(255,51,102,0.4), 0 0 80px rgba(255,51,102,0.15)";
  } else {
    sentimentLabel = "NEUTRO";
    sentimentColor = "#22D3EE";
    sentimentGlow =
      "0 0 40px rgba(34,211,238,0.4), 0 0 80px rgba(34,211,238,0.15)";
  }
  const confidence = Math.min(
    100,
    Math.round(Math.abs(sentimentScore - 50) * 2),
  );

  // ── BTC Dominance ────────────────────────────────────────────────────────
  let btcDominanceMode: string;
  if (btcVolumeShare > 30 && btcPct > 0) {
    btcDominanceMode =
      "Modo Risk-On — BTC liderando, capital migrando para alts possível";
  } else if (btcVolumeShare > 30 && btcPct < 0) {
    btcDominanceMode = "Modo Risk-Off — BTC caindo arrasta todo o mercado";
  } else if (btcVolumeShare < 20) {
    btcDominanceMode = "Altseason em curso — capital fluindo para alts";
  } else {
    btcDominanceMode =
      "Mercado equilibrado — BTC neutro, alts operando por conta própria";
  }

  // ── Sectors ──────────────────────────────────────────────────────────────
  const sectorBuckets: Record<
    string,
    {
      pcts: number[];
      volume: number;
      tokens: Array<{ symbol: string; pct: number }>;
    }
  > = {};
  for (const t of filtered) {
    const base = fmtSymbol(t.symbol);
    const sector = SECTOR_MAP[base];
    if (!sector) continue;
    if (!sectorBuckets[sector])
      sectorBuckets[sector] = { pcts: [], volume: 0, tokens: [] };
    if (t.pct <= 50) sectorBuckets[sector].pcts.push(t.pct);
    sectorBuckets[sector].volume += t.quoteVolume;
    if (t.pct <= 50)
      sectorBuckets[sector].tokens.push({ symbol: base, pct: t.pct });
  }
  const sectors: SectorData[] = Object.entries(sectorBuckets)
    .map(([name, d]) => ({
      name,
      avgPct: d.pcts.reduce((s, p) => s + p, 0) / (d.pcts.length || 1),
      totalVolume: d.volume,
      tokens: [...d.tokens].sort((a, b) => b.pct - a.pct).slice(0, 3),
    }))
    .sort((a, b) => b.avgPct - a.avgPct)
    .slice(0, 3);

  // ── Narrative ────────────────────────────────────────────────────────────
  const btcDir = btcPct > 1 ? "alta" : btcPct < -1 ? "queda" : "lateralização";
  const fundingBias =
    avgFunding > 0.01
      ? "viés comprador predominante"
      : avgFunding < -0.01
        ? "viés vendedor predominante"
        : "equilíbrio entre comprados e vendidos";
  const momentum =
    gainerCount > loserCount * 1.5
      ? "risk-on"
      : gainerCount * 1.5 < loserCount
        ? "risk-off"
        : "neutro";
  const breadthPct = Math.round(
    (gainerCount / (gainerCount + loserCount || 1)) * 100,
  );

  const fundingEndNote =
    avgFunding > 0.03
      ? "nível elevado que sinaliza alavancagem excessiva em longs."
      : avgFunding < -0.01
        ? "pressão vendedora acima do normal."
        : "mercado sem desequilíbrio significativo de alavancagem.";
  const smcPhaseContext =
    btcSMCPhase === "Acumulação"
      ? "Instituições absorvendo liquidez. Movimento direcional esperado após compressão."
      : btcSMCPhase === "Manipulação"
        ? "Stop hunts ativos. Aguardar confirmação de direção antes de entrar."
        : btcSMCPhase === "Distribuição Alta"
          ? "Capital fluindo para cima. Altcoins alinhadas com BTC têm maior probabilidade de continuidade."
          : btcSMCPhase === "Distribuição Baixa"
            ? "Pressão vendedora institucional. Priorizar gestão de risco."
            : null;

  const narrative: string[] = [
    ...(smcPhaseContext
      ? [`BTC encontra-se em fase de ${btcSMCPhase} — ${smcPhaseContext}`]
      : []),
    `O Bitcoin opera em ${btcDir} de ${Math.abs(btcPct).toFixed(2)}% nas últimas 24h, concentrando ${btcVolumeShare.toFixed(1)}% do volume total do mercado de futuros. As taxas de financiamento sugerem ${fundingBias}, com média de ${avgFunding.toFixed(4)}% — ${fundingEndNote}`,
    `A amplitude do mercado indica ${breadthPct}% dos ativos em alta frente a ${100 - breadthPct}% em queda. O índice Fear & Greed está em ${fngValue} (${fngLabel}), refletindo o sentimento geral como ${sentimentLabel.toLowerCase()}. O sentimento composto aponta para um ambiente ${momentum}, com score de ${sentimentScore.toFixed(0)}/100.`,
    sectors.length > 0
      ? `Os setores com melhor desempenho são: ${sectors.map((s) => `${s.name} (${s.avgPct > 0 ? "+" : ""}${s.avgPct.toFixed(2)}%)`).join(", ")}. Institucionalmente, a ${btcDominanceMode.toLowerCase()}. Monitore rotações de capital entre setores para identificar oportunidades de curto prazo.`
      : `O fluxo institucional sugere ${btcDominanceMode.toLowerCase()}. Acompanhe os setores com maior volume para antecipar movimentos.`,
  ];

  // ── Opportunities ────────────────────────────────────────────────────────
  const opportunities: Opportunity[] = [];

  const squeezeCandidates = fundingFiltered
    .filter((f) => Number.parseFloat(f.lastFundingRate) * 100 < -0.01)
    .sort(
      (a, b) =>
        Number.parseFloat(a.lastFundingRate) -
        Number.parseFloat(b.lastFundingRate),
    )
    .slice(0, 2);
  for (const f of squeezeCandidates) {
    opportunities.push({
      icon: "💰",
      title: "Squeeze de Shorts",
      asset: fmtSymbol(f.symbol),
      reason: `Funding negativo (${(Number.parseFloat(f.lastFundingRate) * 100).toFixed(4)}%) — shorts estão pagando, potencial para squeeze de alta.`,
    });
  }

  if (gainers.length > 0 && gainers[0].pct > 5) {
    opportunities.push({
      icon: "🚀",
      title: "Momentum Forte",
      asset: fmtSymbol(gainers[0].symbol),
      reason: `Alta de +${gainers[0].pct.toFixed(2)}% com volume elevado — momentum de compra sustentado nas últimas 24h.`,
    });
  }

  if (sectors.length > 0 && sectors[0].avgPct > 3) {
    opportunities.push({
      icon: "🏆",
      title: "Setor em Destaque",
      asset: sectors[0].name,
      reason: `Setor com média de +${sectors[0].avgPct.toFixed(2)}% — rotação de capital favorável. Tokens em alta: ${sectors[0].tokens.map((t) => t.symbol).join(", ")}.`,
    });
  }

  if (btcVolumeShare < 20 && sentimentScore > 55) {
    opportunities.push({
      icon: "🌊",
      title: "Rotação para Alts",
      asset: "Altcoins",
      reason: `BTC representa apenas ${btcVolumeShare.toFixed(1)}% do volume — capital está fluindo para alts em ambiente altista.`,
    });
  }

  // ── Risks ────────────────────────────────────────────────────────────────
  const risks: Risk[] = [];

  if (avgFunding > 0.03) {
    risks.push({
      severity: "high",
      title: "Funding Elevado",
      description: `Média de ${avgFunding.toFixed(4)}% — mercado overlevered em longs. Risco de flush descendente para liquidar posições alavancadas.`,
    });
  }

  if (btcPct < -3) {
    risks.push({
      severity: "high",
      title: "BTC em Queda Forte",
      description: `Bitcoin caiu ${btcPct.toFixed(2)}% nas últimas 24h — risco sistêmico elevado para altcoins. Evite abrir longs sem confirmação de suporte.`,
    });
  }

  if (fngValue > 75) {
    risks.push({
      severity: "medium",
      title: "Ganância Extrema",
      description: `Fear & Greed em ${fngValue} (${fngLabel}) — mercado eufórico e próximo de topo local. Histórico sugere correção iminente.`,
    });
  }

  if (fngValue < 25) {
    risks.push({
      severity: "medium",
      title: "Medo Extremo",
      description: `Fear & Greed em ${fngValue} (${fngLabel}) — possível capitulação em curso. Cuidado com longs; aguarde confirmação de reversão.`,
    });
  }

  if (losers.length > 0 && Math.abs(losers[losers.length - 1]?.pct ?? 0) > 10) {
    const worst = losers[losers.length - 1];
    risks.push({
      severity: "high",
      title: "Ativo em Colapso",
      description: `${fmtSymbol(worst.symbol)} caiu ${worst.pct.toFixed(2)}% — evite exposição, possível evento de desalavancagem ou notícia negativa.`,
    });
  }

  return {
    sentimentLabel,
    sentimentScore,
    sentimentColor,
    sentimentGlow,
    confidence,
    fngValue,
    fngLabel,
    btcDominanceMode,
    btcVolumeShare,
    sectors,
    narrative,
    opportunities,
    risks,
    gainers,
    losers,
    topVolume,
    fetchedAt: new Date(),
  };
}

// ─── Skeleton Components ───────────────────────────────────────────────────

function SkeletonRow({ id }: { id: string }) {
  return (
    <div key={id} className="flex items-center justify-between py-2">
      <div
        className="h-4 rounded animate-pulse"
        style={{ background: "#1F2A3A", width: "40%" }}
      />
      <div
        className="h-5 rounded animate-pulse"
        style={{ background: "#1F2A3A", width: "20%" }}
      />
    </div>
  );
}

function SkeletonCard({ ids }: { ids: string[] }) {
  return (
    <div style={PANEL}>
      <div
        className="h-4 rounded mb-4 animate-pulse"
        style={{ background: "#1F2A3A", width: "50%" }}
      />
      {ids.map((id) => (
        <SkeletonRow key={id} id={id} />
      ))}
    </div>
  );
}

function AnalyzingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-20 space-y-6"
      data-ocid="market.loading_state"
    >
      {/* Animated pulse ring */}
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.2, 0.8] }}
          transition={{
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="w-20 h-20 rounded-full"
          style={{
            background: "rgba(34,211,238,0.15)",
            border: "2px solid rgba(34,211,238,0.4)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-8 h-8" style={{ color: "#22D3EE" }} />
        </div>
      </div>
      {/* Shimmer text */}
      <div className="text-center space-y-2">
        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
          className="text-lg font-semibold tracking-widest uppercase"
          style={{ color: "#22D3EE" }}
        >
          Analisando mercado...
        </motion.p>
        <p className="text-sm" style={{ color: "#9AA7B6" }}>
          Coletando dados de múltiplas fontes
        </p>
      </div>
      {/* Progress shimmer bar */}
      <div
        className="w-64 h-1.5 rounded-full overflow-hidden"
        style={{ background: "#1F2A3A" }}
      >
        <motion.div
          animate={{ x: ["-100%", "200%"] }}
          transition={{
            duration: 1.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="h-full w-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, #22D3EE, transparent)",
          }}
        />
      </div>
      {/* Data source badges */}
      <div className="flex flex-wrap gap-2 justify-center">
        {["Binance Tickers", "Funding Rates", "Fear & Greed"].map((src, i) => (
          <motion.span
            key={src}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.3 }}
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: "rgba(34,211,238,0.08)",
              border: "1px solid rgba(34,211,238,0.25)",
              color: "#9AA7B6",
            }}
          >
            {src}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function MercadoPanel({ isActive, btcSMCPhase }: MercadoPanelProps) {
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevActiveRef = useRef(false);

  const fetchData = useCallback(
    async (fromTabOpen = false) => {
      if (fromTabOpen) setTabLoading(true);
      else setLoading(true);
      setError(null);
      try {
        const [tickersRes, fundingRes, fngRes] = await Promise.all([
          fetch("https://fapi.binance.com/fapi/v1/ticker/24hr"),
          fetch("https://fapi.binance.com/fapi/v1/premiumIndex"),
          fetch("https://api.alternative.me/fng/?limit=1"),
        ]);

        if (!tickersRes.ok || !fundingRes.ok)
          throw new Error("Falha ao carregar dados da Binance");

        const [tickers, funding, fngData]: [
          Ticker[],
          PremiumIndex[],
          FngResponse,
        ] = await Promise.all([
          tickersRes.json(),
          fundingRes.json(),
          fngRes.json(),
        ]);

        const fngValue = Number.parseInt(fngData?.data?.[0]?.value ?? "50");
        const fngLabel = fngData?.data?.[0]?.value_classification ?? "Neutro";

        const result = generateFullAnalysis(
          tickers,
          funding,
          fngValue,
          fngLabel,
          btcSMCPhase,
        );
        setAnalysis(result);
        setCountdown(REFRESH_INTERVAL);
      } catch (e: any) {
        setError(e.message ?? "Erro desconhecido");
      } finally {
        setLoading(false);
        setTabLoading(false);
      }
    },
    [btcSMCPhase],
  );

  // Initial fetch
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch on tab open
  useEffect(() => {
    if (isActive && !prevActiveRef.current && analysis !== null) {
      fetchData(true);
    }
    prevActiveRef.current = isActive;
  }, [isActive, analysis, fetchData]);

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const isInitialLoading = loading && !analysis;
  const showAnalyzing = tabLoading;

  return (
    <div className="space-y-4 w-full" data-ocid="market.panel">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5" style={{ color: "#22D3EE" }} />
          <h2
            className="text-lg font-bold tracking-wider"
            style={{ color: "#E7EEF8" }}
          >
            Análise de Mercado
          </h2>
          {analysis && !tabLoading && !loading && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(34,211,238,0.1)",
                border: "1px solid rgba(34,211,238,0.25)",
                color: "#9AA7B6",
              }}
            >
              {analysis.fetchedAt.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {analysis && (
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Atualiza em <span style={{ color: "#22D3EE" }}>{countdown}s</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={loading || tabLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.3)",
              color: "#22D3EE",
            }}
            data-ocid="market.primary_button"
          >
            <RefreshCw
              className={`w-3 h-3 ${loading || tabLoading ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl"
            style={{
              background: "rgba(255,51,102,0.1)",
              border: "1px solid rgba(255,51,102,0.3)",
            }}
            data-ocid="market.error_state"
          >
            <AlertCircle
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "#FF3366" }}
            />
            <div className="flex-1">
              <p className="text-sm" style={{ color: "#FF3366" }}>
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchData(true)}
              className="text-xs px-3 py-1 rounded-lg transition-all hover:opacity-80"
              style={{ background: "rgba(255,51,102,0.2)", color: "#FF3366" }}
              data-ocid="market.secondary_button"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading states ── */}
      <AnimatePresence mode="wait">
        {isInitialLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="space-y-4">
              <div style={PANEL}>
                <div
                  className="h-24 rounded animate-pulse"
                  style={{ background: "#1F2A3A" }}
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SkeletonCard ids={["r1", "r2", "r3"]} />
                <SkeletonCard ids={["r1", "r2", "r3"]} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard ids={["r1", "r2", "r3"]} />
                <SkeletonCard ids={["r1", "r2", "r3"]} />
              </div>
            </div>
          </motion.div>
        ) : showAnalyzing ? (
          <motion.div key="analyzing">
            <AnalyzingOverlay />
          </motion.div>
        ) : analysis ? (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* ── Sentiment Banner ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-xl p-5"
              style={{
                background: "#0F1622",
                border: `2px solid ${analysis.sentimentColor}`,
                boxShadow: analysis.sentimentGlow,
              }}
              data-ocid="market.card"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-semibold tracking-widest uppercase"
                        style={{ color: "#9AA7B6" }}
                      >
                        Sentimento do Mercado
                      </span>
                    </div>
                    <div
                      className="text-4xl font-black tracking-widest uppercase"
                      style={{
                        color: analysis.sentimentColor,
                        textShadow: `0 0 20px ${analysis.sentimentColor}60`,
                      }}
                    >
                      {analysis.sentimentLabel}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs" style={{ color: "#9AA7B6" }}>
                        Confiança:
                      </span>
                      <div
                        className="flex-1 w-32 h-1.5 rounded-full overflow-hidden"
                        style={{ background: "#1F2A3A" }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${analysis.confidence}%` }}
                          transition={{
                            delay: 0.4,
                            duration: 0.8,
                            ease: "easeOut",
                          }}
                          className="h-full rounded-full"
                          style={{ background: analysis.sentimentColor }}
                        />
                      </div>
                      <span
                        className="text-xs font-bold"
                        style={{ color: analysis.sentimentColor }}
                      >
                        {analysis.confidence}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {/* Fear & Greed badge */}
                  <div
                    className="flex flex-col items-center px-4 py-3 rounded-xl"
                    style={{
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.25)",
                    }}
                  >
                    <span
                      className="text-2xl font-black"
                      style={{ color: "#F59E0B" }}
                    >
                      {analysis.fngValue}
                    </span>
                    <span className="text-xs" style={{ color: "#9AA7B6" }}>
                      Fear & Greed
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: "#F59E0B" }}
                    >
                      {analysis.fngLabel}
                    </span>
                  </div>
                  {/* Score badge */}
                  <div
                    className="flex flex-col items-center px-4 py-3 rounded-xl"
                    style={{
                      background: `rgba(${analysis.sentimentLabel === "ALTISTA" ? "0,255,136" : analysis.sentimentLabel === "BAIXISTA" ? "255,51,102" : "34,211,238"},0.08)`,
                      border: `1px solid ${analysis.sentimentColor}40`,
                    }}
                  >
                    <span
                      className="text-2xl font-black"
                      style={{ color: analysis.sentimentColor }}
                    >
                      {analysis.sentimentScore.toFixed(0)}
                    </span>
                    <span className="text-xs" style={{ color: "#9AA7B6" }}>
                      Score
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: analysis.sentimentColor }}
                    >
                      / 100
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Action Phrase ── */}
              {(() => {
                const phrase = ACTION_PHRASE[analysis.sentimentLabel];
                const { Icon } = phrase;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
                    className="mt-4 rounded-lg px-4 py-3 flex items-start gap-3"
                    style={{
                      borderTop: "1px solid #1F2A3A",
                      paddingTop: "16px",
                      marginTop: "16px",
                      background: `rgba(${phrase.rgbValues},0.06)`,
                      borderLeft: `3px solid ${phrase.color}`,
                    }}
                    data-ocid="market.panel"
                  >
                    <div
                      className="mt-0.5 flex-shrink-0 p-1.5 rounded-lg"
                      style={{ background: `rgba(${phrase.rgbValues},0.12)` }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: phrase.color }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span
                        className="text-sm font-black tracking-wide uppercase"
                        style={{
                          color: phrase.color,
                          textShadow: `0 0 12px ${phrase.color}50`,
                        }}
                      >
                        {phrase.label}
                      </span>
                      <span
                        className="text-xs leading-relaxed"
                        style={{ color: "#9AA7B6" }}
                      >
                        {phrase.description}
                      </span>
                    </div>
                  </motion.div>
                );
              })()}
            </motion.div>

            {/* ── Contexto + Dominância + Setores ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Contexto Geral */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-3 rounded-xl p-4"
                style={{ background: "#0F1622", border: "1px solid #1F2A3A" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4" style={{ color: "#22D3EE" }} />
                  <span
                    className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "#22D3EE" }}
                  >
                    Contexto Geral
                  </span>
                </div>
                <div className="space-y-3">
                  {analysis.narrative.map((para, i) => (
                    <motion.p
                      key={para.slice(0, 30)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.08 }}
                      className="text-sm leading-relaxed"
                      style={{ color: i === 0 ? "#E7EEF8" : "#9AA7B6" }}
                    >
                      {para}
                    </motion.p>
                  ))}
                </div>
              </motion.div>

              {/* Right column: BTC Dominância + Setores */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* BTC Dominância */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="rounded-xl p-4"
                  style={{ background: "#0F1622", border: "1px solid #1F2A3A" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Bitcoin className="w-4 h-4" style={{ color: "#F59E0B" }} />
                    <span
                      className="text-xs font-semibold tracking-widest uppercase"
                      style={{ color: "#F59E0B" }}
                    >
                      Dominância BTC
                    </span>
                  </div>
                  <div
                    className="text-xs leading-relaxed font-medium mb-3 px-3 py-2 rounded-lg"
                    style={{
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.2)",
                      color: "#E7EEF8",
                    }}
                  >
                    {analysis.btcDominanceMode}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "#9AA7B6" }}>
                      Volume BTC:
                    </span>
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "#1F2A3A" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, analysis.btcVolumeShare)}%`,
                        }}
                        transition={{
                          delay: 0.5,
                          duration: 0.7,
                          ease: "easeOut",
                        }}
                        className="h-full rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, #F59E0B, #F59E0B80)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-bold"
                      style={{ color: "#F59E0B" }}
                    >
                      {analysis.btcVolumeShare.toFixed(1)}%
                    </span>
                  </div>
                </motion.div>

                {/* Setores */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-xl p-4"
                  style={{ background: "#0F1622", border: "1px solid #1F2A3A" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="w-4 h-4" style={{ color: "#F97316" }} />
                    <span
                      className="text-xs font-semibold tracking-widest uppercase"
                      style={{ color: "#F97316" }}
                    >
                      Setores em Destaque
                    </span>
                  </div>
                  <div className="space-y-2">
                    {analysis.sectors.length === 0 ? (
                      <p className="text-xs" style={{ color: "#9AA7B6" }}>
                        Dados insuficientes para mapeamento setorial.
                      </p>
                    ) : (
                      analysis.sectors.map((sector, i) => {
                        const sectorColor =
                          SECTOR_COLORS[sector.name] ?? "#22D3EE";
                        return (
                          <motion.div
                            key={sector.name}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.25 + i * 0.08 }}
                            className="rounded-lg p-2.5 pl-3"
                            style={{
                              background: `rgba(${sectorColor === "#22D3EE" ? "34,211,238" : sectorColor === "#A855F7" ? "168,85,247" : sectorColor === "#00FF88" ? "0,255,136" : sectorColor === "#F59E0B" ? "245,158,11" : sectorColor === "#FF3366" ? "255,51,102" : "249,115,22"},0.06)`,
                              borderLeft: `3px solid ${sectorColor}`,
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className="text-xs font-bold"
                                style={{ color: sectorColor }}
                              >
                                {sector.name}
                              </span>
                              <span
                                className="text-xs font-bold"
                                style={{
                                  color:
                                    sector.avgPct >= 0 ? "#00FF88" : "#FF3366",
                                }}
                              >
                                {sector.avgPct >= 0 ? "+" : ""}
                                {sector.avgPct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {sector.tokens.map((t) => (
                                <span
                                  key={t.symbol}
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "rgba(255,255,255,0.05)",
                                    color: t.pct >= 0 ? "#00FF88" : "#FF3366",
                                  }}
                                >
                                  {t.symbol} {t.pct >= 0 ? "+" : ""}
                                  {t.pct.toFixed(1)}%
                                </span>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              </div>
            </div>

            {/* ── Oportunidades + Riscos ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Oportunidades */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="rounded-xl p-4"
                style={{ background: "#0F1622", border: "1px solid #1F2A3A" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp
                    className="w-4 h-4"
                    style={{ color: "#00FF88" }}
                  />
                  <span
                    className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "#00FF88" }}
                  >
                    Oportunidades do Momento
                  </span>
                </div>
                <div className="space-y-2">
                  {analysis.opportunities.length === 0 ? (
                    <p className="text-xs" style={{ color: "#9AA7B6" }}>
                      Nenhuma oportunidade clara identificada no momento.
                    </p>
                  ) : (
                    analysis.opportunities.map((opp, i) => (
                      <motion.div
                        key={opp.title + opp.asset}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.07 }}
                        className="rounded-lg p-3"
                        style={{
                          background: "rgba(0,255,136,0.04)",
                          borderLeft: "3px solid #00FF88",
                        }}
                        data-ocid={`market.item.${i + 1}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">{opp.icon}</span>
                          <span
                            className="text-xs font-bold"
                            style={{ color: "#00FF88" }}
                          >
                            {opp.title}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-mono"
                            style={{
                              background: "rgba(0,255,136,0.15)",
                              color: "#00FF88",
                            }}
                          >
                            {opp.asset}
                          </span>
                        </div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: "#9AA7B6" }}
                        >
                          {opp.reason}
                        </p>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>

              {/* Riscos */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl p-4"
                style={{ background: "#0F1622", border: "1px solid #1F2A3A" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert
                    className="w-4 h-4"
                    style={{ color: "#FF3366" }}
                  />
                  <span
                    className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "#FF3366" }}
                  >
                    Riscos do Momento
                  </span>
                </div>
                <div className="space-y-2">
                  {analysis.risks.length === 0 ? (
                    <div
                      className="rounded-lg p-3 text-xs"
                      style={{
                        background: "rgba(0,255,136,0.06)",
                        borderLeft: "3px solid #00FF88",
                        color: "#00FF88",
                      }}
                    >
                      ✅ Nenhum risco crítico identificado no momento.
                    </div>
                  ) : (
                    analysis.risks.map((risk, i) => {
                      const riskColor =
                        risk.severity === "high" ? "#FF3366" : "#F59E0B";
                      const riskBg =
                        risk.severity === "high"
                          ? "rgba(255,51,102,0.06)"
                          : "rgba(245,158,11,0.06)";
                      return (
                        <motion.div
                          key={risk.title}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.35 + i * 0.07 }}
                          className="rounded-lg p-3"
                          style={{
                            background: riskBg,
                            borderLeft: `3px solid ${riskColor}`,
                          }}
                          data-ocid={`market.item.${i + 1}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle
                              className="w-3.5 h-3.5"
                              style={{ color: riskColor }}
                            />
                            <span
                              className="text-xs font-bold"
                              style={{ color: riskColor }}
                            >
                              {risk.title}
                            </span>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded uppercase font-bold"
                              style={{
                                background: `${riskColor}20`,
                                color: riskColor,
                                fontSize: "0.6rem",
                              }}
                            >
                              {risk.severity === "high" ? "ALTO" : "MÉDIO"}
                            </span>
                          </div>
                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: "#9AA7B6" }}
                          >
                            {risk.description}
                          </p>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
