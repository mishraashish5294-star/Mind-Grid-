"use strict";

const express = require("express");
const path = require("node:path");

const {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  LEVELS,
  generateQuestion
} = require("./questionBank");
const { clampLevel, recommendDifficulty, MIN_SAMPLE } = require("./adaptive");
const { scoreAttempt, currentStreak, totalPoints, MAX_HINTS } = require("./scoring");
const { createStore } = require("./storage");

const QUESTION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHED_QUESTIONS = 2000;

function validSession(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(id);
}

/** Answers are compared loosely so "−4" and "-4" or "3 / 4" and "3/4" match. */
function normalizeAnswer(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

/**
 * Issued puzzles are kept server-side so the API, not the browser, decides
 * whether an answer was correct.
 */
function createQuestionCache(ttlMs = QUESTION_TTL_MS, max = MAX_CACHED_QUESTIONS) {
  const entries = new Map();
  return {
    put(question) {
      if (entries.size >= max) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(question.id, {
        answer: question.answer,
        category: question.category,
        level: question.level,
        topic: question.topic,
        type: question.type,
        hint: question.hint,
        explanation: question.explanation,
        issuedAt: Date.now()
      });
    },
    get(id) {
      if (typeof id !== "string") return null;
      const entry = entries.get(id);
      if (!entry) return null;
      if (Date.now() - entry.issuedAt > ttlMs) {
        entries.delete(id);
        return null;
      }
      return entry;
    },
    take(id) {
      const entry = this.get(id);
      if (entry) entries.delete(id);
      return entry;
    },
    size() {
      return entries.size;
    }
  };
}

function medianOf(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function publicQuestion(question) {
  return {
    id: question.id,
    category: question.category,
    level: question.level,
    levelName: question.levelName,
    type: question.type,
    topic: question.topic,
    prompt: question.prompt,
    choices: question.choices,
    hintAvailable: true
  };
}

function createApp(store, options = {}) {
  const generate = options.generateQuestion || generateQuestion;
  const cache = options.questionCache || createQuestionCache();
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "MindGrid API",
      storage: store.kind || "unknown",
      categories: CATEGORIES,
      levels: LEVELS
    });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      categories: CATEGORIES.map(id => ({ id, label: CATEGORY_LABELS[id], icon: CATEGORY_ICONS[id] })),
      levels: LEVELS,
      hintsPerPuzzle: MAX_HINTS,
      minimumAttemptsBeforeAdapting: MIN_SAMPLE
    });
  });

  app.get("/api/question", (req, res) => {
    const { category } = req.query;
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "A valid category is required." });
    }
    const level = clampLevel(req.query.level);
    const question = generate(category, level);
    cache.put(question);
    res.json(publicQuestion(question));
  });

  app.get("/api/hint/:questionId", (req, res) => {
    const entry = cache.get(req.params.questionId);
    if (!entry) return res.status(409).json({ error: "This puzzle has expired. Load a new puzzle." });
    res.json({ hint: entry.hint, hintsAllowed: MAX_HINTS });
  });

  app.post("/api/attempt", async (req, res, next) => {
    try {
      const { sessionId, questionId, choice, responseTimeMs, hintsUsed = 0 } = req.body || {};
      if (!validSession(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID." });
      }
      if (typeof questionId !== "string" || !questionId) {
        return res.status(400).json({ error: "questionId is required." });
      }
      if (typeof choice !== "string" || !choice.trim() || choice.length > 120) {
        return res.status(400).json({ error: "A choice is required." });
      }
      if (!Number.isInteger(responseTimeMs) || responseTimeMs < 0 || responseTimeMs > 3600000) {
        return res.status(400).json({ error: "responseTimeMs must be an integer between 0 and 3600000." });
      }
      if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > MAX_HINTS) {
        return res.status(400).json({ error: `hintsUsed must be an integer between 0 and ${MAX_HINTS}.` });
      }

      const issued = cache.take(questionId);
      if (!issued) {
        return res.status(409).json({ error: "This puzzle has expired. Load a new puzzle." });
      }

      const correct = normalizeAnswer(choice) === normalizeAnswer(issued.answer);
      const history = await store.getAttempts(sessionId, issued.category);
      const streakBefore = currentStreak(history);
      const scoring = scoreAttempt({
        level: issued.level,
        correct,
        responseTimeMs,
        hintsUsed,
        streak: streakBefore
      });

      const attempt = {
        sessionId,
        category: issued.category,
        level: issued.level,
        topic: issued.topic,
        type: issued.type,
        correct,
        responseTimeMs,
        hintsUsed: scoring.hintsUsed,
        score: scoring.points,
        createdAt: new Date().toISOString()
      };
      await store.saveAttempt(attempt);

      const updated = [...history, attempt];
      const adaptive = recommendDifficulty(updated, issued.level);

      res.status(201).json({
        correct,
        correctAnswer: issued.answer,
        explanation: issued.explanation,
        hint: issued.hint,
        topic: issued.topic,
        level: issued.level,
        levelName: LEVELS[issued.level - 1],
        score: scoring,
        streak: correct ? streakBefore + 1 : 0,
        totalScore: totalPoints(updated),
        attemptsInCategory: updated.length,
        adaptive
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/profile/:sessionId", async (req, res, next) => {
    try {
      if (!validSession(req.params.sessionId)) {
        return res.status(400).json({ error: "Invalid session ID." });
      }
      const sessionId = req.params.sessionId;
      const all = await store.getAttempts(sessionId);
      const categories = {};

      for (const category of CATEGORIES) {
        const attempts = all.filter(a => a.category === category);
        const correct = attempts.filter(a => a.correct).length;
        const times = attempts.map(a => Number(a.responseTimeMs) || 0).filter(t => t > 0);
        const recommendation = recommendDifficulty(attempts, attempts.length ? attempts[attempts.length - 1].level : 1);
        const byLevel = {};
        for (const level of [1, 2, 3, 4, 5]) {
          const atLevel = attempts.filter(a => a.level === level);
          byLevel[level] = {
            attempts: atLevel.length,
            correct: atLevel.filter(a => a.correct).length
          };
        }
        categories[category] = {
          label: CATEGORY_LABELS[category],
          attempts: attempts.length,
          correct,
          accuracy: attempts.length ? Number((correct / attempts.length).toFixed(3)) : 0,
          medianResponseTimeMs: medianOf(times),
          totalScore: totalPoints(attempts),
          streak: currentStreak(attempts),
          recommendedLevel: recommendation.level,
          recommendedLevelName: LEVELS[recommendation.level - 1],
          recommendationReason: recommendation.reason,
          signal: recommendation.signal,
          byLevel
        };
      }

      res.json({
        sessionId,
        attempts: all.length,
        correct: all.filter(a => a.correct).length,
        accuracy: all.length ? Number((all.filter(a => a.correct).length / all.length).toFixed(3)) : 0,
        totalScore: totalPoints(all),
        streak: currentStreak(all),
        categories
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/feedback", async (req, res, next) => {
    try {
      const { sessionId, ease, challenge, comment = "" } = req.body || {};
      if (!validSession(sessionId)) return res.status(400).json({ error: "Invalid session ID." });
      if (!Number.isInteger(ease) || ease < 1 || ease > 5) {
        return res.status(400).json({ error: "ease must be an integer from 1 to 5." });
      }
      if (!Number.isInteger(challenge) || challenge < 1 || challenge > 5) {
        return res.status(400).json({ error: "challenge must be an integer from 1 to 5." });
      }
      if (typeof comment !== "string" || comment.length > 500) {
        return res.status(400).json({ error: "comment must be at most 500 characters." });
      }
      await store.saveFeedback({
        sessionId,
        ease,
        challenge,
        comment: comment.trim(),
        createdAt: new Date().toISOString()
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/summary", async (_req, res, next) => {
    try {
      res.json(await store.summary());
    } catch (err) {
      next(err);
    }
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown API endpoint." }));

  app.use((err, _req, res, _next) => {
    console.error("Request failed:", err && err.message);
    res.status(500).json({ error: "Internal server error. Please try again." });
  });

  app.locals.questionCache = cache;
  return app;
}

async function start() {
  const store = await createStore({
    databaseUrl: process.env.DATABASE_URL,
    dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : undefined
  });
  const app = createApp(store);
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`MindGrid running on port ${port} using ${store.kind} storage.`);
  });

  const shutdown = () => {
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch(err => {
    console.error("MindGrid failed to start:", err);
    process.exit(1);
  });
}

module.exports = { createApp, validSession, normalizeAnswer, createQuestionCache };
