import * as THREE from 'three';
import { Noise, clamp, lerp, smoothstep } from '../core/utils';

/** Örnekleyici: (u, v) -> [r, g, b (0-255), yükseklik (0-1)] */
type Sampler = (u: number, v: number) => [number, number, number, number];
type RGB = [number, number, number];

export interface TexPair {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function finish(canvas: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Renk dokusunu ve yükseklikten türetilmiş normal haritasını üretir. */
function build(size: number, strength: number, fn: Sampler): TexPair {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const hs = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = clamp(r, 0, 255);
      img.data[i + 1] = clamp(g, 0, 255);
      img.data[i + 2] = clamp(b, 0, 255);
      img.data[i + 3] = 255;
      hs[y * size + x] = h;
    }
  }
  ctx.putImageData(img, 0, 0);

  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(size, size);
  const at = (x: number, y: number) => hs[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  return { map: finish(c, true), normalMap: finish(nc, false) };
}

export type GameTextures = ReturnType<typeof createTextures>;

/** Oyundaki tüm malzeme dokularını çalışma anında üretir (harici dosya yok). */
export function createTextures() {
  const n = new Noise(1337);
  // Döşenebilir, [0,1] aralığında fbm
  const f = (u: number, v: number, p: number, oct = 4) => clamp(n.fbm(u * p, v * p, oct, p) * 0.5 + 0.5, 0, 1);
  const rd = (u: number, v: number, p: number, oct = 3) => n.ridged(u * p, v * p, oct, p);

  const grass = build(512, 3, (u, v) => {
    const a = f(u, v, 6, 5);
    const b = f(u + 0.31, v + 0.17, 48, 3);
    const d = f(u + 0.7, v + 0.4, 3, 2);
    let c = mix([34, 58, 20], [86, 112, 44], a * 0.65 + b * 0.35);
    c = mix(c, [118, 116, 52], smoothstep(0.62, 0.9, d) * 0.45);
    const k = 0.82 + b * 0.36;
    return [c[0] * k, c[1] * k, c[2] * k, b * 0.7 + a * 0.3];
  });

  const dirt = build(512, 4, (u, v) => {
    const a = f(u, v, 5, 5);
    const b = f(u + 0.5, v + 0.2, 40, 3);
    const peb = smoothstep(0.66, 0.78, f(u + 0.13, v + 0.61, 26, 2));
    let c = mix([74, 56, 38], [128, 102, 72], a * 0.6 + b * 0.4);
    c = mix(c, [132, 122, 106], peb * 0.4);
    return [c[0], c[1], c[2], b * 0.5 + peb * 0.5];
  });

  const rock = build(512, 6, (u, v) => {
    const a = f(u, v, 4, 5);
    const b = f(u + 0.2, v + 0.8, 32, 3);
    const cr = rd(u + 0.4, v + 0.1, 7, 4);
    const crack = smoothstep(0.82, 0.97, cr);
    let c = mix([78, 76, 74], [146, 140, 130], a * 0.7 + b * 0.3);
    c = mix(c, [88, 96, 70], smoothstep(0.6, 0.85, f(u + 0.9, v + 0.3, 5, 3)) * 0.35);
    c = mix(c, [36, 34, 33], crack);
    return [c[0], c[1], c[2], a * 0.6 + b * 0.25 - crack * 0.6 + 0.3];
  });

  const sand = build(256, 2, (u, v) => {
    const a = f(u, v, 6, 4);
    const b = f(u + 0.3, v + 0.3, 50, 2);
    const c = mix([150, 132, 96], [198, 180, 138], a * 0.6 + b * 0.4);
    return [c[0], c[1], c[2], b];
  });

  const bark = build(256, 6, (u, v) => {
    const a = f(u * 1, v * 0.18, 22, 4);
    const b = f(u, v, 6, 3);
    const c = mix([42, 32, 24], [104, 84, 62], a * 0.75 + b * 0.25);
    return [c[0], c[1], c[2], a];
  });

  const leaves = build(256, 5, (u, v) => {
    const a = f(u, v, 10, 4);
    const b = f(u + 0.4, v + 0.2, 44, 2);
    const c = mix([24, 50, 16], [92, 128, 44], a * 0.5 + b * 0.5);
    return [c[0], c[1], c[2], b * 0.7 + a * 0.3];
  });

  const pine = build(256, 5, (u, v) => {
    const a = f(u, v * 0.4, 36, 3);
    const b = f(u + 0.4, v + 0.2, 8, 3);
    const c = mix([14, 34, 20], [52, 88, 46], a * 0.6 + b * 0.4);
    return [c[0], c[1], c[2], a];
  });

  const plaster = build(256, 2, (u, v) => {
    const a = f(u, v, 4, 5);
    const b = f(u + 0.5, v + 0.5, 30, 2);
    const stain = smoothstep(0.55, 0.9, f(u + 0.2, v * 0.5, 5, 3)) * (1 - v) * 0.5;
    let c = mix([188, 176, 152], [226, 216, 196], a * 0.7 + b * 0.3);
    c = mix(c, [130, 116, 96], stain);
    return [c[0], c[1], c[2], b * 0.6 + a * 0.4];
  });

  const wood = build(256, 5, (u, v) => {
    const plank = Math.floor(u * 6);
    const grain = f(u * 0.25 + plank * 0.37, v, 28, 4);
    const edge = smoothstep(0.0, 0.035, Math.min((u * 6) % 1, 1 - ((u * 6) % 1)));
    const tone = 0.85 + ((plank * 37) % 7) * 0.035;
    let c = mix([62, 40, 24], [130, 92, 56], grain);
    c = [c[0] * tone, c[1] * tone, c[2] * tone];
    c = mix([18, 12, 8], c, edge);
    return [c[0], c[1], c[2], grain * 0.5 + edge * 0.5];
  });

  const roof = build(256, 8, (u, v) => {
    const rows = 8;
    const ry = v * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const fx = (u * 10 + (row % 2) * 0.5) % 1;
    const round = Math.sin(fx * Math.PI);
    const a = f(u, v, 12, 3);
    const h = round * 0.6 + (1 - fy) * 0.4;
    const shade = 0.55 + h * 0.6;
    let c = mix([44, 52, 64], [74, 86, 100], a);
    c = mix(c, [60, 84, 70], smoothstep(0.6, 0.9, f(u + 0.3, v + 0.6, 5, 3)) * 0.4);
    return [c[0] * shade, c[1] * shade, c[2] * shade, h];
  });

  const stone = build(256, 7, (u, v) => {
    const rows = 6;
    const ry = v * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const bx = u * 4 + (row % 2) * 0.5;
    const fx = bx % 1;
    const id = Math.floor(bx) * 7 + row * 13;
    const mortar = Math.min(smoothstep(0, 0.06, Math.min(fx, 1 - fx)), smoothstep(0, 0.09, Math.min(fy, 1 - fy)));
    const a = f(u, v, 20, 3);
    const tone = 0.8 + ((id * 31) % 9) * 0.04;
    let c = mix([96, 92, 86], [150, 144, 134], a);
    c = [c[0] * tone, c[1] * tone, c[2] * tone];
    c = mix([52, 48, 44], c, mortar);
    return [c[0], c[1], c[2], mortar * 0.7 + a * 0.3];
  });

  const fur = build(128, 5, (u, v) => {
    const a = f(u * 0.3, v, 30, 3);
    const b = f(u, v, 5, 3);
    const k = 150 + a * 80 + b * 25;
    return [k, k, k, a];
  });

  const cloth = build(128, 4, (u, v) => {
    const w = (Math.sin(u * Math.PI * 60) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 60) * 0.5 + 0.5);
    const a = f(u, v, 6, 3);
    const k = 190 + w * 40 + a * 25;
    return [k, k, k, w];
  });

  // Lanetli taşların parlayan damarları için (emissive harita)
  const veins = build(256, 3, (u, v) => {
    const cr = rd(u, v, 5, 4);
    const k = smoothstep(0.78, 0.96, cr) * 255;
    return [k, k, k, cr];
  });

  return { grass, dirt, rock, sand, bark, leaves, pine, plaster, wood, roof, stone, fur, cloth, veins };
}
