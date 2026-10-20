// Synthesised sound: engine drone, wind, guns, hits, explosions. No sample files needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this._lastGun = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0.25;
    const amp = ctx.createGain(); amp.gain.value = 0.6;
    this.lfo.connect(this.lfoGain).connect(amp.gain);
    this.osc1.connect(amp); this.osc2.connect(amp);
    amp.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.osc1.start(); this.osc2.start(); this.lfo.start();

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise; wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 800; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setEngine(rpm, throttle, speed, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = Math.max(20, (rpm / 60) * 4.5);
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.lfo.frequency.setTargetAtTime(f / 9, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.1 : 0, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, speed / 260), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(400 + speed * 18, t, 0.2);
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.05);
    this.windGain.gain.setTargetAtTime(0, t, 0.05);
  }

  _burst({ dur = 0.1, freq = 1000, type = 'highpass', gain = 0.3, q = 0.7, decay = dur, rate = 1 }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + decay);
  }

  gun() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this._lastGun < 0.05) return;
    this._lastGun = t;
    this._burst({ dur: 0.03, freq: 1400, type: 'bandpass', gain: 0.35, q: 1.2, decay: 0.07 });
  }
  enemyGun(dist) {
    if (dist > 900) return;
    this._burst({ dur: 0.02, freq: 1800, type: 'bandpass', gain: 0.12 * (1 - dist / 900), q: 1.5, decay: 0.05 });
  }
  hit() { this._burst({ dur: 0.02, freq: 2500, type: 'highpass', gain: 0.4, decay: 0.05 }); }
  thud() { this._burst({ dur: 0.05, freq: 300, type: 'lowpass', gain: 0.5, decay: 0.15 }); }
  explosion(dist = 0) {
    const g = Math.max(0.05, 0.9 * (1 - Math.min(1, dist / 4000)));
    this._burst({ dur: 0.4, freq: 180, type: 'lowpass', gain: g, decay: 1.6, rate: 0.6 });
  }
  flak(dist = 0) {
    const g = Math.max(0.03, 0.6 * (1 - Math.min(1, dist / 2500)));
    this._burst({ dur: 0.15, freq: 260, type: 'lowpass', gain: g, decay: 0.7, rate: 0.7 });
  }
  click() { this._burst({ dur: 0.01, freq: 3000, type: 'highpass', gain: 0.25, decay: 0.03 }); }
  jam() { this._burst({ dur: 0.04, freq: 900, type: 'bandpass', gain: 0.4, q: 4, decay: 0.12 }); }
}
