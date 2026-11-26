"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CATEGORY_KEYS = ["arithmetic", "spatial", "sequence"];
const MAX_JSON_ATTEMPTS = 50000;

/* ------------------------------------------------------------------ *
 * JSON fallback (local development, no database configured)
 * ------------------------------------------------------------------ */

class JsonStore {
  constructor(dataDir) {
    this.kind = "json";
    this.file = path.join(dataDir || path.join(__dirname, "data"), "mindgrid.json");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify({ sessions: {}, attempts: [], feedback: [] }, null, 2));
    }
    this.data = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        sessions: parsed.sessions || {},
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback : []
      };
    } catch {
      return { sessions: {}, attempts: [], feedback: [] };
    }
  }

  write() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  async saveAttempt(attempt) {
    const session = (this.data.sessions[attempt.sessionId] ||= { createdAt: attempt.createdAt });
    this.data.attempts.push(attempt);
    if (this.data.attempts.length > MAX_JSON_ATTEMPTS) {
      this.data.attempts.splice(0, this.data.attempts.length - MAX_JSON_ATTEMPTS);
    }
    session.lastActiveAt = attempt.createdAt;
    this.write();
    return attempt;
  }

  async getAttempts(sessionId, category) {
    return this.data.attempts.filter(
      a => a.sessionId === sessionId && (!category || a.category === category)
    );
  }

  async saveFeedback(feedback) {
    this.data.feedback.push(feedback);
    this.write();
  }

  async summary() {
    const attempts = this.data.attempts;
    const categories = Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0]));
    for (const a of attempts) {
      if (categories[a.category] !== undefined) categories[a.category] += 1;
    }
    return {
      storage: this.kind,
      sessions: Object.keys(this.data.sessions).length,
      attempts: attempts.length,
      accuracy: attempts.length ? Number((attempts.filter(a => a.correct).length / attempts.length).toFixed(3)) : 0,
      totalScore: attempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0),
      categories,
      feedbackCount: this.data.feedback.length
    };
  }

  async close() {}
}

/* ------------------------------------------------------------------ *
 * PostgreSQL (used when DATABASE_URL is configured)
 * ------------------------------------------------------------------ */

class PostgresStore {
  constructor(pool) {
    this.kind = "postgresql";
    this.pool = pool;
  }

  async init() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS sessions (
         id TEXT PRIMARY KEY,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS attempts (
         id BIGSERIAL PRIMARY KEY,
         session_id TEXT NOT NULL,
         category TEXT NOT NULL,
         level INTEGER NOT NULL,
         correct BOOLEAN NOT NULL,
         response_time_ms INTEGER NOT NULL,
         topic TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await this.pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0`);
    await this.pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS hints_used INTEGER NOT NULL DEFAULT 0`);
    await this.pool.query(`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS type TEXT`);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS attempts_session_category_idx ON attempts(session_id, category, created_at DESC)`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS feedback (
         id BIGSERIAL PRIMARY KEY,
         session_id TEXT NOT NULL,
         ease INTEGER NOT NULL,
         challenge INTEGER NOT NULL,
         comment TEXT NOT NULL DEFAULT '',
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
  }

  async saveAttempt(a) {
    await this.pool.query(
      `INSERT INTO sessions(id, last_active_at) VALUES($1, NOW())
       ON CONFLICT(id) DO UPDATE SET last_active_at = NOW()`,
      [a.sessionId]
    );
    await this.pool.query(
      `INSERT INTO attempts(session_id, category, level, correct, response_time_ms, topic, type, score, hints_used, created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.sessionId, a.category, a.level, a.correct, a.responseTimeMs, a.topic, a.type, a.score, a.hintsUsed, a.createdAt]
    );
    return a;
  }

  async getAttempts(sessionId, category) {
    const result = await this.pool.query(
      `SELECT session_id AS "sessionId", category, level, correct,
              response_time_ms AS "responseTimeMs", topic, type, score,
              hints_used AS "hintsUsed", created_at AS "createdAt"
       FROM attempts
       WHERE session_id = $1 AND ($2::text IS NULL OR category = $2)
       ORDER BY created_at, id`,
      [sessionId, category || null]
    );
    return result.rows.map(row => ({
      ...row,
      responseTimeMs: Number(row.responseTimeMs),
      score: Number(row.score),
      hintsUsed: Number(row.hintsUsed)
    }));
  }

  async saveFeedback(f) {
    await this.pool.query(
      `INSERT INTO feedback(session_id, ease, challenge, comment) VALUES($1,$2,$3,$4)`,
      [f.sessionId, f.ease, f.challenge, f.comment]
    );
  }

  async summary() {
    const [sessions, totals, byCategory, feedback] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS n FROM sessions`),
      this.pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(AVG(correct::int), 0)::float AS accuracy,
                COALESCE(SUM(score), 0)::int AS score
         FROM attempts`
      ),
      this.pool.query(`SELECT category, COUNT(*)::int AS n FROM attempts GROUP BY category`),
      this.pool.query(`SELECT COUNT(*)::int AS n FROM feedback`)
    ]);

    const categories = Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0]));
    for (const row of byCategory.rows) {
      if (categories[row.category] !== undefined) categories[row.category] = row.n;
    }

    return {
      storage: this.kind,
      sessions: sessions.rows[0].n,
      attempts: totals.rows[0].n,
      accuracy: Number(Number(totals.rows[0].accuracy).toFixed(3)),
      totalScore: totals.rows[0].score,
      categories,
      feedbackCount: feedback.rows[0].n
    };
  }

  async close() {
    await this.pool.end();
  }
}

/* ------------------------------------------------------------------ *
 * Factory: prefer PostgreSQL, fall back to JSON so the app always runs
 * ------------------------------------------------------------------ */

async function createStore({ databaseUrl, dataDir } = {}) {
  if (databaseUrl) {
    let pool = null;
    try {
      const { Pool } = require("pg");
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 8000,
        max: 5
      });
      pool.on("error", err => console.error("PostgreSQL pool error:", err.message));
      const store = new PostgresStore(pool);
      await store.init();
      console.log("Connected to PostgreSQL — progress is stored in the database.");
      return store;
    } catch (err) {
      console.error("PostgreSQL connection failed; falling back to local JSON storage:", err.message);
      if (pool) {
        try {
          await pool.end();
        } catch {
          /* ignore shutdown errors */
        }
      }
    }
  }
  return new JsonStore(dataDir);
}

module.exports = { JsonStore, PostgresStore, createStore };
