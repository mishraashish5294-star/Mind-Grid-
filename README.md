# MindGrid — Adaptive College-Level Reasoning Trainer

MindGrid is a browser-based reasoning game with three categories, five difficulty tiers, adaptive
difficulty, hints, worked explanations, scoring and a progress dashboard. It runs as a small Express
app that serves the frontend and a JSON API from one process.

Everything is plain JavaScript: no build step, no framework, no account system.

---

## What you can play

| Category | What it trains | Example topics |
| --- | --- | --- |
| **Mathematical reasoning** | symbolic manipulation and calculus | order of operations, linear equations, matrix multiplication, logarithms, modular arithmetic, combinations, probability, derivatives |
| **Spatial reasoning** | geometry and linear algebra | area/perimeter, coordinate reflections, cylinder volume, rotations, vectors, determinants as area scaling |
| **Sequence reasoning** | pattern and series analysis | arithmetic and geometric progressions, recurrence relations, polynomial sequences, geometric series, limits |

**Five difficulty tiers** — Foundation, Intermediate, Advanced, Expert, Master. Each tier raises both
the mathematics and the time budget:

| Level | Character of the puzzles |
| --- | --- |
| 1 Foundation | recall and fluency (arithmetic, simple areas, linear sequences) |
| 2 Intermediate | algebra and multi-step reasoning (linear systems, geometric progressions) |
| 3 Advanced | college techniques (matrices, logs, counting, series) |
| 4 Expert | multi-concept work (transformations, modular arithmetic, recurrences) |
| 5 Master | calculus, limits, non-homogeneous recurrences, determinants |

Every puzzle is multiple choice with one correct answer, three plausible distractors, a hint and a
worked explanation.

## Scoring

A correct answer earns `(base + speed bonus − hint penalty) × streak multiplier`:

- **Base** — 100 points at Foundation, +50 per tier (300 at Master).
- **Speed bonus** — up to 50% of the base, scaled by how far inside the level's time budget you answer.
- **Hint penalty** — 20% of the base per hint, maximum two hints per puzzle.
- **Streak multiplier** — +10% per consecutive correct answer, capped at 1.5×.

Wrong answers score 0 and still show the correct answer plus the explanation.

## Adaptive difficulty

After each answer the server looks at your **last 8 attempts in that category** and moves the
difficulty at most one level:

- **Promote** when accuracy ≥ 80% and the median response time is ≤ 45 s.
- **Ease down** when accuracy < 50%, or when accuracy < 75% and the median is ≥ 90 s.
- **Hold** otherwise. High accuracy with slow answers gives the message "speed up to be promoted".
- The first 3 attempts in a category are a warm-up before adaptation starts.

The recommendation is returned by the API and also shown on the dashboard. You can switch the
adaptive behaviour off in the UI to keep a fixed level.

---

## Run it locally

Requirements: Node.js 18 or newer (developed on Node 20/22/26).

```bash
npm install
npm test          # unit + API integration tests
npm start         # http://localhost:3000
```

`npm run dev` restarts the server when a file changes.

### Configuration

Copy `.env.example` to `.env` if you want to override defaults. Environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | Port to listen on (default `3000`; AppJet supplies it) |
| `DATABASE_URL` | no | PostgreSQL connection string. When empty, progress is stored in `data/mindgrid.json` |
| `PGSSL` | no | Set to `true` when your PostgreSQL provider requires TLS (Supabase, Neon, Railway…) |
| `DATA_DIR` | no | Folder for the JSON store (default `./data`) |

The app never stores secrets in the repository. `.env` and `data/` are git-ignored.

### Database

Without `DATABASE_URL` the app still works and keeps progress in a local JSON file — good for
development. For a real deployment set `DATABASE_URL` and the server creates its tables on startup:

- `sessions` — one row per anonymous session
- `attempts` — category, level, correctness, response time, hints, score, timestamp
- `feedback` — usability ratings from the Guide tab

Any PostgreSQL database works, including a free Supabase or Neon project. The schema is created
automatically (`CREATE TABLE IF NOT EXISTS` plus idempotent `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`), so no manual migration is needed.

---

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | service, storage kind, categories, levels |
| GET | `/api/meta` | categories with labels/icons, level names, hints per puzzle |
| GET | `/api/question?category=&level=` | issue a puzzle (answer and explanation are withheld) |
| GET | `/api/hint/:questionId` | hint for an issued puzzle |
| POST | `/api/attempt` | grade an answer; returns correctness, correct answer, explanation, score breakdown, streak, total, adaptive recommendation |
| GET | `/api/profile/:sessionId` | dashboard data: totals, accuracy, per-category and per-level progress, recommendation |
| GET | `/api/summary` | site-wide activity and storage backend |
| POST | `/api/feedback` | store a usability rating (ease 1–5, challenge 1–5, comment ≤ 500 chars) |

**Grading is server-side.** Issued puzzles live in a server cache for two hours; the browser never
receives the answer, and each puzzle can only be answered once. Session IDs are random 32-character
tokens validated with a strict pattern, and all request bodies are validated (types, ranges,
lengths) with a 16 kB JSON limit.

## Project layout

```
server.js        Express app, API routes, server-side grading, question cache
questionBank.js  45 puzzle generators (3 categories × 5 levels)
adaptive.js      difficulty recommendation from accuracy and response time
scoring.js       points, speed bonus, hint penalty, streaks
storage.js       PostgreSQL store + JSON fallback, shared interface
public/          index.html, app.js, styles.css (responsive, no build step)
tests/           unit.test.js, integration.test.js (node --test + supertest)
```

## Tests

`npm test` runs both suites with the built-in Node test runner:

- **Unit** — every generator for all 3 categories × 5 levels produces a valid, unique-choice puzzle
  whose answer is among the choices; all text is English; difficulty clamping; the adaptive engine
  (warm-up, promote, ease, hold, Master/Foundation limits, window); the scoring model; session-ID and
  answer-normalisation helpers; question-cache expiry.
- **Integration** — every endpoint, including answer grading, hint delivery, replay rejection,
  validation errors, adaptive promotion/easing through the real API, dashboard aggregation,
  persistence across a store reload, summary and feedback.

## Deploy

The included `Dockerfile` runs the app as a non-root user on port 3000. On AppJet, deploy the
`appjet` branch and add `DATABASE_URL` (plus `PGSSL=true` if your provider needs TLS) under
**Settings → Environment variables** to use PostgreSQL instead of the JSON fallback.
