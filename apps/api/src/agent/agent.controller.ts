import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AgentAnalyzeRequest } from "./agent.types";
import { Timeframe } from "../market-data/market-data.types";

type AnalyzeBody = {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  prompt?: string;
};

@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("analyze")
  analyze(@Body() body: AnalyzeBody) {
    const symbol = this.resolveSymbol(body.symbol, body.prompt);
    if (!symbol) {
      throw new BadRequestException("Provide a symbol or include it in prompt");
    }

    const request: AgentAnalyzeRequest = {
      symbol,
      prompt: body.prompt,
      timeframe: this.parseTimeframe(body.timeframe),
      limit: this.parseLimit(body.limit)
    };

    return this.agentService.analyze(request);
  }

  private resolveSymbol(symbol?: string, prompt?: string): string | null {
    if (symbol && symbol.trim()) {
      return symbol.trim().toUpperCase();
    }

    if (!prompt) {
      return null;
    }

    const match = prompt.match(/\b[A-Z]{1,5}\b/);
    return match ? match[0] : null;
  }

  private parseTimeframe(timeframe?: string): Timeframe | undefined {
    if (!timeframe) {
      return undefined;
    }

    if (timeframe === "1h" || timeframe === "4h" || timeframe === "1d") {
      return timeframe;
    }

    throw new BadRequestException("timeframe must be one of: 1h, 4h, 1d");
  }

  private parseLimit(limit?: number): number | undefined {
    if (limit === undefined || limit === null) {
      return undefined;
    }

    if (!Number.isFinite(limit)) {
      throw new BadRequestException("limit must be a valid number");
    }

    return limit;
  }
}

