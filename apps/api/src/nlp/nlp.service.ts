import { Injectable } from "@nestjs/common";

const SYMBOL_STOPWORDS = new Set(["RSI", "EMA", "SMA", "MACD", "OHLCV", "VWAP", "ATR", "ADX", "ROC"]);
const SYMBOL_HINT_STOPWORDS = new Set([
  "STOCK",
  "STOCKS",
  "SHARE",
  "SHARES",
  "CRYPTO",
  "COIN",
  "TOKEN",
  "MARKET",
  "PRICE",
  "QUOTE",
  "FORECAST",
  "OUTLOOK",
  "TREND",
  "RSI",
  "VOLATILITY",
  "CHART",
  "SNAPSHOT",
  "ANALYSIS",
  "ANALYZE",
  "REVIEW",
  "CHECK",
  "LOOK",
  "SHOW",
  "GIVE",
  "WHAT",
  "ABOUT",
  "WITH",
  "FOR",
  "ON",
  "OF",
  "TODAY",
  "NOW",
  "LATEST",
  "PLEASE",
  "BUY",
  "SELL",
  "HOLD",
  "ENTRY",
  "EXIT",
  "TARGET",
  "PREDICT",
  "PREDICTION",
  "THOUGHTS",
  "OPINION",
  "ADVICE",
  "HELP",
  "ETF",
  "ETFS",
  "THE",
  "THIS",
  "THAT",
  "MY",
  "YOUR",
  "OUR",
  "A",
  "AN"
]);
const COMPANY_SYMBOL_MAP: Record<string, string> = {
  TESLA: "TSLA",
  APPLE: "AAPL",
  MICROSOFT: "MSFT",
  NVIDIA: "NVDA",
  AMAZON: "AMZN",
  META: "META",
  FACEBOOK: "META",
  NETFLIX: "NFLX",
  GOOGLE: "GOOGL",
  ALPHABET: "GOOGL",
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE"
};

type NlpIntent = {
  symbol: string | null;
  timeframe: "1h" | "4h" | "1d" | null;
  limit: number | null;
  action: "analyze" | "snapshot" | "ohlcv" | "forecast" | null;
  horizonYears: number | null;
  confidence: number;
};

type SummaryInput = {
  prompt: string;
  symbol: string;
  timeframe: string;
  latestCandle: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  indicators: {
    latestClose: number;
    changePercent: number;
    sma20: number | null;
    ema20: number | null;
    rsi14: number | null;
    volatility20: number | null;
    trend: string;
  };
  stance: string;
  confidence: number;
};

type SummaryResult = {
  text: string;
  source: "groq";
};

@Injectable()
export class NlpService {
  async extractIntent(prompt: string): Promise<NlpIntent> {
    const trimmed = prompt?.trim();
    if (!trimmed) {
      return this.fallbackIntent(prompt);
    }

    if (this.isGroqEnabled()) {
      try {
        const intent = await this.requestGroqIntent(trimmed);
        if (intent) {
          return intent;
        }
      } catch {
        // fall back below
      }
    }

    return this.fallbackIntent(prompt);
  }

  async summarizeAnalysis(input: SummaryInput): Promise<SummaryResult | null> {
    if (this.isGroqEnabled()) {
      try {
        const summary = await this.requestGroqSummary(input);
        if (summary) {
          return { text: summary, source: "groq" };
        }
      } catch {
        return null;
      }
    }

    return null;
  }


  private parseIntent(payload: any): NlpIntent | null {
    const parsed = payload ?? {};
    const symbol = typeof parsed.symbol === "string" ? parsed.symbol.toUpperCase() : null;
    const timeframe = ["1h", "4h", "1d"].includes(parsed.timeframe) ? parsed.timeframe : null;
    const action = ["analyze", "snapshot", "ohlcv", "forecast"].includes(parsed.action) ? parsed.action : null;
    const limit = Number.isFinite(parsed.limit) ? Number(parsed.limit) : null;
    const horizonYears = this.normalizeHorizonYears(parsed.horizonYears);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    if (!symbol && !timeframe && !action && !limit && !horizonYears) {
      return null;
    }

    return {
      symbol,
      timeframe,
      limit,
      action,
      horizonYears,
      confidence
    };
  }

  private safeJsonParse(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(content.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private fallbackIntent(prompt?: string): NlpIntent {
    const symbol = this.resolveSymbol(prompt);
    const action = this.resolveAction(prompt);
    const timeframe = this.resolveTimeframe(prompt);
    const limit = this.resolveLimit(prompt);
    const horizonYears = this.resolveHorizonYears(prompt, action);

    return {
      symbol,
      timeframe,
      limit,
      action,
      horizonYears,
      confidence: 0.4
    };
  }

  private resolveSymbol(prompt?: string): string | null {
    if (!prompt) {
      return null;
    }

    const pairMatch = prompt.match(/\b([A-Za-z0-9]{2,10})\/(USD)\b/i);
    if (pairMatch) {
      return `${pairMatch[1].toUpperCase()}/${pairMatch[2].toUpperCase()}`;
    }

    const compactPair = prompt.match(/\b([A-Za-z0-9]{2,10})USD\b/i);
    if (compactPair) {
      return `${compactPair[1].toUpperCase()}/USD`;
    }

    const mappedName = this.resolveMappedName(prompt);
    if (mappedName) {
      return mappedName;
    }

    const intentMatch = prompt.match(
      /\b(?:review|analyze|analysis|predict|prediction|check|look\s+at|look\s+into|thoughts\s+on|thoughts\s+about|what\s+about|whats?\s+up\s+with|tell\s+me\s+about|show\s+me|give\s+me|price|quote|forecast|outlook|trend|rsi|volatility|chart|snapshot|buy|sell|hold|entry|exit|target)\s+(?:of|for|on|about)?\s*(?:the\s+)?([A-Za-z0-9/]{1,10})\b/i
    );
    if (intentMatch) {
      const candidate = this.normalizeSymbolCandidate(intentMatch[1]);
      if (candidate) {
        return candidate;
      }
    }

    const nounMatch = prompt.match(/\b([A-Za-z0-9/]{1,10})\s+(?:stock|stocks|share|shares|ticker|token|coin|etf|etfs)\b/i);
    if (nounMatch) {
      const candidate = this.normalizeSymbolCandidate(nounMatch[1]);
      if (candidate) {
        return candidate;
      }
    }

    const dollarMatch = prompt.match(/\$([A-Za-z]{1,6})\b/);
    if (dollarMatch) {
      const candidate = this.normalizeSymbolCandidate(dollarMatch[1]);
      if (candidate) {
        return candidate;
      }
    }

    const tokens = Array.from(prompt.matchAll(/\b[A-Z]{1,6}\b/g)).map((match) => match[0]);
    const filtered = tokens
      .map((token) => this.normalizeSymbolCandidate(token))
      .filter((token): token is string => Boolean(token));
    if (filtered.length) {
      return filtered[filtered.length - 1];
    }

    const wordMatch = prompt.match(/\b(?:for|of|on|about)\s+(?:the\s+)?([A-Za-z0-9/]{1,10})\b/i);
    if (wordMatch) {
      return this.normalizeSymbolCandidate(wordMatch[1]);
    }

    return null;
  }

  private resolveMappedName(prompt: string): string | null {
    const upperPrompt = prompt.toUpperCase();
    for (const [name, mapped] of Object.entries(COMPANY_SYMBOL_MAP)) {
      const pattern = new RegExp(`\\b${name}\\b`, "i");
      if (pattern.test(upperPrompt)) {
        return mapped;
      }
    }

    return null;
  }

  private normalizeSymbolCandidate(rawCandidate?: string): string | null {
    if (!rawCandidate) {
      return null;
    }

    const candidate = rawCandidate.trim().toUpperCase();
    if (!candidate || SYMBOL_STOPWORDS.has(candidate) || SYMBOL_HINT_STOPWORDS.has(candidate)) {
      return null;
    }

    if (/^[A-Z0-9]{1,6}$/.test(candidate)) {
      return candidate;
    }

    if (/^[A-Z0-9]{2,10}\/USD$/.test(candidate)) {
      return candidate;
    }

    if (/^[A-Z0-9]{2,10}USD$/.test(candidate)) {
      return `${candidate.slice(0, -3)}/USD`;
    }

    return null;
  }

  private resolveAction(prompt?: string): NlpIntent["action"] {
    if (!prompt) {
      return null;
    }

    const lower = prompt.toLowerCase();
    if (
      lower.includes("predict") ||
      lower.includes("prediction") ||
      lower.includes("forecast") ||
      lower.includes("outlook") ||
      lower.includes("next year") ||
      lower.includes("next-year")
    ) {
      return "forecast";
    }

    if (lower.includes("chart") || lower.includes("ohlcv")) {
      return "ohlcv";
    }
    if (lower.includes("snapshot") || lower.includes("price")) {
      return "snapshot";
    }

    return "analyze";
  }

  private resolveHorizonYears(prompt?: string, action?: NlpIntent["action"]): number | null {
    if (!prompt) {
      return action === "forecast" ? 3 : null;
    }

    const explicitNextYears = prompt.match(/\bnext\s+(\d{1,2})\s+years?\b/i);
    if (explicitNextYears) {
      return this.normalizeHorizonYears(explicitNextYears[1]);
    }

    const explicitYears = prompt.match(/\b(\d{1,2})\s*[- ]?years?\b/i);
    if (explicitYears) {
      return this.normalizeHorizonYears(explicitYears[1]);
    }

    const isForecastPrompt =
      action === "forecast" ||
      /\b(predict|prediction|forecast|outlook|long[- ]term|multi[- ]year)\b/i.test(prompt);
    if (isForecastPrompt) {
      return 3;
    }

    return null;
  }

  private normalizeHorizonYears(raw: unknown): number | null {
    const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const rounded = Math.floor(parsed);
    if (rounded < 1) {
      return null;
    }

    return Math.min(8, rounded);
  }

  private resolveTimeframe(prompt?: string): NlpIntent["timeframe"] {
    if (!prompt) {
      return null;
    }

    const lower = prompt.toLowerCase();
    if (lower.includes("4h") || lower.includes("4 hour")) {
      return "4h";
    }
    if (lower.includes("1h") || lower.includes("hour")) {
      return "1h";
    }
    if (lower.includes("daily") || lower.includes("1d") || lower.includes("day")) {
      return "1d";
    }

    return null;
  }

  private resolveLimit(prompt?: string): number | null {
    if (!prompt) {
      return null;
    }

    const match = prompt.match(/\b(\d{2,3})\b/);
    if (!match) {
      return null;
    }

    const limit = Number.parseInt(match[1], 10);
    if (Number.isNaN(limit)) {
      return null;
    }

    return Math.min(500, Math.max(20, limit));
  }

  private parseTimeout(raw?: string): number {
    if (!raw) {
      return 8_000;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return 8_000;
    }

    return Math.min(20_000, Math.max(1_000, parsed));
  }

  private timeoutSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  private isGroqEnabled(): boolean {
    const flag = process.env.USE_GROQ_SUMMARY;
    if (flag) {
      const normalized = flag.trim().toLowerCase();
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
      return true;
    }

    return Boolean(process.env.GROQ_API_KEY ?? process.env.GROQ_API);
  }

  private async requestGroqIntent(prompt: string): Promise<NlpIntent | null> {
    const apiKey = process.env.GROQ_API_KEY ?? process.env.GROQ_API;
    if (!apiKey) {
      return null;
    }

    const baseUrl = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
    const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    const timeoutMs = this.parseTimeout(process.env.GROQ_TIMEOUT_MS);
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL("chat/completions", normalizedBase);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Extract intent from the user prompt. Return JSON only with keys: symbol, timeframe, limit, action, horizonYears, confidence. Map company names to tickers (Tesla->TSLA, Apple->AAPL, Microsoft->MSFT, Nvidia->NVDA, Amazon->AMZN, Meta/Facebook->META, Netflix->NFLX, Google/Alphabet->GOOGL). For crypto, return the pair in USD format (BTC/USD, ETH/USD, SOL/USD, DOGE/USD). If you infer another coin, still return TICKER/USD. Timeframe must be 1h, 4h, or 1d or null. Action must be analyze, snapshot, ohlcv, forecast, or null. horizonYears must be integer or null."
          },
          { role: "user", content: prompt }
        ]
      }),
      signal: this.timeoutSignal(timeoutMs)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "Groq intent request failed");
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    const parsed = this.safeJsonParse(content.trim());
    if (!parsed) {
      return null;
    }

    return this.parseIntent(parsed);
  }

  private async requestGroqSummary(input: SummaryInput): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY ?? process.env.GROQ_API;
    if (!apiKey) {
      return null;
    }

    const baseUrl = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
    const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    const timeoutMs = this.parseTimeout(process.env.GROQ_TIMEOUT_MS);
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL("chat/completions", normalizedBase);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Summarize the provided market data in 2-3 sentences. Use only the data given. Do not give financial advice. If the prompt asks to buy/sell, say you can't advise and then summarize trend, RSI, volatility, and latest price."
          },
          {
            role: "user",
            content: JSON.stringify(input)
          }
        ]
      }),
      signal: this.timeoutSignal(timeoutMs)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "Groq request failed");
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    return content.trim();
  }
}
