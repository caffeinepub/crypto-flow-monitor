import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AltcoinScanner } from "./components/AltcoinScanner";
import { BTCLiquidationComparison } from "./components/BTCLiquidationComparison";
import { BTCPanel } from "./components/BTCPanel";
import { BTCThermometer } from "./components/BTCThermometer";
import { BotTraderTab } from "./components/BotTraderTab";
import { CircuitBackground } from "./components/CircuitBackground";
import { Header } from "./components/Header";
import { LiquidacoesTab } from "./components/LiquidacoesTab";
import { MercadoPanel } from "./components/MercadoPanel";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { useBinanceData } from "./hooks/useBinanceData";
import type { Interval } from "./types/binance";
import { loadUiState, saveUiState } from "./utils/binanceCycleStorage";

const queryClient = new QueryClient();

function Dashboard() {
  const [activeTab, setActiveTab] = useState<string>(() =>
    loadUiState<string>("active_tab", "btc"),
  );
  const { btcMetrics, altcoins, loading, lastUpdate, refresh } = useBinanceData(
    "1h" as Interval,
  );

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    saveUiState("active_tab", tab);
  }

  return (
    <div className="min-h-screen relative" style={{ background: "#070B10" }}>
      <CircuitBackground />
      <div className="relative z-10">
        <Header
          lastUpdate={lastUpdate}
          onRefresh={refresh}
          loading={loading}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        <main className="max-w-[1600px] mx-auto px-4 py-4">
          {/* BTC Fluxo de Capital */}
          <div style={{ display: activeTab === "btc" ? "block" : "none" }}>
            <div className="space-y-4">
              <BTCThermometer btcMetrics={btcMetrics} loading={loading} />
              <BTCLiquidationComparison />
              <BTCPanel metrics={btcMetrics} loading={loading} />
            </div>
          </div>

          {/* Scanner */}
          <div style={{ display: activeTab === "scanner" ? "block" : "none" }}>
            <div className="w-full">
              <AltcoinScanner altcoins={altcoins} loading={loading} />
            </div>
          </div>

          {/* Mercado */}
          <div style={{ display: activeTab === "market" ? "block" : "none" }}>
            <MercadoPanel />
          </div>

          {/* Liquidações */}
          <div
            style={{ display: activeTab === "liquidacoes" ? "block" : "none" }}
          >
            <LiquidacoesTab />
          </div>

          {/* Bot Trader */}
          <div
            style={{ display: activeTab === "bottrader" ? "block" : "none" }}
          >
            <BotTraderTab altcoins={altcoins} btcMetrics={btcMetrics} />
          </div>
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
