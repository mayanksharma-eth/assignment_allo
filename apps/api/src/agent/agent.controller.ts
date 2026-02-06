import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AgentAnalyzeRequest } from "./agent.types";
import { Timeframe } from "../market-data/market-data.types";
import { NlpService } from "../nlp/nlp.service";

type AnalyzeBody = {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  prompt?: string;
};

@Controller("agent")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly nlpService: NlpService
  ) {}

  @Post("analyze")
  async analyze(@Body() body: AnalyzeBody) {
    const prompt = body.prompt ?? "";
    const intent = prompt ? await this.nlpService.extractIntent(prompt) : null;
    const symbol = body.symbol?.trim() || intent?.symbol || null;
    if (!symbol) {
      throw new BadRequestException("Provide a symbol or include it in prompt");
    }

    const request: AgentAnalyzeRequest = {
      symbol,
      prompt,
      timeframe: this.parseTimeframe(body.timeframe) ?? intent?.timeframe ?? undefined,
      limit: this.parseLimit(body.limit) ?? intent?.limit ?? undefined
    };

    return this.agentService.analyze(request);
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
