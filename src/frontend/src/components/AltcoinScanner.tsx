import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { AltcoinOpportunity } from "../types/binance";
import { loadUiState, saveUiState } from "../utils/binanceCycleStorage";
import {
  formatFundingRate,
  formatPrice,
  formatVolume,
} from "../utils/calculations";

// ── Structural Analysis Types ─────────────────────────────────────────────────

interface TFStructure {
  tf: string;
  structure: "uptrend" | "downtrend" | "sideways";
  candlePattern: string | null;
  classicPattern: string | null;
  score: number;
}

interface StructuralResult {
  tfs: TFStructure[];
  consolidatedScore: number;
  label: string;
  summary: string;
}

interface StructuralEntry {
  loading: boolean;
  result: StructuralResult | null;
  error?: string;
}

// ── Structural Analysis Algorithms ───────────────────────────────────────────

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

function detectCandlePattern(candles: Candle[]): string | null {
  if (candles.length < 3) return null;
  const c = candles[candles.length - 1];
  const p = candles[candles.length - 2];
  const pp = candles[candles.length - 3];

  const cBody = Math.abs(c.close - c.open);
  const cRange = c.high - c.low;
  const _pBody = Math.abs(p.close - p.open);

  // Doji
  if (cRange > 0 && cBody / cRange < 0.1) return "Doji";

  // Bullish Engulfing
  if (
    p.close < p.open &&
    c.close > c.open &&
    c.open < p.close &&
    c.close > p.open
  )
    return "Engolfo Altista";

  // Bearish Engulfing
  if (
    p.close > p.open &&
    c.close < c.open &&
    c.open > p.close &&
    c.close < p.open
  )
    return "Engolfo Baixista";

  // Hammer
  const cLowerWick = Math.min(c.open, c.close) - c.low;
  const cUpperWick = c.high - Math.max(c.open, c.close);
  if (cBody > 0 && cLowerWick >= 2 * cBody && cUpperWick < cBody * 0.5)
    return "Martelo";

  // Shooting Star
  if (cBody > 0 && cUpperWick >= 2 * cBody && cLowerWick < cBody * 0.5)
    return "Estrela Cadente";

  // Morning Star
  const ppBearish = pp.close < pp.open;
  const pSmall =
    Math.abs(p.close - p.open) < Math.abs(pp.close - pp.open) * 0.5;
  const cBullish = c.close > c.open && c.close > (pp.open + pp.close) / 2;
  if (ppBearish && pSmall && cBullish) return "Estrela da Manhã";

  // Evening Star
  const ppBullish = pp.close > pp.open;
  const cBearishStr = c.close < c.open && c.close < (pp.open + pp.close) / 2;
  if (ppBullish && pSmall && cBearishStr) return "Estrela da Tarde";

  return null;
}

function detectMarketStructure(
  candles: Candle[],
): "uptrend" | "downtrend" | "sideways" {
  const last = candles.slice(-20);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < last.length - 2; i++) {
    const h = last[i].high;
    if (
      h > last[i - 1].high &&
      h > last[i - 2].high &&
      h > last[i + 1].high &&
      h > last[i + 2].high
    )
      swingHighs.push(h);
    const l = last[i].low;
    if (
      l < last[i - 1].low &&
      l < last[i - 2].low &&
      l < last[i + 1].low &&
      l < last[i + 2].low
    )
      swingLows.push(l);
  }

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const hhUp =
      swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
    const hlUp =
      swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
    const lhDown =
      swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];
    const llDown =
      swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];
    if (hhUp && hlUp) return "uptrend";
    if (lhDown && llDown) return "downtrend";
  }
  return "sideways";
}

function detectClassicPattern(candles: Candle[]): string | null {
  const last = candles.slice(-50);
  if (last.length < 10) return null;

  const highs = last.map((c) => c.high);
  const lows = last.map((c) => c.low);

  // Double Top: two similar highs
  const maxH = Math.max(...highs);
  const maxIdx = highs.indexOf(maxH);
  const topCandidates = highs
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h >= maxH * 0.985 && Math.abs(x.i - maxIdx) > 3);
  if (topCandidates.length >= 2) return "Topo Duplo";

  // Double Bottom: two similar lows
  const minL = Math.min(...lows);
  const minIdx = lows.indexOf(minL);
  const botCandidates = lows
    .map((l, i) => ({ l, i }))
    .filter((x) => x.l <= minL * 1.015 && Math.abs(x.i - minIdx) > 3);
  if (botCandidates.length >= 2) return "Fundo Duplo";

  // Head and Shoulders: 3 peaks with middle highest
  if (highs.length >= 20) {
    const third = Math.floor(highs.length / 3);
    const h1 = Math.max(...highs.slice(0, third));
    const h2 = Math.max(...highs.slice(third, 2 * third));
    const h3 = Math.max(...highs.slice(2 * third));
    if (h2 > h1 * 1.01 && h2 > h3 * 1.01 && Math.abs(h1 - h3) / h2 < 0.05)
      return "Cabeça e Ombros";
  }

  // Triangle detection
  const recentHighs = highs.slice(-15);
  const recentLows = lows.slice(-15);
  const highTrend = recentHighs[recentHighs.length - 1] - recentHighs[0];
  const lowTrend = recentLows[recentLows.length - 1] - recentLows[0];
  const highFlat = Math.abs(highTrend) / (Math.max(...recentHighs) || 1) < 0.02;
  const lowFlat = Math.abs(lowTrend) / (Math.max(...recentLows) || 1) < 0.02;

  if (highFlat && lowTrend > 0) return "Triângulo Ascendente";
  if (lowFlat && highTrend < 0) return "Triângulo Descendente";
  if (highTrend < 0 && lowTrend > 0) return "Triângulo Simétrico";

  return null;
}

const BULLISH_CANDLE_PATTERNS = [
  "Engolfo Altista",
  "Martelo",
  "Estrela da Manhã",
];
const BEARISH_CANDLE_PATTERNS = [
  "Engolfo Baixista",
  "Estrela Cadente",
  "Estrela da Tarde",
];
const BULLISH_CLASSIC = ["Fundo Duplo", "Triângulo Ascendente"];
const BEARISH_CLASSIC = [
  "Topo Duplo",
  "Cabeça e Ombros",
  "Triângulo Descendente",
];

function computeTFScore(
  structure: "uptrend" | "downtrend" | "sideways",
  candlePattern: string | null,
  classicPattern: string | null,
): number {
  let score = 0;
  // Market structure
  if (structure === "uptrend") score += 40;
  else if (structure === "sideways") score += 20;

  // Candle pattern
  if (candlePattern && BULLISH_CANDLE_PATTERNS.includes(candlePattern))
    score += 30;
  else if (candlePattern && BEARISH_CANDLE_PATTERNS.includes(candlePattern))
    score += 0;
  else score += 15;

  // Classic pattern
  if (classicPattern && BULLISH_CLASSIC.includes(classicPattern)) score += 30;
  else if (classicPattern && BEARISH_CLASSIC.includes(classicPattern))
    score += 0;
  else score += 15;

  return Math.min(100, score);
}

async function fetchKlines(
  symbol: string,
  interval: string,
): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: number[][] = await res.json();
  return data.map((k) => ({
    open: Number.parseFloat(String(k[1])),
    high: Number.parseFloat(String(k[2])),
    low: Number.parseFloat(String(k[3])),
    close: Number.parseFloat(String(k[4])),
  }));
}

async function runStructuralAnalysis(
  symbol: string,
): Promise<StructuralResult> {
  const TFS = ["15m", "1h", "4h"] as const;
  const weights: Record<string, number> = { "15m": 0.2, "1h": 0.4, "4h": 0.4 };

  const results = await Promise.all(
    TFS.map(async (tf) => {
      const candles = await fetchKlines(symbol, tf);
      const structure = detectMarketStructure(candles);
      const candlePattern = detectCandlePattern(candles);
      const classicPattern = detectClassicPattern(candles);
      const score = computeTFScore(structure, candlePattern, classicPattern);
      return {
        tf,
        structure,
        candlePattern,
        classicPattern,
        score,
      } as TFStructure;
    }),
  );

  const consolidated = results.reduce(
    (acc, r) => acc + r.score * weights[r.tf],
    0,
  );
  const rounded = Math.round(consolidated);

  let label: string;
  let summary: string;

  const uptrendCount = results.filter((r) => r.structure === "uptrend").length;
  const downtrendCount = results.filter(
    (r) => r.structure === "downtrend",
  ).length;

  if (rounded >= 65) {
    label = "Estrutura Altista";
    if (uptrendCount >= 2) {
      summary = `Estrutura claramente altista em ${uptrendCount}/3 timeframes. Confluência técnica favorece continuidade de alta.`;
    } else {
      summary =
        "Estrutura técnica positiva com padrões favoráveis. Score consolidado indica viés comprador.";
    }
  } else if (rounded >= 40) {
    label = "Estrutura Neutra";
    if (uptrendCount > 0 && downtrendCount > 0) {
      summary =
        "Conflito estrutural entre timeframes — cautela recomendada. Aguardar confirmação em TFs maiores.";
    } else {
      summary =
        "Estrutura indefinida ou em consolidação. Momentum insuficiente para sinal direcional claro.";
    }
  } else {
    label = "Estrutura Baixista";
    if (downtrendCount >= 2) {
      summary = `Pressão baixista em ${downtrendCount}/3 timeframes. Estrutura técnica desfavorável para entradas compradas.`;
    } else {
      summary =
        "Score estrutural abaixo do neutro. Presença de padrões de reversão baixista ou deterioração de estrutura.";
    }
  }

  return { tfs: results, consolidatedScore: rounded, label, summary };
}

// ── Structural Analysis Panel ─────────────────────────────────────────────────

function structureLabel(s: "uptrend" | "downtrend" | "sideways") {
  if (s === "uptrend") return { text: "Alta HH/HL", color: "#22C55E" };
  if (s === "downtrend") return { text: "Baixa LH/LL", color: "#EF4444" };
  return { text: "Lateral", color: "#EAB308" };
}

function scoreColor(n: number) {
  if (n >= 65) return "#22C55E";
  if (n >= 40) return "#EAB308";
  return "#EF4444";
}

interface StructuralPanelProps {
  symbol: string;
  entry: StructuralEntry | undefined;
  onAnalyze: (symbol: string) => void;
}

function StructuralPanel({ symbol, entry, onAnalyze }: StructuralPanelProps) {
  const hasResult = entry?.result != null;
  const hasError = entry?.error != null && !entry.loading && !hasResult;
  const isLoading = entry?.loading === true;

  return (
    <div
      className="px-3 pb-3"
      style={{ borderTop: "1px solid #1F2A3A", paddingTop: 10 }}
    >
      {/* Trigger button */}
      {!hasResult && !isLoading && !hasError && (
        <button
          type="button"
          onClick={() => onAnalyze(symbol)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all hover:opacity-80 active:scale-95"
          style={{
            background: "transparent",
            border: "1px solid rgba(34,211,238,0.45)",
            color: "#22D3EE",
          }}
          data-ocid="scanner.structural.button"
        >
          <Activity className="w-3 h-3" />
          Análise Estrutural
        </button>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 py-1">
          <svg
            aria-hidden="true"
            className="animate-spin w-3.5 h-3.5"
            style={{ color: "#22D3EE" }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="31.4"
              strokeDashoffset="10"
            />
          </svg>
          <span className="text-xs" style={{ color: "#22D3EE" }}>
            Analisando estrutura...
          </span>
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-xs" style={{ color: "#EF4444" }}>
            ⚠ {entry?.error}
          </span>
          <button
            type="button"
            onClick={() => onAnalyze(symbol)}
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: "#22D3EE" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Results */}
      {hasResult && entry?.result && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "#22D3EE" }}
            >
              📐 Análise Estrutural
            </span>
            <button
              type="button"
              onClick={() => onAnalyze(symbol)}
              className="text-xs hover:opacity-80 transition-opacity"
              style={{ color: "#9AA7B6" }}
              data-ocid="scanner.structural.reanalyze.button"
            >
              Reanalisar
            </button>
          </div>

          {/* TF rows */}
          <div className="space-y-1 mb-2">
            {entry.result.tfs.map((tf) => {
              const sl = structureLabel(tf.structure);
              return (
                <div
                  key={tf.tf}
                  className="flex items-center gap-2 rounded px-2 py-1.5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #1F2A3A",
                  }}
                >
                  {/* TF badge */}
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: "rgba(34,211,238,0.1)",
                      color: "#22D3EE",
                      border: "1px solid rgba(34,211,238,0.2)",
                      minWidth: 28,
                      textAlign: "center",
                    }}
                  >
                    {tf.tf}
                  </span>
                  {/* Structure */}
                  <span
                    className="text-xs font-semibold shrink-0"
                    style={{ color: sl.color, minWidth: 80 }}
                  >
                    {sl.text}
                  </span>
                  {/* Candle pattern */}
                  <span
                    className="text-xs flex-1 truncate"
                    style={{ color: "#9AA7B6" }}
                    title={tf.candlePattern ?? "—"}
                  >
                    {tf.candlePattern ?? "—"}
                  </span>
                  {/* Classic pattern */}
                  <span
                    className="text-xs shrink-0"
                    style={{
                      color: "#6B7A8D",
                      maxWidth: 90,
                      textAlign: "right",
                    }}
                    title={tf.classicPattern ?? "—"}
                  >
                    {tf.classicPattern ?? "—"}
                  </span>
                  {/* Score badge */}
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: `${scoreColor(tf.score)}18`,
                      color: scoreColor(tf.score),
                      border: `1px solid ${scoreColor(tf.score)}40`,
                      minWidth: 28,
                      textAlign: "center",
                    }}
                  >
                    {tf.score}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Consolidated score */}
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: `${scoreColor(entry.result.consolidatedScore)}10`,
              border: `1px solid ${scoreColor(entry.result.consolidatedScore)}35`,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-xs font-bold"
                style={{ color: scoreColor(entry.result.consolidatedScore) }}
              >
                {entry.result.label}
              </span>
              <span
                className="text-lg font-bold font-mono"
                style={{ color: scoreColor(entry.result.consolidatedScore) }}
              >
                {entry.result.consolidatedScore}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#9AA7B6" }}>
              {entry.result.summary}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── AltcoinScannerProps & helpers ─────────────────────────────────────────────

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

function pct(a: number, b: number) {
  return (((a - b) / b) * 100).toFixed(2);
}

function TPSLPanel({
  alt,
  structuralEntry,
  onAnalyze,
}: {
  alt: AltcoinOpportunity;
  structuralEntry: StructuralEntry | undefined;
  onAnalyze: (symbol: string) => void;
}) {
  const entry = alt.price;

  if (alt.tp1 === undefined) {
    return (
      <div
        className="px-3 py-2 text-xs"
        style={{ color: "#9AA7B6", borderTop: "1px solid #1F2A3A" }}
      >
        Aguardando dados de klines...
      </div>
    );
  }

  const risk = entry - (alt.stopLoss ?? entry);
  const reward = (alt.tp2 ?? entry) - entry;
  const rrNum = risk > 0 ? reward / risk : 0;
  const rr = rrNum > 0 ? rrNum.toFixed(1) : "—";
  const rrColor = rrNum >= 3 ? "#22C55E" : rrNum >= 2 ? "#EAB308" : "#EF4444";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-3 py-3" style={{ borderTop: "1px solid #1F2A3A" }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {/* Entry */}
          <div
            className="rounded-lg px-2 py-1.5"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.3)",
            }}
          >
            <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
              Entrada
            </div>
            <div
              className="text-xs font-bold font-mono"
              style={{ color: "#3B82F6" }}
            >
              {formatPrice(entry)}
            </div>
          </div>

          {/* TP1 */}
          {alt.tp1 !== undefined && (
            <div
              className="rounded-lg px-2 py-1.5"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                TP1
              </div>
              <div
                className="text-xs font-bold font-mono"
                style={{ color: "#22C55E" }}
              >
                {formatPrice(alt.tp1)}
              </div>
              <div className="text-xs" style={{ color: "#22C55E99" }}>
                +{pct(alt.tp1, entry)}%
              </div>
            </div>
          )}

          {/* TP2 */}
          {alt.tp2 !== undefined && (
            <div
              className="rounded-lg px-2 py-1.5"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                TP2
              </div>
              <div
                className="text-xs font-bold font-mono"
                style={{ color: "#22C55E" }}
              >
                {formatPrice(alt.tp2)}
              </div>
              <div className="text-xs" style={{ color: "#22C55E99" }}>
                +{pct(alt.tp2, entry)}%
              </div>
            </div>
          )}

          {/* TP3 */}
          {alt.tp3 !== undefined && (
            <div
              className="rounded-lg px-2 py-1.5"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                TP3
              </div>
              <div
                className="text-xs font-bold font-mono"
                style={{ color: "#22C55E" }}
              >
                {formatPrice(alt.tp3)}
              </div>
              <div className="text-xs" style={{ color: "#22C55E99" }}>
                +{pct(alt.tp3, entry)}%
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Stop Loss */}
          {alt.stopLoss !== undefined && (
            <div
              className="rounded-lg px-2 py-1.5 flex-1"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                Stop Loss
              </div>
              <div
                className="text-xs font-bold font-mono"
                style={{ color: "#EF4444" }}
              >
                {formatPrice(alt.stopLoss)}
              </div>
              <div className="text-xs" style={{ color: "#EF444499" }}>
                {pct(alt.stopLoss, entry)}%
              </div>
            </div>
          )}

          {/* R/R Ratio */}
          <div
            className="rounded-lg px-2 py-1.5 flex-1"
            style={{
              background: "rgba(234,179,8,0.08)",
              border: "1px solid rgba(234,179,8,0.3)",
            }}
          >
            <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
              Risco/Retorno
            </div>
            <div
              className="text-xs font-bold font-mono"
              style={{ color: rrColor }}
            >
              {rr}x
            </div>
            <div className="text-xs" style={{ color: "#EAB30899" }}>
              R:R ratio
            </div>
            {alt.timeframeUsed && (
              <div className="text-xs" style={{ color: "#9AA7B6" }}>
                TF: {alt.timeframeUsed}
              </div>
            )}
          </div>
        </div>

        {/* Indicadores Técnicos */}
        {alt.rsi14 !== undefined && (
          <div
            className="mt-2 rounded-lg px-2 py-2"
            style={{
              background: "rgba(139,92,246,0.07)",
              border: "1px solid rgba(139,92,246,0.25)",
            }}
          >
            <div
              className="text-xs font-semibold mb-1.5"
              style={{ color: "#A78BFA" }}
            >
              Indicadores Técnicos (15m)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* RSI(14) */}
              <div
                className="rounded px-2 py-1.5"
                style={{
                  background:
                    alt.rsi14 < 40
                      ? "rgba(34,197,94,0.08)"
                      : alt.rsi14 > 60
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(234,179,8,0.08)",
                  border:
                    alt.rsi14 < 40
                      ? "1px solid rgba(34,197,94,0.3)"
                      : alt.rsi14 > 60
                        ? "1px solid rgba(239,68,68,0.3)"
                        : "1px solid rgba(234,179,8,0.3)",
                }}
              >
                <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                  RSI(14)
                </div>
                <div
                  className="text-xs font-bold font-mono"
                  style={{
                    color:
                      alt.rsi14 < 40
                        ? "#22C55E"
                        : alt.rsi14 > 60
                          ? "#EF4444"
                          : "#EAB308",
                  }}
                >
                  {alt.rsi14.toFixed(1)}
                </div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      alt.rsi14 < 40
                        ? "#22C55E99"
                        : alt.rsi14 > 60
                          ? "#EF444499"
                          : "#EAB30899",
                  }}
                >
                  {alt.rsi14 < 40
                    ? "Sobrevendido"
                    : alt.rsi14 > 60
                      ? "Sobrecomprado"
                      : "Neutro"}
                </div>
              </div>

              {/* MA20 */}
              {alt.ma20 !== undefined && (
                <div
                  className="rounded px-2 py-1.5"
                  style={{
                    background: "rgba(59,130,246,0.08)",
                    border: "1px solid rgba(59,130,246,0.3)",
                  }}
                >
                  <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                    MA20
                  </div>
                  <div
                    className="text-xs font-bold font-mono"
                    style={{ color: "#60A5FA" }}
                  >
                    {formatPrice(alt.ma20)}
                  </div>
                  <div
                    className="text-xs"
                    style={{
                      color: alt.price > alt.ma20 ? "#22C55E99" : "#EF444499",
                    }}
                  >
                    {alt.price > alt.ma20 ? "↑ Acima" : "↓ Abaixo"}
                  </div>
                </div>
              )}

              {/* MA50 */}
              {alt.ma50 !== undefined && (
                <div
                  className="rounded px-2 py-1.5"
                  style={{
                    background: "rgba(59,130,246,0.08)",
                    border: "1px solid rgba(59,130,246,0.3)",
                  }}
                >
                  <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                    MA50
                  </div>
                  <div
                    className="text-xs font-bold font-mono"
                    style={{ color: "#60A5FA" }}
                  >
                    {formatPrice(alt.ma50)}
                  </div>
                  <div
                    className="text-xs"
                    style={{
                      color: alt.price > alt.ma50 ? "#22C55E99" : "#EF444499",
                    }}
                  >
                    {alt.price > alt.ma50 ? "↑ Acima" : "↓ Abaixo"}
                  </div>
                </div>
              )}

              {/* Sinal MA */}
              {alt.ma20 !== undefined &&
                alt.ma50 !== undefined &&
                (() => {
                  const isBullish = alt.price > alt.ma20 && alt.ma20 > alt.ma50;
                  const isBearish = alt.price < alt.ma20 && alt.ma20 < alt.ma50;
                  const maColor = isBullish
                    ? "#22C55E"
                    : isBearish
                      ? "#EF4444"
                      : "#60A5FA";
                  const maBg = isBullish
                    ? "rgba(34,197,94,0.08)"
                    : isBearish
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(59,130,246,0.08)";
                  const maBorder = isBullish
                    ? "1px solid rgba(34,197,94,0.3)"
                    : isBearish
                      ? "1px solid rgba(239,68,68,0.3)"
                      : "1px solid rgba(59,130,246,0.3)";
                  return (
                    <div
                      className="rounded px-2 py-1.5"
                      style={{ background: maBg, border: maBorder }}
                    >
                      <div
                        className="text-xs mb-0.5"
                        style={{ color: "#9AA7B6" }}
                      >
                        Sinal MA
                      </div>
                      <div
                        className="text-xs font-bold"
                        style={{ color: maColor }}
                      >
                        {isBullish
                          ? "Altista"
                          : isBearish
                            ? "Baixista"
                            : "Neutro"}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: `${maColor}99` }}
                      >
                        {isBullish
                          ? "P > MA20 > MA50"
                          : isBearish
                            ? "P < MA20 < MA50"
                            : "Cruzamento"}
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>
        )}

        {/* Smart Money Metrics */}
        {alt.smartMoney && (
          <div
            className="mt-2 rounded-lg px-2 py-2"
            style={{
              background: alt.smartMoney.isSmartMoneySetup
                ? "rgba(34,197,94,0.07)"
                : "rgba(234,179,8,0.05)",
              border: alt.smartMoney.isSmartMoneySetup
                ? "1px solid rgba(34,197,94,0.35)"
                : "1px solid rgba(234,179,8,0.25)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-xs font-bold"
                style={{
                  color: alt.smartMoney.isSmartMoneySetup
                    ? "#22C55E"
                    : "#EAB308",
                }}
              >
                {alt.smartMoney.isSmartMoneySetup
                  ? "🧠 Smart Money Setup"
                  : "📊 Smart Money"}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: alt.smartMoney.isSmartMoneySetup
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(234,179,8,0.15)",
                  color: alt.smartMoney.isSmartMoneySetup
                    ? "#22C55E"
                    : "#EAB308",
                }}
              >
                {alt.smartMoney.smartMoneyScore}/100
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Funding Rate */}
              <div
                className="rounded px-2 py-1.5"
                style={{
                  background:
                    alt.fundingRate < 0
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(239,68,68,0.08)",
                  border:
                    alt.fundingRate < 0
                      ? "1px solid rgba(34,197,94,0.3)"
                      : "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                  Funding Rate
                </div>
                <div
                  className="text-xs font-bold font-mono"
                  style={{ color: alt.fundingRate < 0 ? "#22C55E" : "#EF4444" }}
                >
                  {(alt.fundingRate * 100).toFixed(4)}%
                </div>
                <div
                  className="text-xs"
                  style={{
                    color: alt.fundingRate < 0 ? "#22C55E99" : "#EF444499",
                  }}
                >
                  {alt.fundingRate < 0 ? "✓ Negativo" : "✗ Positivo"}
                </div>
              </div>

              {/* LSR */}
              <div
                className="rounded px-2 py-1.5"
                style={{
                  background:
                    alt.smartMoney.lsr !== null && alt.smartMoney.lsr < 0.5
                      ? "rgba(34,197,94,0.08)"
                      : alt.smartMoney.lsr === null
                        ? "rgba(148,163,184,0.06)"
                        : "rgba(239,68,68,0.08)",
                  border:
                    alt.smartMoney.lsr !== null && alt.smartMoney.lsr < 0.5
                      ? "1px solid rgba(34,197,94,0.3)"
                      : alt.smartMoney.lsr === null
                        ? "1px solid rgba(148,163,184,0.2)"
                        : "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                  LSR (L/S Ratio)
                </div>
                <div
                  className="text-xs font-bold font-mono"
                  style={{
                    color:
                      alt.smartMoney.lsr === null
                        ? "#9AA7B6"
                        : alt.smartMoney.lsr < 0.4
                          ? "#22C55E"
                          : alt.smartMoney.lsr < 0.5
                            ? "#EAB308"
                            : "#EF4444",
                  }}
                >
                  {alt.smartMoney.lsr !== null
                    ? alt.smartMoney.lsr.toFixed(2)
                    : "—"}
                </div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      alt.smartMoney.lsr !== null && alt.smartMoney.lsr < 0.5
                        ? "#22C55E99"
                        : "#9AA7B699",
                  }}
                >
                  {alt.smartMoney.lsr === null
                    ? "n/d"
                    : alt.smartMoney.lsr < 0.35
                      ? "✓ Muito vendido"
                      : alt.smartMoney.lsr < 0.5
                        ? "✓ Vendido"
                        : "✗ Equilibrado"}
                </div>
              </div>

              {/* Range 15m */}
              <div
                className="rounded px-2 py-1.5"
                style={{
                  background:
                    alt.smartMoney.range15m >= 4
                      ? "rgba(34,197,94,0.08)"
                      : alt.smartMoney.range15m === 3
                        ? "rgba(234,179,8,0.08)"
                        : "rgba(148,163,184,0.06)",
                  border:
                    alt.smartMoney.range15m >= 4
                      ? "1px solid rgba(34,197,94,0.3)"
                      : alt.smartMoney.range15m === 3
                        ? "1px solid rgba(234,179,8,0.3)"
                        : "1px solid rgba(148,163,184,0.2)",
                }}
              >
                <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                  Range 15m
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{
                        background:
                          n <= alt.smartMoney!.range15m
                            ? alt.smartMoney!.range15m >= 4
                              ? "#22C55E"
                              : alt.smartMoney!.range15m === 3
                                ? "#EAB308"
                                : "#9AA7B6"
                            : "#1F2A3A",
                      }}
                    />
                  ))}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{
                    color:
                      alt.smartMoney.range15m >= 4
                        ? "#22C55E99"
                        : alt.smartMoney.range15m === 3
                          ? "#EAB30899"
                          : "#9AA7B699",
                  }}
                >
                  {alt.smartMoney.range15m >= 4
                    ? "✓ Acumulação"
                    : alt.smartMoney.range15m === 3
                      ? "~ Comprimindo"
                      : "✗ Expansão"}
                </div>
              </div>

              {/* exp_btc */}
              <div
                className="rounded px-2 py-1.5"
                style={{
                  background:
                    alt.smartMoney.expBtcCount >= 2
                      ? "rgba(34,197,94,0.08)"
                      : alt.smartMoney.expBtcCount === 1
                        ? "rgba(234,179,8,0.08)"
                        : "rgba(239,68,68,0.08)",
                  border:
                    alt.smartMoney.expBtcCount >= 2
                      ? "1px solid rgba(34,197,94,0.3)"
                      : alt.smartMoney.expBtcCount === 1
                        ? "1px solid rgba(234,179,8,0.3)"
                        : "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <div className="text-xs mb-0.5" style={{ color: "#9AA7B6" }}>
                  exp_btc
                </div>
                <div
                  className="text-xs font-bold"
                  style={{
                    color:
                      alt.smartMoney.expBtcCount >= 2
                        ? "#22C55E"
                        : alt.smartMoney.expBtcCount === 1
                          ? "#EAB308"
                          : "#EF4444",
                  }}
                >
                  {alt.smartMoney.expBtcCount}/3 TFs
                </div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      alt.smartMoney.expBtcCount >= 2
                        ? "#22C55E99"
                        : "#9AA7B699",
                  }}
                >
                  {alt.smartMoney.expBtcTFs.length > 0
                    ? alt.smartMoney.expBtcTFs.join(", ")
                    : "Nenhum"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Structural Analysis */}
      <StructuralPanel
        symbol={alt.symbol}
        entry={structuralEntry}
        onAnalyze={onAnalyze}
      />
    </motion.div>
  );
}

export function AltcoinScanner({ altcoins, loading }: AltcoinScannerProps) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(() =>
    loadUiState<string | null>("scanner_expanded", null),
  );

  const [structuralData, setStructuralData] = useState<
    Map<string, StructuralEntry>
  >(new Map());

  function handleToggle(symbol: string, isExpanded: boolean) {
    const next = isExpanded ? null : symbol;
    setExpandedSymbol(next);
    saveUiState("scanner_expanded", next);
  }

  async function handleAnalyze(symbol: string) {
    setStructuralData((prev) => {
      const next = new Map(prev);
      next.set(symbol, { loading: true, result: null });
      return next;
    });
    try {
      const result = await runStructuralAnalysis(symbol);
      setStructuralData((prev) => {
        const next = new Map(prev);
        next.set(symbol, { loading: false, result });
        return next;
      });
    } catch {
      setStructuralData((prev) => {
        const next = new Map(prev);
        next.set(symbol, {
          loading: false,
          result: null,
          error: "Falha ao buscar dados. Tente novamente.",
        });
        return next;
      });
    }
  }

  // Only show skeleton on initial load (no data yet)
  const showSkeleton = loading && altcoins.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-xl flex flex-col"
      style={{
        background: "#0F1622",
        border: "2px solid #1F2A3A",
      }}
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
              Top oportunidades · Clique para ver TP/SL
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
          className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-2 mt-3 text-xs uppercase tracking-wider"
          style={{ color: "#9AA7B6" }}
        >
          <div className="w-7" />
          <div>Par</div>
          <div className="text-right">Preço</div>
          <div className="text-right">24h</div>
          <div className="text-right">FR</div>
          <div className="text-right">Score</div>
          <div className="w-4" />
        </div>
      </div>

      <div className="flex-1">
        {showSkeleton ? (
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
              const isExpanded = expandedSymbol === alt.symbol;
              return (
                <div
                  key={alt.symbol}
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    boxShadow: isExpanded ? s.glow : "none",
                  }}
                  data-ocid={`scanner.item.${i + 1}`}
                >
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.3 }}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-2 items-center px-3 py-2 cursor-pointer transition-all hover:bg-white/5"
                    onClick={() => handleToggle(alt.symbol, isExpanded)}
                    data-ocid={`scanner.item.toggle.${i + 1}`}
                  >
                    <CoinAvatar symbol={alt.symbol} />
                    <div>
                      <div className="flex items-center gap-1">
                        <span
                          className="text-xs font-bold"
                          style={{ color: "#E7EEF8" }}
                        >
                          {alt.symbol}
                        </span>
                        {alt.smartMoney?.isSmartMoneySetup && (
                          <span
                            className="text-xs px-1 rounded font-bold"
                            style={{
                              background: "rgba(34,197,94,0.15)",
                              color: "#22C55E",
                              fontSize: 9,
                            }}
                          >
                            SM
                          </span>
                        )}
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
                          color:
                            alt.priceChange24h >= 0 ? "#22C55E" : "#EF4444",
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
                    <div className="flex items-center justify-center">
                      {isExpanded ? (
                        <ChevronUp
                          className="w-3 h-3"
                          style={{ color: "#9AA7B6" }}
                        />
                      ) : (
                        <ChevronDown
                          className="w-3 h-3"
                          style={{ color: "#9AA7B6" }}
                        />
                      )}
                    </div>
                  </motion.div>

                  <AnimatePresence>
                    {isExpanded && (
                      <TPSLPanel
                        alt={alt}
                        structuralEntry={structuralData.get(alt.symbol)}
                        onAnalyze={handleAnalyze}
                      />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
