// The game: reads the keys, judges the rhythm, plays the song back, and draws the chart and results.
import { createWorld } from "./world.js";
import { Sound } from "./audio.js";
import { NOTES, NOTE, SONG, DEFAULTS, PRESETS, TUNING, CHART_SLOTS, CHART_CLEAR_DELAY, FRAME_MS, hitWindowMs, attemptLength, matchesSong, judge, planPlayback } from "./song.js";

const $ = (id) => document.getElementById(id);
const world = createWorld($("view"));
const sound = new Sound();
const PHRASE = SONG.phrase;

// ---- settings: kept in this browser so a reload keeps your choices ----
const SAVE_KEY = "ocarina-rhythm-pass-settings";
const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) settings[k] = saved[k];
} catch { /* storage may be blocked */ }
const saveSettings = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };
const rules = () => ({ windowMs: hitWindowMs(settings.windowFrames), missesAllowed: settings.missesAllowed, basis: settings.basis, holdPercent: settings.holdPercent });
/** The preset the settings equal right now, or null when the player has changed something. */
const activePreset = () => Object.keys(PRESETS).find((p) => Object.entries({ ...TUNING, ...PRESETS[p] }).every(([k, v]) => settings[k] === v)) ?? null;

// ---- state ----
let mode = "walk"; // "walk" = moving around, "play" = ocarina out, "game" = the game is playing the song
let buffer = []; // the notes on the chart: { id, on, off }
const held = new Map(); // note id -> { voice, entry }
let events = []; // { at, fn }: things to do at a time on the performance.now() clock
let gameVoices = []; // every note the game has scheduled for this song
let display = null; // while the game repeats the opening, the notes it has written back onto the chart
let repeatAt = 0; // when that repeat starts
let result = null; // the last finished opening: { judged, pass, first, at }
let run = null; // the song the game is playing now
const runs = [];
const walkKeys = new Set();

const after = (at, fn) => events.push({ at, fn });
const secs = (ms) => (ms / 1000).toFixed(1) + " s";
const named = `You played the ${SONG.name}!`;

// ---- accompaniment: a lyre that follows the player's rhythm ----
// The lyre plays one note every `lyreStep` on a grid lined up with the player's newest note.
// Its strength glides: full when the newest note was on time, half when it was close, and
// fading to nothing when it missed or is overdue. It keeps playing while it fades, so a
// player who finds the rhythm again hears it come back.
const lyre = { base: null, last: 0, until: Infinity, level: 0, off: null };
function lyreTo(level, seconds) {
  if (lyre.level !== level) { lyre.level = level; sound.fade(sound.lyreBus, level, seconds); }
  lyre.off = level ? null : lyre.off ?? performance.now() + 1600;
}
function lyreStop(seconds = 1) { lyre.base = null; lyre.until = Infinity; lyre.level = 0; lyre.off = null; sound.fade(sound.lyreBus, 0, seconds); }
function lyreNote(n) { return SONG.lyre[((n % SONG.lyre.length) + SONG.lyre.length) % SONG.lyre.length]; }
function tickLyre(now) {
  if (lyre.base == null) return;
  if (lyre.off != null && now > lyre.off) return lyreStop();
  for (;;) {
    const n = Math.ceil((Math.max(lyre.last + SONG.lyreStep * 0.6, now + 15) - lyre.base) / SONG.lyreStep);
    const t = lyre.base + n * SONG.lyreStep;
    if (t > now + 200 || t >= lyre.until) return;
    lyre.last = t;
    sound.pluck(lyreNote(n), t - now, 1, 1.1, sound.lyreBus);
    after(t, () => { if (lyre.level > 0.05) world.lyreRing(lyre.level); });
  }
}
/** Set the lyre's strength from how the newest note landed. Runs on every note and every frame. */
function updateLyre(now) {
  if (!settings.lyre || result) return;
  const k = attemptLength(buffer.map((b) => b.id));
  if (k < 3) { if (lyre.base != null) lyreTo(0, 0.9); return; } // the try broke, or has not reached three notes
  const notes = buffer.slice(buffer.length - k), newest = notes[k - 1], w = rules().windowMs;
  const err = Math.abs(newest.on - notes[k - 2].on - (PHRASE[k - 1].at - PHRASE[k - 2].at));
  const overdue = k < PHRASE.length && now > newest.on + PHRASE[k].at - PHRASE[k - 1].at + w * 2;
  const level = overdue ? 0 : err <= w ? 1 : err <= w * 2 ? 0.5 : 0;
  if (lyre.base == null && level < 1) return; // it joins only on a note in rhythm
  if (level) lyre.base = newest.on - PHRASE[k - 1].at;
  lyreTo(level, level > lyre.level ? 0.3 : 0.9);
}
/** The game's own accompaniment for a part of the song it plays. */
function songLyre(base, from, until, now) {
  for (let n = Math.ceil((from - base) / SONG.lyreStep); base + n * SONG.lyreStep < until; n++) {
    const t = base + n * SONG.lyreStep;
    gameVoices.push(sound.pluck(lyreNote(n), t - now, 1, 1.1, run.bus));
    after(t, () => world.lyreRing(0.7));
  }
}

// ---- the ocarina ----
function takeOut() {
  if (mode !== "walk" || !world.onPlate()) return;
  sound.start();
  closing = 0; display = null; $("hud").classList.remove("closing");
  mode = "play"; world.setPlaying(true); world.hop(); sound.pluck(880, 0, 0.3, 0.3); sound.pluck(1318.5, 70, 0.25, 0.3);
  clearChart(); draw();
}
function putAway() {
  if (mode !== "play") return;
  releaseAll(); lyreStop(0.3); mode = "walk"; world.setPlaying(false); clearChart(); draw();
}
function clearChart() { buffer = []; result = null; leaving = null; locked = false; leaveToken++; setBanner(""); $("hud").classList.remove("glow"); }

// A full chart with no song empties itself at once: the notes drop off, left to right, in about
// 0.4 s. Note keys do nothing until the chart is empty, so a fast player cannot start the next
// try on top of the old one. The bar view has no slots, so it never fills.
const LEAVE_WAIT = 50, LEAVE_STAGGER = 18, LEAVE_DROP = 240;
let leaving = null, leaveToken = 0; // `leaving` is when the notes started to drop
let locked = false; // true from the eighth note until the chart is empty
function emptyFullChart(now) {
  const token = ++leaveToken;
  locked = true;
  after(now + LEAVE_WAIT, () => {
    if (token !== leaveToken) return;
    leaving = performance.now();
    [392, 329.63, 261.63].forEach((f, i) => sound.pluck(f, i * 45, 0.3, 0.3));
    drawChart();
  });
  after(now + LEAVE_WAIT + LEAVE_STAGGER * (CHART_SLOTS - 1) + LEAVE_DROP, () => {
    if (token !== leaveToken) return;
    clearChart(); draw();
  });
}

function noteDown(id) {
  if (mode !== "play" || held.has(id) || locked) return;
  if (result) clearChart();
  const now = performance.now();
  const entry = { id, on: now, off: null };
  buffer.push(entry);
  if (settings.bars && buffer.length > 40) buffer.splice(0, buffer.length - 40); // old notes have scrolled away
  held.set(id, { voice: sound.hold(NOTE[id].freq), entry });
  world.pulse(id, NOTE[id].color); world.bump();
  document.querySelector(`#keys [data-note="${id}"]`)?.classList.add("down");
  updateLyre(now);
  if (matchesSong(buffer.map((b) => b.id))) notesMatched(now);
  else if (!settings.bars && buffer.length >= CHART_SLOTS) emptyFullChart(now);
  draw();
}
function noteUp(id) {
  const h = held.get(id);
  if (!h) return;
  h.voice.stop(); h.entry.off = performance.now(); held.delete(id);
  document.querySelector(`#keys [data-note="${id}"]`)?.classList.remove("down");
  if (mode !== "walk") drawChart(); // a note let go too early changes its feedback
}
function releaseAll() { for (const id of [...held.keys()]) noteUp(id); }

/** The game plays one of its own notes: sound and a pulse on the figure. `onChart` also draws it on the chart. */
function gameNote(p, at, now, onChart) {
  gameVoices.push(sound.ocarina(NOTE[p.note].freq, at - now, p.len, run.bus));
  after(at, () => {
    world.pulse(p.note, NOTE[p.note].color);
    if (onChart) { display.push({ id: p.note, on: at, off: at + p.len }); drawChart(); }
  });
}

/**
 * The newest six notes are the song. With Rhythm Pass on, the player may hold the last note
 * for as long as they like, and the verdict comes when they let go. With it off, the song is
 * recognised on the last note's start, as the original does.
 */
let finalHold = false;
function notesMatched(now) {
  if (settings.rhythmPass) { finalHold = true; mode = "game"; }
  else songPlayed(now);
}
function checkFinalHold(now) {
  if (buffer[buffer.length - 1].off == null) return;
  finalHold = false;
  songPlayed(now);
  draw();
}

/**
 * The order of events follows the captures: the chart flashes, shows the entered notes again,
 * then clears; the game writes the opening back onto the chart note by note; the song's name
 * appears with the last of those notes; then the rest of the song plays. A Rhythm Pass goes
 * from the flash to the name, and the rest of the song starts on the song's next beat.
 */
function songPlayed(now) {
  const played = buffer.slice(buffer.length - PHRASE.length);
  const onsets = played.map((b) => b.on);
  const judged = judge(played, rules(), now);
  const pass = settings.rhythmPass && judged.pass;
  const plan = planPlayback({ onsets, now, pass });
  result = { judged, pass, first: buffer.length - PHRASE.length, at: now };
  run = { design: settings.rhythmPass ? "Rhythm Pass" : "Original", pass, t0: onsets[0], enteredMs: onsets[onsets.length - 1] - onsets[0], tailStart: plan.tailStart, bus: sound.bus() };
  mode = "game";
  flashChart();

  if (pass) {
    // The payoff: a rising chime, a burst of light, a camera punch, a glowing chart.
    sound.passChime(); world.celebrate();
    $("hud").classList.add("glow");
    setBanner(named + " Rhythm Pass.", true);
    // The lyre carries the beat across the gap, lined up with where the rest of the song starts.
    if (settings.lyre) { lyre.base = plan.tailStart; lyre.until = plan.tailStart; lyreTo(1, 0.2); after(plan.tailStart, () => lyreStop(1.2)); }
  } else {
    lyreStop(0.9);
    sound.twinkle(); world.twinkle();
    if (settings.rhythmPass) { sound.missTone(); shakeChart(); } // soft, not a punishment
    repeatAt = plan.repeatStart;
    after(now + CHART_CLEAR_DELAY, () => { releaseAll(); display = []; drawChart(); });
    PHRASE.forEach((p) => gameNote(p, plan.repeatStart + p.at, now, true));
    after(plan.repeatStart + PHRASE[PHRASE.length - 1].at, () => setBanner(named));
    songLyre(plan.repeatStart, plan.repeatStart, plan.tailStart, now);
  }
  SONG.tail.forEach((p) => gameNote(p, plan.tailStart + p.at, now, false));
  songLyre(plan.tailStart, plan.tailStart, plan.end, now);
  after(plan.tailStart, () => { releaseAll(); draw(); }); // the skip button appears here
  after(plan.end, () => endRun(plan.end, pass ? "Pass" : "Repeat"));
}

function flashChart() {
  const c = $("chart");
  c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
  setTimeout(() => c.classList.remove("flash"), 650);
}

function shakeChart() {
  const c = $("chart");
  c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  setTimeout(() => c.classList.remove("shake"), 400);
}

/** The song is over: the water moves, control returns, and the chart folds away. */
function endRun(at, outcome) {
  $("level").textContent = `Water ${world.nextLevel() + 1} / ${world.levels}`;
  sound.swell();
  runs.push({ design: run.design, outcome, pass: run.pass, enteredMs: run.enteredMs, totalMs: at - run.t0 });
  run = null; gameVoices = [];
  mode = "walk"; world.setPlaying(false);
  closeChart();
  drawLog(); draw();
}

const CLOSE_MS = 380;
let closing = 0; // a token while the chart is folding away; 0 when it is not
function closeChart() {
  const token = (closing = performance.now());
  $("hud").classList.add("closing");
  setTimeout(() => {
    if (closing !== token) return;
    closing = 0; display = null; $("hud").classList.remove("closing");
    clearChart(); draw();
  }, CLOSE_MS);
}

/**
 * Skip is always there once the rest of the song is playing. The Early skip setting also
 * allows it before that, while the game repeats the opening.
 */
const canSkip = (now) => mode === "game" && !!run && (settings.earlySkip || now >= run.tailStart);
/** Skip: the song fades out and control comes back now. */
function skip() {
  const now = performance.now();
  if (!canSkip(now)) return;
  const voices = gameVoices;
  sound.fade(run.bus, 0, 0.6);
  setTimeout(() => { for (const v of voices) v.kill(); }, 1500);
  events = []; releaseAll(); lyreStop(0.6);
  setBanner(named);
  endRun(now, run.pass ? "Pass + skip" : now < run.tailStart ? "Early skip" : "Repeat + skip");
}

function listen() {
  if (mode === "game") return;
  sound.start(); releaseAll(); lyreStop(0.3);
  const was = mode, start = performance.now() + 120;
  mode = "game"; setBanner("");
  PHRASE.forEach((p, i) => { sound.ocarina(NOTE[p.note].freq, start + p.at - performance.now(), p.len); after(start + p.at, () => lightCard(i)); });
  after(start + SONG.phraseLength, () => { lightCard(-1); mode = was; draw(); });
  draw();
}

// ---- drawing ----
function setBanner(text, pass = false) {
  const b = $("banner");
  b.textContent = text; b.classList.toggle("pass", pass);
  b.classList.remove("pop");
  if (text) { void b.offsetWidth; b.classList.add("pop"); }
}
function lightCard(i) { document.querySelectorAll("#card .n").forEach((el, k) => el.classList.toggle("lit", k === i)); }

const framesLabel = (err) => {
  const frames = Math.round(err / FRAME_MS), side = frames < 0 ? "early" : "late";
  return frames === 0 ? "perfect" : Math.abs(frames) > 99 ? `very ${side}` : `${Math.abs(frames)}f ${side}`;
};
/** The timing popup for one note: how its start landed, and a second line when it was let go too early. */
function timingLabel(i, judged) {
  const start = i === 0 ? "start" : framesLabel(judged.startErrors[i]);
  return judged.holdShort[i] ? `${start}<br>let go early` : start;
}

// The bar view: one time line at one zoom. The chart shows BAR_VIEW ms. The playhead moves
// right until BAR_HEAD of the width, then stays there while the chart pans under it.
const BAR_VIEW = 8000, BAR_LEAD = 300, BAR_HEAD = 0.7, LABEL_GAP = 6.5; // LABEL_GAP is % of the chart width

function drawChart() {
  const list = display ?? buffer; // the game's repeat, or the player's notes
  const mine = !display && result; // feedback only belongs on the player's own notes
  const now = performance.now();
  // Feedback is live: each note is judged as it is played, against the try it belongs to.
  let fb = null; // { judged, first }: `first` is the chart index of the try's first note
  if (mine) fb = result;
  else if (!display) {
    const n = attemptLength(buffer.map((b) => b.id));
    if (n) fb = { judged: judge(buffer.slice(buffer.length - n), rules(), now), first: buffer.length - n };
  }
  const k = (i) => (fb ? i - fb.first : -1); // index into the judged notes
  const grade = (i) => (settings.colors && k(i) >= 0 ? fb.judged.grades[k(i)] : "");
  const label = (i) => (settings.labels && k(i) >= 0 ? timingLabel(k(i), fb.judged) : "");
  // A popup springs in once, when its note starts. The negative delay keeps a redraw from replaying it.
  const labAge = (i) => `animation-delay:${-Math.round(Math.min(2000, now - list[i].on))}ms;`;
  const dim = (i) => (mine && k(i) < 0 ? "dim" : "");
  let html = NOTES.map((n) => `<div class="line" style="--row:${n.row}"></div>`).join("");
  // While a full chart empties, each note drops a little after the one before it. The delay
  // counts from when the drop began, so a redraw in the middle does not restart it.
  const sinceLeave = leaving != null && !display ? now - leaving : null;
  const out = () => (sinceLeave == null ? "" : "out");
  const outDelay = (j) => (sinceLeave == null ? "" : `animation-delay:${Math.round(j * LEAVE_STAGGER - sinceLeave)}ms;`);

  if (settings.bars) {
    // Dashed outlines are the song. They ride the playhead until a try starts, then lock to
    // that try's first note. Notes scroll off the left as time passes; nothing ever clears.
    const live = !mine; // time is still running
    const head = live ? now : result.at;
    const t0 = display ? repeatAt : list[0]?.on ?? now;
    const viewStart = Math.max(t0 - BAR_LEAD, head - BAR_VIEW * BAR_HEAD);
    const x = (t) => ((t - viewStart) / BAR_VIEW) * 100, w = (ms) => (ms / BAR_VIEW) * 100;
    const anchor = display ? repeatAt : fb ? list[fb.first].on : mine ? null : now;
    if (anchor != null) html += PHRASE.map((p) => `<div class="bar goal" style="left:${x(anchor + p.at)}%;width:${w(p.len)}%;--row:${NOTE[p.note].row}"></div>`).join("");
    const bars = list.map((b, i) => { const end = Math.max(b.on, Math.min(b.off ?? head, head)); return { i, b, left: x(b.on), width: w(end - b.on) }; }).filter((r) => r.left + r.width > -2);
    // Popups that would sit on top of each other are left out: fast notes show their colours only.
    const labelled = bars.filter((r) => label(r.i)).map((r) => ({ ...r, mid: r.left + r.width / 2 }));
    const clear = (j) => (j === 0 || labelled[j].mid - labelled[j - 1].mid >= LABEL_GAP) && (j === labelled.length - 1 || labelled[j + 1].mid - labelled[j].mid >= LABEL_GAP);
    html += bars.map((r) => `<div class="bar me ${grade(r.i)} ${dim(r.i)}" style="left:${r.left}%;width:${r.width}%;--row:${NOTE[r.b.id].row};--c:${NOTE[r.b.id].color}"></div>`).join("");
    html += labelled.filter((_, j) => clear(j)).map((r) => `<div class="lab" style="left:${r.mid}%;${labAge(r.i)}">${label(r.i)}</div>`).join("");
    if (live && x(now) >= 0) html += `<div class="playhead" style="left:${x(now)}%"></div>`;
  } else {
    html += list.map((b, i) => {
      const lab = label(i) ? `<div class="lab" style="left:${(i + 0.5) * 12.5}%;${labAge(i)}">${label(i)}</div>` : "";
      // A new note pops in once. The negative delay keeps a redraw from replaying the pop.
      const age = now - b.on, fresh = sinceLeave == null && age < 500;
      return `<div class="note ${grade(i)} ${dim(i)} ${fresh ? "new" : ""} ${out()}" style="--i:${i};--row:${NOTE[b.id].row};--c:${NOTE[b.id].color};${fresh ? `--d:${-Math.round(age)}ms;` : ""}${outDelay(i)}">${NOTE[b.id].glyph}</div>${lab}`;
    }).join("");
  }
  $("chart").innerHTML = html;
}

function draw() {
  const ocarinaOut = mode !== "walk";
  const hud = $("hud");
  hud.hidden = !ocarinaOut && !closing;
  $("legend").hidden = !hud.hidden; // the chart has its own note buttons
  // The chart sits in the middle of the space the options panel leaves free.
  const panelOpen = !$("panel").classList.contains("closed") && innerWidth > 900;
  const free = innerWidth - (panelOpen ? $("panel").offsetWidth + 24 : 0);
  hud.style.left = `${free / 2}px`;
  hud.style.width = `${Math.min(1000, free - 24)}px`;
  drawChart();
  const btn = $("ocarinaBtn");
  if (mode === "game") { btn.hidden = !canSkip(performance.now()); btn.textContent = "E · Skip"; btn.disabled = false; }
  else if (mode === "play") btn.hidden = true;
  else { btn.hidden = false; btn.textContent = world.onPlate() ? "Press E to play" : "Stand on the plate"; btn.disabled = !world.onPlate(); }
  btn.style.left = `${free / 2}px`;
  btn.style.bottom = hud.hidden ? "28px" : `${hud.offsetHeight + 40}px`;
  $("listen").disabled = mode === "game";
  world.setInsets(panelOpen ? $("panel").offsetWidth + 12 : 0, hud.hidden ? 0 : hud.offsetHeight + 28);
}

const OUTCOMES = ["Repeat", "Repeat + skip", "Early skip", "Pass", "Pass + skip"];
function drawLog() {
  document.querySelector("#log tbody").innerHTML = runs.slice().reverse().map((r) =>
    `<tr><td>${r.design}</td><td class="${r.pass ? "pass" : ""}">${r.outcome}</td><td>${secs(r.enteredMs)}</td><td>${secs(r.totalMs)}</td></tr>`).join("");
  const lastRun = runs.at(-1);
  $("lastRun").innerHTML = lastRun ? `${secs(lastRun.totalMs)}<span class="chip ${lastRun.pass ? "pass" : ""}">${lastRun.outcome}</span>` : "–";
  const best = (o) => runs.filter((r) => r.outcome === o).reduce((m, r) => Math.min(m, r.totalMs), Infinity);
  const sub = (name, value, cls = "") => `<div class="row sub"><span>${name}</span><span class="value ${cls}">${value}</span></div>`;
  let rows = OUTCOMES.filter((o) => best(o) < Infinity).map((o) => sub(o, secs(best(o)))).join("");
  if (best("Repeat") < Infinity && best("Pass") < Infinity) rows += sub("Pass saves", secs(best("Repeat") - best("Pass")), "pass");
  $("best").innerHTML = rows || sub("No songs played yet", "");
}

// ---- the options panel ----
const PRESET_TEXT = {
  original: "Only the notes count. The song always repeats.", // every caption fits one line, so the panel does not jump
  rhythm: "Play in rhythm and the song continues with no repeat.",
};
const SWITCHES = ["rhythmPass", "labels", "colors", "bars", "lyre", "earlySkip"];
function syncPanel() {
  const preset = activePreset();
  document.querySelectorAll('input[name="preset"]').forEach((r) => { r.checked = r.value === preset; });
  $("presetText").textContent = PRESET_TEXT[preset] ?? "Your own mix of settings.";
  $("windowFrames").value = settings.windowFrames;
  $("missesAllowed").value = settings.missesAllowed;
  $("basis").value = settings.basis;
  for (const k of SWITCHES) $(k).checked = settings[k];
  $("holdPercent").value = settings.holdPercent;
  $("holdText").textContent = settings.holdPercent ? `${settings.holdPercent}% or more` : "Off";
  const f = settings.windowFrames;
  $("windowText").textContent = `${2 * f + 1} frames · ±${Math.round(hitWindowMs(f))} ms`;
}
let barsWas = settings.bars;
function changed() {
  saveSettings(); syncPanel();
  if (!settings.lyre && lyre.base != null) lyreStop(0.4);
  if (settings.bars !== barsWas) { barsWas = settings.bars; if (mode === "play") clearChart(); } // the two chart views count notes differently
  draw();
}
/** A preset puts every option back to that preset's values. It applies from the next song. */
function setPreset(p) { Object.assign(settings, TUNING, PRESETS[p]); changed(); }

// The "i" bubbles: one shared tooltip, shown under the bubble on hover, focus or tap.
const tip = $("tip");
function showTip(el) {
  const r = el.getBoundingClientRect(), body = $("panelBody").getBoundingClientRect();
  tip.textContent = el.dataset.tip; tip.hidden = false;
  tip.style.left = `${body.left + 12}px`; tip.style.width = `${body.width - 24}px`;
  const below = r.bottom + 8;
  tip.style.top = `${below + tip.offsetHeight > innerHeight - 8 ? r.top - 8 - tip.offsetHeight : below}px`;
}
for (const el of document.querySelectorAll(".info")) {
  el.addEventListener("pointerenter", () => showTip(el));
  el.addEventListener("focus", () => showTip(el));
  for (const ev of ["pointerleave", "blur"]) el.addEventListener(ev, () => { tip.hidden = true; });
  el.addEventListener("click", (e) => { e.preventDefault(); showTip(el); });
}

// A click on the pill that is already lit still restores that preset.
document.querySelectorAll('input[name="preset"]').forEach((r) => r.addEventListener("click", () => setPreset(r.value)));
$("windowFrames").addEventListener("input", (e) => { settings.windowFrames = +e.target.value; changed(); });
$("holdPercent").addEventListener("input", (e) => { settings.holdPercent = +e.target.value; changed(); });
$("missesAllowed").addEventListener("change", (e) => { settings.missesAllowed = +e.target.value; changed(); });
$("basis").addEventListener("change", (e) => { settings.basis = e.target.value; changed(); });
for (const k of SWITCHES) $(k).addEventListener("change", (e) => { settings[k] = e.target.checked; changed(); });
$("clearLog").addEventListener("click", () => { runs.length = 0; drawLog(); });
$("panelToggle").addEventListener("click", () => {
  const closed = $("panel").classList.toggle("closed");
  $("panelToggle").textContent = closed ? "Options" : "Hide";
  $("panelToggle").setAttribute("aria-expanded", String(!closed));
  draw();
});
if (innerWidth <= 900) $("panelToggle").click();
$("ocarinaBtn").addEventListener("click", () => (mode === "game" ? skip() : takeOut()));

// ---- keys and on-screen note buttons ----
$("card").innerHTML = `<span>${SONG.name}</span>` + PHRASE.map((p) => `<span class="n" title="${NOTE[p.note].keyLabel}">${NOTE[p.note].glyph}</span>`).join("") + `<button id="listen">Hear it</button>`;
$("listen").addEventListener("click", listen);
$("keys").innerHTML = NOTES.map((n) => `<button data-note="${n.id}" style="--c:${n.color}" aria-label="Note ${n.keyLabel}">${n.glyph}<small>${n.keyLabel}</small></button>`).join("");
for (const btn of document.querySelectorAll("#keys button")) {
  const id = btn.dataset.note;
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); noteDown(id); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(ev, () => noteUp(id));
}
const noteForKey = (key) => NOTES.find((n) => n.key === key)?.id;
addEventListener("keydown", (e) => {
  if (e.target.matches?.("select, input[type=range]")) return; // a focused slider or menu keeps its own keys
  const id = noteForKey(e.key);
  if (id) { e.preventDefault(); if (!e.repeat) noteDown(id); return; }
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "e") { e.preventDefault(); mode === "game" ? skip() : mode === "play" ? putAway() : takeOut(); } // E is the one action key
  else if (e.key === "Escape") putAway();
  else if (k === "1") setPreset("original");
  else if (k === "2") setPreset("rhythm");
  else if (k.length === 1 && "wasd".includes(k)) { walkKeys.add(k); if (mode === "walk" && result) { clearChart(); draw(); } }
});
addEventListener("keyup", (e) => { const id = noteForKey(e.key); if (id) noteUp(id); walkKeys.delete(e.key.toLowerCase()); });
addEventListener("blur", () => { releaseAll(); walkKeys.clear(); });
addEventListener("resize", draw);
// After an option changes, give the keys back to the game.
document.addEventListener("change", (e) => e.target.blur?.());

// ---- the frame loop ----
let last = performance.now(), wasOnPlate = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (events.length) {
    const due = events.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
    events = events.filter((e) => e.at > now);
    for (const e of due) e.fn();
  }
  if (mode === "walk") {
    world.move((walkKeys.has("d") ? 1 : 0) - (walkKeys.has("a") ? 1 : 0), (walkKeys.has("s") ? 1 : 0) - (walkKeys.has("w") ? 1 : 0), dt);
    const on = world.onPlate();
    if (on !== wasOnPlate) { wasOnPlate = on; draw(); }
  }
  if (finalHold) checkFinalHold(now);
  if (mode === "play" || finalHold) updateLyre(now);
  if (sound.ctx) tickLyre(now);
  world.setPrompt(mode === "walk" && world.onPlate());
  if (settings.bars && mode !== "walk") drawChart(); // the bar view moves with time
  world.update(dt);
  requestAnimationFrame(frame);
}

syncPanel(); draw(); drawLog();
requestAnimationFrame(frame);

// For the automated check only.
if (location.hostname === "localhost") window.__prototype = { runs, settings, lyre, get mode() { return mode; }, get chart() { return buffer.map((b) => b.id); }, sync: changed };
