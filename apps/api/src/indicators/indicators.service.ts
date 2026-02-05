import { Injectable } from "@nestjs/common";
import { Candle } from "../market-data/market-data.types";
import { IndicatorSnapshot } from "./indicators.types";

@Injectable()
export class IndicatorsService {
  getSnapshot(candles: Candle[]): IndicatorSnapshot {
    if (candles.length < 2) {
      throw new Error("Need at least 2 candles to compute indicators");
    }

    const closes = candles.map((candle) => candle.close);
    const latestClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const changePercent = ((latestClose - prevClose) / prevClose) * 100;

    const smaSeries = this.sma(closes, 20);
    const emaSeries = this.ema(closes, 20);
    const rsiSeries = this.rsi(closes, 14);
    const volatilitySeries = this.volatility(closes, 20);

    const sma20 = this.lastNumber(smaSeries);
    const ema20 = this.lastNumber(emaSeries);
    const rsi14 = this.lastNumber(rsiSeries);
    const volatility20 = this.lastNumber(volatilitySeries);
    const trend = this.getTrend(latestClose, sma20, ema20);

    return {
      latestClose: this.round(latestClose),
      changePercent: this.round(changePercent),
      sma20,
      ema20,
      rsi14,
      volatility20,
      trend
    };
  }

  private sma(values: number[], period: number): Array<number | null> {
    const result: Array<number | null> = [];
    let rollingSum = 0;

    for (let i = 0; i < values.length; i += 1) {
      rollingSum += values[i];

      if (i >= period) {
        rollingSum -= values[i - period];
      }

      if (i < period - 1) {
        result.push(null);
      } else {
        result.push(this.round(rollingSum / period));
      }
    }

    return result;
  }

  private ema(values: number[], period: number): Array<number | null> {
    const result: Array<number | null> = Array(values.length).fill(null);
    if (values.length < period) {
      return result;
    }

    const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    const multiplier = 2 / (period + 1);
    let current = seed;
    result[period - 1] = this.round(seed);

    for (let i = period; i < values.length; i += 1) {
      current = (values[i] - current) * multiplier + current;
      result[i] = this.round(current);
    }

    return result;
  }

  private rsi(values: number[], period: number): Array<number | null> {
    const result: Array<number | null> = Array(values.length).fill(null);
    if (values.length <= period) {
      return result;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i += 1) {
      const delta = values[i] - values[i - 1];
      if (delta >= 0) {
        gains += delta;
      } else {
        losses += Math.abs(delta);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    result[period] = this.round(this.rsiFromAverages(avgGain, avgLoss));

    for (let i = period + 1; i < values.length; i += 1) {
      const delta = values[i] - values[i - 1];
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? Math.abs(delta) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result[i] = this.round(this.rsiFromAverages(avgGain, avgLoss));
    }

    return result;
  }

  private volatility(values: number[], period: number): Array<number | null> {
    const result: Array<number | null> = Array(values.length).fill(null);
    if (values.length <= period) {
      return result;
    }

    const returns: number[] = [];
    for (let i = 1; i < values.length; i += 1) {
      returns.push(Math.log(values[i] / values[i - 1]));
    }

    for (let i = period - 1; i < returns.length; i += 1) {
      const slice = returns.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
      const variance = slice.reduce((sum, value) => sum + (value - avg) ** 2, 0) / slice.length;
      const annualizedVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
      result[i + 1] = this.round(annualizedVol);
    }

    return result;
  }

  private rsiFromAverages(avgGain: number, avgLoss: number): number {
    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private getTrend(
    latestClose: number,
    sma20: number | null,
    ema20: number | null
  ): "uptrend" | "downtrend" | "sideways" {
    if (sma20 === null || ema20 === null) {
      return "sideways";
    }

    if (latestClose > sma20 && latestClose > ema20) {
      return "uptrend";
    }

    if (latestClose < sma20 && latestClose < ema20) {
      return "downtrend";
    }

    return "sideways";
  }

  private lastNumber(values: Array<number | null>): number | null {
    for (let i = values.length - 1; i >= 0; i -= 1) {
      if (values[i] !== null) {
        return this.round(values[i] as number);
      }
    }

    return null;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

