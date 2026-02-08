import { Timeframe } from "../market-data/market-data.types";

export type AgentAction = "analyze" | "snapshot" | "ohlcv" | "forecast";

export type AgentAnalyzeRequest = {
  symbol: string;
  timeframe?: Timeframe;
  limit?: number;
  prompt?: string;
  action?: AgentAction;
  forecastYears?: number;
};

export type ForecastYearRange = {
  year: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  catalysts: string;
  probability: string;
};

export type ForecastKeyLevel = {
  year: number;
  support: number;
  resistance: number;
  invalidation: number;
};

export type ForecastCatalystBreakdown = {
  year: number;
  macro: string;
  technical: string;
  adoption: string;
};

export type MultiYearForecast = {
  horizonYears: number;
  fromYear: number;
  toYear: number;
  basePrice: number;
  methodology: string;
  outlook: ForecastYearRange[];
  keyLevelsTimeline: ForecastKeyLevel[];
  annualCatalystBreakdown: ForecastCatalystBreakdown[];
};
