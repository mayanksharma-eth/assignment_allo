import { Module } from "@nestjs/common";
import { AgentModule } from "./agent/agent.module";
import { CacheModule } from "./cache/cache.module";
import { IndicatorsModule } from "./indicators/indicators.module";
import { MarketDataModule } from "./market-data/market-data.module";
import { NlpModule } from "./nlp/nlp.module";

@Module({
  imports: [CacheModule, MarketDataModule, IndicatorsModule, AgentModule, NlpModule],
  controllers: [],
  providers: []
})
export class AppModule {}
