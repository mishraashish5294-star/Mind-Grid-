"use strict";

/**
 * MindGrid question bank.
 *
 * Three reasoning categories, five difficulty tiers each. Every generator
 * returns a multiple-choice puzzle with a single correct answer, three
 * plausible distractors, a hint and a worked explanation.
 *
 * Difficulty is not only "bigger numbers": Foundation is recall/fluency,
 * Intermediate introduces algebraic manipulation, Advanced adds matrices,
 * logarithms and 3D geometry, Expert covers modular arithmetic, counting and
 * probability, and Master requires calculus, limits and linear algebra.
 */

const { LEVELS, clampLevel } = require("./adaptive");

const CATEGORIES = ["arithmetic", "spatial", "sequence"];

const CATEGORY_LABELS = {
  arithmetic: "Mathematical Reasoning",
  spatial: "Spatial Reasoning",
  sequence: "Sequence Reasoning"
};

const CATEGORY_ICONS = {
  arithmetic: "∑",
  spatial: "◫",
  sequence: "⋯"
};

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = xs => xs[rand(0, xs.length - 1)];

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

const fmt = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(4)));
};

const nCr = (n, k) => {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i = 1; i <= k; i++) v = (v * (n - i + 1)) / i;
  return Math.round(v);
};

const nPr = (n, k) => {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i = 0; i < k; i++) v *= n - i;
  return v;
};

/** Build four unique choices (the answer plus up to three distractors). */
function buildChoices(answer, distractors) {
  const correct = String(answer);
  const seen = new Set([correct]);

  for (const d of distractors || []) {
    if (seen.size >= 4) break;
    const text = String(d);
    if (text && text !== "NaN" && !seen.has(text)) seen.add(text);
  }

  const numeric = Number(correct);
  if (seen.size < 4 && Number.isFinite(numeric)) {
    for (const delta of [1, -1, 2, -2, 3, -3, 5, -5, 10, -10]) {
      if (seen.size >= 4) break;
      const candidate = fmt(numeric + delta);
      if (!seen.has(candidate)) seen.add(candidate);
    }
  }

  for (const generic of ["None of these", "Cannot be determined", "0", "1", "2", "3"]) {
    if (seen.size >= 4) break;
    if (!seen.has(generic)) seen.add(generic);
  }

  const choices = [...seen].slice(0, 4);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { correct, choices };
}

// Picks three options that differ from the correct answer and from each other,
// so a puzzle never has to fall back to a "None of these" filler.
function uniqueOptions(correct, candidates) {
  const seen = new Set([String(correct)]);
  const options = [];
  for (const candidate of candidates) {
    if (options.length === 3) break;
    const text = String(candidate);
    if (!text || text === "NaN" || text === "undefined" || seen.has(text)) continue;
    seen.add(text);
    options.push(text);
  }
  return options;
}

let counter = 0;

function make({ prompt, answer, distractors, hint, explanation, topic, type, level }) {
  const { correct, choices } = buildChoices(answer, distractors);
  counter = (counter + 1) % 1e9;
  return {
    id: `q${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    category: null,
    level,
    levelName: LEVELS[level - 1],
    type,
    topic,
    prompt,
    choices,
    answer: correct,
    hint,
    explanation
  };
}

const fraction = (num, den) => {
  const g = gcd(num, den) || 1;
  return `${num / g}/${den / g}`;
};

/* ------------------------------------------------------------------ *
 * Mathematical reasoning
 * ------------------------------------------------------------------ */

function orderOfOperations() {
  const a = rand(3, 12), b = rand(2, 6), c = rand(2, 4);
  const ans = a + b * c * c;
  return make({
    prompt: `Evaluate: ${a} + ${b} × ${c}²`,
    answer: ans,
    distractors: [(a + b) * c * c, a + b * c, (a + b * c) * c],
    hint: "Use the order of operations: powers first, then multiplication, then addition.",
    explanation: `${c}² = ${c * c}. Next ${b} × ${c * c} = ${b * c * c}. Finally ${a} + ${b * c * c} = ${ans}.`,
    topic: "Order of Operations",
    type: "order-of-operations",
    level: 1
  });
}

function percentageReverse() {
  const original = rand(4, 30) * 100;
  const pct = pick([10, 20, 25, 50]);
  const sale = (original * (100 - pct)) / 100;
  return make({
    prompt: `After a ${pct}% discount a jacket costs ₹${sale}. What was its original price?`,
    answer: original,
    distractors: [sale + pct, sale + original * (pct / 100), sale - 100],
    hint: "The sale price is (100 − discount)% of the original price, so divide by that percentage.",
    explanation: `Original × ${(100 - pct) / 100} = ${sale}, so original = ${sale} ÷ ${(100 - pct) / 100} = ₹${original}.`,
    topic: "Percentages",
    type: "percentage",
    level: 1
  });
}

function fractionSum() {
  const b = pick([3, 4, 5, 6, 8]);
  const d = pick([3, 4, 5, 6, 8].filter(x => x !== b));
  const a = rand(1, b - 1), c = rand(1, d - 1);
  const num = a * d + c * b;
  const den = b * d;
  const ans = fraction(num, den);

  // Wrong options are derived from the reduced answer, so the unreduced working
  // can never be offered as a second copy of the correct answer.
  const parts = String(ans).split("/");
  const p = Number(parts[0]);
  const q = parts.length > 1 ? Number(parts[1]) : 1;
  const asFraction = (n, dn) => (dn === 1 ? String(n) : `${n}/${dn}`);
  const candidates = [
    `${a + c}/${b + d}`,
    asFraction(p + 1, q),
    asFraction(p, q + 1),
    `${num}/${den}`,
    `${a * c}/${b * d}`
  ];
  const seen = new Set([String(ans)]);
  const distractors = [];
  for (const candidate of candidates) {
    if (distractors.length === 3) break;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    distractors.push(candidate);
  }

  return make({
    prompt: `Add the fractions: ${a}/${b} + ${c}/${d}`,
    answer: ans,
    distractors,
    hint: "Rewrite both fractions with the common denominator, then add the numerators and simplify.",
    explanation: `${a}/${b} = ${a * d}/${den} and ${c}/${d} = ${c * b}/${den}. The sum is ${num}/${den} = ${ans}.`,
    topic: "Fractions",
    type: "fraction-addition",
    level: 1
  });
}

function linearEquation() {
  const a = rand(2, 9), x = rand(-6, 9), b = rand(1, 12);
  const c = a * x + b;
  return make({
    prompt: `Solve for x: ${a}x + ${b} = ${c}`,
    answer: x,
    distractors: [x + 1, x - 1, c - a],
    hint: "Subtract the constant from both sides, then divide by the coefficient of x.",
    explanation: `${a}x = ${c} − ${b} = ${c - b}; x = ${c - b} ÷ ${a} = ${x}.`,
    topic: "Linear Equations",
    type: "linear-equation",
    level: 2
  });
}

function linearSystem() {
  const x = rand(1, 9), y = rand(1, 9);
  return make({
    prompt: `Solve the system: x + y = ${x + y} and x − y = ${x - y}. What is x?`,
    answer: x,
    distractors: [y, x + y, x - y],
    hint: "Add the two equations to eliminate y.",
    explanation: `Adding gives 2x = ${x + y + (x - y)} = ${2 * x}, so x = ${x} (and y = ${y}).`,
    topic: "Systems of Equations",
    type: "linear-system",
    level: 2
  });
}

function exponentLaw() {
  const a = rand(3, 7), b = rand(2, 6), c = rand(1, Math.min(a, b));
  return make({
    prompt: `Simplify (2^${a} × 2^${b}) ÷ 2^${c} and give the exponent of 2.`,
    answer: a + b - c,
    distractors: [a + b + c, a * b - c, a + b],
    hint: "Multiplying powers adds exponents; dividing subtracts them.",
    explanation: `2^${a} × 2^${b} = 2^${a + b}, and 2^${a + b} ÷ 2^${c} = 2^${a + b - c}. The exponent is ${a + b - c}.`,
    topic: "Exponent Laws",
    type: "exponent-law",
    level: 2
  });
}

function determinant2x2() {
  const a = rand(1, 6), b = rand(1, 6), c = rand(1, 6), d = rand(1, 6);
  const det = a * d - b * c;
  return make({
    prompt: `Find the determinant of the matrix [[${a}, ${b}], [${c}, ${d}]].`,
    answer: det,
    distractors: [a * d + b * c, a + b + c + d, -det],
    hint: "For a 2×2 matrix the determinant is ad − bc.",
    explanation: `det = (${a})(${d}) − (${b})(${c}) = ${a * d} − ${b * c} = ${det}.`,
    topic: "Matrices & Determinants",
    type: "determinant",
    level: 3
  });
}

function matrixProductEntry() {
  const a = rand(1, 5), b = rand(1, 5), c = rand(1, 5), d = rand(1, 5);
  const e = rand(1, 5), f = rand(1, 5), g = rand(1, 5), h = rand(1, 5);
  const ans = a * e + b * g;
  return make({
    prompt: `For A = [[${a}, ${b}], [${c}, ${d}]] and B = [[${e}, ${f}], [${g}, ${h}]], find the top-left entry of A × B.`,
    answer: ans,
    distractors: [a * e - b * g, a * f + b * h, a * e + c * g],
    hint: "The top-left entry is row 1 of A dotted with column 1 of B.",
    explanation: `Entry (1,1) = ${a}×${e} + ${b}×${g} = ${a * e} + ${b * g} = ${ans}.`,
    topic: "Matrix Multiplication",
    type: "matrix-product",
    level: 3
  });
}

function logarithmValue() {
  const base = pick([2, 3, 5, 10]);
  const k = rand(2, 4);
  const value = Math.pow(base, k);
  return make({
    prompt: `Evaluate log_${base}(${value}).`,
    answer: k,
    distractors: [k + 1, value / base, k - 1],
    hint: "Ask: to what power must the base be raised to give the argument?",
    explanation: `${base}^${k} = ${value}, therefore log_${base}(${value}) = ${k}.`,
    topic: "Logarithms",
    type: "logarithm",
    level: 3
  });
}

function modularMultiplication() {
  const m = pick([7, 9, 11, 13]);
  const a = rand(2, m - 1), b = rand(2, m - 1);
  const ans = (a * b) % m;
  return make({
    prompt: `Compute (${a} × ${b}) mod ${m}.`,
    answer: ans,
    distractors: [a * b, (a + b) % m, m - ans],
    hint: "Multiply first, then take the remainder after dividing by the modulus.",
    explanation: `${a} × ${b} = ${a * b}. Since ${a * b} = ${Math.floor((a * b) / m)} × ${m} + ${ans}, the remainder is ${ans}.`,
    topic: "Modular Arithmetic",
    type: "modular-arithmetic",
    level: 4
  });
}

function combinations() {
  const n = rand(6, 12);
  const k = rand(2, Math.min(4, n - 2));
  const ans = nCr(n, k);
  return make({
    prompt: `How many ways can a committee of ${k} be chosen from ${n} students?`,
    answer: ans,
    distractors: [nPr(n, k), nCr(n, k + 1), nCr(n - 1, k)],
    hint: "Order does not matter, so this is a combination: nCk = n! / (k!(n − k)!).",
    explanation: `${n}C${k} = ${n}! / (${k}! × ${n - k}!) = ${ans} ways.`,
    topic: "Combinatorics",
    type: "combinations",
    level: 4
  });
}

function permutations() {
  const n = rand(5, 9);
  const k = rand(2, 3);
  const ans = nPr(n, k);
  return make({
    prompt: `In how many ways can ${k} different prizes be awarded to ${n} contestants (each contestant gets at most one)?`,
    answer: ans,
    distractors: [nCr(n, k), nPr(n, k - 1), n * k],
    hint: "Order matters here, so use nPk = n × (n−1) × … for k factors.",
    explanation: `${n}P${k} = ${n} × ${n - 1}${k > 2 ? ` × ${n - 2}` : ""} = ${ans} ways.`,
    topic: "Permutations",
    type: "permutations",
    level: 4
  });
}

function probabilityWithoutReplacement() {
  const red = rand(2, 6), blue = rand(2, 6);
  const total = red + blue;
  const num = red * (red - 1);
  const den = total * (total - 1);
  const ans = fraction(num, den);
  return make({
    prompt: `A bag holds ${red} red and ${blue} blue balls. Two balls are drawn without replacement. What is the probability that both are red?`,
    answer: ans,
    distractors: [`${red * red}/${total * total}`, `${num}/${den}`, `${red}/${total}`],
    hint: "Multiply the probability of a red ball on the first draw by the conditional probability on the second.",
    explanation: `P = (${red}/${total}) × (${red - 1}/${total - 1}) = ${num}/${den} = ${ans}.`,
    topic: "Probability",
    type: "probability",
    level: 4
  });
}

function derivativeAtPoint() {
  const a = rand(2, 6), b = rand(1, 9), x = rand(2, 6);
  const ans = 2 * a * x + b;
  return make({
    prompt: `For f(x) = ${a}x² + ${b}x, find f′(${x}).`,
    answer: ans,
    distractors: [a * x + b, 2 * a * x, 2 * a * x + b + a],
    hint: "Differentiate term by term with the power rule, then substitute x.",
    explanation: `f′(x) = ${2 * a}x + ${b}, so f′(${x}) = ${2 * a * x} + ${b} = ${ans}.`,
    topic: "Differential Calculus",
    type: "derivative",
    level: 5
  });
}

function definiteIntegral() {
  const a = rand(2, 6), k = rand(2, 3) * 2;
  const ans = (a * k * k) / 2;
  return make({
    prompt: `Evaluate the definite integral ∫₀^${k} ${a}x dx.`,
    answer: ans,
    distractors: [a * k * k, a * k, ans + a],
    hint: "An antiderivative of ax is ax²/2; evaluate it from 0 to the upper limit.",
    explanation: `∫₀^${k} ${a}x dx = [${a}x²/2]₀^${k} = ${a}(${k * k})/2 = ${ans}.`,
    topic: "Integral Calculus",
    type: "definite-integral",
    level: 5
  });
}

function limitByFactoring() {
  const a = rand(2, 9);
  return make({
    prompt: `Evaluate lim(x→${a}) (x² − ${a * a}) / (x − ${a}).`,
    answer: 2 * a,
    distractors: [a, a * a, 0],
    hint: "Factor the numerator as a difference of squares, then cancel.",
    explanation: `(x² − ${a * a})/(x − ${a}) = x + ${a} for x ≠ ${a}, so the limit is ${a} + ${a} = ${2 * a}.`,
    topic: "Limits",
    type: "limit",
    level: 5
  });
}

function expectedValue() {
  let p1 = rand(1, 4) * 10;
  let p2 = rand(1, 4) * 10;
  let p3 = 100 - p1 - p2;
  if (p3 < 10) { p1 = 20; p2 = 30; p3 = 50; }
  const ans = fmt((p1 * 1 + p2 * 2 + p3 * 5) / 100);
  return make({
    prompt: `A random variable X takes the values 1, 2 and 5 with probabilities ${p1}%, ${p2}% and ${p3}%. Find E(X).`,
    answer: ans,
    distractors: [fmt((p1 + p2 + p3) / 100), fmt((1 + 2 + 5) / 3), fmt((p1 * 5 + p2 * 2 + p3 * 1) / 100)],
    hint: "Expected value is the sum of each value multiplied by its probability.",
    explanation: `E(X) = ${p1}%×1 + ${p2}%×2 + ${p3}%×5 = ${fmt(p1 / 100)} + ${fmt((p2 * 2) / 100)} + ${fmt((p3 * 5) / 100)} = ${ans}.`,
    topic: "Expected Value",
    type: "expected-value",
    level: 5
  });
}

/* ------------------------------------------------------------------ *
 * Spatial reasoning
 * ------------------------------------------------------------------ */

function rectangleArea() {
  const w = rand(4, 16), h = rand(3, 12);
  return make({
    prompt: `A rectangle is ${w} units wide and ${h} units tall. What is its area?`,
    answer: w * h,
    distractors: [2 * (w + h), w + h, w * h + w],
    hint: "Area of a rectangle = width × height.",
    explanation: `${w} × ${h} = ${w * h} square units.`,
    topic: "2D Geometry",
    type: "area",
    level: 1
  });
}

function triangleArea() {
  const b = rand(2, 10) * 2, h = rand(3, 12);
  return make({
    prompt: `A triangle has base ${b} cm and height ${h} cm. What is its area?`,
    answer: (b * h) / 2,
    distractors: [b * h, b + h, b * h + 2],
    hint: "Area of a triangle = ½ × base × height.",
    explanation: `½ × ${b} × ${h} = ${(b * h) / 2} cm².`,
    topic: "2D Geometry",
    type: "triangle-area",
    level: 1
  });
}

function midpoint() {
  const x1 = rand(-6, 6);
  const y1 = rand(-6, 6);
  const x2 = x1 + 2 * rand(-4, 4);
  const y2 = y1 + 2 * rand(-4, 4);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return make({
    prompt: `Find the midpoint of A(${x1}, ${y1}) and B(${x2}, ${y2}).`,
    answer: `(${mx}, ${my})`,
    distractors: uniqueOptions(`(${mx}, ${my})`, [
      `(${x1 + x2}, ${y1 + y2})`,
      `(${my}, ${mx})`,
      `(${mx + 1}, ${my})`,
      `(${mx}, ${my + 1})`,
      `(${x1}, ${y2})`,
      `(${x2}, ${y1})`
    ]),
    hint: "Average the x-coordinates and average the y-coordinates.",
    explanation: `Midpoint = (((${x1} + ${x2})/2), ((${y1} + ${y2})/2)) = (${mx}, ${my}).`,
    topic: "Coordinate Geometry",
    type: "midpoint",
    level: 1
  });
}

function reflection() {
  const x = rand(-6, 7), y = rand(-6, 7);
  const axis = pick(["x", "y"]);
  const ans = axis === "x" ? `(${x}, ${-y})` : `(${-x}, ${y})`;
  return make({
    prompt: `Reflect the point (${x}, ${y}) in the ${axis}-axis. What are the new coordinates?`,
    answer: ans,
    distractors: uniqueOptions(ans, [
      axis === "x" ? `(${-x}, ${y})` : `(${x}, ${-y})`,
      `(${-x}, ${-y})`,
      `(${y}, ${x})`,
      `(${x + 1}, ${y})`,
      `(${x}, ${y + 1})`
    ]),
    hint: axis === "x"
      ? "Reflecting in the x-axis keeps x and flips the sign of y."
      : "Reflecting in the y-axis keeps y and flips the sign of x.",
    explanation: axis === "x" ? `(x, y) → (x, −y), so (${x}, ${y}) → ${ans}.` : `(x, y) → (−x, y), so (${x}, ${y}) → ${ans}.`,
    topic: "Coordinate Transformations",
    type: "reflection",
    level: 2
  });
}

function translation() {
  const x = rand(-5, 5), y = rand(-5, 5);
  const dx = pick([-4, -3, -2, 2, 3, 4]), dy = pick([-4, -3, -2, 2, 3, 4]);
  return make({
    prompt: `Translate the point (${x}, ${y}) by the vector ⟨${dx}, ${dy}⟩. What are the new coordinates?`,
    answer: `(${x + dx}, ${y + dy})`,
    distractors: uniqueOptions(`(${x + dx}, ${y + dy})`, [
      `(${x - dx}, ${y - dy})`,
      `(${x + dy}, ${y + dx})`,
      `(${x * dx}, ${y * dy})`,
      `(${x + dx + 1}, ${y + dy})`,
      `(${x + dx}, ${y + dy + 1})`
    ]),
    hint: "Add the vector components to the matching coordinates.",
    explanation: `(${x} + ${dx}, ${y} + ${dy}) = (${x + dx}, ${y + dy}).`,
    topic: "Vectors & Translation",
    type: "translation",
    level: 2
  });
}

function circleArea() {
  const r = rand(2, 12);
  return make({
    prompt: `A circle has radius ${r}. What is its area, in terms of π?`,
    answer: `${r * r}π`,
    distractors: uniqueOptions(`${r * r}π`, [
      `${2 * r}π`,
      `${r * r * 2}π`,
      `${r}π`,
      `${r * r + 2 * r}π`,
      `${r * r - 1}π`
    ]),
    hint: "Area of a circle = πr².",
    explanation: `A = π × ${r}² = ${r * r}π.`,
    topic: "Circles",
    type: "circle-area",
    level: 2
  });
}

function cylinderVolume() {
  const r = rand(2, 6), h = rand(3, 9);
  return make({
    prompt: `A cylinder has radius ${r} and height ${h}. What is its volume, in terms of π?`,
    answer: `${r * r * h}π`,
    distractors: uniqueOptions(`${r * r * h}π`, [
      `${2 * r * h}π`,
      `${r * h}π`,
      `${r * r * h * 2}π`,
      `${r * r * h + r * r}π`,
      `${r * r * h - r}π`
    ]),
    hint: "Volume of a cylinder = πr²h.",
    explanation: `V = π × ${r}² × ${h} = ${r * r * h}π cubic units.`,
    topic: "3D Geometry",
    type: "cylinder-volume",
    level: 3
  });
}

function coneVolume() {
  const r = pick([3, 6, 9]), h = rand(2, 10);
  return make({
    prompt: `A cone has radius ${r} and height ${h}. What is its volume, in terms of π?`,
    answer: `${(r * r * h) / 3}π`,
    distractors: [`${r * r * h}π`, `${(r * h) / 3}π`, `${(r * r * h) / 2}π`],
    hint: "Volume of a cone is one third of the cylinder with the same base and height.",
    explanation: `V = (1/3)π × ${r}² × ${h} = ${(r * r * h) / 3}π cubic units.`,
    topic: "3D Geometry",
    type: "cone-volume",
    level: 3
  });
}

function sphereVolume() {
  const r = pick([3, 6]);
  const ans = (4 / 3) * r * r * r;
  return make({
    prompt: `A sphere has radius ${r}. What is its volume, in terms of π?`,
    answer: `${ans}π`,
    distractors: [`${(4 / 3) * r * r}π`, `${4 * r * r * r}π`, `${ans * 2}π`],
    hint: "Volume of a sphere = (4/3)πr³.",
    explanation: `V = (4/3)π × ${r}³ = (4/3)π × ${r * r * r} = ${ans}π.`,
    topic: "3D Geometry",
    type: "sphere-volume",
    level: 3
  });
}

function rotation() {
  const x = rand(1, 6), y = rand(1, 6);
  const angle = pick([90, 180]);
  const ans = angle === 90 ? `(${-y}, ${x})` : `(${-x}, ${-y})`;
  return make({
    prompt: `Rotate the point (${x}, ${y}) by ${angle}° anticlockwise about the origin. What are the new coordinates?`,
    answer: ans,
    distractors: uniqueOptions(ans, angle === 90
      ? [`(${y}, ${-x})`, `(${-x}, ${-y})`, `(${x}, ${-y})`, `(${-y}, ${-x})`, `(${x + 1}, ${y})`]
      : [`(${y}, ${x})`, `(${-y}, ${x})`, `(${x}, ${y})`, `(${y}, ${-x})`, `(${x + 1}, ${y})`]),
    hint: angle === 90
      ? "A 90° anticlockwise rotation maps (x, y) to (−y, x)."
      : "A 180° rotation maps (x, y) to (−x, −y).",
    explanation: angle === 90
      ? `(${x}, ${y}) → (${-y}, ${x}).`
      : `(${x}, ${y}) → (${-x}, ${-y}).`,
    topic: "Rotations",
    type: "rotation",
    level: 4
  });
}

function dotProduct() {
  const a = rand(-5, 5) || 2, b = rand(-5, 5) || 3;
  const c = rand(-5, 5) || 1, d = rand(-5, 5) || 4;
  const ans = a * c + b * d;
  return make({
    prompt: `For u = ⟨${a}, ${b}⟩ and v = ⟨${c}, ${d}⟩, compute u · v.`,
    answer: ans,
    distractors: [a * d + b * c, a * c - b * d, ans + 1],
    hint: "The dot product multiplies matching components and adds the results.",
    explanation: `u · v = (${a})(${c}) + (${b})(${d}) = ${a * c} + ${b * d} = ${ans}.`,
    topic: "Vector Algebra",
    type: "dot-product",
    level: 4
  });
}

function vectorMagnitude() {
  const [a, b, m] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
  const sign = pick([1, -1]);
  const aa = a * sign;
  return make({
    prompt: `Find the magnitude of the vector ⟨${aa}, ${b}⟩.`,
    answer: m,
    distractors: [Math.abs(aa) + b, m + 1, Math.abs(aa * b)],
    hint: "Magnitude = √(x² + y²).",
    explanation: `|v| = √((${aa})² + ${b}²) = √(${aa * aa} + ${b * b}) = √${aa * aa + b * b} = ${m}.`,
    topic: "Vector Magnitude",
    type: "vector-magnitude",
    level: 4
  });
}

function areaScaleFactor() {
  const a = rand(1, 4), b = rand(1, 3), c = rand(1, 3), d = rand(1, 4);
  const det = a * d - b * c;
  const ans = Math.abs(det);
  return make({
    prompt: `The transformation matrix [[${a}, ${b}], [${c}, ${d}]] is applied to a shape. By what factor does its area change?`,
    answer: ans,
    distractors: [det, a + d, a * d + b * c],
    hint: "Area scale factor = |det| of the transformation matrix.",
    explanation: `det = (${a})(${d}) − (${b})(${c}) = ${det}, so the area scales by |${det}| = ${ans}.`,
    topic: "Linear Transformations",
    type: "area-scale",
    level: 5
  });
}

function eigenvalueTrace() {
  const p = rand(1, 6), q = rand(1, 5), r = rand(1, 6);
  const ans = p + r;
  return make({
    prompt: `The matrix M = [[${p}, ${q}], [0, ${r}]] is upper triangular. What is the sum of its eigenvalues?`,
    answer: ans,
    distractors: [p * r, q, p + q + r],
    hint: "The sum of the eigenvalues equals the trace (the sum of the diagonal entries).",
    explanation: `Eigenvalues are the diagonal entries ${p} and ${r}; their sum is ${p} + ${r} = ${ans}.`,
    topic: "Eigenvalues",
    type: "eigenvalue-trace",
    level: 5
  });
}

function crossProductZ() {
  const a = rand(1, 5), b = rand(1, 5), c = rand(1, 5), d = rand(1, 5);
  const ans = a * d - b * c;
  return make({
    prompt: `For u = ⟨${a}, ${b}, 0⟩ and v = ⟨${c}, ${d}, 0⟩, find the z-component of u × v.`,
    answer: ans,
    distractors: [a * c + b * d, a * c - b * d, b * c - a * d],
    hint: "For vectors in the xy-plane the z-component of the cross product is u₁v₂ − u₂v₁.",
    explanation: `(u × v)z = (${a})(${d}) − (${b})(${c}) = ${a * d} − ${b * c} = ${ans}.`,
    topic: "Cross Product",
    type: "cross-product",
    level: 5
  });
}

/* ------------------------------------------------------------------ *
 * Sequence reasoning
 * ------------------------------------------------------------------ */

function arithmeticNext() {
  const a = rand(2, 15), d = rand(2, 9);
  const terms = [0, 1, 2, 3, 4].map(i => a + i * d);
  return make({
    prompt: `Find the next term: ${terms.join(", ")}, ?`,
    answer: a + 5 * d,
    distractors: [a + 4 * d + d + 1, a + 6 * d, a + 4 * d],
    hint: "Subtract consecutive terms to find the common difference.",
    explanation: `The common difference is ${d}, so the next term is ${a + 4 * d} + ${d} = ${a + 5 * d}.`,
    topic: "Arithmetic Progression",
    type: "arithmetic-sequence",
    level: 1
  });
}

function arithmeticNthTerm() {
  const a = rand(1, 10), d = rand(2, 8), n = rand(8, 15);
  return make({
    prompt: `An arithmetic progression starts at ${a} with common difference ${d}. What is term number ${n}?`,
    answer: a + (n - 1) * d,
    distractors: [a + n * d, a + (n - 2) * d, a * n + d],
    hint: "The nth term of an AP is a + (n − 1)d.",
    explanation: `aₙ = ${a} + (${n} − 1)×${d} = ${a} + ${(n - 1) * d} = ${a + (n - 1) * d}.`,
    topic: "Arithmetic Progression",
    type: "ap-nth-term",
    level: 1
  });
}

function arithmeticSum() {
  const a = rand(1, 9), d = rand(2, 6), n = rand(3, 6) * 2;
  const ans = (n * (2 * a + (n - 1) * d)) / 2;
  return make({
    prompt: `Find the sum of the first ${n} terms of the AP starting at ${a} with common difference ${d}.`,
    answer: ans,
    distractors: [n * a, ans + d, (n * (2 * a + n * d)) / 2],
    hint: "Sₙ = (n/2)(2a + (n − 1)d).",
    explanation: `Sₙ = (${n}/2)(2×${a} + ${n - 1}×${d}) = ${n / 2} × ${2 * a + (n - 1) * d} = ${ans}.`,
    topic: "Series Summation",
    type: "ap-sum",
    level: 2
  });
}

function geometricNext() {
  const a = rand(1, 4), r = rand(2, 3);
  const terms = [0, 1, 2, 3, 4].map(i => a * Math.pow(r, i));
  return make({
    prompt: `Find the next term: ${terms.join(", ")}, ?`,
    answer: a * Math.pow(r, 5),
    distractors: [a * Math.pow(r, 4) + r, a + 5 * r, a * Math.pow(r, 6)],
    hint: "Divide each term by the previous one to find the common ratio.",
    explanation: `The common ratio is ${r}, so the next term is ${a * Math.pow(r, 4)} × ${r} = ${a * Math.pow(r, 5)}.`,
    topic: "Geometric Progression",
    type: "geometric-sequence",
    level: 2
  });
}

function geometricNthTerm() {
  const a = rand(1, 5), r = rand(2, 3), n = rand(5, 8);
  return make({
    prompt: `A geometric progression has first term ${a} and common ratio ${r}. What is term number ${n}?`,
    answer: a * Math.pow(r, n - 1),
    distractors: [a * Math.pow(r, n), a * Math.pow(r, n - 2), a * r * n],
    hint: "The nth term of a GP is a·r^(n−1).",
    explanation: `aₙ = ${a} × ${r}^${n - 1} = ${a} × ${Math.pow(r, n - 1)} = ${a * Math.pow(r, n - 1)}.`,
    topic: "Geometric Progression",
    type: "gp-nth-term",
    level: 2
  });
}

function fibonacciLike() {
  const a = rand(1, 5), b = rand(2, 6);
  const seq = [a, b];
  while (seq.length < 6) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  return make({
    prompt: `Find the next term: ${seq.slice(0, 5).join(", ")}, ?`,
    answer: seq[5],
    distractors: [seq[4] + 2 * seq[3], seq[4] * 2, seq[4] + seq[0]],
    hint: "Each term is the sum of the two terms before it.",
    explanation: `aₙ = aₙ₋₁ + aₙ₋₂, so the next term is ${seq[4]} + ${seq[3]} = ${seq[5]}.`,
    topic: "Recurrence Relations",
    type: "fibonacci",
    level: 3
  });
}

function quadraticSequence() {
  const a = rand(1, 4), b = rand(1, 5), c = rand(0, 5);
  const term = n => a * n * n + b * n + c;
  const terms = [1, 2, 3, 4, 5].map(term);
  return make({
    prompt: `Find the next term: ${terms.join(", ")}, ?`,
    answer: term(6),
    distractors: [term(6) + 1, terms[4] + (terms[4] - terms[3]), term(6) + a],
    hint: "Take first differences, then second differences. A constant second difference means a quadratic rule.",
    explanation: `The rule is aₙ = ${a}n² + ${b}n + ${c}, so a₆ = ${a}×36 + ${b}×6 + ${c} = ${term(6)}.`,
    topic: "Polynomial Sequences",
    type: "polynomial",
    level: 3
  });
}

function sumOfSquares() {
  const n = rand(4, 10);
  const ans = (n * (n + 1) * (2 * n + 1)) / 6;
  return make({
    prompt: `Find the sum 1² + 2² + … + ${n}².`,
    answer: ans,
    distractors: [(n * (n + 1)) / 2, ans + n, n * n],
    hint: "Use the identity Σk² = n(n+1)(2n+1)/6.",
    explanation: `Σk² = ${n}×${n + 1}×${2 * n + 1}/6 = ${ans}.`,
    topic: "Series Summation",
    type: "sum-of-squares",
    level: 3
  });
}

function linearRecurrence() {
  const p = rand(2, 4), q = rand(1, 3);
  const seq = [1, 2];
  for (let i = 2; i < 6; i++) seq.push(p * seq[i - 1] + q * seq[i - 2]);
  return make({
    prompt: `Find the next term: ${seq.slice(0, 5).join(", ")}, ?`,
    answer: seq[5],
    distractors: [seq[4] + seq[3], p * seq[4], seq[5] + 1],
    hint: "Fit the recurrence aₙ = p·aₙ₋₁ + q·aₙ₋₂ by testing the given terms.",
    explanation: `Here aₙ = ${p}aₙ₋₁ + ${q}aₙ₋₂, so a₆ = ${p}×${seq[4]} + ${q}×${seq[3]} = ${seq[5]}.`,
    topic: "Linear Recurrences",
    type: "recurrence",
    level: 4
  });
}

function infiniteGeometricSum() {
  const a = rand(2, 9);
  return make({
    prompt: `Find the sum of the infinite geometric series ${a} + ${a / 2} + ${a / 4} + ${a / 8} + …`,
    answer: 2 * a,
    distractors: [a, 4 * a, `${a}/2`],
    hint: "For |r| < 1 the sum is a/(1 − r).",
    explanation: `r = 1/2, so S = ${a}/(1 − 1/2) = ${a} × 2 = ${2 * a}.`,
    topic: "Infinite Series",
    type: "infinite-gp",
    level: 4
  });
}

function sequenceLimit() {
  const c = rand(2, 5), a = c * rand(2, 6), b = rand(1, 9), d = rand(1, 9);
  return make({
    prompt: `Evaluate lim(n→∞) (${a}n + ${b}) / (${c}n + ${d}).`,
    answer: a / c,
    distractors: [0, a, `${a}/${c}·n`],
    hint: "Divide numerator and denominator by n; the constant terms vanish.",
    explanation: `Dividing by n gives (${a} + ${b}/n)/(${c} + ${d}/n) → ${a}/${c} = ${a / c}.`,
    topic: "Limits of Sequences",
    type: "sequence-limit",
    level: 4
  });
}

function recurrenceWithN() {
  const p = rand(2, 3), q = rand(1, 4);
  const seq = [rand(1, 3)];
  for (let n = 2; n <= 5; n++) seq.push(p * seq[n - 2] + q * n);
  const next = p * seq[4] + q * 6;
  return make({
    prompt: `A sequence satisfies a₁ = ${seq[0]} and aₙ = ${p}aₙ₋₁ + ${q}n. Find a₆.`,
    answer: next,
    distractors: [p * seq[4] + q * 5, p * seq[4], next + q],
    hint: "Build the terms one at a time, substituting the current index n each time.",
    explanation: `a₅ = ${seq[4]}, so a₆ = ${p}×${seq[4]} + ${q}×6 = ${next}.`,
    topic: "Non-homogeneous Recurrences",
    type: "recurrence-with-n",
    level: 5
  });
}

function quadraticConvergence() {
  const c = rand(2, 4), a = c * rand(2, 5), b = rand(1, 9), d = rand(1, 9);
  return make({
    prompt: `Evaluate lim(n→∞) (${a}n² + ${b}n + 1) / (${c}n² + ${d}).`,
    answer: a / c,
    distractors: [0, a, `${a}/${c}·n`],
    hint: "When the highest powers match, the limit is the ratio of their coefficients.",
    explanation: `Divide by n²: (${a} + ${b}/n + 1/n²)/(${c} + ${d}/n²) → ${a}/${c} = ${a / c}.`,
    topic: "Limits of Sequences",
    type: "quadratic-limit",
    level: 5
  });
}

function telescopingSeries() {
  const n = rand(4, 12);
  return make({
    prompt: `Evaluate Σ (k = 1 to ${n}) 1/(k(k+1)) and give the answer as a single fraction.`,
    answer: `${n}/${n + 1}`,
    distractors: [`1/${n + 1}`, `${n + 1}/${n + 2}`, `${n}/${n + 2}`],
    hint: "Split the term with partial fractions: 1/(k(k+1)) = 1/k − 1/(k+1).",
    explanation: `1/(k(k+1)) = 1/k − 1/(k+1), so the sum telescopes: 1 − 1/${n + 1} = ${n}/${n + 1}.`,
    topic: "Telescoping Series",
    type: "telescoping-series",
    level: 5
  });
}

/* ------------------------------------------------------------------ *
 * Level dispatch
 * ------------------------------------------------------------------ */

const ARITHMETIC_BY_LEVEL = {
  1: [orderOfOperations, percentageReverse, fractionSum],
  2: [linearEquation, linearSystem, exponentLaw],
  3: [determinant2x2, matrixProductEntry, logarithmValue],
  4: [modularMultiplication, combinations, permutations, probabilityWithoutReplacement],
  5: [derivativeAtPoint, definiteIntegral, limitByFactoring, expectedValue]
};

const SPATIAL_BY_LEVEL = {
  1: [rectangleArea, triangleArea, midpoint],
  2: [reflection, translation, circleArea],
  3: [cylinderVolume, coneVolume, sphereVolume],
  4: [rotation, dotProduct, vectorMagnitude],
  5: [areaScaleFactor, eigenvalueTrace, crossProductZ]
};

const SEQUENCE_BY_LEVEL = {
  1: [arithmeticNext, arithmeticNthTerm],
  2: [arithmeticSum, geometricNext, geometricNthTerm],
  3: [fibonacciLike, quadraticSequence, sumOfSquares],
  4: [linearRecurrence, infiniteGeometricSum, sequenceLimit],
  5: [recurrenceWithN, quadraticConvergence, telescopingSeries]
};

const BANKS = {
  arithmetic: ARITHMETIC_BY_LEVEL,
  spatial: SPATIAL_BY_LEVEL,
  sequence: SEQUENCE_BY_LEVEL
};

/**
 * Generate one puzzle.
 * @param {string} category one of CATEGORIES
 * @param {number} level 1..5
 */
function generateQuestion(category, level = 1) {
  const bank = BANKS[category];
  if (!bank) throw new Error("Unknown puzzle category.");
  const lvl = clampLevel(level);
  const variants = bank[lvl];
  const question = pick(variants)();
  question.category = category;
  question.level = lvl;
  question.levelName = LEVELS[lvl - 1];
  return question;
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  LEVELS,
  generateQuestion,
  buildChoices
};
