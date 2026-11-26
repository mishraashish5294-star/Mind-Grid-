"use strict";

/**
 * Points model.
 *
 * A correct answer earns a level-based base score, a speed bonus that shrinks
 * as the response time approaches the level budget, minus a small penalty per
 * hint revealed, multiplied by a streak bonus capped at five answers.
 */

const { clampLevel } = require("./adaptive");

const MAX_HINTS = 2;

function basePoints(level) {
  return 100 + (clampLevel(level) - 1) * 50;
}

function timeBudgetMs(level) {
  return 20000 + clampLevel(level) * 10000;
}

function scoreAttempt({ level = 1, correct = false, responseTimeMs = 0, hintsUsed = 0, streak = 0 } = {}) {
  const lvl = clampLevel(level);
  const hints = Math.max(0, Math.min(MAX_HINTS, Math.floor(Number(hintsUsed) || 0)));
  const budgetMs = timeBudgetMs(lvl);

  if (!correct) {
    return { points: 0, base: 0, timeBonus: 0, hintPenalty: 0, streakMultiplier: 1, hintsUsed: hints, budgetMs };
  }

  const base = basePoints(lvl);
  const time = Math.max(0, Number(responseTimeMs) || 0);
  const speedRatio = Math.max(0, Math.min(1, 1 - time / budgetMs));
  const timeBonus = Math.round(base * 0.5 * speedRatio);
  const hintPenalty = Math.round(base * 0.2 * hints);
  const streakMultiplier = Number((1 + Math.min(Math.max(0, Math.floor(streak)), 5) * 0.1).toFixed(2));
  const points = Math.max(0, Math.round((base + timeBonus - hintPenalty) * streakMultiplier));

  return { points, base, timeBonus, hintPenalty, streakMultiplier, hintsUsed: hints, budgetMs };
}

/** Consecutive correct answers at the end of an oldest-first attempt list. */
function currentStreak(attempts) {
  let streak = 0;
  for (let i = (attempts || []).length - 1; i >= 0; i--) {
    if (attempts[i] && attempts[i].correct) streak++;
    else break;
  }
  return streak;
}

function totalPoints(attempts) {
  return (attempts || []).reduce((sum, a) => sum + (Number(a && a.score) || 0), 0);
}

module.exports = { MAX_HINTS, basePoints, timeBudgetMs, scoreAttempt, currentStreak, totalPoints };
