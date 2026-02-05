"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const DEFAULT_TIMEFRAME = "1d";
const DEFAULT_LIMIT = 120;
const SYMBOL_STOPWORDS = new Set(["RSI", "EMA", "SMA", "MACD", "OHLCV", "VWAP", "ATR", "ADX", "ROC"]);

function buildUrl(path, params) {
  const url = new URL(path, API_BASE_URL);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function requestJson(path, options = {}) {
  const { method = "GET", body, params } = options;

  const response = await fetch(buildUrl(path, params), {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed (${response.status})`);
  }

  if (payload?.status === "error") {
    throw new Error(payload.message ?? "Backend request failed");
  }

  return payload;
}

const backendApi = {
  analyze: (data) =>
    requestJson("/agent/analyze", {
      method: "POST",
      body: data
    }),
  snapshot: (params) =>
    requestJson("/indicators/snapshot", {
      params
    }),
  ohlcv: (params) =>
    requestJson("/market-data/ohlcv", {
      params
    })
};

function extractSymbol(text) {
  if (!text) {
    return null;
  }

  const dollarMatch = text.match(/\$([A-Za-z]{1,5})\b/);
  if (dollarMatch) {
    return dollarMatch[1].toUpperCase();
  }

  const tokens = Array.from(text.matchAll(/\b[A-Z]{1,5}\b/g)).map((match) => match[0]);
  const filtered = tokens.filter((token) => !SYMBOL_STOPWORDS.has(token));
  if (filtered.length) {
    return filtered[filtered.length - 1];
  }

  if (tokens.length) {
    return tokens[tokens.length - 1];
  }

  const wordMatch = text.match(/\b(?:for|of|on|about)\s+([A-Za-z]{1,5})\b/i);
  if (wordMatch) {
    const candidate = wordMatch[1].toUpperCase();
    return SYMBOL_STOPWORDS.has(candidate) ? null : candidate;
  }

  return null;
}

function numberFormat(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function toPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

function Icon({ children, size = 18 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 24 24" width={size} height={size}>
        {children}
      </svg>
    </span>
  );
}

function Sidebar({ onNewChat, onPickHistory, theme, onToggleTheme }) {
  const [historyOpen, setHistoryOpen] = useState(true);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M4 18V6m0 12h16M8 14V8m4 6V5m4 9V9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand__name">Allo</span>
        </div>
        <div className="sidebar__icons" aria-hidden="true">
          <button
            className="iconBtn"
            title={theme === "dark" ? "Day mode" : "Night mode"}
            type="button"
            onClick={onToggleTheme}
            aria-pressed={theme === "dark"}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button className="iconBtn" title="Shortcuts" type="button">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M6 5h12M6 12h12M6 19h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <button className="newChat" type="button" onClick={onNewChat}>
        <span className="newChat__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M4 6h16v10H7l-3 3V6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M12 8v6M9 11h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        New Chat
      </button>

      <nav className="nav">
        <a className="nav__item" href="#">
          <span className="nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9L12 3Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Alpha
        </a>

        <a className="nav__item" href="#">
          <span className="nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M7 9a5 5 0 0 1 10 0v3a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V9Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M9 18v2h6v-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          Agents <span className="pill">SOON</span>
        </a>

        <button
          className="nav__item nav__item--button"
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
        >
          <span className="nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 8v5l3 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.4 6.4A8 8 0 1 1 4 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M4 8V4h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          History <span className="chev">{historyOpen ? "▾" : "▸"}</span>
        </button>

        <div className="history" hidden={!historyOpen}>
          <button className="history__item" type="button" onClick={() => onPickHistory("Analyze AAPL for today")}>
            Analyze AAPL for today
          </button>
          <button className="history__item" type="button" onClick={() => onPickHistory("Snapshot for TSLA")}>
            Snapshot for TSLA
          </button>
          <button className="history__item" type="button" onClick={() => onPickHistory("Load OHLCV for NVDA")}>
            Load OHLCV for NVDA
          </button>
        </div>
      </nav>

      <div className="sidebar__footer">
        <div className="profile">
          <div className="avatar" aria-hidden="true">
            FR
          </div>
          <div className="profile__meta">
            <div className="profile__name">far_raven</div>
            <div className="profile__tag">INSIDER</div>
          </div>
        </div>
        <div className="footerBtns">
          <button className="ghostBtn" type="button">
            Join Community
          </button>
          <button className="squareBtn" type="button" aria-label="Twitter">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M20 7.3c-.6.3-1.3.5-2 .6.7-.4 1.2-1.1 1.5-1.9-.7.4-1.4.7-2.2.9A3.4 3.4 0 0 0 11.4 8a9.6 9.6 0 0 1-7-3.6 3.4 3.4 0 0 0 1.1 4.5c-.5 0-1-.2-1.5-.4v.1c0 1.6 1.2 3 2.8 3.3-.4.1-.9.1-1.3 0 .4 1.4 1.7 2.4 3.2 2.4A6.8 6.8 0 0 1 4 16.7 9.6 9.6 0 0 0 18.9 8c0-.2 0-.5 0-.7.7-.5 1.2-1 1.6-1.7Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ symbol }) {
  return (
    <header className="topbar">
      <div className="topbar__symbol">{symbol ? `${symbol} dashboard` : "Allo dashboard"}</div>
      <button className="shareBtn" type="button">
        <Icon>
          <path
            d="M16 6a2 2 0 1 0-1.8-2.8L8.8 7.7a2 2 0 0 0 0 2.6l5.4 4.5A2 2 0 1 0 15 16.6l-5.4-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Icon>
        Share
      </button>
    </header>
  );
}

function EmptyState({ prompts, onRefresh, onPickPrompt }) {
  return (
    <div className="empty">
      <div className="empty__hero">
        <div className="botMark" aria-hidden="true">
          <svg viewBox="0 0 28 28" width="28" height="28">
            <path
              d="M14 3v3M8 9h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M10.5 15h.01M17.5 15h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="empty__title">ASK&nbsp;&nbsp;MERLIN</h1>
      </div>

      <div className="prompts">
        <button className="refresh" type="button" onClick={onRefresh}>
          <span className="refresh__icon" aria-hidden="true">
            ⟳
          </span>
          Refresh
        </button>

        <div className="promptGrid">
          {prompts.map((prompt) => (
            <button key={prompt} className="promptCard" type="button" onClick={() => onPickPrompt(prompt)}>
              • {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PriceChart({ candles }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!candles.length) {
    return <div className="chartEmpty">No OHLCV data loaded yet.</div>;
  }

  const width = 760;
  const height = 240;
  const padding = 24;
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const closes = candles.map((item) => item.close);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const diff = max - min || 1;
  const xStep = (width - padding * 2) / Math.max(candles.length - 1, 1);
  const toY = (value) => height - padding - ((value - min) / diff) * (height - padding * 2);
  const points = closes.map((value, index) => `${padding + index * xStep},${toY(value)}`).join(" ");
  const first = closes[0];
  const last = closes[closes.length - 1];
  const move = ((last - first) / first) * 100;
  const activeIndex = hoverIndex ?? closes.length - 1;
  const activeCandle = candles[activeIndex];
  const activeX = padding + activeIndex * xStep;
  const activeY = toY(closes[activeIndex]);

  return (
    <div className="chartWrap">
      <div className="chartHover">
        <span>{activeCandle.timestamp.slice(0, 10)}</span>
        <span>O {numberFormat(activeCandle.open)}</span>
        <span>H {numberFormat(activeCandle.high)}</span>
        <span>L {numberFormat(activeCandle.low)}</span>
        <span>C {numberFormat(activeCandle.close)}</span>
      </div>

      <svg className="priceChart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chartAxis" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chartAxis" />
        <polyline points={points} className="chartLine chartLine--glow" />
        <polyline points={points} className="chartLine chartLine--main" />
        {hoverIndex !== null && <line x1={activeX} y1={padding} x2={activeX} y2={height - padding} className="chartCross" />}
        <rect
          x={padding}
          y={padding}
          width={width - padding * 2}
          height={height - padding * 2}
          className="chartHit"
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - bounds.left) / bounds.width;
            const index = Math.max(0, Math.min(candles.length - 1, Math.round(ratio * (candles.length - 1))));
            setHoverIndex(index);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
      <div className="chartMeta">
        <span>{candles.length} candles</span>
        <span>Low {numberFormat(min)}</span>
        <span>High {numberFormat(max)}</span>
        <span className={move >= 0 ? "positive" : "negative"}>{toPercent(move)}</span>
      </div>
    </div>
  );
}

function Thread({ messages, analysis, snapshot, candles, loadingAction, error, onRefreshAll }) {
  return (
    <div className={`thread ${messages.length ? "thread--visible" : ""}`} aria-live="polite">
      {messages.map((message, index) => (
        <div key={`${message.kind}-${index}`} className={`msg msg--${message.kind}`}>
          <div className="msg__bubble">{message.text}</div>
        </div>
      ))}

      {loadingAction ? (
        <div className="statusCard">Running `{loadingAction}` endpoint...</div>
      ) : null}

      {error ? <div className="statusCard statusCard--error">{error}</div> : null}

      {analysis ? (
        <section className="insights">
          <div className="cardGrid">
            <article className="dataCard">
              <div className="dataCard__head">
                <h3>Analysis</h3>
                <span className="badge">{analysis.symbol}</span>
              </div>
              <p className="summaryText">{analysis.summary}</p>
              <div className="metricGrid">
                <div className="metric">
                  <span>Stance</span>
                  <strong>{analysis.stance}</strong>
                </div>
                <div className="metric">
                  <span>Confidence</span>
                  <strong>{analysis.confidence}%</strong>
                </div>
                <div className="metric">
                  <span>Timeframe</span>
                  <strong>{analysis.timeframe}</strong>
                </div>
                <div className="metric">
                  <span>Latest close</span>
                  <strong>{numberFormat(analysis.indicators?.latestClose)}</strong>
                </div>
              </div>
            </article>

            <article className="dataCard">
              <div className="dataCard__head">
                <h3>Snapshot</h3>
                <button className="miniBtn" type="button" onClick={onRefreshAll} disabled={Boolean(loadingAction)}>
                  Refresh all APIs
                </button>
              </div>
              <div className="metricGrid">
                <div className="metric">
                  <span>Change</span>
                  <strong className={snapshot?.changePercent >= 0 ? "positive" : "negative"}>
                    {toPercent(snapshot?.changePercent)}
                  </strong>
                </div>
                <div className="metric">
                  <span>SMA20</span>
                  <strong>{numberFormat(snapshot?.sma20)}</strong>
                </div>
                <div className="metric">
                  <span>EMA20</span>
                  <strong>{numberFormat(snapshot?.ema20)}</strong>
                </div>
                <div className="metric">
                  <span>RSI14</span>
                  <strong>{numberFormat(snapshot?.rsi14)}</strong>
                </div>
                <div className="metric">
                  <span>Volatility</span>
                  <strong>{toPercent(snapshot?.volatility20)}</strong>
                </div>
                <div className="metric">
                  <span>Trend</span>
                  <strong>{snapshot?.trend ?? "—"}</strong>
                </div>
              </div>
            </article>
          </div>

          <article className="dataCard dataCard--wide">
            <div className="dataCard__head">
              <h3>OHLCV Chart</h3>
              <span className="mutedText">GET /market-data/ohlcv</span>
            </div>
            <PriceChart candles={candles} />
          </article>

          <article className="dataCard dataCard--wide">
            <div className="dataCard__head">
              <h3>Latest candles</h3>
              <span className="mutedText">{candles.length} rows</span>
            </div>
            <div className="candleList">
              {candles
                .slice(-6)
                .reverse()
                .map((candle) => (
                  <div className="candleRow" key={candle.timestamp}>
                    <span>{candle.timestamp.slice(0, 10)}</span>
                    <span>O {numberFormat(candle.open)}</span>
                    <span>H {numberFormat(candle.high)}</span>
                    <span>L {numberFormat(candle.low)}</span>
                    <span>C {numberFormat(candle.close)}</span>
                    <span>V {Number(candle.volume).toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}

function Composer({
  value,
  timeframe,
  limit,
  busy,
  onChange,
  onTimeframeChange,
  onLimitChange,
  onAnalyze,
  onSnapshot,
  onOhlcv
}) {
  return (
    <footer className="composer">
      <div className="composer__inner composer__inner--stacked">
        <div className="composer__tools">
          <button className="toolBtn" type="button" onClick={onAnalyze} disabled={busy}>
            Analyze
          </button>
          <button className="toolBtn" type="button" onClick={onSnapshot} disabled={busy}>
            Snapshot
          </button>
          <button className="toolBtn" type="button" onClick={onOhlcv} disabled={busy}>
            OHLCV
          </button>

          <label className="toolField">
            TF
            <select value={timeframe} onChange={(event) => onTimeframeChange(event.target.value)} disabled={busy}>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </label>

          <label className="toolField">
            Limit
            <input
              type="number"
              min="20"
              max="500"
              value={limit}
              onChange={(event) => onLimitChange(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <div className="composer__row">
          <button className="clipBtn" type="button" aria-label="Attach">
            <Icon>
              <path
                d="M8 12.5 14.8 5.7a3 3 0 0 1 4.2 4.2L11 18a5 5 0 0 1-7.1-7.1L12 2.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Icon>
          </button>

          <input
            className="composer__input"
            type="text"
            placeholder="Try: analyze AAPL, snapshot TSLA, chart NVDA..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAnalyze();
              }
            }}
          />

          <button className="sendBtn" type="button" aria-label="Send" onClick={onAnalyze} disabled={busy}>
            <Icon>
              <path
                d="M12 5v14M12 5l-6 6M12 5l6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Icon>
          </button>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [promptSeed, setPromptSeed] = useState(0);
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [analysis, setAnalysis] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [candles, setCandles] = useState([]);
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("allo-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }

    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem("allo-theme", theme);
  }, [theme]);

  const prompts = useMemo(() => {
    const base = [
      "Analyze AAPL and suggest entries",
      "Snapshot for TSLA on 1d",
      "Load OHLCV chart for NVDA",
      "Analyze MSFT for trend and risk",
      "Check RSI and volatility for AMZN",
      "Analyze META with bullish/bearish view"
    ];

    const items = base.slice();
    let seed = promptSeed + 13;
    for (let i = items.length - 1; i > 0; i -= 1) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    return items;
  }, [promptSeed]);

  function pushMessage(kind, text) {
    setMessages((current) => current.concat({ kind, text }));
  }

  function parseLimit() {
    const parsed = Number.parseInt(limit, 10);
    if (Number.isNaN(parsed)) {
      return DEFAULT_LIMIT;
    }

    return Math.min(500, Math.max(20, parsed));
  }

  function resolveSymbol(text) {
    return extractSymbol(text) ?? activeSymbol;
  }

  async function loadAllForSymbol(symbol, prompt) {
    const numericLimit = parseLimit();
    const analyzeResponse = await backendApi.analyze({
      symbol,
      timeframe,
      limit: numericLimit,
      prompt
    });

    const targetSymbol = analyzeResponse.symbol ?? symbol;
    const [snapshotResponse, ohlcvResponse] = await Promise.all([
      backendApi.snapshot({
        symbol: targetSymbol,
        timeframe,
        limit: numericLimit
      }),
      backendApi.ohlcv({
        symbol: targetSymbol,
        timeframe,
        limit: numericLimit
      })
    ]);

    setAnalysis(analyzeResponse);
    setSnapshot(snapshotResponse);
    setCandles(Array.isArray(ohlcvResponse) ? ohlcvResponse : []);
    setActiveSymbol(targetSymbol);
    return analyzeResponse;
  }

  async function runAnalyze() {
    const prompt = input.trim();
    if (!prompt) {
      return;
    }

    const symbol = resolveSymbol(prompt);
    if (!symbol) {
      setError("Add a ticker symbol like AAPL or TSLA in your prompt.");
      return;
    }

    setError("");
    setLoadingAction("analyze");
    setInput("");
    pushMessage("user", prompt);

    try {
      const result = await loadAllForSymbol(symbol, prompt);
      pushMessage("bot", result.summary);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not complete analyze request";
      setError(message);
      pushMessage("bot", `Request failed: ${message}`);
    } finally {
      setLoadingAction("");
    }
  }

  async function runSnapshotOnly() {
    const symbol = resolveSymbol(input.trim());
    if (!symbol) {
      setError("Add a ticker symbol before loading snapshot.");
      return;
    }

    setError("");
    setLoadingAction("snapshot");

    try {
      const response = await backendApi.snapshot({
        symbol,
        timeframe,
        limit: parseLimit()
      });
      setSnapshot(response);
      setActiveSymbol(symbol);
      pushMessage("bot", `Snapshot updated for ${symbol}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load snapshot";
      setError(message);
      pushMessage("bot", `Snapshot failed: ${message}`);
    } finally {
      setLoadingAction("");
    }
  }

  async function runOhlcvOnly() {
    const symbol = resolveSymbol(input.trim());
    if (!symbol) {
      setError("Add a ticker symbol before loading OHLCV.");
      return;
    }

    setError("");
    setLoadingAction("ohlcv");

    try {
      const response = await backendApi.ohlcv({
        symbol,
        timeframe,
        limit: parseLimit()
      });
      setCandles(Array.isArray(response) ? response : []);
      setActiveSymbol(symbol);
      pushMessage("bot", `OHLCV chart data updated for ${symbol}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load OHLCV";
      setError(message);
      pushMessage("bot", `OHLCV failed: ${message}`);
    } finally {
      setLoadingAction("");
    }
  }

  async function refreshAllData() {
    if (!activeSymbol) {
      return;
    }

    setError("");
    setLoadingAction("refresh");

    try {
      await loadAllForSymbol(activeSymbol, `refresh ${activeSymbol}`);
      pushMessage("bot", `All endpoints refreshed for ${activeSymbol}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not refresh data";
      setError(message);
      pushMessage("bot", `Refresh failed: ${message}`);
    } finally {
      setLoadingAction("");
    }
  }

  function resetChat() {
    setMessages([]);
    setInput("");
    setError("");
    setAnalysis(null);
    setSnapshot(null);
    setCandles([]);
    setActiveSymbol("AAPL");
  }

  return (
    <div className="app">
      <Sidebar
        onNewChat={resetChat}
        onPickHistory={(text) => setInput(text)}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <main className="main">
        <Topbar symbol={analysis?.symbol ?? activeSymbol} />

        <section className="content">
          {messages.length === 0 ? (
            <EmptyState
              prompts={prompts}
              onRefresh={() => setPromptSeed((value) => value + 1)}
              onPickPrompt={(prompt) => setInput(prompt)}
            />
          ) : (
            <Thread
              messages={messages}
              analysis={analysis}
              snapshot={snapshot}
              candles={candles}
              loadingAction={loadingAction}
              error={error}
              onRefreshAll={refreshAllData}
            />
          )}
        </section>

        <Composer
          value={input}
          timeframe={timeframe}
          limit={limit}
          busy={Boolean(loadingAction)}
          onChange={setInput}
          onTimeframeChange={setTimeframe}
          onLimitChange={setLimit}
          onAnalyze={runAnalyze}
          onSnapshot={runSnapshotOnly}
          onOhlcv={runOhlcvOnly}
        />
      </main>
    </div>
  );
}
