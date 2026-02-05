import { Module } from "@nestjs/common";
import { IndicatorsModule } from "../indicators/indicators.module";
import { MarketDataModule } from "../market-data/market-data.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";

@Module({
  imports: [MarketDataModule, IndicatorsModule],
  controllers: [AgentController],
  providers: [AgentService]
})
export class AgentModule {}

