const threadEl = document.getElementById("thread");
const emptyStateEl = document.getElementById("emptyState");
const inputEl = document.getElementById("promptInput");

function showThread() {
  threadEl.classList.add("thread--visible");
  emptyStateEl.style.display = "none";
}

function showEmpty() {
  threadEl.classList.remove("thread--visible");
  threadEl.innerHTML = "";
  emptyStateEl.style.display = "";
}

function addMessage(kind, text) {
  const row = document.createElement("div");
  row.className = `msg msg--${kind}`;

  const bubble = document.createElement("div");
  bubble.className = "msg__bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  threadEl.appendChild(row);
  row.scrollIntoView({ block: "end", behavior: "smooth" });
}

function respondTo(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  showThread();
  addMessage("user", trimmed);

  window.setTimeout(() => {
    addMessage(
      "bot",
      "Demo mode: I can summarize market themes and risks, but this UI is just a basic assignment layout (not financial advice)."
    );
  }, 450);
}

document.getElementById("sendBtn").addEventListener("click", () => {
  const value = inputEl.value;
  inputEl.value = "";
  respondTo(value);
  inputEl.focus();
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("sendBtn").click();
  }
});

document.querySelectorAll(".promptCard").forEach((btn) => {
  btn.addEventListener("click", () => {
    inputEl.value = btn.textContent.replace(/^•\s*/, "");
    inputEl.focus();
  });
});

document.querySelectorAll(".history__item").forEach((btn) => {
  btn.addEventListener("click", () => {
    inputEl.value = btn.textContent;
    inputEl.focus();
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  const cards = Array.from(document.querySelectorAll(".promptCard"));
  cards.sort(() => Math.random() - 0.5);
  const grid = document.querySelector(".promptGrid");
  cards.forEach((c) => grid.appendChild(c));
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  showEmpty();
  inputEl.value = "";
  inputEl.focus();
});

document.getElementById("historyToggle").addEventListener("click", () => {
  const list = document.getElementById("historyList");
  list.hidden = !list.hidden;
});

// start open, like the screenshot
document.getElementById("historyList").hidden = false;

