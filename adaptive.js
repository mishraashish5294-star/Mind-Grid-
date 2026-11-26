const LEVELS = Object.freeze([
  "Foundation", "Intermediate", "Advanced", "Expert", "Master"
]);

function clampLevel(level) {
  return Math.max(1, Math.min(5, Math.round(Number(level) || 1)));
}

function recommendDifficulty(attempts, currentLevel = 1) {
  const level = clampLevel(currentLevel);
  const recent = (attempts || []).slice(-8);
  if (recent.length < 3) return { level, reason: "कम-से-कम 3 attempts के बाद adaptation शुरू होगा।", accuracy: null, medianTimeMs: null };

  const accuracy = recent.filter(a => a.correct).length / recent.length;
  const times = recent.map(a => Number(a.responseTimeMs) || 0).filter(t => t > 0).sort((a,b) => a-b);
  const medianTimeMs = times.length ? times[Math.floor(times.length / 2)] : null;

  // Fast + accurate performance advances; low accuracy or consistently slow responses ease difficulty.
  const fastEnough = medianTimeMs === null || medianTimeMs <= 45000;
  const slow = medianTimeMs !== null && medianTimeMs >= 90000;
  let next = level;
  let reason = "आपकी वर्तमान difficulty बनाए रखी गई है।";
  if (accuracy >= 0.8 && fastEnough) {
    next = Math.min(5, level + 1);
    reason = "अच्छी accuracy और response time के कारण अगला स्तर सुझाया गया है।";
  } else if (accuracy < 0.45 || (slow && accuracy < 0.7)) {
    next = Math.max(1, level - 1);
    reason = "अभी concepts मजबूत करने के लिए एक आसान स्तर सुझाया गया है।";
  }
  return { level: next, reason, accuracy: Number(accuracy.toFixed(2)), medianTimeMs };
}

module.exports = { LEVELS, clampLevel, recommendDifficulty };
