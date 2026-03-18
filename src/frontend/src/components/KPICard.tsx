import { motion } from "motion/react";
import type { ReactNode } from "react";

type NeonColor = "green" | "red" | "blue" | "cyan" | "orange";

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  color: NeonColor;
  icon?: ReactNode;
  index?: number;
}

const colorMap: Record<
  NeonColor,
  { border: string; glow: string; text: string }
> = {
  green: {
    border: "rgba(34,197,94,0.7)",
    glow: "0 0 18px rgba(34,197,94,0.35), 0 0 40px rgba(34,197,94,0.15)",
    text: "#22C55E",
  },
  red: {
    border: "rgba(239,68,68,0.7)",
    glow: "0 0 18px rgba(239,68,68,0.35), 0 0 40px rgba(239,68,68,0.15)",
    text: "#EF4444",
  },
  blue: {
    border: "rgba(59,130,246,0.7)",
    glow: "0 0 18px rgba(59,130,246,0.35), 0 0 40px rgba(59,130,246,0.15)",
    text: "#3B82F6",
  },
  cyan: {
    border: "rgba(34,211,238,0.7)",
    glow: "0 0 18px rgba(34,211,238,0.35), 0 0 40px rgba(34,211,238,0.15)",
    text: "#22D3EE",
  },
  orange: {
    border: "rgba(249,115,22,0.7)",
    glow: "0 0 18px rgba(249,115,22,0.35), 0 0 40px rgba(249,115,22,0.15)",
    text: "#F97316",
  },
};

export function KPICard({
  label,
  value,
  sub,
  color,
  icon,
  index = 0,
}: KPICardProps) {
  const c = colorMap[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden"
      style={{
        background: "#0F1622",
        border: `2px solid ${c.border}`,
        boxShadow: c.glow,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "#9AA7B6" }}
        >
          {label}
        </span>
        {icon && <span style={{ color: c.text }}>{icon}</span>}
      </div>
      <div
        className="text-2xl font-bold font-mono"
        style={{ color: c.text, textShadow: `0 0 12px ${c.text}88` }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "#9AA7B6" }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}
