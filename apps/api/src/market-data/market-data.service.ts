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
const COINAPI_PERIODS: Record<Timeframe, string> = {
  "1h": "1HRS",
  "4h": "4HRS",
  "1d": "1DAY"
};
const COINAPI_PREFERRED_EXCHANGES = ["BINANCE", "COINBASE", "KRAKEN", "BITSTAMP", "GEMINI", "OKX", "BYBIT"];
const CRYPTO_BASES = new Set([
  "BTC",
  "ETH",
  "SOL",
  "DOGE",
  "BNB",
  "XRP",
  "ADA",
  "AVAX",
  "LTC",
  "DOT",
  "TRX",
  "MATIC",
  "LINK",
  "BCH",
  "ATOM"
]);

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

type CoinApiSymbol = {
  symbol_id?: string;
  exchange_id?: string;
  asset_id_base?: string;
  asset_id_quote?: string;
};

type CoinApiOhlcv = {
  time_period_start: string;
  price_open: number;
  price_high: number;
  price_low: number;
  price_close: number;
  volume_traded?: number;
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

    return this.normalizeCryptoSymbol(normalized) ?? normalized;
  }

  private normalizeCryptoSymbol(symbol: string): string | null {
    if (symbol.includes("/")) {
      const [base, quote] = symbol.split("/");
      if (base && quote && quote === "USD") {
        return `${base}/USD`;
      }
    }

    if (symbol.includes("-")) {
      const [base, quote] = symbol.split("-");
      if (base && quote && quote === "USD") {
        return `${base}/USD`;
      }
    }

    if (symbol.endsWith("USD")) {
      const base = symbol.slice(0, -3);
      if (CRYPTO_BASES.has(base)) {
        return `${base}/USD`;
      }
    }

    if (CRYPTO_BASES.has(symbol)) {
      return `${symbol}/USD`;
    }

    return null;
  }

  private isCryptoPair(symbol: string): boolean {
    if (symbol.includes("/")) {
      const [base, quote] = symbol.split("/");
      return Boolean(base && quote && quote === "USD");
    }

    if (symbol.endsWith("USD") && symbol.length <= 12) {
      return true;
    }

    return CRYPTO_BASES.has(symbol);
  }

  private splitPair(symbol: string): { base: string; quote: string } | null {
    if (symbol.includes("/")) {
      const [base, quote] = symbol.split("/");
      if (base && quote) {
        return { base, quote };
      }
    }

    if (symbol.endsWith("USD") && symbol.length > 3) {
      return { base: symbol.slice(0, -3), quote: "USD" };
    }

    if (CRYPTO_BASES.has(symbol)) {
      return { base: symbol, quote: "USD" };
    }

    return null;
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
      const alphaAttempted = Boolean(alphaKey);
      let alphaError: unknown = null;
      if (alphaKey) {
        this.logger.warn(`Twelve Data failed for ${symbol} (${timeframe}), switching to Alpha Vantage fallback`);
        try {
          return await this.fetchFromAlphaVantage(symbol, timeframe, limit, alphaKey);
        } catch (fallbackError) {
          alphaError = fallbackError;
        }
      }

      const coinApiKey = process.env.COINAPI_API_KEY;
      let coinApiError: unknown = null;
      if (coinApiKey && this.isCryptoPair(symbol)) {
        const reason = alphaAttempted ? "Alpha Vantage failed" : "Twelve Data failed";
        this.logger.warn(`${reason} for ${symbol} (${timeframe}), switching to CoinAPI fallback`);
        try {
          return await this.fetchFromCoinApi(symbol, timeframe, limit, coinApiKey);
        } catch (fallbackError) {
          coinApiError = fallbackError;
        }
      }

      const alphaMessage = alphaError ? ` Alpha Vantage fallback failed: ${this.errorToMessage(alphaError)}.` : "";
      const coinApiMessage = coinApiError ? ` CoinAPI fallback failed: ${this.errorToMessage(coinApiError)}.` : "";
      throw new BadGatewayException(
        `Twelve Data failed: ${this.errorToMessage(primaryError)}.${alphaMessage}${coinApiMessage}`
      );
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

  private async fetchFromCoinApi(
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    apiKey: string
  ): Promise<Candle[]> {
    const pair = this.splitPair(symbol);
    if (!pair) {
      throw new BadGatewayException(`CoinAPI supports crypto pairs; unable to resolve ${symbol}`);
    }

    const symbolId = await this.resolveCoinApiSymbolId(pair.base, pair.quote, apiKey);
    if (!symbolId) {
      throw new BadGatewayException(`CoinAPI symbol not found for ${pair.base}/${pair.quote}`);
    }

    const baseUrl = process.env.COINAPI_BASE_URL ?? "https://rest.coinapi.io";
    const timeoutMs = this.parseTimeout(process.env.COINAPI_TIMEOUT_MS);
    const url = new URL(`/v1/ohlcv/${symbolId}/history`, baseUrl);
    url.searchParams.set("period_id", COINAPI_PERIODS[timeframe]);
    url.searchParams.set("limit", String(limit));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-CoinAPI-Key": apiKey
        },
        signal: controller.signal
      });

      const payload = (await response.json()) as CoinApiOhlcv[];
      if (!response.ok) {
        const message = (payload as any)?.error ?? "CoinAPI request failed";
        throw new BadGatewayException(`CoinAPI error (${response.status}): ${message}`);
      }

      if (!Array.isArray(payload) || payload.length === 0) {
        throw new BadGatewayException(`CoinAPI returned empty OHLCV for ${symbolId}`);
      }

      return payload
        .map((bar) => this.toCoinApiCandle(bar))
        .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.close))
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .slice(-limit);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new BadGatewayException("CoinAPI request timed out");
      }

      throw new BadGatewayException("Failed to fetch CoinAPI OHLCV data");
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveCoinApiSymbolId(base: string, quote: string, apiKey: string): Promise<string | null> {
    const cacheKey = `coinapi:symbol:${base}_${quote}`;
    return this.cacheService.rememberAsync(cacheKey, 6 * 60 * 60 * 1000, async () => {
      const baseUrl = process.env.COINAPI_BASE_URL ?? "https://rest.coinapi.io";
      const timeoutMs = this.parseTimeout(process.env.COINAPI_TIMEOUT_MS);
      const url = new URL("/v1/symbols", baseUrl);
      url.searchParams.set("filter_symbol_id", `_SPOT_${base}_${quote}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "X-CoinAPI-Key": apiKey
          },
          signal: controller.signal
        });

        const payload = (await response.json()) as CoinApiSymbol[];
        if (!response.ok) {
          const message = (payload as any)?.error ?? "CoinAPI symbols request failed";
          throw new BadGatewayException(`CoinAPI error (${response.status}): ${message}`);
        }

        if (!Array.isArray(payload) || payload.length === 0) {
          return null;
        }

        const preferred =
          COINAPI_PREFERRED_EXCHANGES.map((exchange) =>
            payload.find((item) => item.exchange_id === exchange && item.symbol_id)
          ).find(Boolean) ?? payload.find((item) => item.symbol_id);

        return preferred?.symbol_id ?? null;
      } finally {
        clearTimeout(timer);
      }
    });
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

  private toCoinApiCandle(value: CoinApiOhlcv): Candle {
    return {
      timestamp: value.time_period_start,
      open: Number(value.price_open),
      high: Number(value.price_high),
      low: Number(value.price_low),
      close: Number(value.price_close),
      volume: Math.max(0, Math.trunc(Number(value.volume_traded ?? 0)))
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
