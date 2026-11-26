#!/usr/bin/env node
"use strict";

// Regression sweep: every category/level must always produce four distinct
// options that include the correct answer, with no filler option.
// Run with: node scripts/choice-sweep.js

const { CATEGORIES, generateQuestion } = require("../questionBank");

const DRAWS = Number(process.env.SWEEP_DRAWS || 400);
const FILLERS = ["None of these", "Cannot be determined"];
const offenders = new Map();

let total = 0;
for (const category of CATEGORIES) {
  for (let level = 1; level <= 5; level++) {
    for (let i = 0; i < DRAWS; i++) {
      const question = generateQuestion(category, level);
      total++;
      const problems = [];

      if (!Array.isArray(question.choices) || question.choices.length !== 4) {
        problems.push(`expected 4 choices, got ${question.choices && question.choices.length}`);
      }
      if (new Set(question.choices).size !== question.choices.length) {
        problems.push(`duplicate choices ${JSON.stringify(question.choices)}`);
      }
      if (!question.choices.includes(String(question.answer))) {
        problems.push(`answer ${JSON.stringify(question.answer)} missing from choices`);
      }
      const filler = question.choices.find(choice => FILLERS.includes(choice));
      if (filler) problems.push(`filler option ${JSON.stringify(filler)}`);

      if (problems.length) {
        const key = question.type;
        if (!offenders.has(key)) {
          offenders.set(key, { count: 0, sample: { prompt: question.prompt, choices: question.choices, answer: question.answer, problems } });
        }
        offenders.get(key).count++;
      }
    }
  }
}

if (offenders.size === 0) {
  console.log(`choice sweep passed: ${total} puzzles, ${DRAWS} draws per category/level, no filler or duplicate options`);
  process.exit(0);
}

console.error(`choice sweep FAILED: ${offenders.size} puzzle type(s) produced invalid options out of ${total} puzzles`);
for (const [type, info] of offenders) {
  console.error(`\n- ${type}: ${info.count} invalid draw(s)`);
  console.error(`  prompt:  ${info.sample.prompt}`);
  console.error(`  choices: ${JSON.stringify(info.sample.choices)}`);
  console.error(`  answer:  ${JSON.stringify(info.sample.answer)}`);
  console.error(`  issues:  ${info.sample.problems.join("; ")}`);
}
process.exit(1);
