import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Clock, Globe } from "lucide-react";
import { useState } from "react";
import { AltcoinScanner } from "./components/AltcoinScanner";
import { BTCLiquidationComparison } from "./components/BTCLiquidationComparison";
import { BTCPanel } from "./components/BTCPanel";
import { BTCThermometer } from "./components/BTCThermometer";
import { CircuitBackground } from "./components/CircuitBackground";
import { DollarFlow } from "./components/DollarFlow";
import { Header } from "./components/Header";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { useBinanceData } from "./hooks/useBinanceData";
import type { Interval } from "./types/binance";

const queryClient = new QueryClient();

function Dashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { btcMetrics, altcoins, loading, lastUpdate, refresh } = useBinanceData(
    "1h" as Interval,
  );

  return (
    <div className="min-h-screen relative" style={{ background: "#070B10" }}>
      <CircuitBackground />
      <div className="relative z-10">
        <Header
          lastUpdate={lastUpdate}
          onRefresh={refresh}
          loading={loading}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <main className="max-w-[1600px] mx-auto px-4 py-4">
          {/* Dashboard: exclusivo BTC */}
          {activeTab === "dashboard" && (
            <>
              <div className="mb-4">
                <DollarFlow btcMetrics={btcMetrics} altcoins={altcoins} />
              </div>
              <div className="mb-4">
                <BTCThermometer
                  score={btcMetrics?.reversalScore ?? 0}
                  loading={loading}
                />
              </div>
              <div className="mb-4">
                <BTCLiquidationComparison />
              </div>
              <BTCPanel metrics={btcMetrics} loading={loading} />
            </>
          )}

          {/* Scanner: full-width altcoin scanner */}
          {activeTab === "scanner" && (
            <div className="w-full">
              <AltcoinScanner altcoins={altcoins} loading={loading} />
            </div>
          )}

          {/* BTC Analysis: Thermometer + Liquidation Comparison + BTCPanel */}
          {activeTab === "btc" && (
            <div className="space-y-4">
              <BTCThermometer
                score={btcMetrics?.reversalScore ?? 0}
                loading={loading}
              />
              <BTCLiquidationComparison />
              <BTCPanel metrics={btcMetrics} loading={loading} />
            </div>
          )}

          {/* Market: placeholder */}
          {activeTab === "market" && (
            <div
              className="rounded-xl flex flex-col items-center justify-center py-24"
              style={{ background: "#0F1622", border: "2px solid #1F2A3A" }}
              data-ocid="market.panel"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                style={{
                  background: "rgba(34,211,238,0.1)",
                  border: "1px solid rgba(34,211,238,0.3)",
                }}
              >
                <Globe className="w-8 h-8" style={{ color: "#22D3EE" }} />
              </div>
              <h2
                className="text-2xl font-bold mb-2 tracking-wider"
                style={{ color: "#E7EEF8" }}
              >
                Em Breve
              </h2>
              <p className="text-sm mb-1" style={{ color: "#22D3EE" }}>
                Análise de Mercado
              </p>
              <p
                className="text-xs text-center max-w-md px-4"
                style={{ color: "#9AA7B6" }}
              >
                Análise descritiva do momento do mercado, últimos acontecimentos
                e movimentos institucionais significativos. Em desenvolvimento.
              </p>
              <div className="mt-8 flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: "#9AA7B6" }} />
                <span className="text-xs" style={{ color: "#9AA7B6" }}>
                  Disponível em breve
                </span>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer
          className="text-center py-6 mt-4"
          style={{ borderTop: "1px solid #1F2A3A" }}
        >
          <p className="text-xs" style={{ color: "#9AA7B6" }}>
            © {new Date().getFullYear()}. Built with ❤️ using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#22D3EE" }}
            >
              caffeine.ai
            </a>
          </p>
        </footer>
      </div>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
