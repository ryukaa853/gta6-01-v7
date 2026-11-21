// All sound is synthesised with WebAudio — oscillators and filtered noise, no
// audio files, no network. Created lazily on the first user gesture so the
// browser's autoplay rules are satisfied.
export function createAudio() {
  const A = {
    ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null,
    sirenGain: null, muted: false,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 40;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 320;
        this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
        this.engineOsc.start();
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.value = 700;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      } catch (e) { this.ctx = null; }
    },
    engine(speed01, on) {
      if (!this.ctx) return;
      this.engineGain.gain.value = on ? 0.05 + speed01 * 0.06 : 0;
      this.engineOsc.frequency.value = 42 + speed01 * 130;
    },
    siren(on, t) {
      if (!this.ctx) return;
      this.sirenGain.gain.value = on ? 0.045 : 0;
      if (on) this.sirenOsc.frequency.value = 650 + Math.sin(t * 5) * 220;
    },
    blip(freq, dur, type, vol) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.2, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + dur);
    },
    noise(dur, vol, lowpass) {
      if (!this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
      const g = this.ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
    },
    shot() { this.noise(0.16, 0.5, 2400); },
    cash() { this.blip(1320, 0.12, 'sine', 0.22); setTimeout(() => this.blip(1760, 0.2, 'sine', 0.2), 90); },
    fail() { this.blip(180, 0.5, 'sawtooth', 0.15); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.22), i * 110)); },
    click() { this.blip(900, 0.05, 'square', 0.1); },
  };
  return A;
}
