import { motion } from "motion/react";

interface ReversalScoreProps {
  score: number;
}

const INDICATORS = [
  { label: "RSI < 40", key: "rsi" },
  { label: "FR Neg.", key: "fr" },
  { label: "Drop 24h", key: "drop" },
  { label: "OI ↑", key: "oi" },
];

export function ReversalScore({ score }: ReversalScoreProps) {
  const color = score >= 60 ? "#22C55E" : score >= 40 ? "#3B82F6" : "#EF4444";
  const label =
    score >= 60 ? "RESET CONFIRMADO" : score >= 40 ? "ATENÇÃO" : "AGUARDANDO";
  const glow =
    score >= 60
      ? "0 0 20px rgba(34,197,94,0.5), 0 0 50px rgba(34,197,94,0.25)"
      : score >= 40
        ? "0 0 20px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.25)"
        : "0 0 20px rgba(239,68,68,0.5), 0 0 50px rgba(239,68,68,0.25)";

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl p-5 flex items-center gap-6"
      style={{
        background: "#0F1622",
        border: `2px solid ${color}99`,
        boxShadow: glow,
      }}
    >
      <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <title>Reversal score gauge</title>
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
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            transform="rotate(-90 65 65)"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold font-mono"
            style={{ color, textShadow: `0 0 12px ${color}88` }}
          >
            {score}
          </span>
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            / 100
          </span>
        </div>
      </div>

      <div className="flex-1">
        <div
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "#9AA7B6" }}
        >
          BTC Reversal Score
        </div>
        <div
          className="text-2xl font-bold tracking-wider"
          style={{ color, textShadow: `0 0 16px ${color}66` }}
        >
          {label}
        </div>
        <div className="mt-2 text-sm" style={{ color: "#9AA7B6" }}>
          Score composto baseado em RSI, Funding Rate, Variação 24h, Open
          Interest e Proximidade de Suporte
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {INDICATORS.map((item) => (
            <span
              key={item.key}
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                background: score >= 20 ? `${color}22` : "#1F2A3A",
                color: score >= 20 ? color : "#9AA7B6",
                border: `1px solid ${score >= 20 ? `${color}55` : "#1F2A3A"}`,
              }}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
