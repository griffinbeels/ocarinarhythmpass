// Run with: node --test tests/song.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { SONG, DEFAULTS, PRESETS, hitWindowMs, attemptLength, matchesSong, judge, planPlayback } from "../src/song.js";

const P = SONG.phrase;
const ids = P.map((p) => p.note);
const perfect = P.map((p) => ({ on: 1000 + p.at, off: 1000 + p.at + p.len }));
const rushed = P.map((_, i) => ({ on: 1000 + i * 150, off: 1000 + i * 150 + 60 }));
const onsets = (notes) => notes.map((n) => n.on);
// A strict setting: a 5 frame hit window. The page opens on a wider one.
const rules = (over = {}) => ({ windowMs: hitWindowMs(2), missesAllowed: 0, basis: "first", holdPercent: 60, ...over });
const change = (notes, i, patch) => notes.map((n, k) => (k === i ? { ...n, ...patch(n) } : n));

test("a 5 frame hit window is 2 early, 1 perfect, 2 late: about 42 ms either side", () => {
  assert.ok(Math.abs(hitWindowMs(2) - 41.67) < 0.01);
});

test("the page opens on Rhythm Pass with feedback on, and a perfect performance passes its defaults", () => {
  assert.equal(DEFAULTS.rhythmPass && DEFAULTS.labels && DEFAULTS.colors && DEFAULTS.lyre, true);
  assert.equal(DEFAULTS.bars || DEFAULTS.earlySkip, false);
  assert.equal(Object.values(PRESETS.original).some(Boolean), false, "the Original preset turns every switch off");
  const opening = { windowMs: hitWindowMs(DEFAULTS.windowFrames), missesAllowed: DEFAULTS.missesAllowed, basis: DEFAULTS.basis, holdPercent: DEFAULTS.holdPercent };
  assert.equal(judge(perfect, opening).pass, true);
  const human = perfect.map((n, i) => ({ on: n.on + [0, 60, -70, 80, -50, 90][i], off: n.off - 100 }));
  assert.equal(judge(human, opening).pass, true, "a player who is up to 90 ms off still passes the opening defaults");
});

test("the song is matched by its notes alone, whatever the rhythm", () => {
  assert.equal(matchesSong(ids), true);
  assert.equal(matchesSong(["low", ...ids]), true, "notes before the song do not matter");
  assert.equal(matchesSong(ids.slice(0, 5)), false);
  assert.equal(matchesSong([...ids.slice(0, 5), "low"]), false);
});

test("attemptLength counts how much of the song the newest notes start", () => {
  assert.equal(attemptLength(ids.slice(0, 3)), 3);
  assert.equal(attemptLength(["low", "low"]), 0);
  assert.equal(attemptLength([...ids.slice(0, 2), "low", ids[0]]), 1, "a wrong note restarts the attempt");
});

test("a perfect performance passes and a rushed one does not", () => {
  assert.equal(judge(perfect, rules()).pass, true);
  const r = judge(rushed, rules());
  assert.equal(r.pass, false);
  assert.ok(r.startErrors[5] < -1000, "rushed notes are very early");
});

test("the window decides a start: 30 ms late passes at 33 ms and fails at 20 ms", () => {
  const late = change(perfect, 3, (n) => ({ on: n.on + 30 }));
  assert.equal(judge(late, rules({ windowMs: 33 })).pass, true);
  const strict = judge(late, rules({ windowMs: 20 }));
  assert.equal(strict.pass, false);
  assert.equal(strict.grades[3], "near");
  assert.equal(judge(late, rules({ windowMs: 20, missesAllowed: 1 })).pass, true);
});

test("hold: a note let go too early misses, even when it started on time", () => {
  const long = 2; // the third note is the long one
  const cutShort = change(perfect, long, (n) => ({ off: n.on + 200 }));
  const r = judge(cutShort, rules());
  assert.equal(r.startErrors[long], 0);
  assert.ok(r.holdShort[long] > 0);
  assert.equal(r.grades[long], "miss");
  assert.equal(r.pass, false);
  assert.equal(judge(cutShort, rules({ holdPercent: 0 })).pass, true, "at 0% only the starts count");
});

test("hold: the minimum is a share of each note's length", () => {
  const len = P[2].len;
  const heldFor = (ms) => change(perfect, 2, (n) => ({ off: n.on + ms }));
  assert.equal(judge(heldFor(len * 0.61), rules({ holdPercent: 60 })).pass, true);
  assert.equal(judge(heldFor(len * 0.59), rules({ holdPercent: 60 })).pass, false);
});

test("hold: a late release is never a miss, on any note", () => {
  const overlapping = perfect.map((n) => ({ on: n.on, off: n.off + 900 }));
  assert.equal(judge(overlapping, rules()).pass, true);
  const longLast = change(perfect, 5, (n) => ({ off: n.off + 5000 }));
  assert.equal(judge(longLast, rules()).pass, true);
});

test("hold: a note still held is undecided until it reaches its minimum", () => {
  const holding = change(perfect, 5, () => ({ off: null }));
  const early = judge(holding, rules(), perfect[5].on + 100);
  assert.equal(early.pending, true);
  assert.equal(early.pass, false);
  assert.equal(early.misses, 0, "nothing has gone wrong yet");
  assert.equal(judge(holding, rules(), perfect[5].off).pending, false);
});

test("timing from the previous note forgives one long gap that then keeps the beat", () => {
  const drift = perfect.map((n, i) => (i >= 2 ? { on: n.on + 60, off: n.off + 60 } : n));
  assert.equal(judge(drift, rules({ basis: "first" })).misses, 4);
  assert.equal(judge(drift, rules({ basis: "previous" })).misses, 1);
});

test("a pass skips the repeat and continues on the song's beat, counted from the last note; anything else repeats the opening", () => {
  const last = perfect[5].on, gap = SONG.phraseLength - P[5].at; // the song's own gap after the last note starts
  const pass = planPlayback({ onsets: onsets(perfect), now: perfect[5].off, pass: true });
  assert.equal(pass.repeatStart, null);
  assert.equal(pass.tailStart, last + gap, "let go on time: the rest starts exactly where the song has it");
  const lateLast = change(perfect, 5, (n) => ({ on: n.on + 80, off: n.off + 80 }));
  assert.equal(planPlayback({ onsets: onsets(lateLast), now: lateLast[5].off, pass: true }).tailStart, last + 80 + gap, "the beat follows the player's last note");
  const held = planPlayback({ onsets: onsets(perfect), now: last + gap + 700, pass: true }); // the last note was held 700 ms past the beat
  assert.equal(held.tailStart, last + gap + 2 * SONG.beat, "a long hold waits for the next beat");
  assert.equal(planPlayback({ onsets: onsets(perfect), now: last + gap - 10, pass: true }).tailStart, last + gap + SONG.beat, "never sooner than 30 ms after the release");
  const now = perfect[5].off + 700;
  const repeat = planPlayback({ onsets: onsets(perfect), now, pass: false });
  assert.equal(repeat.tailStart - repeat.repeatStart, SONG.phraseLength);
});

test("the thesis in numbers: the original design rewards rushing, Rhythm Pass rewards rhythm", () => {
  const total = (notes, pass) => planPlayback({ onsets: onsets(notes), now: pass ? notes[5].off : notes[5].on + 5, pass }).end - notes[0].on;
  const originalRushed = total(rushed, false), originalInRhythm = total(perfect, false), rhythmPass = total(perfect, true);
  assert.ok(originalRushed < originalInRhythm, "original design: rushing is faster than playing in rhythm");
  assert.ok(rhythmPass < originalRushed, "Rhythm Pass: playing in rhythm is faster than rushing");
});
