"use client";

import { useMemo, useState } from "react";

function Icon({ children, size = 18 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 24 24" width={size} height={size}>
        {children}
      </svg>
    </span>
  );
}

function Sidebar({ onNewChat, onPickHistory }) {
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
          <button className="iconBtn" title="Theme" type="button">
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
          onClick={() => setHistoryOpen((v) => !v)}
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
          History <span className="chev" aria-hidden="true">{historyOpen ? "▾" : "▸"}</span>
        </button>

        <div className="history" hidden={!historyOpen}>
          <button className="history__item" type="button" onClick={() => onPickHistory("whats going on with cop...")}>
            whats going on with cop...
          </button>
          <button className="history__item" type="button" onClick={() => onPickHistory("BTC analysis today")}>
            BTC analysis today
          </button>
          <button className="history__item" type="button" onClick={() => onPickHistory("ETH price prediction")}>
            ETH price prediction
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

function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar__spacer" />
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
          {prompts.map((p) => (
            <button key={p} className="promptCard" type="button" onClick={() => onPickPrompt(p)}>
              • {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Thread({ messages }) {
  return (
    <div className={`thread ${messages.length ? "thread--visible" : ""}`} aria-live="polite">
      {messages.map((m, idx) => (
        <div key={idx} className={`msg msg--${m.kind}`}>
          <div className="msg__bubble">{m.text}</div>
        </div>
      ))}
    </div>
  );
}

function Composer({ value, onChange, onSend }) {
  return (
    <footer className="composer">
      <div className="composer__inner">
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
          placeholder="Ask about crypto, DeFi, markets..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button className="sendBtn" type="button" aria-label="Send" onClick={onSend}>
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
    </footer>
  );
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [promptSeed, setPromptSeed] = useState(0);

  const prompts = useMemo(() => {
    const base = [
      "whats going on with copper",
      "what about GDXU",
      "rsi is quite low so will it bounce back or not",
      "what about URAA",
      "what about copper - compare all of them in table format",
      "add in palladium and uuuu"
    ];

    const arr = base.slice();
    let t = promptSeed + 7;
    for (let i = arr.length - 1; i > 0; i--) {
      t = (t * 9301 + 49297) % 233280;
      const j = Math.floor((t / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [promptSeed]);

  function push(kind, text) {
    setMessages((m) => m.concat({ kind, text }));
  }

  function send(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed) return;

    setInput("");
    push("user", trimmed);

    window.setTimeout(() => {
      push(
        "bot",
        "Demo mode: I can outline themes/risks, but this is only a basic assignment layout (not financial advice)."
      );
    }, 420);
  }

  return (
    <div className="app">
      <Sidebar
        onNewChat={() => {
          setMessages([]);
          setInput("");
        }}
        onPickHistory={(t) => setInput(t)}
      />

      <main className="main">
        <Topbar />

        <section className="content">
          {messages.length === 0 ? (
            <EmptyState
              prompts={prompts}
              onRefresh={() => setPromptSeed((s) => s + 1)}
              onPickPrompt={(p) => setInput(p)}
            />
          ) : (
            <Thread messages={messages} />
          )}
        </section>

        <Composer value={input} onChange={setInput} onSend={() => send()} />
      </main>
    </div>
  );
}

