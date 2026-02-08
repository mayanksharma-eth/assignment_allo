import { Injectable } from "@nestjs/common";
import { IndicatorsService } from "../indicators/indicators.service";
import { MarketDataService } from "../market-data/market-data.service";
import {
  AgentAnalyzeRequest,
  ForecastCatalystBreakdown,
  ForecastKeyLevel,
  ForecastYearRange,
  MultiYearForecast
} from "./agent.types";
import { NlpService } from "../nlp/nlp.service";

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

const EQUITY_MACRO_CATALYSTS = [
  "Fed policy path and real rates drive risk appetite",
  "Earnings cycle and growth expectations reset valuation multiples",
  "Credit conditions and labor trends shape index-level momentum",
  "Global liquidity and fiscal priorities influence broad equity demand",
  "Sector rotation and policy spending priorities reprice leadership"
];

const EQUITY_TECHNICAL_CATALYSTS = [
  "Trend persistence vs mean reversion around long-term moving averages",
  "Volume-confirmed breakouts/breakdowns define regime changes",
  "Volatility compression can resolve into directional expansion",
  "Multi-quarter base-building increases probability of sustained trends",
  "Momentum exhaustion signals become critical near cycle highs"
];

const EQUITY_ADOPTION_CATALYSTS = [
  "Institutional positioning and passive flow allocations remain supportive",
  "Retail participation strengthens during stable macro windows",
  "Corporate buybacks and strategic M&A influence demand",
  "AI and productivity narratives can shift market-wide leadership",
  "Global pension and sovereign flows can reinforce allocation trends"
];

const CRYPTO_MACRO_CATALYSTS = [
  "Liquidity regime and real-yield direction shape crypto risk appetite",
  "Policy clarity across major jurisdictions reduces regulatory overhang",
  "Dollar strength/weakness and macro volatility influence BTC beta",
  "Rate-cycle transitions can re-open speculative demand",
  "Macro stress can revive the digital-store-of-value narrative"
];

const CRYPTO_TECHNICAL_CATALYSTS = [
  "Post-halving supply dynamics remain a major structural driver",
  "Cycle resets and trend re-acceleration depend on sustained momentum",
  "Volatility compression can precede large directional repricing",
  "Miner behavior and network health influence market structure",
  "Liquidity fragmentation can amplify breakout and breakdown ranges"
];

const CRYPTO_ADOPTION_CATALYSTS = [
  "Spot ETF penetration and custody expansion broaden access",
  "Treasury allocation interest from institutions can deepen demand",
  "Payment and settlement pilots increase real-world utility",
  "Cross-border and emerging-market usage may expand in stress periods",
  "Exchange, broker, and bank integrations improve retail onboarding"
];

@Injectable()
export class AgentService {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly indicatorsService: IndicatorsService,
    private readonly nlpService: NlpService
  ) {}

  async analyze(request: AgentAnalyzeRequest) {
    const timeframe = request.timeframe ?? "1d";
    const candles = await this.marketDataService.getOhlcv({
      symbol: request.symbol,
      timeframe,
      limit: request.limit ?? 120
    });

    const snapshot = this.indicatorsService.getSnapshot(candles);
    const lastCandle = candles[candles.length - 1];

    const stance = this.getStance(snapshot.rsi14, snapshot.trend);
    const confidence = this.getConfidence(snapshot.rsi14, snapshot.volatility20, snapshot.trend);

    const summaryResult = await this.nlpService.summarizeAnalysis({
      prompt: request.prompt ?? "",
      symbol: request.symbol.toUpperCase(),
      timeframe,
      latestCandle: lastCandle,
      indicators: snapshot,
      stance,
      confidence
    });

    const forecast = this.buildMultiYearForecast({
      symbol: request.symbol.toUpperCase(),
      latestPrice: lastCandle.close,
      latestTimestamp: lastCandle.timestamp,
      trend: snapshot.trend,
      rsi14: snapshot.rsi14,
      volatility20: snapshot.volatility20,
      prompt: request.prompt,
      action: request.action,
      forecastYears: request.forecastYears
    });

    return {
      symbol: request.symbol.toUpperCase(),
      timeframe,
      prompt: request.prompt ?? null,
      latestCandle: lastCandle,
      indicators: snapshot,
      stance,
      confidence,
      forecast,
      summary: null,
      llmSummary: summaryResult?.text ?? null,
      summarySource: summaryResult?.source ?? null,
      notFinancialAdvice: true
    };
  }

  private getStance(
    rsi14: number | null,
    trend: "uptrend" | "downtrend" | "sideways"
  ): "bullish" | "bearish" | "neutral" {
    if (rsi14 !== null && rsi14 <= 35 && trend !== "downtrend") {
      return "bullish";
    }

    if (rsi14 !== null && rsi14 >= 65 && trend !== "uptrend") {
      return "bearish";
    }

    if (trend === "uptrend") {
      return "bullish";
    }

    if (trend === "downtrend") {
      return "bearish";
    }

    return "neutral";
  }

  private getConfidence(
    rsi14: number | null,
    volatility20: number | null,
    trend: "uptrend" | "downtrend" | "sideways"
  ): number {
    let score = 50;

    if (trend !== "sideways") {
      score += 10;
    }

    if (rsi14 !== null) {
      if (rsi14 <= 35 || rsi14 >= 65) {
        score += 12;
      } else if (rsi14 >= 45 && rsi14 <= 55) {
        score -= 5;
      }
    }

    if (volatility20 !== null) {
      if (volatility20 > 45) {
        score -= 12;
      } else if (volatility20 < 20) {
        score += 8;
      }
    }

    return Math.max(10, Math.min(95, score));
  }

  private buildMultiYearForecast(input: {
    symbol: string;
    latestPrice: number;
    latestTimestamp: string;
    trend: "uptrend" | "downtrend" | "sideways";
    rsi14: number | null;
    volatility20: number | null;
    prompt?: string;
    action?: AgentAnalyzeRequest["action"];
    forecastYears?: number;
  }): MultiYearForecast | null {
    const isForecastRequest =
      input.action === "forecast" ||
      input.forecastYears !== undefined ||
      this.isForecastPrompt(input.prompt);
    if (!isForecastRequest) {
      return null;
    }

    const horizonYears = this.normalizeForecastYears(input.forecastYears ?? this.extractForecastYears(input.prompt) ?? 3);
    const fromYear = this.resolveStartYear(input.latestTimestamp);
    const toYear = fromYear + horizonYears;
    const isCrypto = this.isCryptoSymbol(input.symbol);
    const annualizedVolatility = input.volatility20 ?? (isCrypto ? 75 : 28);
    const trendTilt = input.trend === "uptrend" ? 0.06 : input.trend === "downtrend" ? -0.04 : 0;
    const rsiTilt = input.rsi14 === null ? 0 : input.rsi14 < 40 ? 0.04 : input.rsi14 > 65 ? -0.04 : 0;
    const baseDrift = (isCrypto ? 0.22 : 0.11) + trendTilt + rsiTilt;
    const probabilityBase = isCrypto ? 60 : 68;
    const probabilityStep = isCrypto ? 10 : 8;
    let anchorPrice = input.latestPrice;

    const outlook: ForecastYearRange[] = [];
    const keyLevelsTimeline: ForecastKeyLevel[] = [];
    const annualCatalystBreakdown: ForecastCatalystBreakdown[] = [];

    for (let offset = 0; offset <= horizonYears; offset += 1) {
      const year = fromYear + offset;
      const yearlyDriftPenalty = offset * (isCrypto ? 0.03 : 0.02);
      const annualReturn = this.clamp(baseDrift - yearlyDriftPenalty, -0.15, isCrypto ? 0.55 : 0.3);
      anchorPrice = Math.max(0.01, anchorPrice * (1 + annualReturn));

      const bandSeed = (annualizedVolatility / 100) * (isCrypto ? 0.85 : 0.55) + 0.18 + offset * (isCrypto ? 0.04 : 0.03);
      const bandWidth = this.clamp(bandSeed, 0.2, isCrypto ? 1.35 : 0.65);
      const priceRangeLow = Math.max(0.01, anchorPrice * (1 - bandWidth * 0.45));
      const priceRangeHigh = Math.max(priceRangeLow, anchorPrice * (1 + bandWidth * 0.75));
      const support = Math.max(0.01, anchorPrice * (1 - bandWidth * 0.35));
      const resistance = Math.max(support, anchorPrice * (1 + bandWidth * 0.55));
      const invalidation = Math.max(0.01, support * (isCrypto ? 0.78 : 0.86));
      const probability = `${Math.max(isCrypto ? 20 : 30, probabilityBase - offset * probabilityStep)}% base case`;
      const catalysts = this.resolveCatalysts(input.symbol, year, offset, isCrypto);

      outlook.push({
        year,
        priceRangeLow: this.roundPrice(priceRangeLow),
        priceRangeHigh: this.roundPrice(priceRangeHigh),
        catalysts: `${catalysts.macro}; ${catalysts.technical}; ${catalysts.adoption}`,
        probability
      });

      keyLevelsTimeline.push({
        year,
        support: this.roundPrice(support),
        resistance: this.roundPrice(resistance),
        invalidation: this.roundPrice(invalidation)
      });

      annualCatalystBreakdown.push({
        year,
        macro: catalysts.macro,
        technical: catalysts.technical,
        adoption: catalysts.adoption
      });
    }

    const methodology = isCrypto
      ? "Model blends current price, trend, RSI, annualized volatility, and crypto-cycle assumptions to estimate yearly ranges."
      : "Model blends current price, trend, RSI, annualized volatility, and earnings-cycle assumptions to estimate yearly ranges.";

    return {
      horizonYears,
      fromYear,
      toYear,
      basePrice: this.roundPrice(input.latestPrice),
      methodology,
      outlook,
      keyLevelsTimeline,
      annualCatalystBreakdown
    };
  }

  private resolveCatalysts(
    symbol: string,
    year: number,
    offset: number,
    isCrypto: boolean
  ): { macro: string; technical: string; adoption: string } {
    if (isCrypto) {
      return this.resolveCryptoCatalysts(symbol, year, offset);
    }

    return {
      macro: EQUITY_MACRO_CATALYSTS[offset % EQUITY_MACRO_CATALYSTS.length],
      technical: EQUITY_TECHNICAL_CATALYSTS[offset % EQUITY_TECHNICAL_CATALYSTS.length],
      adoption: EQUITY_ADOPTION_CATALYSTS[offset % EQUITY_ADOPTION_CATALYSTS.length]
    };
  }

  private resolveCryptoCatalysts(
    symbol: string,
    year: number,
    offset: number
  ): { macro: string; technical: string; adoption: string } {
    const normalized = symbol.toUpperCase();
    const baseMacro = CRYPTO_MACRO_CATALYSTS[offset % CRYPTO_MACRO_CATALYSTS.length];
    const baseTechnical = CRYPTO_TECHNICAL_CATALYSTS[offset % CRYPTO_TECHNICAL_CATALYSTS.length];
    const baseAdoption = CRYPTO_ADOPTION_CATALYSTS[offset % CRYPTO_ADOPTION_CATALYSTS.length];

    const isBitcoin = normalized.startsWith("BTC");
    if (!isBitcoin) {
      return { macro: baseMacro, technical: baseTechnical, adoption: baseAdoption };
    }

    if (year === 2026) {
      return {
        macro: "ETF and macro-liquidity flows are likely to remain the primary BTC driver",
        technical: "Lag effects from the 2024 halving can still influence supply-demand imbalance",
        adoption: "Institutional treasury and allocator participation may broaden"
      };
    }

    if (year === 2027) {
      return {
        macro: "Policy and election-cycle uncertainty may raise both risk and opportunity",
        technical: "Pre-2028 halving positioning can create accumulation phases",
        adoption: "Sovereign and strategic-reserve debate may support long-duration narratives"
      };
    }

    if (year === 2028) {
      return {
        macro: "Global growth and liquidity backdrop will dictate post-halving demand elasticity",
        technical: "Expected 2028 halving window can trigger supply-shock repricing",
        adoption: "Global ETF and bank-custody rails can accelerate mainstream access"
      };
    }

    if (year >= 2029) {
      return {
        macro: "Post-halving macro regime determines whether BTC behaves more like risk or reserve",
        technical: "Cycle maturity and trend persistence become key to sustaining high valuations",
        adoption: "Corporate and institutional treasury integration can anchor long-term demand"
      };
    }

    return {
      macro: baseMacro,
      technical: baseTechnical,
      adoption: baseAdoption
    };
  }

  private isForecastPrompt(prompt?: string): boolean {
    if (!prompt) {
      return false;
    }

    return /\b(predict|prediction|forecast|outlook|next\s+\d+\s+years?|long[- ]term|multi[- ]year)\b/i.test(prompt);
  }

  private extractForecastYears(prompt?: string): number | null {
    if (!prompt) {
      return null;
    }

    const nextYearsMatch = prompt.match(/\bnext\s+(\d{1,2})\s+years?\b/i);
    if (nextYearsMatch) {
      return Number.parseInt(nextYearsMatch[1], 10);
    }

    const genericYearsMatch = prompt.match(/\b(\d{1,2})\s*[- ]?years?\b/i);
    if (genericYearsMatch) {
      return Number.parseInt(genericYearsMatch[1], 10);
    }

    return null;
  }

  private normalizeForecastYears(rawYears: number): number {
    if (!Number.isFinite(rawYears)) {
      return 3;
    }

    const normalized = Math.floor(rawYears);
    if (normalized < 1) {
      return 1;
    }

    return Math.min(8, normalized);
  }

  private resolveStartYear(latestTimestamp: string): number {
    const latestYear = new Date(latestTimestamp).getUTCFullYear();
    const nowYear = new Date().getUTCFullYear();
    if (Number.isNaN(latestYear)) {
      return nowYear;
    }

    return Math.max(latestYear, nowYear);
  }

  private isCryptoSymbol(symbol: string): boolean {
    const normalized = symbol.trim().toUpperCase();
    if (normalized.includes("/")) {
      return normalized.endsWith("/USD");
    }

    if (normalized.endsWith("USD") && normalized.length > 3) {
      return true;
    }

    return CRYPTO_BASES.has(normalized);
  }

  private roundPrice(value: number): number {
    if (value >= 1_000) {
      return Math.round(value);
    }
    if (value >= 100) {
      return Math.round(value * 10) / 10;
    }
    return Math.round(value * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
