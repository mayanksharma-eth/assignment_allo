import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  InternalServerErrorException
} from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { Candle, OhlcvQuery, Timeframe } from "./market-data.types";

const TWELVE_INTERVAL: Record<Timeframe, string> = {
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};

const ALPHA_INTRADAY_INTERVAL = "60min";
const ALPHA_DAILY_SERIES_KEY = "Time Series (Daily)";
const ALPHA_INTRADAY_SERIES_KEY = "Time Series (60min)";

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

type AlphaVantageValue = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume"?: string;
};

type AlphaVantageResponse = {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<string, AlphaVantageValue>;
  "Time Series (60min)"?: Record<string, AlphaVantageValue>;
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(private readonly cacheService: CacheService) {}

  async getOhlcv(query: OhlcvQuery): Promise<Candle[]> {
    const symbol = this.normalizeSymbol(query.symbol);
    const timeframe = this.normalizeTimeframe(query.timeframe);
    const limit = this.normalizeLimit(query.limit);
    const cacheKey = `ohlcv:${symbol}:${timeframe}:${limit}`;

    return this.cacheService.rememberAsync(cacheKey, this.getTtl(timeframe), () =>
      this.fetchFromProviders(symbol, timeframe, limit)
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

  private async fetchFromProviders(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    try {
      return await this.fetchFromTwelveData(symbol, timeframe, limit);
    } catch (primaryError) {
      const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (!alphaKey) {
        throw primaryError;
      }

      this.logger.warn(`Twelve Data failed for ${symbol} (${timeframe}), switching to Alpha Vantage fallback`);

      try {
        return await this.fetchFromAlphaVantage(symbol, timeframe, limit, alphaKey);
      } catch (fallbackError) {
        throw new BadGatewayException(
          `Twelve Data failed: ${this.errorToMessage(primaryError)}. Alpha Vantage fallback failed: ${this.errorToMessage(
            fallbackError
          )}`
        );
      }
    }
  }

  private async fetchFromTwelveData(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
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

  private async fetchFromAlphaVantage(
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    apiKey: string
  ): Promise<Candle[]> {
    if (timeframe === "1d") {
      return this.fetchFromAlphaDaily(symbol, limit, apiKey);
    }

    return this.fetchFromAlphaIntraday(symbol, timeframe, limit, apiKey);
  }

  private async fetchFromAlphaDaily(symbol: string, limit: number, apiKey: string): Promise<Candle[]> {
    const outputsize = limit > 100 ? "full" : "compact";

    try {
      return await this.requestAlphaDaily(symbol, limit, apiKey, outputsize);
    } catch (error) {
      if (outputsize === "full" && this.isAlphaPremiumConstraint(error)) {
        this.logger.warn("Alpha Vantage full daily output is unavailable on this plan; retrying with compact");
        return this.requestAlphaDaily(symbol, limit, apiKey, "compact");
      }

      throw error;
    }
  }

  private async requestAlphaDaily(
    symbol: string,
    limit: number,
    apiKey: string,
    outputsize: "compact" | "full"
  ): Promise<Candle[]> {
    const payload = await this.requestAlpha({
      function: "TIME_SERIES_DAILY",
      symbol,
      outputsize,
      apikey: apiKey
    });

    const series = payload[ALPHA_DAILY_SERIES_KEY];
    if (!series || typeof series !== "object") {
      throw new BadGatewayException(`Alpha Vantage daily series missing for ${symbol}`);
    }

    const candles = Object.entries(series)
      .map(([datetime, value]) => this.toAlphaCandle(datetime, value))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    if (candles.length === 0) {
      throw new BadGatewayException(`Alpha Vantage returned empty daily series for ${symbol}`);
    }

    return candles.slice(-limit);
  }

  private async fetchFromAlphaIntraday(
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    apiKey: string
  ): Promise<Candle[]> {
    const payload = await this.requestAlpha({
      function: "TIME_SERIES_INTRADAY",
      symbol,
      interval: ALPHA_INTRADAY_INTERVAL,
      outputsize: "compact",
      apikey: apiKey
    });

    const series = payload[ALPHA_INTRADAY_SERIES_KEY];
    if (!series || typeof series !== "object") {
      throw new BadGatewayException(`Alpha Vantage intraday series missing for ${symbol}`);
    }

    const candles = Object.entries(series)
      .map(([datetime, value]) => this.toAlphaCandle(datetime, value))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    if (candles.length === 0) {
      throw new BadGatewayException(`Alpha Vantage returned empty intraday series for ${symbol}`);
    }

    if (timeframe === "1h") {
      return candles.slice(-limit);
    }

    const aggregated = this.aggregateCandles(candles, 4);
    if (aggregated.length === 0) {
      throw new BadGatewayException(`Alpha Vantage could not aggregate 4h candles for ${symbol}`);
    }

    return aggregated.slice(-limit);
  }

  private async requestAlpha(params: Record<string, string>): Promise<AlphaVantageResponse> {
    const baseUrl = process.env.ALPHA_VANTAGE_BASE_URL ?? "https://www.alphavantage.co";
    const timeoutMs = this.parseTimeout(process.env.ALPHA_VANTAGE_TIMEOUT_MS);
    const url = new URL("/query", baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal
      });

      const payload = (await response.json()) as AlphaVantageResponse;
      if (!response.ok) {
        throw new BadGatewayException(`Alpha Vantage request failed with HTTP ${response.status}`);
      }

      const providerError = payload["Error Message"] ?? payload.Note ?? payload.Information;
      if (providerError) {
        throw new BadGatewayException(`Alpha Vantage error: ${providerError}`);
      }

      return payload;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new BadGatewayException("Alpha Vantage request timed out");
      }

      throw new BadGatewayException("Failed to fetch Alpha Vantage data");
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

  private toAlphaCandle(datetime: string, value: AlphaVantageValue): Candle {
    const open = Number(value["1. open"]);
    const high = Number(value["2. high"]);
    const low = Number(value["3. low"]);
    const close = Number(value["4. close"]);
    const volume = Number(value["5. volume"] ?? 0);

    if (![open, high, low, close, volume].every((item) => Number.isFinite(item))) {
      throw new BadGatewayException("Received malformed OHLCV values from Alpha Vantage");
    }

    return {
      timestamp: this.normalizeTimestamp(datetime),
      open: this.round(open),
      high: this.round(high),
      low: this.round(low),
      close: this.round(close),
      volume: Math.max(0, Math.trunc(volume))
    };
  }

  private aggregateCandles(candles: Candle[], bucketSize: number): Candle[] {
    const aggregated: Candle[] = [];

    for (let index = 0; index < candles.length; index += bucketSize) {
      const chunk = candles.slice(index, index + bucketSize);
      if (chunk.length === 0) {
        continue;
      }

      aggregated.push({
        timestamp: chunk[chunk.length - 1].timestamp,
        open: chunk[0].open,
        high: Math.max(...chunk.map((item) => item.high)),
        low: Math.min(...chunk.map((item) => item.low)),
        close: chunk[chunk.length - 1].close,
        volume: Math.max(
          0,
          Math.trunc(chunk.reduce((sum, item) => sum + (Number.isFinite(item.volume) ? item.volume : 0), 0))
        )
      });
    }

    return aggregated;
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

  private isAlphaPremiumConstraint(error: unknown): boolean {
    return /premium/i.test(this.errorToMessage(error));
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown provider error";
  }
}
