import { motion } from "motion/react";
import type { ReversalDetails } from "../types/binance";

interface ReversalScoreProps {
  details: ReversalDetails;
}

export function ReversalScore({ details }: ReversalScoreProps) {
  const { signals, totalScore, reversalType } = details;
  const score = totalScore;

  const isBottom = reversalType === "bottom";
  const isTop = reversalType === "top";
  const isImminent = score >= 70;

  const mainColor = isBottom
    ? "#EF4444"
    : isTop
      ? "#22C55E"
      : score >= 55
        ? "#F97316"
        : score >= 40
          ? "#3B82F6"
          : "#9AA7B6";

  const label =
    score >= 70
      ? "REVERSÃO IMINENTE"
      : score >= 55
        ? "SINAL FORTE"
        : score >= 40
          ? "ATENÇÃO"
          : "AGUARDANDO";

  const glow = isImminent
    ? `0 0 24px ${mainColor}66, 0 0 60px ${mainColor}33`
    : `0 0 14px ${mainColor}44`;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const typeLabel = isBottom ? "FUNDO" : isTop ? "TOPO" : null;
  const typeBg = isBottom ? "#EF444433" : "#22C55E33";
  const typeBorder = isBottom ? "#EF444466" : "#22C55E66";
  const typeColor = isBottom ? "#EF4444" : "#22C55E";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl p-5"
      style={{
        background: "#0F1622",
        border: `2px solid ${mainColor}55`,
        boxShadow: glow,
      }}
    >
      {/* Header row: gauge + title + badge */}
      <div className="flex items-center gap-5 mb-5">
        {/* Circular gauge */}
        <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
          <svg width="120" height="120" viewBox="0 0 130 130">
            <title>BTC Reversal Score</title>
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="#1F2A3A"
              strokeWidth="10"
            />
            <motion.circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke={mainColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              transform="rotate(-90 65 65)"
              style={{ filter: `drop-shadow(0 0 6px ${mainColor})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-bold font-mono"
              style={{
                color: mainColor,
                textShadow: `0 0 12px ${mainColor}88`,
              }}
            >
              {score}
            </span>
            <span className="text-xs" style={{ color: "#9AA7B6" }}>
              / 100
            </span>
          </div>
        </div>

        {/* Title + label */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: "#9AA7B6" }}
            >
              BTC Reversal Score
            </span>
            {typeLabel && (
              <span
                className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
                style={{
                  background: typeBg,
                  color: typeColor,
                  border: `1px solid ${typeBorder}`,
                }}
              >
                {typeLabel}
              </span>
            )}
          </div>

          <motion.div
            animate={isImminent ? { opacity: [1, 0.65, 1] } : { opacity: 1 }}
            transition={
              isImminent
                ? { duration: 1.2, repeat: Number.POSITIVE_INFINITY }
                : {}
            }
            className="text-xl font-bold tracking-wider"
            style={{ color: mainColor, textShadow: `0 0 16px ${mainColor}66` }}
          >
            {label}
          </motion.div>

          <div className="mt-1 text-xs" style={{ color: "#9AA7B6" }}>
            {reversalType === "bottom"
              ? "Confluência de sinais indicando possível fundo de mercado"
              : reversalType === "top"
                ? "Confluência de sinais indicando possível topo de mercado"
                : "Aguardando confluência de múltiplos timeframes"}
          </div>
        </div>
      </div>

      {/* Signal grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {signals.map((sig) => {
          const sigColor =
            sig.direction === "bullish"
              ? "#22C55E"
              : sig.direction === "bearish"
                ? "#EF4444"
                : "#3B82F6";
          const isActive = sig.active && sig.score > 0;
          const fillPct =
            sig.maxScore > 0 ? (sig.score / sig.maxScore) * 100 : 0;

          return (
            <div
              key={sig.label}
              className="rounded-lg p-3"
              style={{
                background: isActive ? `${sigColor}0F` : "#0A101A",
                border: `1px solid ${isActive ? `${sigColor}44` : "#1F2A3A"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: isActive ? sigColor : "#4A5568" }}
                >
                  {sig.label}
                </span>
                {/* status dot */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: isActive ? sigColor : "#2D3748",
                    boxShadow: isActive ? `0 0 6px ${sigColor}` : "none",
                  }}
                />
              </div>

              <div
                className="text-sm font-mono font-bold mb-2"
                style={{ color: isActive ? "#E2E8F0" : "#4A5568" }}
              >
                {sig.value}
              </div>

              {/* Mini progress bar */}
              <div
                className="w-full rounded-full overflow-hidden mb-1"
                style={{ height: 4, background: "#1F2A3A" }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${fillPct}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    background: isActive ? sigColor : "#2D3748",
                    borderRadius: 9999,
                  }}
                />
              </div>

              <div
                className="text-xs font-mono"
                style={{ color: isActive ? `${sigColor}CC` : "#2D3748" }}
              >
                {sig.score}/{sig.maxScore} pts
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
