import {
  AlertCircle,
  BarChart2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface ProcessedTicker {
  symbol: string;
  pct: number;
  price: number;
  quoteVolume: number;
}

interface FundingItem {
  symbol: string;
  rate: number;
}

interface MarketData {
  gainers: ProcessedTicker[];
  losers: ProcessedTicker[];
  topVolume: ProcessedTicker[];
  fundingPositive: FundingItem[];
  fundingNegative: FundingItem[];
  btcPct: number;
  avgFunding: number;
  gainerCount: number;
  loserCount: number;
  topVolumeAsset: string;
  fetchedAt: Date;
}

const PANEL = {
  background: "#0F1622",
  border: "1px solid #1F2A3A",
  borderRadius: "12px",
  padding: "16px",
};
const REFRESH_INTERVAL = 60;
const SKELETON_ROWS = ["r1", "r2", "r3", "r4", "r5"];
const SKELETON_ROWS_6 = ["r1", "r2", "r3", "r4", "r5", "r6"];
const NARRATIVE_WIDTHS = ["90%", "85%", "60%"] as const;

function isPerp(symbol: string): boolean {
  if (!symbol.endsWith("USDT")) return false;
  if (symbol.includes("_")) return false;
  return true;
}

function fmtSymbol(symbol: string): string {
  return symbol.replace("USDT", "");
}

function fmtVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function generateNarrative(data: MarketData): string {
  const btcDir =
    data.btcPct > 1 ? "alta" : data.btcPct < -1 ? "queda" : "lateralidade";
  const fundingBias =
    data.avgFunding > 0.01
      ? "viés comprador predominante"
      : data.avgFunding < -0.01
        ? "viés vendedor predominante"
        : "equilíbrio entre comprados e vendidos";
  const momentum =
    data.gainerCount > data.loserCount * 1.5
      ? "risk-on"
      : data.gainerCount * 1.5 < data.loserCount
        ? "risk-off"
        : "neutro";

  const sentence1 = `O Bitcoin opera em ${btcDir} de ${Math.abs(data.btcPct).toFixed(1)}% nas últimas 24h, servindo como principal referência direcional para o mercado.`;
  const sentence2 = `As taxas de financiamento indicam ${fundingBias}, com ${data.gainerCount} ativos em alta contra ${data.loserCount} em queda — sentimento geral ${momentum}.`;
  const sentence3 = `O ativo de maior destaque em volume é ${fmtSymbol(data.topVolumeAsset)}, concentrando liquidez significativa e potencial de movimentos expressivos.`;

  return `${sentence1} ${sentence2} ${sentence3}`;
}

function SkeletonRow({ id }: { id: string }) {
  return (
    <div
      key={id}
      className="flex items-center justify-between py-2"
      data-ocid="market.loading_state"
    >
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

export function MercadoPanel() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tickersRes, fundingRes] = await Promise.all([
        fetch("https://fapi.binance.com/fapi/v1/ticker/24hr"),
        fetch("https://fapi.binance.com/fapi/v1/premiumIndex"),
      ]);

      if (!tickersRes.ok || !fundingRes.ok)
        throw new Error("Falha ao carregar dados da Binance");

      const [tickers, funding]: [Ticker[], PremiumIndex[]] = await Promise.all([
        tickersRes.json(),
        fundingRes.json(),
      ]);

      const filtered: ProcessedTicker[] = tickers
        .filter(
          (t) =>
            isPerp(t.symbol) && Number.parseFloat(t.quoteVolume) >= 5_000_000,
        )
        .map((t) => ({
          symbol: t.symbol,
          pct: Number.parseFloat(t.priceChangePercent),
          price: Number.parseFloat(t.lastPrice),
          quoteVolume: Number.parseFloat(t.quoteVolume),
        }));

      const sorted = [...filtered].sort((a, b) => b.pct - a.pct);
      const gainers = sorted.filter((t) => t.pct > 0).slice(0, 5);
      const losers = [...filtered]
        .sort((a, b) => a.pct - b.pct)
        .filter((t) => t.pct < 0)
        .slice(0, 5);
      const topVolume = [...filtered]
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 6);

      const fundingFiltered = funding.filter((f) => isPerp(f.symbol));
      const fundingSorted = [...fundingFiltered].sort(
        (a, b) =>
          Number.parseFloat(b.lastFundingRate) -
          Number.parseFloat(a.lastFundingRate),
      );
      const fundingPositive: FundingItem[] = fundingSorted
        .slice(0, 5)
        .map((f) => ({
          symbol: f.symbol,
          rate: Number.parseFloat(f.lastFundingRate) * 100,
        }));
      const fundingNegative: FundingItem[] = [...fundingFiltered]
        .sort(
          (a, b) =>
            Number.parseFloat(a.lastFundingRate) -
            Number.parseFloat(b.lastFundingRate),
        )
        .slice(0, 5)
        .map((f) => ({
          symbol: f.symbol,
          rate: Number.parseFloat(f.lastFundingRate) * 100,
        }));

      const btcTicker = filtered.find((t) => t.symbol === "BTCUSDT");
      const avgFunding =
        fundingFiltered.reduce(
          (sum, f) => sum + Number.parseFloat(f.lastFundingRate) * 100,
          0,
        ) / (fundingFiltered.length || 1);

      const result: MarketData = {
        gainers,
        losers,
        topVolume,
        fundingPositive,
        fundingNegative,
        btcPct: btcTicker?.pct ?? 0,
        avgFunding,
        gainerCount: filtered.filter((t) => t.pct > 0).length,
        loserCount: filtered.filter((t) => t.pct < 0).length,
        topVolumeAsset: topVolume[0]?.symbol ?? "BTCUSDT",
        fetchedAt: new Date(),
      };

      setData(result);
      setCountdown(REFRESH_INTERVAL);
    } catch (e: any) {
      setError(e.message ?? "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const maxVolume = data?.topVolume[0]?.quoteVolume ?? 1;

  return (
    <div className="space-y-4 w-full" data-ocid="market.panel">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5" style={{ color: "#22D3EE" }} />
          <h2
            className="text-lg font-bold tracking-wider"
            style={{ color: "#E7EEF8" }}
          >
            Análise de Mercado
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              Atualiza em <span style={{ color: "#22D3EE" }}>{countdown}s</span>
            </span>
          )}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.3)",
              color: "#22D3EE",
            }}
            data-ocid="market.primary_button"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Error state */}
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
              onClick={fetchData}
              className="text-xs px-3 py-1 rounded-lg transition-all hover:opacity-80"
              style={{ background: "rgba(255,51,102,0.2)", color: "#FF3366" }}
              data-ocid="market.secondary_button"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && !data ? (
        <div className="space-y-4">
          <div style={PANEL}>
            <div
              className="h-4 rounded mb-3 animate-pulse"
              style={{ background: "#1F2A3A", width: "30%" }}
            />
            <div className="space-y-2">
              {NARRATIVE_WIDTHS.map((w) => (
                <div
                  key={w}
                  className="h-3 rounded animate-pulse"
                  style={{ background: "#1F2A3A", width: w }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard ids={SKELETON_ROWS} />
            <SkeletonCard ids={SKELETON_ROWS} />
          </div>
          <SkeletonCard ids={SKELETON_ROWS} />
          <SkeletonCard ids={SKELETON_ROWS_6} />
        </div>
      ) : data ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Narrativa */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{ ...PANEL, border: "1px solid rgba(34,211,238,0.35)" }}
            data-ocid="market.card"
          >
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4" style={{ color: "#22D3EE" }} />
              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: "#22D3EE" }}
              >
                Narrativa do Mercado
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#E7EEF8" }}>
              {generateNarrative(data)}
            </p>
            <p className="text-xs mt-3" style={{ color: "#9AA7B6" }}>
              Atualizado às{" "}
              {data.fetchedAt.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          </motion.div>

          {/* Gainers & Losers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gainers */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={PANEL}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4" style={{ color: "#00FF88" }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#00FF88" }}
                >
                  Top 5 Maiores Altas
                </span>
              </div>
              <div className="space-y-2">
                {data.gainers.map((item, i) => (
                  <div
                    key={item.symbol}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                    style={{ background: "rgba(0,255,136,0.05)" }}
                    data-ocid={`market.item.${i + 1}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs w-4 text-center"
                        style={{ color: "#9AA7B6" }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "#E7EEF8" }}
                      >
                        {fmtSymbol(item.symbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "#9AA7B6" }}>
                        $
                        {item.price.toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })}
                      </span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(0,255,136,0.15)",
                          color: "#00FF88",
                          border: "1px solid rgba(0,255,136,0.3)",
                        }}
                      >
                        +{item.pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Losers */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={PANEL}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown
                  className="w-4 h-4"
                  style={{ color: "#FF3366" }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#FF3366" }}
                >
                  Top 5 Maiores Quedas
                </span>
              </div>
              <div className="space-y-2">
                {data.losers.map((item, i) => (
                  <div
                    key={item.symbol}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                    style={{ background: "rgba(255,51,102,0.05)" }}
                    data-ocid={`market.item.${i + 1}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs w-4 text-center"
                        style={{ color: "#9AA7B6" }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "#E7EEF8" }}
                      >
                        {fmtSymbol(item.symbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "#9AA7B6" }}>
                        $
                        {item.price.toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })}
                      </span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,51,102,0.15)",
                          color: "#FF3366",
                          border: "1px solid rgba(255,51,102,0.3)",
                        }}
                      >
                        {item.pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Funding Rate Extremes */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={PANEL}
          >
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-4 h-4 rounded-full"
                style={{
                  background: "rgba(34,211,238,0.3)",
                  border: "1px solid #22D3EE",
                }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: "#E7EEF8" }}
              >
                Taxas de Financiamento — Extremos
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Positive funding */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "#00FF88" }}
                  >
                    Mais Positivo
                  </span>
                  <span className="text-xs" style={{ color: "#9AA7B6" }}>
                    — Longs pagando
                  </span>
                </div>
                <div className="space-y-1.5">
                  {data.fundingPositive.map((item) => (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between py-1 px-2 rounded-lg"
                      style={{ background: "rgba(0,255,136,0.04)" }}
                    >
                      <span className="text-sm" style={{ color: "#E7EEF8" }}>
                        {fmtSymbol(item.symbol)}
                      </span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(0,255,136,0.15)",
                          color: "#00FF88",
                          border: "1px solid rgba(0,255,136,0.25)",
                        }}
                      >
                        {item.rate > 0 ? "+" : ""}
                        {item.rate.toFixed(4)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Negative funding */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "#FF3366" }}
                  >
                    Mais Negativo
                  </span>
                  <span className="text-xs" style={{ color: "#9AA7B6" }}>
                    — Shorts pagando
                  </span>
                </div>
                <div className="space-y-1.5">
                  {data.fundingNegative.map((item) => (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between py-1 px-2 rounded-lg"
                      style={{ background: "rgba(255,51,102,0.04)" }}
                    >
                      <span className="text-sm" style={{ color: "#E7EEF8" }}>
                        {fmtSymbol(item.symbol)}
                      </span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,51,102,0.15)",
                          color: "#FF3366",
                          border: "1px solid rgba(255,51,102,0.25)",
                        }}
                      >
                        {item.rate.toFixed(4)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Volume Destaque */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            style={PANEL}
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4" style={{ color: "#22D3EE" }} />
              <span
                className="text-sm font-semibold"
                style={{ color: "#E7EEF8" }}
              >
                Volume Destaque — Top 6
              </span>
              <span className="text-xs" style={{ color: "#9AA7B6" }}>
                Volume 24h em USDT
              </span>
            </div>
            <div className="space-y-3">
              {data.topVolume.map((item, i) => {
                const barPct = (item.quoteVolume / maxVolume) * 100;
                const isFirst = i === 0;
                return (
                  <div key={item.symbol} data-ocid={`market.item.${i + 1}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs w-4"
                          style={{ color: isFirst ? "#22D3EE" : "#9AA7B6" }}
                        >
                          {i + 1}
                        </span>
                        <span
                          className="text-sm font-medium"
                          style={{ color: isFirst ? "#22D3EE" : "#E7EEF8" }}
                        >
                          {fmtSymbol(item.symbol)}
                        </span>
                      </div>
                      <span
                        className="text-xs font-mono"
                        style={{ color: isFirst ? "#22D3EE" : "#9AA7B6" }}
                      >
                        {fmtVolume(item.quoteVolume)}
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "#1F2A3A" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{
                          delay: 0.3 + i * 0.05,
                          duration: 0.6,
                          ease: "easeOut",
                        }}
                        className="h-full rounded-full"
                        style={{
                          background: isFirst
                            ? "linear-gradient(90deg, #22D3EE, rgba(34,211,238,0.5))"
                            : "linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.15))",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
}
