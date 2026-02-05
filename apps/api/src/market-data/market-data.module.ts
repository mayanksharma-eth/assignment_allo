import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { MarketDataController } from "./market-data.controller";
import { MarketDataService } from "./market-data.service";

@Module({
  imports: [CacheModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService]
})
export class MarketDataModule {}

