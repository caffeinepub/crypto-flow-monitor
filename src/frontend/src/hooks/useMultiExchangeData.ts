export interface MultiExchangeData {
  bybitFundingRate: number | null;
  bybitLongShortRatio: number | null;
  okxFundingRate: number | null;
  okxOpenInterest: number | null;
  fearGreedIndex: number | null;
  fearGreedLabel: string | null;
  coinGeckoBTCVolume24h: number | null;
  sourcesActive: string[];
  // Bulk altcoin funding maps (symbol without USDT -> funding rate)
  bybitAltFunding: Record<string, number>;
  okxAltFunding: Record<string, number>;
}

export async function fetchMultiExchangeData(): Promise<MultiExchangeData> {
  const [
    bybitTicker,
    bybitRatio,
    okxFunding,
    okxTicker,
    fearGreed,
    coinGecko,
    bybitAltFunding,
    okxAltFunding,
  ] = await Promise.all([
    fetchBybitFundingRate(),
    fetchBybitLongShortRatio(),
    fetchOKXFundingRate(),
    fetchOKXOpenInterest(),
    fetchFearGreed(),
    fetchCoinGeckoVolume(),
    fetchBybitAllFunding(),
    fetchOKXAllFunding(),
  ]);

  const sourcesActive = ["Binance"];
  if (bybitTicker !== null || bybitRatio !== null) sourcesActive.push("Bybit");
  if (okxFunding !== null || okxTicker !== null) sourcesActive.push("OKX");
  if (fearGreed.index !== null) sourcesActive.push("F&G");
  if (coinGecko !== null) sourcesActive.push("CoinGecko");

  return {
    bybitFundingRate: bybitTicker,
    bybitLongShortRatio: bybitRatio,
    okxFundingRate: okxFunding,
    okxOpenInterest: okxTicker,
    fearGreedIndex: fearGreed.index,
    fearGreedLabel: fearGreed.label,
    coinGeckoBTCVolume24h: coinGecko,
    sourcesActive,
    bybitAltFunding,
    okxAltFunding,
  };
}

/** Fetch all Bybit linear perpetual tickers and return symbol->fundingRate map.
 *  Bybit symbol format: BTCUSDT -> key stored as "BTC" */
async function fetchBybitAllFunding(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=linear",
    );
    const data = await res.json();
    const list: { symbol: string; fundingRate: string }[] =
      data?.result?.list ?? [];
    const map: Record<string, number> = {};
    for (const item of list) {
      if (!item.symbol.endsWith("USDT")) continue;
      const rate = Number.parseFloat(item.fundingRate);
      if (Number.isNaN(rate)) continue;
      const base = item.symbol.replace(/USDT$/, "");
      map[base] = rate;
    }
    return map;
  } catch {
    return {};
  }
}

/** Fetch OKX USDT-margined swap tickers and return symbol->fundingRate map.
 *  OKX tickers don't include funding rate; we use a lightweight funding-rate
 *  summary if available, otherwise skip and return empty map. */
async function fetchOKXAllFunding(): Promise<Record<string, number>> {
  try {
    // OKX public/instruments gives list of swap symbols;
    // funding-rate-summary endpoint returns current funding for all
    const res = await fetch(
      "https://www.okx.com/api/v5/public/funding-rate-summary?instType=SWAP",
    );
    if (!res.ok) return {};
    const data = await res.json();
    const list: { instId: string; fundingRate: string }[] = data?.data ?? [];
    const map: Record<string, number> = {};
    for (const item of list) {
      // instId format: BTC-USDT-SWAP -> base "BTC"
      if (!item.instId.includes("-USDT-")) continue;
      const base = item.instId.split("-")[0];
      const rate = Number.parseFloat(item.fundingRate);
      if (Number.isNaN(rate)) continue;
      map[base] = rate;
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchBybitFundingRate(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
    );
    const data = await res.json();
    const rate = data?.result?.list?.[0]?.fundingRate;
    if (rate == null) return null;
    return Number.parseFloat(rate);
  } catch {
    return null;
  }
}

async function fetchBybitLongShortRatio(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1",
    );
    const data = await res.json();
    const ratio = data?.result?.list?.[0]?.buyRatio;
    if (ratio == null) return null;
    return Number.parseFloat(ratio);
  } catch {
    return null;
  }
}

async function fetchOKXFundingRate(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",
    );
    const data = await res.json();
    const rate = data?.data?.[0]?.fundingRate;
    if (rate == null) return null;
    return Number.parseFloat(rate);
  } catch {
    return null;
  }
}

async function fetchOKXOpenInterest(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP",
    );
    const data = await res.json();
    const oi = data?.data?.[0]?.openInterest;
    if (oi == null) return null;
    return Number.parseFloat(oi);
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<{
  index: number | null;
  label: string | null;
}> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    const data = await res.json();
    const entry = data?.data?.[0];
    if (!entry) return { index: null, label: null };
    return {
      index: Number.parseInt(entry.value, 10),
      label: entry.value_classification ?? null,
    };
  } catch {
    return { index: null, label: null };
  }
}

async function fetchCoinGeckoVolume(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true",
    );
    const data = await res.json();
    const vol = data?.bitcoin?.usd_24h_vol;
    if (vol == null) return null;
    return Number(vol);
  } catch {
    return null;
  }
}
