import * as THREE from 'three';
import { Noise, clamp, lerp, smoothstep } from '../core/utils';
import { LAKE, MOUNTAIN, ROADS, VILLAGE_H, VILLAGE_R, WATER_LEVEL, WORLD_HALF, WORLD_SIZE } from '../data/world';
import type { GameTextures } from '../render/textures';

const N = 401; // ızgara çözünürlüğü (2 m hücre)
const CELL = WORLD_SIZE / (N - 1);

/** Yükseklik haritası tabanlı arazi: ağ, doku karışım shader'ı ve yükseklik sorguları. */
export class Terrain {
  readonly res = N;
  heights = new Float32Array(N * N);
  /** Köy/yol toprak maskesi (0-1) */
  dirt = new Float32Array(N * N);
  /** Çim yoğunluğu (0-1) */
  grass = new Float32Array(N * N);
  mesh = new THREE.Group();
  /** R: yükseklik, G: çim yoğunluğu — çim shader'ı tarafından örneklenir */
  heightTex!: THREE.DataTexture;
  private noise = new Noise(2024);

  constructor(tex: GameTextures) {
    this.generate();
    this.buildMesh(tex);
  }

  roadDist(x: number, z: number) {
    const wx = x + this.noise.perlin(x * 0.03, z * 0.03) * 7;
    const wz = z + this.noise.perlin(x * 0.03 + 50, z * 0.03 + 50) * 7;
    let best = 1e9;
    for (const road of ROADS) {
      for (let i = 0; i < road.length - 1; i++) {
        const [ax, az] = road[i];
        const [bx, bz] = road[i + 1];
        const dx = bx - ax, dz = bz - az;
        const t = clamp(((wx - ax) * dx + (wz - az) * dz) / (dx * dx + dz * dz), 0, 1);
        const d = Math.hypot(wx - (ax + dx * t), wz - (az + dz * t));
        if (d < best) best = d;
      }
    }
    return best;
  }

  private rawHeight(x: number, z: number) {
    const n = this.noise;
    const base = n.fbm(x * 0.0042 + 10, z * 0.0042 + 10, 5);
    let h = 9 + base * 22;
    h += n.ridged(x * 0.011, z * 0.011, 3) * 7 * smoothstep(0.0, 0.5, base);
    h += n.fbm(x * 0.05, z * 0.05, 2) * 0.7;

    // Güneybatı dağlık bölge
    const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
    h += 34 * Math.exp(-(md * md) / (2 * MOUNTAIN.r * MOUNTAIN.r)) * (0.55 + 0.45 * n.ridged(x * 0.02, z * 0.02, 3));

    // Göl çanağı
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    const lk = Math.exp(-(ld * ld) / (2 * LAKE.r * LAKE.r));
    h = lerp(h, -7, lk * 0.95);

    // Yolları hafifçe düzle ve sudan yukarıda tut
    const rd = this.roadDist(x, z);
    const rf = smoothstep(9, 3, rd);
    if (rf > 0) h = lerp(h, Math.max(h, 1.6), rf);

    // Köy platosu
    const d = Math.hypot(x, z);
    h = lerp(h, VILLAGE_H, smoothstep(VILLAGE_R + 50, VILLAGE_R + 2, d));

    // Dünyayı çevreleyen sıradağlar
    const e = Math.max(Math.abs(x), Math.abs(z));
    const edge = smoothstep(300, 400, e);
    h += edge * edge * (70 + n.ridged(x * 0.015, z * 0.015, 3) * 50);
    return h;
  }

  private generate() {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.heights[j * N + i] = this.rawHeight(-WORLD_HALF + i * CELL, -WORLD_HALF + j * CELL);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
        const h = this.heights[j * N + i];
        const village = smoothstep(VILLAGE_R + 5, VILLAGE_R - 6, Math.hypot(x, z));
        const road = smoothstep(5, 2.2, this.roadDist(x, z));
        const patch = smoothstep(0.55, 0.8, this.noise.fbm(x * 0.02 + 99, z * 0.02 + 99, 3) * 0.5 + 0.5) * 0.6;
        const dirt = Math.max(village * 0.92, road, patch);
        const slope = this.slopeAtIndex(i, j);
        this.dirt[j * N + i] = dirt;
        this.grass[j * N + i] =
          (1 - smoothstep(0.25, 0.6, dirt)) * (1 - smoothstep(0.14, 0.3, slope)) *
          smoothstep(WATER_LEVEL + 0.5, WATER_LEVEL + 1.6, h) * (1 - smoothstep(38, 52, h));
      }
    }
  }

  private slopeAtIndex(i: number, j: number) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const dx = (this.heights[j * N + i1] - this.heights[j * N + i0]) / ((i1 - i0) * CELL);
    const dz = (this.heights[j1 * N + i] - this.heights[j0 * N + i]) / ((j1 - j0) * CELL);
    return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
  }

  private buildMesh(tex: GameTextures) {
    const pos = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = -WORLD_HALF + i * CELL;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -WORLD_HALF + j * CELL;
        uv[k * 2] = (i * CELL) / 5;
        uv[k * 2 + 1] = (j * CELL) / 5;
      }
    }
    const idx = new Uint32Array((N - 1) * (N - 1) * 6);
    let p = 0;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aDirt', new THREE.BufferAttribute(this.dirt, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.94,
      metalness: 0,
      normalMap: tex.dirt.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
    });
    mat.onBeforeCompile = (s) => {
      s.uniforms.tGrass = { value: tex.grass.map };
      s.uniforms.tDirt = { value: tex.dirt.map };
      s.uniforms.tRock = { value: tex.rock.map };
      s.uniforms.tSand = { value: tex.sand.map };
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aDirt;
          varying vec3 vWPos; varying vec3 vWNrm; varying float vDirt;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vWPos = position; vWNrm = normal; vDirt = aDirt;`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; uniform sampler2D tSand;
          varying vec3 vWPos; varying vec3 vWNrm; varying float vDirt;`)
        .replace('#include <map_fragment>', /* glsl */ `
          vec2 tuv = vWPos.xz;
          vec3 wn = normalize(vWNrm);
          float macro = texture2D(tGrass, tuv * 0.0031).g;
          float macro2 = texture2D(tDirt, tuv * 0.011).r;
          // Tekrarı kırmak için iki ölçekte örnekleme
          vec3 cg = mix(texture2D(tGrass, tuv * 0.19).rgb, texture2D(tGrass, tuv * 0.041).rgb, 0.5);
          cg *= 0.95 + macro * 2.3;
          vec3 cd = mix(texture2D(tDirt, tuv * 0.16).rgb, texture2D(tDirt, tuv * 0.037).rgb, 0.4) * (0.8 + macro2 * 0.9);
          vec3 cs = texture2D(tSand, tuv * 0.14).rgb;
          // Kayalar için üç düzlemli izdüşüm (dik yüzeylerde esnemeyi önler)
          vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 cr = texture2D(tRock, vWPos.zy * 0.09).rgb * bw.x
                  + texture2D(tRock, vWPos.xz * 0.09).rgb * bw.y
                  + texture2D(tRock, vWPos.xy * 0.09).rgb * bw.z;
          cr *= 0.75 + macro2 * 0.8;
          float slope = 1.0 - wn.y;
          float rockW = smoothstep(0.16, 0.34, slope + (macro2 - 0.3) * 0.12);
          float snowless = smoothstep(40.0, 60.0, vWPos.y);
          float sandW = smoothstep(1.5, 0.35, vWPos.y + (macro2 - 0.3) * 1.2);
          vec3 col = mix(cg, cd, smoothstep(0.3, 0.7, vDirt + (macro2 - 0.3) * 0.5));
          col = mix(col, cs, sandW);
          col = mix(col, cr, max(rockW, snowless));
          // Su altında kalan zemin koyulaşır
          col *= mix(1.0, 0.45, smoothstep(0.2, -2.5, vWPos.y));
          diffuseColor.rgb = col;
        `);
    };

    // Ağı ~50 hücrelik parçalara bölmek ana ve gölge frustum'larında doğal
    // kırpma sağlar. Normaller bütün ızgaradan kopyalandığı için parça
    // dikişlerinde görünüm değişmez.
    const chunkCells = 50;
    const normals = geo.attributes.normal.array as Float32Array;
    for (let z = 0; z < N - 1; z += chunkCells) {
      for (let x = 0; x < N - 1; x += chunkCells) {
        const width = Math.min(chunkCells, N - 1 - x), depth = Math.min(chunkCells, N - 1 - z);
        const stride = width + 1, count = stride * (depth + 1);
        const chunk = new THREE.BufferGeometry();
        for (const [name, source, size] of [
          ['position', pos, 3],
          ['normal', normals, 3],
          ['uv', uv, 2],
          ['aDirt', this.dirt, 1],
        ] as const) {
          const attribute = new Float32Array(count * size);
          for (let row = 0; row <= depth; row++) {
            const start = ((z + row) * N + x) * size;
            attribute.set(source.subarray(start, start + stride * size), row * stride * size);
          }
          chunk.setAttribute(name, new THREE.BufferAttribute(attribute, size));
        }
        const indices = new Uint16Array(width * depth * 6);
        let offset = 0;
        for (let row = 0; row < depth; row++) {
          for (let col = 0; col < width; col++) {
            const a = row * stride + col, b = a + 1, c = a + stride, d = c + 1;
            indices[offset++] = a; indices[offset++] = c; indices[offset++] = b;
            indices[offset++] = b; indices[offset++] = c; indices[offset++] = d;
          }
        }
        chunk.setIndex(new THREE.BufferAttribute(indices, 1));
        chunk.computeBoundingSphere();
        const mesh = new THREE.Mesh(chunk, mat);
        mesh.receiveShadow = mesh.castShadow = true;
        this.mesh.add(mesh);
      }
    }
    geo.dispose();

    // Çim shader'ı için yükseklik + yoğunluk dokusu
    const data = new Uint16Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      data[k * 4] = THREE.DataUtils.toHalfFloat(this.heights[k]);
      data[k * 4 + 1] = THREE.DataUtils.toHalfFloat(this.grass[k]);
      data[k * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    this.heightTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
  }

  private sample(arr: Float32Array, x: number, z: number) {
    const fx = clamp((x + WORLD_HALF) / CELL, 0, N - 1.001);
    const fz = clamp((z + WORLD_HALF) / CELL, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const k = j * N + i;
    return lerp(lerp(arr[k], arr[k + 1], tx), lerp(arr[k + N], arr[k + N + 1], tx), tz);
  }

  getHeight(x: number, z: number) { return this.sample(this.heights, x, z); }
  getDirt(x: number, z: number) { return this.sample(this.dirt, x, z); }
  getGrass(x: number, z: number) { return this.sample(this.grass, x, z); }

  /** 0 = düz, 1 = dik */
  getSlope(x: number, z: number) {
    const e = 1.2;
    const dx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const dz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
  }

  /** Yaratıkların ve oyuncunun durabileceği zemin mi? */
  walkable(x: number, z: number) {
    if (Math.abs(x) > WORLD_HALF - 20 || Math.abs(z) > WORLD_HALF - 20) return false;
    return this.getHeight(x, z) > WATER_LEVEL - 1.1 && this.getSlope(x, z) < 0.42;
  }
}
