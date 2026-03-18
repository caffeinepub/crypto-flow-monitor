import { Activity, RefreshCw } from "lucide-react";
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
    { id: "dashboard", label: "Dashboard" },
    { id: "scanner", label: "Scanner" },
    { id: "btc", label: "BTC Analysis" },
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
            <Activity className="w-4 h-4 text-neon-cyan" />
          </div>
          <span className="font-bold text-lg tracking-widest text-neon-cyan">
            CFM
          </span>
          <span className="text-xs text-muted-foreground hidden sm:block">
            Crypto Futures Monitor
          </span>
        </motion.div>

        <nav className="flex items-center gap-1" data-ocid="nav.tab">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              data-ocid={`nav.${tab.id}.link`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "text-neon-cyan"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={
                activeTab === tab.id
                  ? {
                      background: "rgba(34,211,238,0.1)",
                      boxShadow: "0 0 10px rgba(34,211,238,0.15)",
                    }
                  : {}
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Atualizado {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full animate-pulse-glow"
              style={{ backgroundColor: "#22C55E" }}
            />
            <span className="text-xs text-neon-green hidden sm:block">
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
              className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
