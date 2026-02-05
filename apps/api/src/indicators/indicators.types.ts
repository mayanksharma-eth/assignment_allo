export type IndicatorSnapshot = {
  latestClose: number;
  changePercent: number;
  sma20: number | null;
  ema20: number | null;
  rsi14: number | null;
  volatility20: number | null;
  trend: "uptrend" | "downtrend" | "sideways";
};

