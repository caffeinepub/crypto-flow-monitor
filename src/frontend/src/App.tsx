import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AltcoinScanner } from "./components/AltcoinScanner";
import { BTCLiquidationComparison } from "./components/BTCLiquidationComparison";
import { BTCPanel } from "./components/BTCPanel";
import { BTCThermometer } from "./components/BTCThermometer";
import { CircuitBackground } from "./components/CircuitBackground";
import { Header } from "./components/Header";
import { MercadoPanel } from "./components/MercadoPanel";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { useBinanceData } from "./hooks/useBinanceData";
import type { Interval } from "./types/binance";

const queryClient = new QueryClient();

function Dashboard() {
  const [activeTab, setActiveTab] = useState("btc");
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
          {/* BTC Fluxo de Capital: Thermometer + Liquidation Comparison + BTCPanel */}
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

          {/* Scanner: full-width altcoin scanner */}
          {activeTab === "scanner" && (
            <div className="w-full">
              <AltcoinScanner altcoins={altcoins} loading={loading} />
            </div>
          )}

          {/* Market: real-time market analysis */}
          {activeTab === "market" && <MercadoPanel />}
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
