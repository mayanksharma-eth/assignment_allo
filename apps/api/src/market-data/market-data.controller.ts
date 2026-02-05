import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { MarketDataService } from "./market-data.service";
import { Timeframe } from "./market-data.types";

@Controller("market-data")
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get("ohlcv")
  getOhlcv(
    @Query("symbol") symbol?: string,
    @Query("timeframe") timeframe?: string,
    @Query("limit") limit?: string
  ) {
    if (!symbol || !symbol.trim()) {
      throw new BadRequestException("symbol query param is required");
    }

    return this.marketDataService.getOhlcv({
      symbol,
      timeframe: this.parseTimeframe(timeframe),
      limit: this.parseLimit(limit)
    });
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

  private parseLimit(limit?: string): number | undefined {
    if (!limit) {
      return undefined;
    }

    const parsed = Number.parseInt(limit, 10);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException("limit must be a number");
    }

    return parsed;
  }
}

