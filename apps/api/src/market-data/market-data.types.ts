export type Timeframe = "1h" | "4h" | "1d";

export type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OhlcvQuery = {
  symbol: string;
  timeframe?: Timeframe;
  limit?: number;
};

