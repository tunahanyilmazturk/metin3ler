export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** Tohumlu, deterministik rastgele sayı üreteci (mulberry32). */
export function makeRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2B Perlin gürültüsü; period > 0 ise döşenebilir (tileable) sonuç üretir. */
export class Noise {
  private perm = new Uint8Array(512);

  constructor(seed = 1) {
    const r = makeRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(h: number, x: number, y: number) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  perlin(x: number, y: number, period = 0) {
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    let x1 = xi + 1;
    let y1 = yi + 1;
    if (period > 0) {
      xi = ((xi % period) + period) % period;
      yi = ((yi % period) + period) % period;
      x1 = ((x1 % period) + period) % period;
      y1 = ((y1 % period) + period) % period;
    }
    xi &= 255; yi &= 255; x1 &= 255; y1 &= 255;
    const p = this.perm;
    const u = fade(xf);
    const v = fade(yf);
    const aa = p[p[xi] + yi], ab = p[p[xi] + y1], ba = p[p[x1] + yi], bb = p[p[x1] + y1];
    return lerp(
      lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  /** Yaklaşık [-1, 1] aralığında fraktal gürültü. */
  fbm(x: number, y: number, octaves = 4, period = 0) {
    let amp = 0.5, sum = 0, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.perlin(x * f, y * f, period * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm * 1.6;
  }

  /** [0, 1] aralığında sırt (ridge) gürültüsü. */
  ridged(x: number, y: number, octaves = 3, period = 0) {
    let amp = 0.5, sum = 0, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.perlin(x * f, y * f, period * f));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}

/** Bir sonraki kareyi bekler; sekme arka plandaysa zamanlayıcıya düşer. */
export const nextFrame = () => new Promise<void>((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
