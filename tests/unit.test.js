"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  LEVELS,
  generateQuestion
} = require("../questionBank");
const { clampLevel, recommendDifficulty, MIN_SAMPLE } = require("../adaptive");
const { MAX_HINTS, basePoints, timeBudgetMs, scoreAttempt, currentStreak, totalPoints } = require("../scoring");
const { validSession, normalizeAnswer, createQuestionCache } = require("../server");

/* ------------------------------------------------------------ question bank */

test("question bank exposes three categories and five levels", () => {
  assert.deepEqual(CATEGORIES, ["arithmetic", "spatial", "sequence"]);
  assert.deepEqual(LEVELS, ["Foundation", "Intermediate", "Advanced", "Expert", "Master"]);
  for (const id of CATEGORIES) {
    assert.equal(typeof CATEGORY_LABELS[id], "string");
    assert.ok(CATEGORY_LABELS[id].length > 0);
    assert.ok(CATEGORY_ICONS[id].length > 0);
  }
});

test("every category and level generates a valid multiple-choice puzzle", () => {
  for (const category of CATEGORIES) {
    for (let level = 1; level <= LEVELS.length; level++) {
      for (let i = 0; i < 40; i++) {
        const q = generateQuestion(category, level);
        const where = `${category} level ${level} iteration ${i}: ${q.prompt}`;
        assert.equal(q.category, category, where);
        assert.equal(q.level, level, where);
        assert.equal(q.levelName, LEVELS[level - 1], where);
        assert.ok(q.prompt.length > 8, where);
        assert.equal(q.choices.length, 4, where);
        assert.equal(new Set(q.choices).size, 4, `choices must be unique — ${where}`);
        assert.ok(q.choices.includes(q.answer), `answer must be one of the choices — ${where}`);
        assert.ok(q.hint.length > 5, where);
        assert.ok(q.explanation.length > 5, where);
        assert.equal(typeof q.topic, "string");
        assert.ok(q.topic.length > 0, where);
        assert.match(q.id, /^[a-z0-9-]+$/i, where);
      }
    }
  }
});

test("all puzzle text is English, not Devanagari", () => {
  const devanagari = /[\u0900-\u097F]/;
  for (const category of CATEGORIES) {
    for (let level = 1; level <= LEVELS.length; level++) {
      for (let i = 0; i < 15; i++) {
        const q = generateQuestion(category, level);
        for (const field of [q.prompt, q.hint, q.explanation, q.topic, ...q.choices]) {
          assert.ok(!devanagari.test(field), `expected English text, found: ${field}`);
        }
      }
    }
  }
});

test("higher levels use college-level mathematics", () => {
  const expertTopics = new Set();
  for (const category of CATEGORIES) {
    for (let i = 0; i < 60; i++) expertTopics.add(generateQuestion(category, 5).topic);
  }
  const topics = [...expertTopics].join(" ");
  assert.match(topics, /Differential|Integral|Matrix|Determinant|Vector|Transformation|Recurrence|Limit|Series|Probability|Combinatorics|Logarithm|Modular|Cylinder|Rotation|Polynomial|Geometry|Sequence/i);
});

test("a wrong level is clamped into the supported range", () => {
  assert.equal(generateQuestion("arithmetic", 99).level, 5);
  assert.equal(generateQuestion("arithmetic", -4).level, 1);
  assert.equal(generateQuestion("arithmetic", "3").level, 3);
});

/* ----------------------------------------------------------------- adaptive */

test("clampLevel normalises anything into 1..5", () => {
  assert.equal(clampLevel(0), 1);
  assert.equal(clampLevel(3.4), 3);
  assert.equal(clampLevel(9), 5);
  assert.equal(clampLevel("2"), 2);
  assert.equal(clampLevel(undefined), 1);
  assert.equal(clampLevel(NaN), 1);
});

test("difficulty waits for a sample before adapting", () => {
  const attempts = [{ correct: true, responseTimeMs: 4000 }];
  const result = recommendDifficulty(attempts, 2);
  assert.equal(result.signal, "warming-up");
  assert.equal(result.level, 2);
  assert.equal(result.sampleSize, 1);
  assert.ok(MIN_SAMPLE >= 2);
});

test("high accuracy with fast answers promotes one level", () => {
  const attempts = Array.from({ length: 4 }, () => ({ correct: true, responseTimeMs: 6000 }));
  const result = recommendDifficulty(attempts, 2);
  assert.equal(result.signal, "promote");
  assert.equal(result.level, 3);
  assert.match(result.reason, /Promoted/);
});

test("low accuracy eases difficulty down", () => {
  const attempts = Array.from({ length: 4 }, () => ({ correct: false, responseTimeMs: 30000 }));
  const result = recommendDifficulty(attempts, 4);
  assert.equal(result.signal, "ease");
  assert.equal(result.level, 3);
  assert.match(result.reason, /Eased/);
});

test("slow but accurate play holds instead of promoting", () => {
  const attempts = Array.from({ length: 4 }, () => ({ correct: true, responseTimeMs: 150000 }));
  const result = recommendDifficulty(attempts, 2);
  assert.equal(result.signal, "hold");
  assert.equal(result.level, 2);
  assert.match(result.reason, /speed up/i);
});

test("difficulty never exceeds Master or drops below Foundation", () => {
  const perfect = Array.from({ length: 5 }, () => ({ correct: true, responseTimeMs: 2000 }));
  const atMaster = recommendDifficulty(perfect, 5);
  assert.equal(atMaster.level, 5);
  assert.match(atMaster.reason, /Master/);

  const poor = Array.from({ length: 5 }, () => ({ correct: false, responseTimeMs: 200000 }));
  const atFoundation = recommendDifficulty(poor, 1);
  assert.equal(atFoundation.level, 1);
  assert.equal(atFoundation.signal, "hold");
});

test("only the recent window of attempts matters", () => {
  const old = Array.from({ length: 10 }, () => ({ correct: false, responseTimeMs: 100000 }));
  const recent = Array.from({ length: 4 }, () => ({ correct: true, responseTimeMs: 5000 }));
  const result = recommendDifficulty([...old, ...recent], 3);
  assert.equal(result.signal, "promote");
  assert.equal(result.level, 4);
});

/* ------------------------------------------------------------------ scoring */

test("base points and time budgets rise with the level", () => {
  assert.ok(basePoints(5) > basePoints(1));
  assert.ok(timeBudgetMs(5) > timeBudgetMs(1));
  assert.equal(MAX_HINTS, 2);
});

test("a wrong answer scores nothing", () => {
  const result = scoreAttempt({ level: 4, correct: false, responseTimeMs: 3000, hintsUsed: 1, streak: 3 });
  assert.equal(result.points, 0);
  assert.equal(result.base, 0);
});

test("a correct answer earns base points plus a speed bonus", () => {
  const fast = scoreAttempt({ level: 3, correct: true, responseTimeMs: 1000 });
  const slow = scoreAttempt({ level: 3, correct: true, responseTimeMs: timeBudgetMs(3) });
  assert.equal(fast.base, basePoints(3));
  assert.ok(fast.timeBonus > 0);
  assert.ok(fast.points > slow.points);
  assert.equal(slow.timeBonus, 0);
});

test("hints cost points and streaks add a multiplier", () => {
  const clean = scoreAttempt({ level: 2, correct: true, responseTimeMs: 8000, hintsUsed: 0 });
  const hinted = scoreAttempt({ level: 2, correct: true, responseTimeMs: 8000, hintsUsed: 2 });
  assert.ok(hinted.hintPenalty > 0);
  assert.ok(hinted.points < clean.points);

  const streaked = scoreAttempt({ level: 2, correct: true, responseTimeMs: 8000, streak: 5 });
  assert.ok(streaked.streakMultiplier > 1);
  assert.ok(streaked.points > clean.points);
});

test("hint usage is clamped and streaks count from the latest answer", () => {
  assert.equal(scoreAttempt({ level: 1, correct: true, hintsUsed: 99 }).hintsUsed, MAX_HINTS);
  assert.equal(currentStreak([{ correct: true }, { correct: true }, { correct: false }]), 0);
  assert.equal(currentStreak([{ correct: false }, { correct: true }, { correct: true }]), 2);
  assert.equal(currentStreak([]), 0);
  assert.equal(totalPoints([{ score: 10 }, { score: 25 }, {}]), 35);
});

/* ------------------------------------------------------- server primitives */

test("session IDs must be safe tokens", () => {
  assert.equal(validSession("abcdefgh12345678"), true);
  assert.equal(validSession("short"), false);
  assert.equal(validSession("bad id with spaces"), false);
  assert.equal(validSession(undefined), false);
  assert.equal(validSession("x".repeat(101)), false);
});

test("answer comparison tolerates formatting differences", () => {
  assert.equal(normalizeAnswer("−4"), normalizeAnswer("-4"));
  assert.equal(normalizeAnswer("3 / 4"), normalizeAnswer("3/4"));
  assert.equal(normalizeAnswer("  15 "), normalizeAnswer("15"));
  assert.notEqual(normalizeAnswer("15"), normalizeAnswer("16"));
});

test("the issued-question cache expires and can only be consumed once", () => {
  const cache = createQuestionCache(50, 10);
  cache.put({ id: "abc", answer: "7", category: "arithmetic", level: 1, hint: "h", explanation: "e" });
  assert.equal(cache.get("abc").answer, "7");
  assert.ok(cache.take("abc"));
  assert.equal(cache.take("abc"), null);
  assert.equal(cache.get("missing"), null);

  const expiring = createQuestionCache(5, 10);
  expiring.put({ id: "old", answer: "1", category: "arithmetic", level: 1, hint: "h", explanation: "e" });
  return new Promise(resolve => {
    setTimeout(() => {
      assert.equal(expiring.get("old"), null);
      resolve();
    }, 25);
  });
});
