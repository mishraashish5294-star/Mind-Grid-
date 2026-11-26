# MindGrid – Mathematical Puzzle Game

MindGrid is a responsive, browser-based college project with three puzzle categories, five difficulty levels, hints, explanations, progress analytics, an adaptive recommendation engine, and an Express API.

## Features

- **Mathematical Reasoning / Arithmetic:** arithmetic, linear algebra, determinants, modular arithmetic, probability, combinatorics, and differentiation.
- **Spatial Puzzles:** 2D geometry, coordinate reflections, 3D cylinder volume, rotations, and linear transformations.
- **Sequence Puzzles:** arithmetic/geometric progressions, Fibonacci-style sequences, polynomial sequences, and linear recurrences.
- **Five levels:** Foundation, Intermediate, Advanced, Expert, Master.
- **Adaptive difficulty:** category-specific recommendations based on recent accuracy and median response time. It promotes after high accuracy with sufficiently quick answers, and eases difficulty after low accuracy / slow performance.
- Hints and worked explanations, session statistics, category dashboard, feedback form.
- PostgreSQL support when `DATABASE_URL` is configured; otherwise local JSON fallback.
- Unit and API integration tests.

## Requirements

- Windows 10/11, macOS, or Linux
- Node.js 18 or newer (Node.js 20 LTS recommended)
- Internet connection for the first `npm install`
- PostgreSQL is optional for local evaluation.

## Run on Windows (beginner-friendly)

1. Install Node.js LTS from https://nodejs.org/. During setup, keep the option to add Node to PATH enabled.
2. Extract `MindGrid-v2.zip` to a folder such as `C:\\College\\MindGrid`.
3. Open that folder in File Explorer.
4. Click the address bar, type `cmd`, and press Enter. A Command Prompt opens in the project folder.
5. Run:

   ```bash
   npm install
   ```

6. Run automated tests:

   ```bash
   npm test
   ```

7. Start the game:

   ```bash
   npm start
   ```

8. Open http://localhost:3000 in Chrome or Edge.

To stop the server, return to Command Prompt and press `Ctrl + C`.

## PostgreSQL setup (optional)

1. Install PostgreSQL from https://www.postgresql.org/download/windows/.
2. During setup, remember the password you choose for the `postgres` user.
3. Create a database named `mindgrid` using pgAdmin or SQL:

   ```sql
   CREATE DATABASE mindgrid;
   ```

4. Copy `.env.example` to `.env` and set `DATABASE_URL` to your own credentials, for example:

   ```text
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/mindgrid
   PORT=3000
   ```

5. Install dotenv if you want automatic `.env` loading (`npm install dotenv`) and add `require("dotenv").config();` as the first line of `server.js`, or set the environment variable in Command Prompt before starting:

   ```cmd
   set DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/mindgrid
   npm start
   ```

If PostgreSQL is not configured or cannot be reached, the app falls back to `data/mindgrid.json`. Do not commit `.env` or the `data/` directory.

## Tests and honest verification

- `npm test` runs unit tests and API integration tests.
- The integration test uses an isolated temporary JSON store; it does not require PostgreSQL.
- PostgreSQL connection and persistence should be tested separately on a machine with a configured PostgreSQL server.
- Browser compatibility, mobile layout, accessibility with assistive technology, and real multi-user load have not been independently certified.
- Question generation is algorithmic and randomized; faculty should review mathematical content and difficulty calibration before formal grading or research use.
- Adaptive thresholds are prototype heuristics, not a validated psychometric model.

## GitHub upload (Windows)

1. Create/sign in to GitHub at https://github.com/.
2. Click **New repository**. Name it `MindGrid-Mathematical-Puzzle-Game`.
3. Keep it Public or Private as your instructor requires. Do not initialize with another README if uploading this complete folder.
4. In the project folder, open Command Prompt and run:

   ```bash
   git init
   git add .
   git commit -m "Initial MindGrid v2 project"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/MindGrid-Mathematical-Puzzle-Game.git
   git push -u origin main
   ```

5. Replace `YOUR-USERNAME` with your GitHub username. GitHub may ask you to sign in through a browser.

If Git is not installed, install it from https://git-scm.com/downloads and reopen Command Prompt.

## API endpoints

- `GET /api/health` – health check
- `GET /api/meta` – category and level metadata
- `GET /api/question?category=arithmetic&level=3` – generate a puzzle
- `POST /api/attempt` – record an answer and get an adaptive recommendation
- `GET /api/profile/:sessionId` – category-wise progress
- `POST /api/feedback` – save voluntary feedback
- `GET /api/summary` – aggregate project analytics

## Data and privacy

The browser creates a random anonymous session identifier. No login or personal profile is implemented. Avoid entering personal information in feedback comments. Local JSON data is stored in `data/`; PostgreSQL data stays in the configured database. This is a classroom prototype, not a hardened production service.

## Project structure

```text
MindGrid/
  public/
    index.html
    app.js
    styles.css
  tests/
    unit.test.js
    integration.test.js
  adaptive.js
  questionBank.js
  storage.js
  server.js
  package.json
  .env.example
  .gitignore
  README.md
```
