import {
  AlertTriangle,
  BookOpen,
  Eye,
  EyeOff,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface OrderEntry {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  usdValue: number;
  firstSeen: number;
  lastSeen: number;
  status: "ACTIVE" | "REMOVIDA" | "EXECUTADA";
  isEdge: boolean; // far from market price
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

const EDGE_DISTANCE_PCT = 0.02; // 2% from market = edge order
const SPOOFING_TTL_MS = 8000; // order gone in <8s without execution = suspicious
const MAX_FEED_ENTRIES = 80;

function formatUSD(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

  // Track known large orders: priceKey -> OrderEntry
  const knownOrders = useRef<Map<string, OrderEntry>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const tickerWsRef = useRef<WebSocket | null>(null);
  const marketPriceRef = useRef<number>(0);

  const addFeedEntry = useCallback((entry: OrderEntry) => {
    setFeed((prev) => {
      const next = [entry, ...prev].slice(0, MAX_FEED_ENTRIES);
      return next;
    });
  }, []);

  useEffect(() => {
    // Ticker WS
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

    // Depth WS
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

        // Process bids (buy orders)
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

        // Process asks (sell orders)
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

        // Check removed orders
        for (const [key, order] of knownOrders.current.entries()) {
          if (!seen.has(key) && order.status === "ACTIVE") {
            const livedMs = now - order.firstSeen;
            const priceReached =
              order.side === "BUY"
                ? mp <= order.price * 1.001
                : mp >= order.price * 0.999;

            let newStatus: OrderEntry["status"] = "REMOVIDA";
            if (priceReached) newStatus = "EXECUTADA";
            else if (livedMs < SPOOFING_TTL_MS) newStatus = "REMOVIDA"; // fast removal = suspicious

            const updated = { ...order, status: newStatus, lastSeen: now };
            knownOrders.current.delete(key);

            // Update feed entry
            setFeed((prev) =>
              prev.map((f) =>
                f.id === order.id ? { ...f, status: newStatus } : f,
              ),
            );

            // If removed fast (spoofing), add fresh entry to top of feed
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
      } catch {}
    };

    return () => {
      ws.close();
      ticker.close();
      knownOrders.current.clear();
    };
  }, [wsUrl, tickerUrl, threshold, addFeedEntry]);

  return { feed, walls, marketPrice, connected };
}

function OrderFeed({
  feed,
  marketPrice,
}: { feed: OrderEntry[]; marketPrice: number }) {
  return (
    <div className="space-y-1 overflow-y-auto" style={{ maxHeight: "520px" }}>
      <AnimatePresence initial={false}>
        {feed.map((order) => {
          const isBuy = order.side === "BUY";
          const isRemoved = order.status === "REMOVIDA";
          const isExecuted = order.status === "EXECUTADA";
          const isSuspicious =
            isRemoved && order.lastSeen - order.firstSeen < SPOOFING_TTL_MS;

          let borderColor = isBuy ? "#22C55E" : "#EF4444";
          if (isRemoved) borderColor = isSuspicious ? "#F59E0B" : "#6B7280";
          if (isExecuted) borderColor = "#22D3EE";

          let bgColor = isBuy ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)";
          if (isRemoved)
            bgColor = isSuspicious
              ? "rgba(245,158,11,0.08)"
              : "rgba(107,114,128,0.05)";
          if (isExecuted) bgColor = "rgba(34,211,238,0.06)";

          const distPct =
            marketPrice > 0
              ? Math.abs(((order.price - marketPrice) / marketPrice) * 100)
              : 0;

          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="rounded-lg px-3 py-2 flex items-center gap-3"
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}44`,
                borderLeft: `3px solid ${borderColor}`,
              }}
            >
              {/* Side badge */}
              <div
                className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                style={{
                  background: isBuy
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(239,68,68,0.15)",
                  color: isBuy ? "#22C55E" : "#EF4444",
                  minWidth: 44,
                  textAlign: "center",
                }}
              >
                {order.side}
              </div>

              {/* Price & Value */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-sm font-mono font-semibold"
                    style={{ color: "#E2E8F0" }}
                  >
                    $
                    {order.price.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: borderColor }}
                  >
                    {formatUSD(order.usdValue)}
                  </span>
                  <span className="text-xs" style={{ color: "#9AA7B6" }}>
                    {order.qty.toFixed(3)} BTC
                  </span>
                  {distPct > 0.5 && (
                    <span className="text-xs" style={{ color: "#9AA7B6" }}>
                      {distPct.toFixed(1)}% do preço
                    </span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {order.isEdge && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(168,85,247,0.2)",
                      color: "#A855F7",
                      fontSize: 10,
                    }}
                  >
                    EDGE
                  </span>
                )}
                {isSuspicious && isRemoved && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
                    style={{
                      background: "rgba(245,158,11,0.2)",
                      color: "#F59E0B",
                      fontSize: 10,
                    }}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    SPOOFING
                  </span>
                )}
                {isRemoved && !isSuspicious && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(107,114,128,0.2)",
                      color: "#9AA7B6",
                      fontSize: 10,
                    }}
                  >
                    REMOVIDA
                  </span>
                )}
                {isExecuted && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(34,211,238,0.2)",
                      color: "#22D3EE",
                      fontSize: 10,
                    }}
                  >
                    EXECUTADA
                  </span>
                )}
                {order.status === "ACTIVE" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: isBuy ? "#22C55E" : "#EF4444" }}
                  />
                )}
              </div>

              {/* Time */}
              <span
                className="text-xs shrink-0"
                style={{ color: "#6B7280", minWidth: 60 }}
              >
                {formatTime(order.firstSeen)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {feed.length === 0 && (
        <div className="text-center py-12" style={{ color: "#6B7280" }}>
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Aguardando ordens grandes...</p>
          <p className="text-xs mt-1 opacity-60">
            Conectando ao livro de ordens
          </p>
        </div>
      )}
    </div>
  );
}

function WallSummary({
  walls,
  marketPrice,
  threshold,
}: { walls: WallStats; marketPrice: number; threshold: number }) {
  const buyPct =
    walls.totalBuyWall + walls.totalSellWall > 0
      ? (walls.totalBuyWall / (walls.totalBuyWall + walls.totalSellWall)) * 100
      : 50;
  const sellPct = 100 - buyPct;

  let sentiment = "Neutro";
  let sentimentColor = "#9AA7B6";
  if (walls.ratio > 1.5) {
    sentiment = "Pressão Compradora";
    sentimentColor = "#22C55E";
  } else if (walls.ratio < 0.67) {
    sentiment = "Pressão Vendedora";
    sentimentColor = "#EF4444";
  } else if (walls.ratio > 1.1) {
    sentiment = "Leve Pressão Compradora";
    sentimentColor = "#86EFAC";
  } else if (walls.ratio < 0.9) {
    sentiment = "Leve Pressão Vendedora";
    sentimentColor = "#FCA5A5";
  }

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "rgba(15,23,35,0.8)", border: "1px solid #1F2A3A" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "#9AA7B6" }}>
            RESUMO DE MUROS
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(34,211,238,0.1)", color: "#22D3EE" }}
          >
            min {formatUSD(threshold)}
          </span>
        </div>
        <span
          className="text-sm font-semibold"
          style={{ color: sentimentColor }}
        >
          {sentiment}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-center">
          <p className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Muro Compra
          </p>
          <p className="text-lg font-bold" style={{ color: "#22C55E" }}>
            {formatUSD(walls.totalBuyWall)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Ratio C/V
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: walls.ratio >= 1 ? "#22C55E" : "#EF4444" }}
          >
            {walls.ratio.toFixed(2)}x
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs mb-1" style={{ color: "#9AA7B6" }}>
            Muro Venda
          </p>
          <p className="text-lg font-bold" style={{ color: "#EF4444" }}>
            {formatUSD(walls.totalSellWall)}
          </p>
        </div>
      </div>

      {/* Ratio bar */}
      <div
        className="h-2 rounded-full overflow-hidden flex"
        style={{ background: "#1F2A3A" }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${buyPct}%`,
            background: "linear-gradient(90deg, #16A34A, #22C55E)",
          }}
        />
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${sellPct}%`,
            background: "linear-gradient(90deg, #DC2626, #EF4444)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: "#22C55E" }}>
          {buyPct.toFixed(0)}% Compra
        </span>
        {marketPrice > 0 && (
          <span className="text-xs font-mono" style={{ color: "#E2E8F0" }}>
            BTC $
            {marketPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        )}
        <span className="text-xs" style={{ color: "#EF4444" }}>
          {sellPct.toFixed(0)}% Venda
        </span>
      </div>
    </div>
  );
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

function SubTabContent({
  wsUrl,
  tickerUrl,
  defaultThreshold,
}: {
  wsUrl: string;
  tickerUrl: string;
  defaultThreshold: number;
}) {
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [showEdgeOnly, setShowEdgeOnly] = useState(false);
  const { feed, walls, marketPrice, connected } = useOrderBookMonitor(
    wsUrl,
    tickerUrl,
    threshold,
  );

  const filtered = showEdgeOnly
    ? feed.filter((f) => f.isEdge || f.status === "REMOVIDA")
    : feed;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <ThresholdSelector value={threshold} onChange={setThreshold} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowEdgeOnly((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1 rounded transition-all"
            style={{
              background: showEdgeOnly
                ? "rgba(168,85,247,0.2)"
                : "rgba(255,255,255,0.05)",
              color: showEdgeOnly ? "#A855F7" : "#9AA7B6",
              border: `1px solid ${showEdgeOnly ? "#A855F744" : "transparent"}`,
            }}
          >
            {showEdgeOnly ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
            Suspeitas
          </button>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "animate-pulse" : ""}`}
              style={{ background: connected ? "#22C55E" : "#EF4444" }}
            />
            <span
              className="text-xs"
              style={{ color: connected ? "#22C55E" : "#EF4444" }}
            >
              {connected ? "AO VIVO" : "DESCONECTADO"}
            </span>
          </div>
        </div>
      </div>

      <WallSummary
        walls={walls}
        marketPrice={marketPrice}
        threshold={threshold}
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs" style={{ color: "#9AA7B6" }}>
          Legenda:
        </span>
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#22C55E" }}
          />
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Ordem Compra
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#EF4444" }}
          />
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Ordem Venda
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#F59E0B" }}
          />
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Spoofing/Removida rápida
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#A855F7" }}
          />
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Edge (distante do preço)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#22D3EE" }}
          />
          <span className="text-xs" style={{ color: "#9AA7B6" }}>
            Executada
          </span>
        </div>
      </div>

      <OrderFeed feed={filtered} marketPrice={marketPrice} />
    </div>
  );
}

export function OrderFlowTab() {
  const [subTab, setSubTab] = useState<"spot" | "futures">("futures");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "rgba(15,23,35,0.8)",
          border: "1px solid #1F2A3A",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" style={{ color: "#22D3EE" }} />
            <h2 className="text-lg font-bold" style={{ color: "#E2E8F0" }}>
              Livro de Ordens — BTC
            </h2>
          </div>
        </div>
        <p className="text-xs" style={{ color: "#9AA7B6" }}>
          Monitora ordens grandes em tempo real. Detecta muros de compra/venda,
          ordens removidas sem execução (spoofing) e ordens edge posicionadas
          longe do preço.
        </p>
      </div>

      {/* Sub-tab selector */}
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

      {/* Content */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "rgba(15,23,35,0.8)",
          border: "1px solid #1F2A3A",
        }}
      >
        {subTab === "futures" && (
          <SubTabContent
            wsUrl={FUTURES_WS}
            tickerUrl={FUTURES_TICKER_WS}
            defaultThreshold={500_000}
          />
        )}
        {subTab === "spot" && (
          <SubTabContent
            wsUrl={SPOT_WS}
            tickerUrl={SPOT_TICKER_WS}
            defaultThreshold={100_000}
          />
        )}
      </div>
    </div>
  );
}
