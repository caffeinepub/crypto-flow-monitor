import { useEffect, useRef, useState } from "react";
import type { LiquidationData } from "../types/binance";

const MAX_BUFFER = 100;

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

export function useLiquidations() {
  const [liquidations, setLiquidations] = useState<LiquidationData[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

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
          setLiquidations((prev) => [liq, ...prev].slice(0, MAX_BUFFER));
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

    // Fetch initial data
    fetch("https://fapi.binance.com/fapi/v1/forceOrders?limit=50")
      .then((r) => r.json())
      .then((data: Record<string, string | number>[]) => {
        if (!mountedRef.current) return;
        const items: LiquidationData[] = data
          .map((o) => parseOrder(o))
          .reverse();
        setLiquidations(items.slice(0, MAX_BUFFER));
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
