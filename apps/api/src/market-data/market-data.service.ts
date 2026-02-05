import { Injectable } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { Candle, OhlcvQuery, Timeframe } from "./market-data.types";

const STEP_MS: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};

@Injectable()
export class MarketDataService {
  constructor(private readonly cacheService: CacheService) {}

  getOhlcv(query: OhlcvQuery): Candle[] {
    const symbol = this.normalizeSymbol(query.symbol);
    const timeframe = this.normalizeTimeframe(query.timeframe);
    const limit = this.normalizeLimit(query.limit);
    const cacheKey = `ohlcv:${symbol}:${timeframe}:${limit}`;

    return this.cacheService.remember(cacheKey, this.getTtl(timeframe), () =>
      this.buildSeries(symbol, timeframe, limit)
    );
  }

  private getTtl(timeframe: Timeframe): number {
    if (timeframe === "1d") {
      return 10 * 60 * 1000;
    }

    return 60 * 1000;
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  private normalizeTimeframe(timeframe?: Timeframe): Timeframe {
    if (!timeframe) {
      return "1d";
    }

    if (timeframe === "1h" || timeframe === "4h" || timeframe === "1d") {
      return timeframe;
    }

    return "1d";
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || Number.isNaN(limit)) {
      return 120;
    }

    return Math.min(500, Math.max(20, Math.floor(limit)));
  }

  private buildSeries(symbol: string, timeframe: Timeframe, limit: number): Candle[] {
    const step = STEP_MS[timeframe];
    const nowMs = Date.now();
    const alignedNow = nowMs - (nowMs % step);
    const seed = this.hashSymbol(symbol);
    const candles: Candle[] = [];

    let close = 60 + (seed % 140);

    for (let idx = 0; idx < limit; idx += 1) {
      const point = idx + seed;
      const drift = Math.sin(point * 0.17) * 0.012 + Math.cos(point * 0.41) * 0.007;
      const open = close;
      close = Math.max(1, open * (1 + drift));

      const wick = Math.max(open, close) * (0.003 + ((seed + idx) % 7) / 1000);
      const high = Math.max(open, close) + wick;
      const low = Math.max(0.5, Math.min(open, close) - wick);

      const timeMs = alignedNow - (limit - idx - 1) * step;
      const volume = 100_000 + ((seed * 97 + idx * 7_919) % 900_000);

      candles.push({
        timestamp: new Date(timeMs).toISOString(),
        open: this.round(open),
        high: this.round(high),
        low: this.round(low),
        close: this.round(close),
        volume
      });
    }

    return candles;
  }

  private hashSymbol(symbol: string): number {
    let hash = 0;
    for (let i = 0; i < symbol.length; i += 1) {
      hash = (hash * 31 + symbol.charCodeAt(i)) % 1_000_003;
    }

    return hash;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

