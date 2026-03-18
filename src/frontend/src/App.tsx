import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AltcoinScanner } from "./components/AltcoinScanner";
import { BTCPanel } from "./components/BTCPanel";
import { CircuitBackground } from "./components/CircuitBackground";
import { DollarFlow } from "./components/DollarFlow";
import { Header } from "./components/Header";
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
          {/* Dollar Flow */}
          <div className="mb-4">
            <DollarFlow btcMetrics={btcMetrics} altcoins={altcoins} />
          </div>

          {/* Main content: BTC (65%) + Scanner (35%) */}
          <div className="flex flex-col xl:flex-row gap-4">
            {/* BTC Panel */}
            <div className="flex-1 min-w-0" style={{ flex: "0 0 65%" }}>
              <BTCPanel metrics={btcMetrics} loading={loading} />
            </div>

            {/* Altcoin Scanner */}
            <div className="xl:w-[35%] min-w-0">
              <AltcoinScanner altcoins={altcoins} loading={loading} />
            </div>
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
