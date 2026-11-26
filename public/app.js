"use strict";

/* MindGrid client — vanilla JavaScript, no build step. */

const SESSION_KEY = "mindgrid.sessionId";
const LEVELS_KEY = "mindgrid.levels";
const ADAPTIVE_KEY = "mindgrid.adaptive";

const state = {
  meta: null,
  sessionId: readSessionId(),
  category: "arithmetic",
  levels: readLevels(),
  adaptive: readAdaptive(),
  question: null,
  startedAt: 0,
  timerId: null,
  hintsUsed: 0,
  maxHints: 2,
  answered: false,
  totalScore: 0,
  streak: 0,
  answeredCount: 0,
  view: "play"
};

const $ = id => document.getElementById(id);

/* ---------------------------------------------------------------- storage */

function newSessionId() {
  const bytes = new Uint8Array(16);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function readSessionId() {
  let id = null;
  try {
    id = localStorage.getItem(SESSION_KEY);
  } catch {
    id = null;
  }
  if (!id || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
    id = newSessionId();
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      /* private mode: session stays in memory */
    }
  }
  return id;
}

function readLevels() {
  const fallback = { arithmetic: 1, spatial: 1, sequence: 1 };
  try {
    const raw = JSON.parse(localStorage.getItem(LEVELS_KEY) || "{}");
    for (const key of Object.keys(fallback)) {
      const value = Number(raw[key]);
      if (Number.isInteger(value) && value >= 1 && value <= 5) fallback[key] = value;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return fallback;
}

function saveLevels() {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(state.levels));
  } catch {
    /* ignore */
  }
}

function readAdaptive() {
  try {
    return localStorage.getItem(ADAPTIVE_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveAdaptive() {
  try {
    localStorage.setItem(ADAPTIVE_KEY, String(state.adaptive));
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------- api layer */

async function api(path, options = {}) {
  const config = { ...options };
  if (config.body) {
    config.headers = { "Content-Type": "application/json", ...(config.headers || {}) };
  }
  const response = await fetch(path, config);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data && data.error) || `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

function showBanner(message) {
  const banner = $("banner");
  banner.textContent = message;
  banner.hidden = false;
  window.clearTimeout(showBanner.timer);
  showBanner.timer = window.setTimeout(() => {
    banner.hidden = true;
  }, 6000);
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("is-visible"), 3200);
}

/* ------------------------------------------------------------- navigation */

function showView(view) {
  state.view = view;
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.id !== `view-${view}`;
  }
  for (const button of document.querySelectorAll(".nav-btn")) {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (view === "progress") loadProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindNavigation() {
  for (const button of document.querySelectorAll(".nav-btn")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }
  $("progress-refresh").addEventListener("click", () => {
    loadProgress();
    toast("Progress refreshed.");
  });
  $("progress-reset").addEventListener("click", () => {
    state.sessionId = newSessionId();
    try {
      localStorage.setItem(SESSION_KEY, state.sessionId);
    } catch {
      /* ignore */
    }
    state.totalScore = 0;
    state.streak = 0;
    state.answeredCount = 0;
    updateScoreChips();
    loadProgress();
    toast("Started a new session. Your old results stay in the database.");
  });
}

/* ------------------------------------------------------------ setup panel */

function renderCategoryButtons() {
  const grid = $("category-grid");
  grid.innerHTML = "";
  for (const category of state.meta.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-card" + (category.id === state.category ? " is-active" : "");
    button.setAttribute("aria-pressed", String(category.id === state.category));
    button.dataset.category = category.id;
    button.innerHTML = `
      <span class="category-icon" aria-hidden="true">${category.icon}</span>
      <span class="category-name">${category.label}</span>
      <span class="category-hint">${categoryHint(category.id)}</span>`;
    button.addEventListener("click", () => selectCategory(category.id));
    grid.appendChild(button);
  }
}

function categoryHint(id) {
  if (id === "arithmetic") return "Algebra, matrices, calculus";
  if (id === "spatial") return "Geometry, vectors, transformations";
  return "Progressions, recurrences, limits";
}

function renderLevelButtons() {
  const grid = $("level-grid");
  grid.innerHTML = "";
  const current = state.levels[state.category];
  state.meta.levels.forEach((name, index) => {
    const level = index + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-pill" + (level === current ? " is-active" : "");
    button.setAttribute("aria-pressed", String(level === current));
    button.dataset.level = String(level);
    button.innerHTML = `<span class="level-number">${level}</span><span>${name}</span>`;
    button.addEventListener("click", () => selectLevel(level));
    grid.appendChild(button);
  });
}

async function selectCategory(id) {
  if (state.category === id) return;
  state.category = id;
  renderCategoryButtons();
  renderLevelButtons();
  await loadQuestion();
}

async function selectLevel(level) {
  state.levels[state.category] = level;
  saveLevels();
  renderLevelButtons();
  await loadQuestion();
}

/* ------------------------------------------------------------ game panel */

function renderQuestion(question) {
  state.question = question;
  state.answered = false;
  state.hintsUsed = 0;

  $("game-panel").hidden = false;
  $("play-empty").hidden = true;
  $("feedback-box").hidden = true;
  $("hint-text").hidden = true;
  $("hint-text").textContent = "";
  $("hint-btn").disabled = false;
  $("hint-btn").textContent = "Show hint";
  $("hint-count").textContent = `Hints left: ${state.maxHints}`;

  $("question-category").textContent = categoryLabel(question.category);
  $("question-level").textContent = `${question.level} · ${question.levelName}`;
  $("question-topic").textContent = question.topic;
  $("question-prompt").textContent = question.prompt;
  $("question-counter").textContent = `Puzzle ${state.answeredCount + 1}`;

  const list = $("choice-list");
  list.innerHTML = "";
  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.choice = choice;
    button.innerHTML = `<span class="choice-key">${String.fromCharCode(65 + index)}</span><span class="choice-value"></span>`;
    button.querySelector(".choice-value").textContent = choice;
    button.addEventListener("click", () => submitAnswer(choice, button));
    list.appendChild(button);
  });

  startTimer();
}

function categoryLabel(id) {
  const found = state.meta.categories.find(c => c.id === id);
  return found ? found.label : id;
}

function startTimer() {
  stopTimer();
  state.startedAt = Date.now();
  $("question-timer").textContent = "0:00";
  state.timerId = window.setInterval(() => {
    $("question-timer").textContent = formatDuration(Date.now() - state.startedAt);
  }, 250);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function loadQuestion() {
  if (!state.meta) return;
  stopTimer();
  $("play-empty").hidden = false;
  $("play-empty").textContent = "Loading puzzle…";
  $("game-panel").hidden = true;
  try {
    const level = state.levels[state.category];
    const question = await api(
      `/api/question?category=${encodeURIComponent(state.category)}&level=${level}`
    );
    renderQuestion(question);
  } catch (error) {
    $("play-empty").textContent = "Could not load a puzzle.";
    showBanner(error.message);
  }
}

async function revealHint() {
  if (!state.question || state.answered) return;
  if (state.hintsUsed >= state.maxHints) return;
  try {
    const data = await api(`/api/hint/${encodeURIComponent(state.question.id)}`);
    state.hintsUsed += 1;
    const hint = $("hint-text");
    hint.textContent = data.hint;
    hint.hidden = false;
    const left = state.maxHints - state.hintsUsed;
    $("hint-count").textContent = left > 0 ? `Hints left: ${left}` : "No hints left";
    if (left <= 0) {
      $("hint-btn").disabled = true;
      $("hint-btn").textContent = "Hints used";
    }
  } catch (error) {
    showBanner(error.message);
  }
}

async function submitAnswer(choice, button) {
  if (state.answered || !state.question) return;
  state.answered = true;
  stopTimer();
  const responseTimeMs = Math.max(0, Date.now() - state.startedAt);

  for (const el of document.querySelectorAll(".choice")) el.disabled = true;
  button.classList.add("is-selected");

  try {
    const result = await api("/api/attempt", {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        questionId: state.question.id,
        choice,
        responseTimeMs,
        hintsUsed: state.hintsUsed
      })
    });
    state.totalScore = result.totalScore;
    state.streak = result.streak;
    state.answeredCount += 1;
    renderResult(result, choice);
    updateScoreChips();
    applyAdaptive(result);
  } catch (error) {
    state.answered = false;
    for (const el of document.querySelectorAll(".choice")) el.disabled = false;
    button.classList.remove("is-selected");
    showBanner(error.message);
    startTimer();
  }
}

function renderResult(result, choice) {
  for (const el of document.querySelectorAll(".choice")) {
    const value = el.dataset.choice;
    if (value === result.correctAnswer) el.classList.add("is-correct");
    else if (value === choice) el.classList.add("is-wrong");
  }

  $("feedback-result").textContent = result.correct ? "Correct!" : "Not quite";
  $("feedback-result").className = "feedback-title " + (result.correct ? "ok" : "bad");
  $("feedback-answer").textContent = result.correctAnswer;
  $("feedback-explanation").textContent = result.explanation;

  if (result.correct) {
    const parts = [`Base ${result.score.base}`];
    if (result.score.timeBonus) parts.push(`speed +${result.score.timeBonus}`);
    if (result.score.hintPenalty) parts.push(`hints −${result.score.hintPenalty}`);
    if (result.score.streakMultiplier > 1) parts.push(`streak ×${result.score.streakMultiplier}`);
    $("feedback-points").textContent = `+${result.score.points} points (${parts.join(", ")}) · total ${result.totalScore}`;
  } else {
    $("feedback-points").textContent = `0 points · total ${result.totalScore} · streak reset`;
  }

  $("feedback-adaptive").textContent = result.adaptive ? result.adaptive.reason : "";
  $("feedback-box").hidden = false;
}

function applyAdaptive(result) {
  if (!state.adaptive || !result.adaptive) return;
  const next = result.adaptive.level;
  if (next === state.levels[state.category]) return;
  const from = state.meta.levels[state.levels[state.category] - 1];
  const to = state.meta.levels[next - 1];
  state.levels[state.category] = next;
  saveLevels();
  renderLevelButtons();
  toast(`Difficulty ${next > state.levels[state.category] ? "raised" : "eased"}: ${from} → ${to}`);
}

function updateScoreChips() {
  $("session-score").textContent = String(state.totalScore);
  $("session-streak").textContent = String(state.streak);
}

/* --------------------------------------------------------------- progress */

async function loadProgress() {
  try {
    const data = await api(`/api/profile/${encodeURIComponent(state.sessionId)}`);
    renderProgress(data);
  } catch (error) {
    showBanner(error.message);
  }
  try {
    const summary = await api("/api/summary");
    const parts = [
      `${summary.attempts} puzzles solved site-wide`,
      `${Math.round((summary.accuracy || 0) * 100)}% overall accuracy`,
      `${summary.sessions} sessions`,
      `storage: ${summary.storage}`
    ];
    $("summary-line").textContent = parts.join(" · ");
    $("storage-note").textContent = summary.storage === "postgresql"
      ? "Progress stored in PostgreSQL."
      : "Progress stored in local JSON (add DATABASE_URL to use PostgreSQL).";
  } catch {
    $("summary-line").textContent = "Server summary unavailable.";
  }
}

function renderProgress(data) {
  state.totalScore = data.totalScore;
  state.streak = data.streak;
  state.answeredCount = data.attempts;
  updateScoreChips();

  $("stat-attempts").textContent = String(data.attempts);
  $("stat-correct").textContent = String(data.correct);
  $("stat-accuracy").textContent = `${Math.round((data.accuracy || 0) * 100)}%`;
  $("stat-score").textContent = String(data.totalScore);
  $("stat-streak").textContent = String(data.streak);

  $("progress-empty").hidden = data.attempts > 0;

  const container = $("category-progress");
  container.innerHTML = "";
  for (const category of state.meta.categories) {
    const stats = data.categories[category.id];
    const card = document.createElement("article");
    card.className = "category-card-progress";

    const levelRows = Object.entries(stats.byLevel || {})
      .map(([level, value]) => {
        const name = state.meta.levels[Number(level) - 1];
        return `<li><span>${level} · ${name}</span><span>${value.correct}/${value.attempts}</span></li>`;
      })
      .join("");

    card.innerHTML = `
      <header>
        <h3>${category.label}</h3>
        <span class="badge">${stats.recommendedLevelName}</span>
      </header>
      <div class="bar" role="img" aria-label="Accuracy ${Math.round(stats.accuracy * 100)} percent">
        <span style="width:${Math.round(stats.accuracy * 100)}%"></span>
      </div>
      <dl class="mini-stats">
        <div><dt>Attempts</dt><dd>${stats.attempts}</dd></div>
        <div><dt>Accuracy</dt><dd>${Math.round(stats.accuracy * 100)}%</dd></div>
        <div><dt>Median time</dt><dd>${stats.medianResponseTimeMs ? `${(stats.medianResponseTimeMs / 1000).toFixed(1)}s` : "—"}</dd></div>
        <div><dt>Score</dt><dd>${stats.totalScore}</dd></div>
      </dl>
      <p class="muted">${stats.recommendationReason}</p>
      <ul class="level-breakdown">${levelRows}</ul>`;
    container.appendChild(card);
  }
}

/* --------------------------------------------------------------- feedback */

function bindFeedbackForm() {
  $("feedback-form").addEventListener("submit", async event => {
    event.preventDefault();
    const status = $("feedback-status");
    status.textContent = "Sending…";
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: state.sessionId,
          ease: Number($("feedback-ease").value),
          challenge: Number($("feedback-challenge").value),
          comment: $("feedback-comment").value
        })
      });
      status.textContent = "Thank you — your feedback was saved.";
      $("feedback-comment").value = "";
    } catch (error) {
      status.textContent = `Could not save feedback: ${error.message}`;
    }
  });
}

/* ------------------------------------------------------------------- boot */

function bindGameControls() {
  $("hint-btn").addEventListener("click", revealHint);
  $("next-btn").addEventListener("click", () => loadQuestion());
  const toggle = $("adaptive-toggle");
  toggle.checked = state.adaptive;
  toggle.addEventListener("change", () => {
    state.adaptive = toggle.checked;
    saveAdaptive();
    toast(state.adaptive ? "Adaptive difficulty on." : "Adaptive difficulty off — your chosen level stays fixed.");
  });
}

async function init() {
  bindNavigation();
  bindGameControls();
  bindFeedbackForm();
  updateScoreChips();

  try {
    state.meta = await api("/api/meta");
    state.maxHints = Number(state.meta.hintsPerPuzzle) || 2;
    renderCategoryButtons();
    renderLevelButtons();
    await loadQuestion();
  } catch (error) {
    $("play-empty").textContent = "The MindGrid API is not reachable.";
    showBanner(`Could not start MindGrid: ${error.message}`);
  }
}

document.addEventListener("DOMContentLoaded", init);
