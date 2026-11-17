/** Harici dosya gerektirmeyen, WebAudio ile sentezlenen ses efektleri. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Tarayıcı kısıtı nedeniyle ilk kullanıcı etkileşiminde çağrılmalı. */
  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.startAmbience();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  private noiseBuffer(dur: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
  }

  private tone(freq: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }

  swing() { this.burst(0.16, 1400, 0.25); }
  hit(crit = false) {
    this.burst(0.12, crit ? 2600 : 900, 0.5, 'lowpass');
    this.tone(crit ? 240 : 160, 60, 0.12, 'square', 0.12);
  }
  hurt() { this.tone(140, 70, 0.2, 'sawtooth', 0.18); }
  cast() { this.tone(320, 900, 0.3, 'sine', 0.2); this.burst(0.3, 3000, 0.1); }
  boom() { this.burst(0.5, 220, 0.7, 'lowpass'); this.tone(90, 30, 0.5, 'sine', 0.4); }
  pickup() { this.tone(880, 1320, 0.1, 'sine', 0.2); }
  coin() { this.tone(1400, 1900, 0.07, 'triangle', 0.15); this.tone(1900, 2400, 0.08, 'triangle', 0.12, 0.06); }
  click() { this.tone(600, 500, 0.05, 'triangle', 0.12); }
  fail() { this.tone(220, 110, 0.35, 'sawtooth', 0.2); }
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.22, 'triangle', 0.2, i * 0.09)); }
  levelUp() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, f * 1.01, 0.35, 'triangle', 0.25, i * 0.11)); }
}
