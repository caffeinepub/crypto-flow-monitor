import { useEffect, useRef, useState } from "react";
import type { LiquidationData } from "../types/binance";
import {
  getBinanceCycleStart,
  loadCycleData,
  saveCycleData,
} from "../utils/binanceCycleStorage";

const MAX_BUFFER = 200;
const STORAGE_KEY = "liq_cycle_v1";

function parseOrder(o: Record<string, string | number>): LiquidationData {
  const price = Number.parseFloat(String(o.p ?? o.price ?? 0));
  const origQty = Number.parseFloat(String(o.q ?? o.origQty ?? 0));
  return {
    symbol: String(o.s ?? o.symbol ?? ""),
    side: String(o.S ?? o.side ?? "SELL") as "BUY" | "SELL",
    price,
    origQty,
    notionalValue: price * origQty,
    time: Number(o.T ?? o.time ?? Date.now()),
  };
}

function dedupeAndSort(items: LiquidationData[]): LiquidationData[] {
  const seen = new Set<string>();
  const result: LiquidationData[] = [];
  for (const liq of items) {
    const key = `${liq.symbol}-${liq.time}-${liq.side}-${liq.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(liq);
    }
  }
  // Sort newest first
  result.sort((a, b) => b.time - a.time);
  return result.slice(0, MAX_BUFFER);
}

export function useLiquidations() {
  const [liquidations, setLiquidations] = useState<LiquidationData[]>(() => {
    // Restore from localStorage if within the same Binance cycle
    const saved = loadCycleData<LiquidationData[]>(STORAGE_KEY);
    if (saved && saved.length > 0) {
      const cycleStart = getBinanceCycleStart();
      const valid = saved.filter((l) => l.time >= cycleStart);
      if (valid.length > 0) return valid.slice(0, MAX_BUFFER);
    }
    return [];
  });

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist to localStorage whenever liquidations change (debounced)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCycleData(STORAGE_KEY, liquidations);
    }, 2000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [liquidations]);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          const order = msg.o;
          if (!order) return;
          const liq = parseOrder(order);
          setLiquidations((prev) => dedupeAndSort([liq, ...prev]));
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 500);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    // Fetch recent data from REST (merge with restored data)
    fetch("https://fapi.binance.com/fapi/v1/forceOrders?limit=50")
      .then((r) => r.json())
      .then((data: Record<string, string | number>[]) => {
        if (!mountedRef.current) return;
        const cycleStart = getBinanceCycleStart();
        const items: LiquidationData[] = data
          .map((o) => parseOrder(o))
          .filter((l) => l.time >= cycleStart);
        setLiquidations((prev) => dedupeAndSort([...items, ...prev]));
      })
      .catch(() => {});

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return { liquidations, connected };
}
