/**
 * Binance 24h cycle storage utility.
 * Binance resets 24h data at 00:00 UTC.
 * This utility saves data with a timestamp and restores it only
 * if we are still within the same Binance 24h cycle.
 * If the cycle has reset, it discards the old data.
 */

export function getBinanceCycleStart(): number {
  const now = new Date();
  const cycleStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return cycleStart;
}

export function isSameBinanceCycle(savedTimestamp: number): boolean {
  const cycleStart = getBinanceCycleStart();
  const nextCycleStart = cycleStart + 24 * 60 * 60 * 1000;
  return savedTimestamp >= cycleStart && savedTimestamp < nextCycleStart;
}

interface CycleStorageEntry<T> {
  data: T;
  savedAt: number;
}

export function saveCycleData<T>(key: string, data: T): void {
  try {
    const entry: CycleStorageEntry<T> = {
      data,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

/**
 * Load data saved in the current Binance cycle.
 * Returns null if no data, data is from a previous cycle, or parse error.
 */
export function loadCycleData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CycleStorageEntry<T> = JSON.parse(raw);
    if (!isSameBinanceCycle(entry.savedAt)) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Save persistent UI state (not cycle-bound -- survives resets).
 */
export function saveUiState<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function loadUiState<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}
