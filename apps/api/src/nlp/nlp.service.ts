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
  "ETFs"
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
  BITCOIN: "BTC"
};

type NlpIntent = {
  symbol: string | null;
  timeframe: "1h" | "4h" | "1d" | null;
  limit: number | null;
  action: "analyze" | "snapshot" | "ohlcv" | null;
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
    const action = ["analyze", "snapshot", "ohlcv"].includes(parsed.action) ? parsed.action : null;
    const limit = Number.isFinite(parsed.limit) ? Number(parsed.limit) : null;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    if (!symbol && !timeframe && !action && !limit) {
      return null;
    }

    return {
      symbol,
      timeframe,
      limit,
      action,
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

    return {
      symbol,
      timeframe,
      limit,
      action,
      confidence: 0.4
    };
  }

  private resolveSymbol(prompt?: string): string | null {
    if (!prompt) {
      return null;
    }

    const intentMatch = prompt.match(
      /\b(?:review|analyze|analysis|check|look\s+at|look\s+into|thoughts\s+on|thoughts\s+about|what\s+about|whats?\s+up\s+with|tell\s+me\s+about|show\s+me|give\s+me|price|quote|forecast|outlook|trend|rsi|volatility|chart|snapshot|buy|sell|hold|entry|exit|target)\s+(?:of|for|on|about)?\s*([A-Za-z]{1,6})\b/i
    );
    if (intentMatch) {
      const candidate = intentMatch[1].toUpperCase();
      if (!SYMBOL_STOPWORDS.has(candidate) && !SYMBOL_HINT_STOPWORDS.has(candidate)) {
        return candidate;
      }
    }

    const nounMatch = prompt.match(/\b([A-Za-z]{1,6})\s+(?:stock|stocks|share|shares|ticker|token|coin|etf|etfs)\b/i);
    if (nounMatch) {
      const candidate = nounMatch[1].toUpperCase();
      if (!SYMBOL_STOPWORDS.has(candidate) && !SYMBOL_HINT_STOPWORDS.has(candidate)) {
        return candidate;
      }
    }

    const upperPrompt = prompt.toUpperCase();
    for (const [name, mapped] of Object.entries(COMPANY_SYMBOL_MAP)) {
      const pattern = new RegExp(`\\b${name}\\b`, "i");
      if (pattern.test(upperPrompt)) {
        return mapped;
      }
    }

    const dollarMatch = prompt.match(/\$([A-Za-z]{1,5})\b/);
    if (dollarMatch) {
      return dollarMatch[1].toUpperCase();
    }

    const tokens = Array.from(prompt.matchAll(/\b[A-Z]{1,5}\b/g)).map((match) => match[0]);
    const filtered = tokens.filter((token) => !SYMBOL_STOPWORDS.has(token));
    if (filtered.length) {
      return filtered[filtered.length - 1];
    }

    if (tokens.length) {
      return tokens[tokens.length - 1];
    }

    const wordMatch = prompt.match(/\b(?:for|of|on|about)\s+([A-Za-z]{1,5})\b/i);
    if (wordMatch) {
      const candidate = wordMatch[1].toUpperCase();
      return SYMBOL_STOPWORDS.has(candidate) ? null : candidate;
    }

    return null;
  }

  private resolveAction(prompt?: string): NlpIntent["action"] {
    if (!prompt) {
      return null;
    }

    const lower = prompt.toLowerCase();
    if (lower.includes("chart") || lower.includes("ohlcv")) {
      return "ohlcv";
    }
    if (lower.includes("snapshot") || lower.includes("price")) {
      return "snapshot";
    }

    return "analyze";
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
              "Extract intent from the user prompt. Return JSON only with keys: symbol, timeframe, limit, action, confidence. Map company names to tickers (Tesla->TSLA, Apple->AAPL, Microsoft->MSFT, Nvidia->NVDA, Amazon->AMZN, Meta/Facebook->META, Netflix->NFLX, Google/Alphabet->GOOGL). For crypto, return the pair in USD format (BTC/USD, ETH/USD, SOL/USD, DOGE/USD). If you infer another coin, still return TICKER/USD. Timeframe must be 1h, 4h, or 1d or null. Action must be analyze, snapshot, ohlcv, or null."
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
