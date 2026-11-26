"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const { createApp } = require("../server");
const { JsonStore } = require("../storage");
const { CATEGORIES, LEVELS } = require("../questionBank");

const SESSION = "testsession-0001-abcdef";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mindgrid-test-"));
}

function makeApp(dataDir = tempDir()) {
  const store = new JsonStore(dataDir);
  return { app: createApp(store), store, dataDir };
}

async function getQuestion(app, category = "arithmetic", level = 1) {
  const res = await request(app)
    .get(`/api/question?category=${category}&level=${level}`)
    .expect(200);
  return res.body;
}

function serverAnswer(app, questionId) {
  const entry = app.locals.questionCache.get(questionId);
  assert.ok(entry, "the issued question should be cached server-side");
  return entry.answer;
}

async function play(app, options = {}) {
  const {
    category = "arithmetic",
    level = 1,
    correct = true,
    responseTimeMs = 5000,
    hintsUsed = 0,
    sessionId = SESSION
  } = options;
  const question = await getQuestion(app, category, level);
  const answer = serverAnswer(app, question.id);
  const choice = correct ? answer : question.choices.find(c => c !== answer);
  const res = await request(app)
    .post("/api/attempt")
    .send({ sessionId, questionId: question.id, choice, responseTimeMs, hintsUsed })
    .expect(201);
  return { question, result: res.body };
}

/* ------------------------------------------------------------------- basics */

test("health and meta endpoints describe the running game", async () => {
  const { app, dataDir } = makeApp();
  try {
    const health = await request(app).get("/api/health").expect(200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.storage, "json");
    assert.deepEqual(health.body.levels, LEVELS);

    const meta = await request(app).get("/api/meta").expect(200);
    assert.deepEqual(meta.body.categories.map(c => c.id), CATEGORIES);
    assert.deepEqual(meta.body.levels, LEVELS);
    assert.equal(meta.body.hintsPerPuzzle, 2);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("the frontend, script and stylesheet are served", async () => {
  const { app, dataDir } = makeApp();
  try {
    const page = await request(app).get("/").expect(200);
    assert.match(page.text, /MindGrid/);
    assert.match(page.text, /\/app\.js/);

    const script = await request(app).get("/app.js").expect(200);
    assert.match(script.text, /submitAnswer/);

    const css = await request(app).get("/styles.css").expect(200);
    assert.match(css.text, /@media/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------- questions */

test("every category and level can issue a playable puzzle without leaking answers", async () => {
  const { app, dataDir } = makeApp();
  try {
    for (const category of CATEGORIES) {
      for (let level = 1; level <= LEVELS.length; level++) {
        const question = await getQuestion(app, category, level);
        assert.equal(question.category, category);
        assert.equal(question.level, level);
        assert.equal(question.levelName, LEVELS[level - 1]);
        assert.equal(question.choices.length, 4);
        assert.equal(question.answer, undefined, "the answer must not be sent to the browser");
        assert.equal(question.explanation, undefined, "the explanation must not be sent before answering");
        assert.ok(question.prompt.length > 0);
      }
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("invalid requests are rejected with clear errors", async () => {
  const { app, dataDir } = makeApp();
  try {
    await request(app).get("/api/question").expect(400);
    await request(app).get("/api/question?category=history&level=1").expect(400);

    const clamped = await getQuestion(app, "sequence", 42);
    assert.equal(clamped.level, 5);

    await request(app).post("/api/attempt").send({}).expect(400);
    await request(app).post("/api/attempt").send({ sessionId: "no", questionId: "x", choice: "1", responseTimeMs: 10 }).expect(400);

    const question = await getQuestion(app);
    await request(app)
      .post("/api/attempt")
      .send({ sessionId: SESSION, questionId: question.id, choice: "1", responseTimeMs: -5 })
      .expect(400);
    await request(app)
      .post("/api/attempt")
      .send({ sessionId: SESSION, questionId: question.id, choice: "1", responseTimeMs: 100, hintsUsed: 9 })
      .expect(400);

    const unknown = await request(app).get("/api/nope").expect(404);
    assert.match(unknown.body.error, /Unknown API endpoint/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("hints are served for an issued puzzle", async () => {
  const { app, dataDir } = makeApp();
  try {
    const question = await getQuestion(app, "spatial", 3);
    const res = await request(app).get(`/api/hint/${question.id}`).expect(200);
    assert.ok(res.body.hint.length > 5);
    assert.equal(res.body.hintsAllowed, 2);

    await request(app).get("/api/hint/does-not-exist").expect(409);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ----------------------------------------------------------------- attempts */

test("a correct answer is graded, scored and explained", async () => {
  const { app, dataDir } = makeApp();
  try {
    const { result } = await play(app, { level: 2, responseTimeMs: 4000 });
    assert.equal(result.correct, true);
    assert.ok(result.score.points > 0);
    assert.equal(result.totalScore, result.score.points);
    assert.equal(result.streak, 1);
    assert.ok(result.correctAnswer.length > 0);
    assert.ok(result.explanation.length > 5);
    assert.equal(result.levelName, LEVELS[1]);
    assert.ok(result.adaptive);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("a wrong answer scores zero and still reveals the correct answer", async () => {
  const { app, dataDir } = makeApp();
  try {
    const { result } = await play(app, { correct: false, level: 3 });
    assert.equal(result.correct, false);
    assert.equal(result.score.points, 0);
    assert.equal(result.totalScore, 0);
    assert.equal(result.streak, 0);
    assert.ok(result.correctAnswer.length > 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("hints reduce the points awarded for the same puzzle", async () => {
  const { app, dataDir } = makeApp();
  try {
    const clean = await play(app, { level: 2, responseTimeMs: 5000, hintsUsed: 0 });
    const hinted = await play(app, { level: 2, responseTimeMs: 5000, hintsUsed: 2 });
    assert.ok(hinted.result.score.hintPenalty > 0);
    assert.ok(hinted.result.score.points < clean.result.score.points);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("a puzzle cannot be answered twice", async () => {
  const { app, dataDir } = makeApp();
  try {
    const question = await getQuestion(app);
    const answer = serverAnswer(app, question.id);
    const payload = { sessionId: SESSION, questionId: question.id, choice: answer, responseTimeMs: 2000 };
    await request(app).post("/api/attempt").send(payload).expect(201);
    await request(app).post("/api/attempt").send(payload).expect(409);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ----------------------------------------------------------------- adaptive */

test("three fast correct answers promote the player to the next level", async () => {
  const { app, dataDir } = makeApp();
  try {
    const sessionId = "adaptive-promote-session";
    let last = null;
    for (let i = 0; i < 3; i++) {
      last = (await play(app, { sessionId, level: 1, responseTimeMs: 4000 })).result;
    }
    assert.equal(last.adaptive.signal, "promote");
    assert.equal(last.adaptive.level, 2);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("three wrong answers ease the player back down a level", async () => {
  const { app, dataDir } = makeApp();
  try {
    const sessionId = "adaptive-ease-session";
    let last = null;
    for (let i = 0; i < 3; i++) {
      last = (await play(app, { sessionId, level: 4, correct: false, responseTimeMs: 40000 })).result;
    }
    assert.equal(last.adaptive.signal, "ease");
    assert.equal(last.adaptive.level, 3);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------- dashboard/profile */

test("the profile aggregates attempts, accuracy and per-level progress", async () => {
  const { app, dataDir } = makeApp();
  try {
    const sessionId = "profile-session-1234";
    await play(app, { sessionId, category: "arithmetic", level: 1, correct: true, responseTimeMs: 4000 });
    await play(app, { sessionId, category: "arithmetic", level: 2, correct: false, responseTimeMs: 20000 });
    await play(app, { sessionId, category: "spatial", level: 3, correct: true, responseTimeMs: 9000 });

    const res = await request(app).get(`/api/profile/${sessionId}`).expect(200);
    assert.equal(res.body.attempts, 3);
    assert.equal(res.body.correct, 2);
    assert.equal(res.body.accuracy, 0.667);
    assert.ok(res.body.totalScore > 0);
    assert.equal(res.body.streak, 1);

    const arithmetic = res.body.categories.arithmetic;
    assert.equal(arithmetic.attempts, 2);
    assert.equal(arithmetic.correct, 1);
    assert.equal(arithmetic.byLevel[1].attempts, 1);
    assert.equal(arithmetic.byLevel[2].correct, 0);
    assert.ok(arithmetic.medianResponseTimeMs > 0);
    assert.ok(arithmetic.recommendedLevel >= 1 && arithmetic.recommendedLevel <= 5);
    assert.ok(arithmetic.recommendedLevelName.length > 0);
    assert.ok(arithmetic.recommendationReason.length > 0);

    const spatial = res.body.categories.spatial;
    assert.equal(spatial.attempts, 1);
    assert.equal(res.body.categories.sequence.attempts, 0);

    await request(app).get("/api/profile/bad").expect(400);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("attempts survive a store reload, so progress is really persisted", async () => {
  const dataDir = tempDir();
  try {
    const first = makeApp(dataDir);
    await play(first.app, { sessionId: "persist-session-0001" });
    const stored = await new JsonStore(dataDir).getAttempts("persist-session-0001");
    assert.equal(stored.length, 1);
    assert.equal(stored[0].correct, true);
    assert.ok(stored[0].score > 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------- summary/feedback */

test("the summary reports stored activity", async () => {
  const { app, dataDir } = makeApp();
  try {
    await play(app, { sessionId: "summary-session-01", category: "sequence", correct: true });
    const res = await request(app).get("/api/summary").expect(200);
    assert.equal(res.body.storage, "json");
    assert.equal(res.body.attempts, 1);
    assert.equal(res.body.categories.sequence, 1);
    assert.equal(res.body.sessions, 1);
    assert.equal(res.body.accuracy, 1);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("feedback is validated and stored", async () => {
  const { app, store, dataDir } = makeApp();
  try {
    await request(app)
      .post("/api/feedback")
      .send({ sessionId: SESSION, ease: 4, challenge: 3, comment: "Clear layout." })
      .expect(201);

    const summary = await request(app).get("/api/summary").expect(200);
    assert.equal(summary.body.feedbackCount, 1);

    await request(app).post("/api/feedback").send({ sessionId: SESSION, ease: 9, challenge: 3 }).expect(400);
    await request(app).post("/api/feedback").send({ sessionId: "x", ease: 3, challenge: 3 }).expect(400);
    await request(app)
      .post("/api/feedback")
      .send({ sessionId: SESSION, ease: 3, challenge: 3, comment: "x".repeat(600) })
      .expect(400);
    assert.equal(store.kind, "json");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
