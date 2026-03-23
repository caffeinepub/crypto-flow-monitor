import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  RefreshCw,
  Scan,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
  loading: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Header({
  lastUpdate,
  onRefresh,
  loading,
  activeTab,
  onTabChange,
}: HeaderProps) {
  const tabs = [
    { id: "market", label: "Análise do Mercado", icon: BarChart3 },
    { id: "btc", label: "BTC Fluxo de Capital", icon: TrendingUp },
    { id: "ordens", label: "Livro de Ordens - BTC", icon: BookOpen },
    { id: "liquidacoes", label: "Feed Ao Vivo", icon: Zap },
    { id: "scanner", label: "Altcoin Scanner", icon: Scan },
    { id: "bottrader", label: "Bot Trader", icon: Bot },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(7,11,16,0.95)",
        backdropFilter: "blur(12px)",
        borderColor: "#1F2A3A",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <motion.div
          className="flex items-center gap-2 shrink-0"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #22D3EE22, #3B82F622)",
              border: "1px solid #22D3EE55",
              boxShadow: "0 0 12px rgba(34,211,238,0.2)",
            }}
          >
            <Activity className="w-4 h-4" style={{ color: "#22D3EE" }} />
          </div>
          <span
            className="font-bold text-lg tracking-widest"
            style={{ color: "#22D3EE" }}
          >
            CFM
          </span>
          <span
            className="text-xs hidden sm:block"
            style={{ color: "#9AA7B6" }}
          >
            Crypto Futures Monitor
          </span>
        </motion.div>

        <nav className="flex items-center gap-1" data-ocid="nav.tab">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                data-ocid={`nav.${tab.id}.link`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                style={{
                  color: isActive ? "#22D3EE" : "#9AA7B6",
                  background: isActive ? "rgba(34,211,238,0.1)" : "transparent",
                  boxShadow: isActive
                    ? "0 0 10px rgba(34,211,238,0.15)"
                    : "none",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {lastUpdate && (
            <span
              className="text-xs hidden md:block"
              style={{ color: "#9AA7B6" }}
            >
              Atualizado {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "#22C55E" }}
            />
            <span
              className="text-xs hidden sm:block"
              style={{ color: "#22C55E" }}
            >
              LIVE
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            data-ocid="header.refresh.button"
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              style={{ color: "#9AA7B6" }}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
