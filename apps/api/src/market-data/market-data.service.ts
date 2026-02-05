import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException
} from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { Candle, OhlcvQuery, Timeframe } from "./market-data.types";

const TWELVE_INTERVAL: Record<Timeframe, string> = {
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};

type TwelveDataValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataResponse = {
  status?: string;
  code?: number;
  message?: string;
  values?: TwelveDataValue[];
};

@Injectable()
export class MarketDataService {
  constructor(private readonly cacheService: CacheService) {}

  async getOhlcv(query: OhlcvQuery): Promise<Candle[]> {
    const symbol = this.normalizeSymbol(query.symbol);
    const timeframe = this.normalizeTimeframe(query.timeframe);
    const limit = this.normalizeLimit(query.limit);
    const cacheKey = `ohlcv:${symbol}:${timeframe}:${limit}`;

    return this.cacheService.rememberAsync(cacheKey, this.getTtl(timeframe), () =>
      this.fetchOhlcv(symbol, timeframe, limit)
    );
  }

  private getTtl(timeframe: Timeframe): number {
    if (timeframe === "1d") {
      return 10 * 60 * 1000;
    }

    return 60 * 1000;
  }

  private normalizeSymbol(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9.\-_:/]+$/.test(normalized)) {
      throw new BadRequestException("Invalid symbol format");
    }

    return normalized;
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

    return Math.min(500, Math.max(1, Math.floor(limit)));
  }

  private async fetchOhlcv(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException("TWELVE_DATA_API_KEY is missing");
    }

    const baseUrl = process.env.TWELVE_DATA_BASE_URL ?? "https://api.twelvedata.com";
    const timeoutMs = this.parseTimeout(process.env.TWELVE_DATA_TIMEOUT_MS);

    const url = new URL("/time_series", baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", TWELVE_INTERVAL[timeframe]);
    url.searchParams.set("outputsize", String(limit));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("order", "asc");
    url.searchParams.set("apikey", apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal
      });

      const payload = (await response.json()) as TwelveDataResponse;
      if (!response.ok || payload.status === "error" || payload.values === undefined) {
        const providerMessage = payload.message ?? "Failed to fetch market data";
        const providerCode = payload.code ? ` (${payload.code})` : "";
        throw new BadGatewayException(`Twelve Data error${providerCode}: ${providerMessage}`);
      }

      if (!Array.isArray(payload.values) || payload.values.length === 0) {
        throw new BadGatewayException(`No OHLCV data returned for ${symbol}`);
      }

      return payload.values
        .map((bar) => this.toCandle(bar))
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof InternalServerErrorException) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new BadGatewayException("Twelve Data request timed out");
      }

      throw new BadGatewayException("Failed to fetch Twelve Data time series");
    } finally {
      clearTimeout(timer);
    }
  }

  private toCandle(value: TwelveDataValue): Candle {
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    const volume = Number(value.volume ?? 0);

    if (![open, high, low, close, volume].every((item) => Number.isFinite(item))) {
      throw new BadGatewayException("Received malformed OHLCV values from Twelve Data");
    }

    return {
      timestamp: this.normalizeTimestamp(value.datetime),
      open: this.round(open),
      high: this.round(high),
      low: this.round(low),
      close: this.round(close),
      volume: Math.max(0, Math.trunc(volume))
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private normalizeTimestamp(rawTimestamp: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTimestamp)) {
      return `${rawTimestamp}T00:00:00.000Z`;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTimestamp)) {
      return rawTimestamp.replace(" ", "T") + "Z";
    }

    const parsed = new Date(rawTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadGatewayException("Received invalid timestamp from Twelve Data");
    }

    return parsed.toISOString();
  }

  private parseTimeout(raw?: string): number {
    if (!raw) {
      return 10_000;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return 10_000;
    }

    return Math.min(30_000, Math.max(1_000, parsed));
  }
}
