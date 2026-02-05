import { Timeframe } from "../market-data/market-data.types";

export type AgentAnalyzeRequest = {
  symbol: string;
  timeframe?: Timeframe;
  limit?: number;
  prompt?: string;
};

