const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tracker = fs.readFileSync(path.join(__dirname, "../src/MasteryTracker.tsx"), "utf8");
const tutorial = fs.readFileSync(path.join(__dirname, "../src/TutorialView.tsx"), "utf8");

test("daily deliberate-practice blocks add up to exactly one hour", () => {
  const blockSection = tracker.match(/const FOCUS_BLOCKS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  const minutes = [...blockSection.matchAll(/minutes: (\d+)/g)].map(match => Number(match[1]));
  assert.deepEqual(minutes, [5, 15, 20, 15, 5]);
  assert.equal(minutes.reduce((sum, value) => sum + value, 0), 60);
});

test("focus timing pauses when attention leaves the page", () => {
  assert.match(tracker, /visibilitychange/);
  assert.match(tracker, /setRunning\(false\)/);
  assert.match(tracker, /dailyInterruptions/);
  assert.match(tracker, /compact \? " compact"/);
  assert.match(tracker, /compact && !running && !welcomeBack/);
});

test("weak coach positions are retained for spaced review", () => {
  assert.match(tutorial, /reviewDelay = analysis\.score <= 4 \? 1/);
  assert.match(tutorial, /Practice this position again/);
  assert.match(tutorial, /ready for spaced review/);
});
