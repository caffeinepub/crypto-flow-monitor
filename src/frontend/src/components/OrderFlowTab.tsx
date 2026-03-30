import { Settings, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BTCChart } from "./BTCChart";
import { BTCChartOrderBook } from "./BTCChartOrderBook";

interface OrderEntry {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  usdValue: number;
  firstSeen: number;
  lastSeen: number;
  status: "ACTIVE" | "REMOVIDA" | "EXECUTADA";
  isEdge: boolean;
  marketPriceAtEntry: number;
}

interface WallStats {
  totalBuyWall: number;
  totalSellWall: number;
  ratio: number;
}

const SPOT_WS = "wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms";
const FUTURES_WS = "wss://fstream.binance.com/ws/btcusdt@depth20@100ms";
const SPOT_TICKER_WS = "wss://stream.binance.com:9443/ws/btcusdt@miniTicker";
const FUTURES_TICKER_WS = "wss://fstream.binance.com/ws/btcusdt@miniTicker";

const EDGE_DISTANCE_PCT = 0.02;
const SPOOFING_TTL_MS = 8000;
const MAX_FEED_ENTRIES = 80;

function formatUSD(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function useOrderBookMonitor(
  wsUrl: string,
  tickerUrl: string,
  threshold: number,
) {
  const [feed, setFeed] = useState<OrderEntry[]>([]);
  const [walls, setWalls] = useState<WallStats>({
    totalBuyWall: 0,
    totalSellWall: 0,
    ratio: 1,
  });
  const [marketPrice, setMarketPrice] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [activeOrders, setActiveOrders] = useState<OrderEntry[]>([]);

  const knownOrders = useRef<Map<string, OrderEntry>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const tickerWsRef = useRef<WebSocket | null>(null);
  const marketPriceRef = useRef<number>(0);

  const addFeedEntry = useCallback((entry: OrderEntry) => {
    setFeed((prev) => [entry, ...prev].slice(0, MAX_FEED_ENTRIES));
  }, []);

  useEffect(() => {
    const ticker = new WebSocket(tickerUrl);
    tickerWsRef.current = ticker;
    ticker.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = Number.parseFloat(d.c || d.lastPrice || "0");
        if (p > 0) {
          marketPriceRef.current = p;
          setMarketPrice(p);
        }
      } catch {}
    };

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const bids: [string, string][] = data.bids || [];
        const asks: [string, string][] = data.asks || [];
        const now = Date.now();
        const mp = marketPriceRef.current;
        if (mp === 0) return;

        const seen = new Set<string>();
        let buyWall = 0;
        let sellWall = 0;

        for (const [priceStr, qtyStr] of bids) {
          const price = Number.parseFloat(priceStr);
          const qty = Number.parseFloat(qtyStr);
          const usdValue = price * qty;
          const key = `BUY_${priceStr}`;
          seen.add(key);
          if (usdValue >= threshold) {
            buyWall += usdValue;
            const isEdge = mp > 0 && (mp - price) / mp > EDGE_DISTANCE_PCT;
            const existing = knownOrders.current.get(key);
            if (!existing) {
              const entry: OrderEntry = {
                id: `${key}_${now}`,
                side: "BUY",
                price,
                qty,
                usdValue,
                firstSeen: now,
                lastSeen: now,
                status: "ACTIVE",
                isEdge,
                marketPriceAtEntry: mp,
              };
              knownOrders.current.set(key, entry);
              addFeedEntry({ ...entry });
            } else {
              knownOrders.current.set(key, {
                ...existing,
                lastSeen: now,
                qty,
                usdValue,
              });
            }
          }
        }

        for (const [priceStr, qtyStr] of asks) {
          const price = Number.parseFloat(priceStr);
          const qty = Number.parseFloat(qtyStr);
          const usdValue = price * qty;
          const key = `SELL_${priceStr}`;
          seen.add(key);
          if (usdValue >= threshold) {
            sellWall += usdValue;
            const isEdge = mp > 0 && (price - mp) / mp > EDGE_DISTANCE_PCT;
            const existing = knownOrders.current.get(key);
            if (!existing) {
              const entry: OrderEntry = {
                id: `${key}_${now}`,
                side: "SELL",
                price,
                qty,
                usdValue,
                firstSeen: now,
                lastSeen: now,
                status: "ACTIVE",
                isEdge,
                marketPriceAtEntry: mp,
              };
              knownOrders.current.set(key, entry);
              addFeedEntry({ ...entry });
            } else {
              knownOrders.current.set(key, {
                ...existing,
                lastSeen: now,
                qty,
                usdValue,
              });
            }
          }
        }

        for (const [key, order] of knownOrders.current.entries()) {
          if (!seen.has(key) && order.status === "ACTIVE") {
            const livedMs = now - order.firstSeen;
            const priceReached =
              order.side === "BUY"
                ? mp <= order.price * 1.001
                : mp >= order.price * 0.999;

            let newStatus: OrderEntry["status"] = "REMOVIDA";
            if (priceReached) newStatus = "EXECUTADA";
            else if (livedMs < SPOOFING_TTL_MS) newStatus = "REMOVIDA";

            const updated = { ...order, status: newStatus, lastSeen: now };
            knownOrders.current.delete(key);

            setFeed((prev) =>
              prev.map((f) =>
                f.id === order.id ? { ...f, status: newStatus } : f,
              ),
            );

            if (newStatus === "REMOVIDA" && livedMs < SPOOFING_TTL_MS * 2) {
              addFeedEntry({ ...updated, id: `${key}_removed_${now}` });
            }
          }
        }

        setWalls({
          totalBuyWall: buyWall,
          totalSellWall: sellWall,
          ratio: sellWall > 0 ? buyWall / sellWall : 1,
        });
        setActiveOrders(
          Array.from(knownOrders.current.values()).filter(
            (o) => o.status === "ACTIVE",
          ),
        );
      } catch {}
    };

    return () => {
      ws.close();
      ticker.close();
      knownOrders.current.clear();
    };
  }, [wsUrl, tickerUrl, threshold, addFeedEntry]);

  return { feed, activeOrders, walls, marketPrice, connected };
}

function ThresholdSelector({
  value,
  onChange,
}: { value: number; onChange: (v: number) => void }) {
  const options = [
    { label: "$50k", value: 50_000 },
    { label: "$100k", value: 100_000 },
    { label: "$250k", value: 250_000 },
    { label: "$500k", value: 500_000 },
    { label: "$1M", value: 1_000_000 },
  ];
  return (
    <div className="flex items-center gap-1">
      <Settings className="w-3.5 h-3.5" style={{ color: "#9AA7B6" }} />
      <span className="text-xs mr-1" style={{ color: "#9AA7B6" }}>
        Mínimo:
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="text-xs px-2 py-0.5 rounded transition-all"
          style={{
            background:
              value === o.value
                ? "rgba(34,211,238,0.2)"
                : "rgba(255,255,255,0.05)",
            color: value === o.value ? "#22D3EE" : "#9AA7B6",
            border: `1px solid ${value === o.value ? "#22D3EE44" : "transparent"}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OrderFlowTab() {
  const [subTab, setSubTab] = useState<"spot" | "futures">("futures");
  const [threshold, setThreshold] = useState(500_000);

  const futures = useOrderBookMonitor(FUTURES_WS, FUTURES_TICKER_WS, threshold);
  const spot = useOrderBookMonitor(SPOT_WS, SPOT_TICKER_WS, threshold);

  const active = subTab === "futures" ? futures : spot;

  // Suppress unused variable warnings — walls/connected kept for future use
  void futures.walls;
  void futures.connected;
  void spot.walls;
  void spot.connected;
  void formatUSD;

  return (
    <div className="space-y-4">
      <BTCChart />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSubTab("futures")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background:
              subTab === "futures"
                ? "rgba(34,211,238,0.15)"
                : "rgba(255,255,255,0.05)",
            color: subTab === "futures" ? "#22D3EE" : "#9AA7B6",
            border: `1px solid ${subTab === "futures" ? "#22D3EE44" : "transparent"}`,
            boxShadow:
              subTab === "futures" ? "0 0 12px rgba(34,211,238,0.1)" : "none",
          }}
        >
          <TrendingUp className="w-4 h-4" />
          Futuros Perpétuos
        </button>
        <button
          type="button"
          onClick={() => setSubTab("spot")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background:
              subTab === "spot"
                ? "rgba(34,211,238,0.15)"
                : "rgba(255,255,255,0.05)",
            color: subTab === "spot" ? "#22D3EE" : "#9AA7B6",
            border: `1px solid ${subTab === "spot" ? "#22D3EE44" : "transparent"}`,
            boxShadow:
              subTab === "spot" ? "0 0 12px rgba(34,211,238,0.1)" : "none",
          }}
        >
          <TrendingDown className="w-4 h-4" />
          Spot
        </button>
      </div>

      <ThresholdSelector value={threshold} onChange={setThreshold} />

      <BTCChartOrderBook
        orders={active.activeOrders}
        currentMarketPrice={active.marketPrice}
        label={
          subTab === "futures" ? "Ordens — Futuros Perpétuos" : "Ordens — Spot"
        }
      />
    </div>
  );
}
