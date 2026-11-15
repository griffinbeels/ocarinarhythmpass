// Sound made in the browser: a soft ocarina, a plucked string and a short chime.
// No sound files are used.

export class Sound {
  constructor() { this.ctx = null; }

  /** Browsers only allow sound after a click or a key press, so call this from one. */
  start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(this.ctx.createDynamicsCompressor()).connect(this.ctx.destination);
      this.lyreBus = this.bus(0); // the accompaniment while the player plays; its strength follows their rhythm
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  /** A volume control of its own. Notes sent to a bus can be faded together. */
  bus(level = 1) {
    if (!this.ctx) return null;
    const g = this.ctx.createGain(); g.gain.value = level; g.connect(this.out); return g;
  }
  /** Glide a bus to `level` (0 to 1). It gets most of the way there in `seconds`. */
  fade(bus, level, seconds) { if (bus) bus.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3); }

  at(msFromNow) { return this.ctx.currentTime + Math.max(0, msFromNow) / 1000; }

  ocarinaVoice(freq, when, dest = this.out) {
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.34, when + 0.035);
    const filter = c.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 2200;
    const main = c.createOscillator(); main.type = "sine"; main.frequency.value = freq;
    const breath = c.createOscillator(); breath.type = "triangle"; breath.frequency.value = freq * 2;
    const breathGain = c.createGain(); breathGain.gain.value = 0.12;
    const wobble = c.createOscillator(); wobble.frequency.value = 5.2;
    const wobbleGain = c.createGain();
    wobbleGain.gain.setValueAtTime(0, when);
    wobbleGain.gain.linearRampToValueAtTime(freq * 0.006, when + 0.45);
    wobble.connect(wobbleGain); wobbleGain.connect(main.frequency); wobbleGain.connect(breath.frequency);
    main.connect(filter); breath.connect(breathGain).connect(filter); filter.connect(gain).connect(dest);
    const oscs = [main, breath, wobble];
    for (const o of oscs) o.start(when);
    return {
      /** Fade the note out at `at` (audio clock seconds). */
      stop: (at = c.currentTime) => {
        const t = Math.max(at, c.currentTime);
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.05);
        for (const o of oscs) { try { o.stop(t + 0.4); } catch { /* already stopped */ } }
      },
      /** Silence the note now, even if it has not started yet. */
      kill: () => {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.disconnect();
      },
    };
  }

  /** A note the player holds: it rings until `stop` is called. */
  hold(freq) { if (!this.ctx) return { stop() {}, kill() {} }; return this.ocarinaVoice(freq, this.ctx.currentTime); }

  /** A note the game plays: starts `msFromNow` from now and rings for `lenMs`. */
  ocarina(freq, msFromNow, lenMs, dest) {
    if (!this.ctx) return { stop() {}, kill() {} };
    const when = this.at(msFromNow);
    const v = this.ocarinaVoice(freq, when, dest || this.out);
    v.stop(when + lenMs / 1000);
    return v;
  }

  /** One plucked string note. `level` is 0 to 1. */
  pluck(freq, msFromNow, level = 1, ring = 1.1, dest) {
    if (!this.ctx) return { stop() {}, kill() {} };
    const c = this.ctx, when = this.at(msFromNow);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.2 * level, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + ring);
    const a = c.createOscillator(); a.type = "triangle"; a.frequency.value = freq;
    const b = c.createOscillator(); b.type = "sine"; b.frequency.value = freq * 2;
    const bGain = c.createGain(); bGain.gain.value = 0.3;
    a.connect(gain); b.connect(bGain).connect(gain); gain.connect(dest || this.out);
    a.start(when); b.start(when); a.stop(when + ring + 0.1); b.stop(when + ring + 0.1);
    const kill = () => { gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(0, c.currentTime); gain.disconnect(); };
    return { stop: kill, kill };
  }

  /** A Rhythm Pass: a bright run of notes that climbs. */
  passChime() {
    [587.33, 880, 1174.66, 1480, 1760, 2349.32].forEach((f, i) => this.pluck(f, i * 60, 0.7, 0.9));
  }

  /** The rhythm missed: two soft low notes that step down. */
  missTone() {
    this.pluck(246.94, 60, 0.4, 0.5); this.pluck(196, 220, 0.4, 0.6);
  }

  /** The water moves: a low swell that rises and fades. */
  swell() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const osc = c.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(82, t); osc.frequency.exponentialRampToValueAtTime(196, t + 1.4);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.22, t + 0.5); gain.gain.linearRampToValueAtTime(0, t + 1.6);
    osc.connect(gain).connect(this.out); osc.start(t); osc.stop(t + 1.7);
  }

  /** The short chime that says "the song was recognised". */
  twinkle() {
    [1174.66, 1396.91, 1760, 2349.32].forEach((f, i) => this.pluck(f, i * 55, 0.45, 0.5));
  }
}
