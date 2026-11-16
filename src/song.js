// The song data and the rhythm judge. No browser code here, so tests can load it.
// Everything in this file is original: the notes, the melody and the timing.

// Low notes sit low on the chart. Each note owns one line, one colour and one spot around the player.
export const NOTES = [
  // No note is green, amber or red: those colours mean on time, close and missed.
  { id: "low", key: " ", keyLabel: "Space", glyph: "●", freq: 293.66, row: 0, color: "#eef2f6" },
  { id: "down", key: "ArrowDown", keyLabel: "↓", glyph: "▼", freq: 349.23, row: 1, color: "#5b9bff" },
  { id: "right", key: "ArrowRight", keyLabel: "→", glyph: "▶", freq: 440.0, row: 2, color: "#45d4f0" },
  { id: "left", key: "ArrowLeft", keyLabel: "←", glyph: "◀", freq: 493.88, row: 3, color: "#f58fc8" },
  { id: "up", key: "ArrowUp", keyLabel: "↑", glyph: "▲", freq: 587.33, row: 4, color: "#b48cff" },
];
export const NOTE = Object.fromEntries(NOTES.map((n) => [n.id, n]));
export const CHART_SLOTS = 8; // the chart holds eight notes, then clears

// Times are in milliseconds from the first note. `len` is how long a note rings.
export const SONG = {
  name: "Tide Song",
  // The opening the player enters: short, short, long, twice.
  // Each long note lasts two beats. The opening takes 3 s from the first note to the last, and 4 s in all.
  phrase: [
    { note: "down", at: 0, len: 440 },
    { note: "right", at: 500, len: 440 },
    { note: "up", at: 1000, len: 940 },
    { note: "down", at: 2000, len: 440 },
    { note: "right", at: 2500, len: 440 },
    { note: "up", at: 3000, len: 940 },
  ],
  phraseLength: 4000,
  // The rest of the song. The game always plays this part. It lasts the measured 3 s.
  tail: [
    { note: "up", at: 0, len: 460 },
    { note: "left", at: 500, len: 220 },
    { note: "right", at: 750, len: 220 },
    { note: "down", at: 1000, len: 460 },
    { note: "right", at: 1500, len: 220 },
    { note: "left", at: 1750, len: 220 },
    { note: "right", at: 2000, len: 900 },
  ],
  tailLength: 3000,
  // Accompaniment: one plucked note every `lyreStep` ms, cycling through these pitches.
  beat: 500, // one beat of the song, in ms
  lyreStep: 250,
  lyre: [146.83, 220.0, 293.66, 349.23, 196.0, 246.94, 293.66, 392.0],
};

// The switches. A preset is only a bundle of these: "original" turns every one off.
export const PRESETS = {
  original: { rhythmPass: false, labels: false, colors: false, bars: false, lyre: false, earlySkip: false },
  rhythm: { rhythmPass: true, labels: false, colors: true, bars: false, lyre: true, earlySkip: false },
};
// The numbers behind the rhythm judge. Both presets share them.
export const TUNING = {
  windowFrames: 6, // frames allowed early and late, around one perfect frame: 6 gives a 13 frame hit window (2 gives 5)
  missesAllowed: 0,
  basis: "first", // each note is timed from the "first" note, or from the "previous" note
  holdPercent: 50, // a note must be held for this much of its length; 0 judges starts only
};
// The page opens on the Rhythm Pass preset, tuned so a first-time player can earn one without touching the options.
export const DEFAULTS = { ...TUNING, ...PRESETS.rhythm };


export const FRAME_MS = 1000 / 60;
// Measured from two captures of the game this idea is about: it waits about 1.4 s between
// recognising a song and starting its repeat. In that gap the chart flashes, shows the
// entered notes again, then clears at about 0.9 s.
export const REPEAT_DELAY = 1400;
export const CHART_CLEAR_DELAY = 900;
/** Half the hit window in ms: `frames` early or late, plus half of the one perfect frame. */
export const hitWindowMs = (frames) => (frames + 0.5) * FRAME_MS;

/** How many of the newest notes are a correct start of the song (0 when none). */
export function attemptLength(ids, song = SONG) {
  const want = song.phrase.map((p) => p.note);
  for (let k = Math.min(ids.length, want.length); k >= 1; k--) {
    const tail = ids.slice(ids.length - k);
    if (tail.every((id, i) => id === want[i])) return k;
  }
  return 0;
}

/** True when the newest notes are the whole opening, in order. Rhythm is ignored. */
export function matchesSong(ids, song = SONG) {
  return attemptLength(ids, song) === song.phrase.length;
}

/**
 * Judge the notes played so far against the song's opening.
 * `notes` are { on, off } times in ms for the first notes of the song; `off` is null while a note is held.
 * A note's start must land inside the hit window. Its end is lenient: the note only has to be
 * held for `holdPercent` of its length. Holding it longer is always fine, so a release is never "late".
 * `now` is used for notes that are still held.
 * `startErrors` are in ms (negative = early). `holdShort` is how many ms short a hold was
 * (0 when held long enough, null while a held note has not yet reached its minimum).
 */
export function judge(notes, { windowMs, missesAllowed = 0, basis = "first", holdPercent = 0 }, now = Infinity, song = SONG) {
  const P = song.phrase, t0 = notes[0]?.on;
  const startErrors = notes.map((n, i) => {
    if (i === 0) return 0;
    return basis === "previous" ? n.on - notes[i - 1].on - (P[i].at - P[i - 1].at) : n.on - t0 - P[i].at;
  });
  const holdShort = notes.map((n, i) => {
    const need = (P[i].len * holdPercent) / 100, heldFor = (n.off ?? now) - n.on;
    if (heldFor >= need) return 0;
    return n.off == null ? null : need - heldFor;
  });
  const grades = notes.map((_, i) => {
    const e = Math.abs(startErrors[i]);
    if (holdShort[i]) return "miss";
    return e <= windowMs ? "ok" : e <= windowMs * 2 ? "near" : "miss";
  });
  const misses = grades.filter((g) => g !== "ok").length;
  const pending = holdShort.some((s) => s === null);
  const worst = startErrors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  return { startErrors, holdShort, grades, misses, worst, pending, pass: notes.length === P.length && !pending && misses <= missesAllowed };
}

/**
 * Plan what the game plays after the opening is entered. Times share the onsets' clock.
 * A pass goes into the rest of the song on the song's own beat, counted from the start of
 * the player's last note. So the gap after the last note is the gap the song has. A last
 * note held past that beat moves the start to the next beat. The start is never sooner than
 * `minGap` after `now` (the release of the last note). Anything else repeats the opening first.
 */
export function planPlayback({ onsets, now, pass, minGap = 30, repeatDelay = REPEAT_DELAY }, song = SONG) {
  if (pass) {
    const P = song.phrase, first = onsets[onsets.length - 1] + song.phraseLength - P[P.length - 1].at;
    const tailStart = first + Math.max(0, Math.ceil((now + minGap - first) / song.beat)) * song.beat;
    return { repeatStart: null, tailStart, end: tailStart + song.tailLength };
  }
  const repeatStart = now + repeatDelay;
  const tailStart = repeatStart + song.phraseLength;
  return { repeatStart, tailStart, end: tailStart + song.tailLength };
}
