"use strict";

/**
 * Adaptive difficulty engine.
 *
 * Difficulty moves one level at a time inside the five MindGrid tiers and is
 * driven by the two signals the brief asks for: recent accuracy and recent
 * response time. Only the last few attempts are considered so that a player
 * who improves quickly is not held back by old mistakes.
 */

const LEVELS = Object.freeze([
  "Foundation",
  "Intermediate",
  "Advanced",
  "Expert",
  "Master"
]);

const WINDOW = 8;            // attempts considered per recommendation
const MIN_SAMPLE = 3;        // attempts required before adapting
const PROMOTE_ACCURACY = 0.8;
const EASE_ACCURACY = 0.5;
const FAST_MS = 45000;       // median at or below this is "comfortable"
const SLOW_MS = 90000;       // median at or above this is "struggling"

function clampLevel(level) {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(LEVELS.length, n));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percent(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Recommend the next difficulty for a single category.
 *
 * @param {Array} attempts   attempts for one category, oldest first
 * @param {number} currentLevel level the player is currently playing
 * @returns {{level:number, reason:string, accuracy:number|null,
 *            medianTimeMs:number|null, sampleSize:number, signal:string}}
 */
function recommendDifficulty(attempts, currentLevel = 1) {
  const level = clampLevel(currentLevel);
  const recent = (Array.isArray(attempts) ? attempts : []).slice(-WINDOW);
  const correct = recent.filter(a => a && a.correct === true).length;
  const accuracy = recent.length ? correct / recent.length : null;

  const times = recent
    .map(a => Number(a && a.responseTimeMs))
    .filter(t => Number.isFinite(t) && t > 0);
  const medianTimeMs = times.length ? median(times) : null;

  if (recent.length < MIN_SAMPLE) {
    return {
      level,
      accuracy,
      medianTimeMs,
      sampleSize: recent.length,
      signal: "warming-up",
      reason: `Answer ${MIN_SAMPLE} puzzles at ${LEVELS[level - 1]} before the difficulty adapts.`
    };
  }

  const fastEnough = medianTimeMs === null || medianTimeMs <= FAST_MS;
  const slow = medianTimeMs !== null && medianTimeMs >= SLOW_MS;

  let next = level;
  let signal = "hold";
  let reason = `Holding ${LEVELS[level - 1]}: accuracy ${percent(accuracy)} is steady.`;

  if (accuracy >= PROMOTE_ACCURACY && fastEnough) {
    if (level < LEVELS.length) {
      next = level + 1;
      signal = "promote";
      reason = `Promoted to ${LEVELS[next - 1]}: ${percent(accuracy)} accuracy in ${Math.round(medianTimeMs / 1000)}s median.`;
    } else {
      reason = `You are already at Master with ${percent(accuracy)} accuracy — keep the streak alive.`;
    }
  } else if (accuracy < EASE_ACCURACY || (slow && accuracy < 0.75)) {
    if (level > 1) {
      next = level - 1;
      signal = "ease";
      reason = `Eased to ${LEVELS[next - 1]}: ${percent(accuracy)} accuracy with a ${Math.round(medianTimeMs / 1000)}s median.`;
    } else {
      reason = `Stay on Foundation and use the hints — accuracy is ${percent(accuracy)}.`;
    }
  } else if (accuracy >= PROMOTE_ACCURACY && !fastEnough) {
    reason = `Accuracy is ${percent(accuracy)} but the median answer takes ${Math.round(medianTimeMs / 1000)}s; speed up to be promoted.`;
  }

  return {
    level: next,
    reason,
    accuracy: Number(accuracy.toFixed(2)),
    medianTimeMs,
    sampleSize: recent.length,
    signal
  };
}

module.exports = { LEVELS, clampLevel, recommendDifficulty, WINDOW, MIN_SAMPLE };
