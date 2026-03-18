import { useEffect, useRef, useState } from "react";

export interface BTCFuturesLiq {
  side: "LONG" | "SHORT";
  price: number;
  notionalValue: number;
  time: number;
}

export interface BTCSpotTrade {
  price: number;
  qty: number;
  notionalValue: number;
  isBuyerMaker: boolean;
  time: number;
}

const MIN_SPOT_NOTIONAL = 50_000;

export function useBTCLiquidations() {
  const [futuresLiqs, setFuturesLiqs] = useState<BTCFuturesLiq[]>([]);
  const [spotTrades, setSpotTrades] = useState<BTCSpotTrade[]>([]);
  const [futuresConnected, setFuturesConnected] = useState(false);
  const [spotConnected, setSpotConnected] = useState(false);
  const futWsRef = useRef<WebSocket | null>(null);
  const spotWsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connectFutures() {
      if (!mountedRef.current) return;
      const ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      futWsRef.current = ws;
      ws.onopen = () => {
        if (mountedRef.current) setFuturesConnected(true);
      };
      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          const o = msg.o;
          if (!o || !String(o.s).includes("BTC")) return;
          const price = Number.parseFloat(o.p);
          const qty = Number.parseFloat(o.q);
          const liq: BTCFuturesLiq = {
            side: o.S === "SELL" ? "LONG" : "SHORT",
            price,
            notionalValue: price * qty,
            time: Number(o.T) || Date.now(),
          };
          setFuturesLiqs((prev) => [liq, ...prev].slice(0, 200));
        } catch {
          // ignore parse errors
        }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setFuturesConnected(false);
        setTimeout(() => {
          if (mountedRef.current) connectFutures();
        }, 3000);
      };
      ws.onerror = () => ws.close();
    }

    function connectSpot() {
      if (!mountedRef.current) return;
      const ws = new WebSocket(
        "wss://stream.binance.com:9443/ws/btcusdt@aggTrade",
      );
      spotWsRef.current = ws;
      ws.onopen = () => {
        if (mountedRef.current) setSpotConnected(true);
      };
      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          const price = Number.parseFloat(msg.p);
          const qty = Number.parseFloat(msg.q);
          const notional = price * qty;
          if (notional < MIN_SPOT_NOTIONAL) return;
          const trade: BTCSpotTrade = {
            price,
            qty,
            notionalValue: notional,
            isBuyerMaker: msg.m,
            time: Number(msg.T) || Date.now(),
          };
          setSpotTrades((prev) => [trade, ...prev].slice(0, 200));
        } catch {
          // ignore parse errors
        }
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setSpotConnected(false);
        setTimeout(() => {
          if (mountedRef.current) connectSpot();
        }, 3000);
      };
      ws.onerror = () => ws.close();
    }

    connectFutures();
    connectSpot();

    return () => {
      mountedRef.current = false;
      if (futWsRef.current) {
        futWsRef.current.onclose = null;
        futWsRef.current.close();
      }
      if (spotWsRef.current) {
        spotWsRef.current.onclose = null;
        spotWsRef.current.close();
      }
    };
  }, []);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const oneMinAgo = Date.now() - 60 * 1000;

  const recentFutures = futuresLiqs.filter((l) => l.time >= fiveMinAgo);
  const recentSpot = spotTrades.filter((t) => t.time >= fiveMinAgo);

  const futuresStats = {
    longValue: recentFutures
      .filter((l) => l.side === "LONG")
      .reduce((s, l) => s + l.notionalValue, 0),
    shortValue: recentFutures
      .filter((l) => l.side === "SHORT")
      .reduce((s, l) => s + l.notionalValue, 0),
    totalValue: recentFutures.reduce((s, l) => s + l.notionalValue, 0),
    txPerMin: futuresLiqs.filter((l) => l.time >= oneMinAgo).length,
  };

  const spotStats = {
    buyValue: recentSpot
      .filter((t) => !t.isBuyerMaker)
      .reduce((s, t) => s + t.notionalValue, 0),
    sellValue: recentSpot
      .filter((t) => t.isBuyerMaker)
      .reduce((s, t) => s + t.notionalValue, 0),
    totalValue: recentSpot.reduce((s, t) => s + t.notionalValue, 0),
    txPerMin: spotTrades.filter((t) => t.time >= oneMinAgo).length,
  };

  return {
    futuresLiqs,
    spotTrades,
    futuresConnected,
    spotConnected,
    futuresStats,
    spotStats,
  };
}
