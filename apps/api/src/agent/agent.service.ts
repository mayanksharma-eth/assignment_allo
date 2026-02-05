import { Injectable } from "@nestjs/common";
import { IndicatorsService } from "../indicators/indicators.service";
import { MarketDataService } from "../market-data/market-data.service";
import { AgentAnalyzeRequest } from "./agent.types";

@Injectable()
export class AgentService {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly indicatorsService: IndicatorsService
  ) {}

  analyze(request: AgentAnalyzeRequest) {
    const timeframe = request.timeframe ?? "1d";
    const candles = this.marketDataService.getOhlcv({
      symbol: request.symbol,
      timeframe,
      limit: request.limit ?? 120
    });

    const snapshot = this.indicatorsService.getSnapshot(candles);
    const lastCandle = candles[candles.length - 1];

    const stance = this.getStance(snapshot.rsi14, snapshot.trend);
    const confidence = this.getConfidence(snapshot.rsi14, snapshot.volatility20, snapshot.trend);

    return {
      symbol: request.symbol.toUpperCase(),
      timeframe,
      prompt: request.prompt ?? null,
      latestCandle: lastCandle,
      indicators: snapshot,
      stance,
      confidence,
      summary: this.buildSummary(stance, snapshot.rsi14, snapshot.trend, snapshot.volatility20),
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

  private buildSummary(
    stance: "bullish" | "bearish" | "neutral",
    rsi14: number | null,
    trend: "uptrend" | "downtrend" | "sideways",
    volatility20: number | null
  ): string {
    const rsiPart = rsi14 === null ? "RSI unavailable" : `RSI ${rsi14.toFixed(2)}`;
    const volPart = volatility20 === null ? "volatility unavailable" : `volatility ${volatility20.toFixed(2)}%`;

    return `Current read is ${stance} with ${trend}; ${rsiPart} and ${volPart}.`;
  }
}

