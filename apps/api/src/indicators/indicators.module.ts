import { Module } from "@nestjs/common";
import { MarketDataModule } from "../market-data/market-data.module";
import { IndicatorsController } from "./indicators.controller";
import { IndicatorsService } from "./indicators.service";

@Module({
  imports: [MarketDataModule],
  controllers: [IndicatorsController],
  providers: [IndicatorsService],
  exports: [IndicatorsService]
})
export class IndicatorsModule {}

