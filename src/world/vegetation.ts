import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, makeRng, nextFrame, smoothstep } from '../core/utils';
import { VILLAGE_R, WORLD_HALF, WORLD_SIZE } from '../data/world';
import type { Colliders } from '../core/colliders';
import type { GameTextures } from '../render/textures';
import type { Terrain } from './terrain';

const GRASS_TILE = 72;
const GRASS_MAX = 120000;

/** Köşe renklerini (sahte ortam gölgesi) ekler ve geometriyi birleştirmeye hazırlar. */
function prep(geo: THREE.BufferGeometry, shade: (x: number, y: number, z: number) => number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const s = shade(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Gürültüyle bozulmuş yumru (yaprak kümesi / kaya). */
function blob(r: number, detail: number, amp: number, noise: Noise, seed: number, sy = 1) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + noise.fbm(x * 0.9 / r + seed, (y + z) * 0.9 / r + seed * 1.7, 3) * amp;
    p.setXYZ(i, x * n, y * n * sy, z * n);
    uv[i * 2] = Math.atan2(z, x) / Math.PI;
    uv[i * 2 + 1] = y / r;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

interface TreeKind {
  trunk: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  leafMat: THREE.Material;
}

/** Çim, ağaç ve kayalar. Çim, oyuncuyu takip eden sarmal bir döşeme olarak çizilir. */
export class Vegetation {
  group = new THREE.Group();
  private grassUniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() } };
  private grassGeo!: THREE.InstancedBufferGeometry;

  constructor(private terrain: Terrain, private tex: GameTextures, private colliders: Colliders) {}

  async build(onProgress: (progress: number) => void = () => {}) {
    await this.buildGrass((progress) => onProgress(progress * 0.25));
    onProgress(0.25);
    await this.buildTrees((progress) => onProgress(0.25 + progress * 0.6));
    onProgress(0.85);
    await this.buildRocks((progress) => onProgress(0.85 + progress * 0.15));
    onProgress(1);
  }

  setGrassDensity(f: number) {
    this.grassGeo.instanceCount = Math.floor(GRASS_MAX * f);
  }

  update(time: number, player: THREE.Vector3) {
    this.grassUniforms.uTime.value = time;
    this.grassUniforms.uPlayer.value.copy(player);
  }

  private async buildGrass(onProgress: (progress: number) => void) {
    // Tek bir yaprak: tabandan uca daralan şerit
    const segs = 4;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = (1 - t * t) * 0.5;
      verts.push(-w, t, 0, w, t, 0);
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    // Normal özniteliği olmazsa Three.js düz gölgelemeye geçer; hepsi yukarı bakar
    const normals = new Float32Array(verts.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(idx);
    const off = new Float32Array(GRASS_MAX * 4);
    const chunkSize = 12000;
    for (let start = 0; start < GRASS_MAX; start += chunkSize) {
      const end = Math.min(GRASS_MAX, start + chunkSize);
      for (let i = start; i < end; i++) {
        off[i * 4] = Math.random() * GRASS_TILE;
        off[i * 4 + 1] = Math.random() * GRASS_TILE;
        off[i * 4 + 2] = Math.random();
        off[i * 4 + 3] = Math.random();
      }
      onProgress(end / GRASS_MAX);
      if (end < GRASS_MAX) await nextFrame();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = GRASS_MAX;
    this.grassGeo = geo;

    const N = this.terrain.res;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.grassUniforms.uTime;
      s.uniforms.uPlayer = this.grassUniforms.uPlayer;
      s.uniforms.uHeight = { value: this.terrain.heightTex };
      s.vertexShader = s.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
          attribute vec4 aOffset;
          uniform float uTime; uniform vec3 uPlayer; uniform sampler2D uHeight;
          varying vec3 vGrassCol;
          float gHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        `)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', /* glsl */ `
          float tile = ${GRASS_TILE.toFixed(1)};
          vec2 base = mod(aOffset.xy - uPlayer.xz, tile) - tile * 0.5 + uPlayer.xz;
          vec2 huv = (base + ${WORLD_HALF.toFixed(1)}) / ${WORLD_SIZE.toFixed(1)} * ${((N - 1) / N).toFixed(6)} + ${(0.5 / N).toFixed(6)};
          vec4 hd = texture2D(uHeight, huv);
          float gd = length(base - uPlayer.xz);
          float fade = 1.0 - smoothstep(tile * 0.34, tile * 0.48, gd);
          float show = step(aOffset.w * 0.9 + 0.08, hd.g) * fade;
          float hgt = (0.2 + aOffset.z * 0.4) * show * (0.6 + hd.g * 0.5);
          float ang = aOffset.w * 91.7;
          float ca = cos(ang), sa = sin(ang);
          float bend = position.y * position.y;
          vec3 local = vec3(position.x * 0.11 * ca * show, position.y * hgt, position.x * 0.11 * sa * show);
          // Rüzgâr: büyük dalgalar + ince titreşim
          float w1 = sin(uTime * 1.3 + base.x * 0.16 + base.y * 0.11);
          float w2 = sin(uTime * 2.9 + base.x * 0.7 - base.y * 0.5 + aOffset.z * 6.0);
          local.x += (w1 * 0.26 + w2 * 0.07 + 0.1) * bend * hgt;
          local.z += (w1 * 0.14 + w2 * 0.07 + (aOffset.z - 0.5) * 0.5) * bend * hgt;
          // Oyuncu çimi yatırır
          vec2 away = base - uPlayer.xz;
          float push = 1.0 - smoothstep(0.3, 1.5, length(away));
          local.xz += normalize(away + 0.0001) * push * 0.45 * bend * show;
          local.y -= push * 0.25 * bend * hgt;
          vec3 transformed = vec3(base.x, hd.r, base.y) + local;
          float clump = gHash(floor(base * 0.35));
          vec3 cBase = vec3(0.03, 0.07, 0.016);
          vec3 cTip = mix(vec3(0.10, 0.185, 0.045), vec3(0.19, 0.21, 0.07), aOffset.z * 0.6 + clump * 0.3);
          vGrassCol = mix(cBase, cTip, position.y) * (0.8 + w1 * 0.08 * position.y);
        `);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassCol;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(vNormal);');
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private treeKinds(tex: GameTextures, noise: Noise): TreeKind[] {
    const kinds: TreeKind[] = [];
    const one = () => 1;

    // Çam: üst üste binen, kenarları düzensiz konik katmanlar
    for (let v = 0; v < 2; v++) {
      const H = 9 + v * 2.5;
      const trunk = new THREE.CylinderGeometry(0.1, 0.34, H * 0.8, 7).translate(0, H * 0.4, 0);
      const layers: THREE.BufferGeometry[] = [];
      const count = 6 + v;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const r = 2.9 - t * 2.3;
        const h = 2.6 - t * 0.6;
        const cone = new THREE.ConeGeometry(r, h, 12, 2, true);
        const p = cone.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
          const rr = Math.hypot(x, z) / r;
          const j = noise.perlin(x * 1.7 + i * 9, z * 1.7 + v * 5) * 0.45 * rr;
          p.setXYZ(k, x * (1 + j), y - rr * rr * 0.5 + j * 0.5, z * (1 + j));
        }
        cone.computeVertexNormals();
        cone.translate(0, H * 0.3 + t * H * 0.66 + h * 0.5, 0);
        layers.push(prep(cone, (x, _y, z) => 0.5 + 0.5 * smoothstep(0.1, 1, Math.hypot(x, z) / r)));
      }
      kinds.push({
        trunk: prep(trunk, one),
        leaves: mergeGeometries(layers)!,
        leafMat: new THREE.MeshStandardMaterial({
          map: tex.pine.map, normalMap: tex.pine.normalMap, roughness: 0.82, vertexColors: true, side: THREE.DoubleSide,
        }),
      });
    }

    // Geniş yapraklı: gövde, dallar ve yumrulu taç
    for (let v = 0; v < 2; v++) {
      const rng = makeRng(77 + v * 13);
      const H = 4.2 + v * 1.2;
      const parts = [prep(new THREE.CylinderGeometry(0.2, 0.42, H, 8).translate(0, H / 2, 0), one)];
      for (let b = 0; b < 3; b++) {
        const br = new THREE.CylinderGeometry(0.07, 0.16, 2.6, 5).translate(0, 1.3, 0);
        br.rotateZ(0.7 + rng() * 0.4).rotateY(b * 2.1 + rng()).translate(0, H * 0.72, 0);
        parts.push(prep(br, one));
      }
      const blobs: THREE.BufferGeometry[] = [];
      const n = 6 + v;
      for (let i = 0; i < n; i++) {
        const r = 1.5 + rng() * 0.9;
        const a = (i / n) * Math.PI * 2;
        const d = i === 0 ? 0 : 1.3 + rng() * 0.9;
        const cy = H + 1.2 + (i === 0 ? 1.4 : rng() * 1.2);
        const g = blob(r, 2, 0.32, noise, i * 3.7 + v * 11, 0.82).translate(Math.cos(a) * d, cy, Math.sin(a) * d);
        blobs.push(prep(g, (_x, y) => 0.45 + 0.55 * smoothstep(cy - r, cy + r * 0.6, y)));
      }
      kinds.push({
        trunk: mergeGeometries(parts)!,
        leaves: mergeGeometries(blobs)!,
        leafMat: new THREE.MeshStandardMaterial({
          map: tex.leaves.map, normalMap: tex.leaves.normalMap, roughness: 0.8, vertexColors: true,
        }),
      });
    }
    // Kamera yaprakların içine girdiğinde görüşü kapatmasın: yakın yapraklar noktalı biçimde saydamlaşır
    for (const k of kinds) {
      k.leafMat.onBeforeCompile = (s) => {
        s.fragmentShader = s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float camD = length(vViewPosition);
          if (camD < 16.0) {
            float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (ign > smoothstep(5.0, 16.0, camD)) discard;
          }`);
      };
    }
    return kinds;
  }

  private async buildTrees(onProgress: (progress: number) => void) {
    const noise = new Noise(555);
    const rng = makeRng(4242);
    const kinds = this.treeKinds(this.tex, noise);
    const barkMat = new THREE.MeshStandardMaterial({ map: this.tex.bark.map, normalMap: this.tex.bark.normalMap, roughness: 0.95, vertexColors: true });
    this.tex.bark.map.repeat.set(2, 3);

    // Kırpma (culling) verimli olsun diye ağaçlar 8x8 parçaya bölünür
    const CH = 8;
    const buckets: THREE.Matrix4[][][] = kinds.map(() => Array.from({ length: CH * CH }, () => []));
    const tints: THREE.Color[][][] = kinds.map(() => Array.from({ length: CH * CH }, () => []));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let placed = 0;
    for (let tries = 0; tries < 26000 && placed < 1500; tries++) {
      if (tries % 1024 === 1023) {
        onProgress((tries + 1) / 26000);
        await nextFrame();
      }
      const x = (rng() * 2 - 1) * (WORLD_HALF - 30);
      const z = (rng() * 2 - 1) * (WORLD_HALF - 30);
      const forest = noise.fbm(x * 0.008 + 3, z * 0.008 + 3, 3) * 0.5 + 0.5;
      if (rng() > smoothstep(0.38, 0.72, forest) * 0.95 + 0.04) continue;
      if (Math.hypot(x, z) < VILLAGE_R + 8) continue;
      const h = this.terrain.getHeight(x, z);
      if (h < 1.2 || h > 52 || this.terrain.getSlope(x, z) > 0.2 || this.terrain.roadDist(x, z) < 6) continue;
      const pineBias = smoothstep(14, 30, h) * 0.7 + 0.25;
      const kind = rng() < pineBias ? (rng() < 0.5 ? 0 : 1) : (rng() < 0.5 ? 2 : 3);
      const sc = 0.75 + rng() * 0.7;
      p.set(x, h - 0.15, z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      s.set(sc, sc * (0.9 + rng() * 0.25), sc);
      const ci = Math.min(CH - 1, Math.floor(((x + WORLD_HALF) / WORLD_SIZE) * CH));
      const cj = Math.min(CH - 1, Math.floor(((z + WORLD_HALF) / WORLD_SIZE) * CH));
      buckets[kind][cj * CH + ci].push(m.compose(p, q, s).clone());
      tints[kind][cj * CH + ci].push(new THREE.Color().setHSL(0.25 + rng() * 0.08, 0.2, 0.78 + rng() * 0.22));
      this.colliders.add(x, z, 0.45 * sc);
      placed++;
    }
    onProgress(1);

    kinds.forEach((kind, k) => {
      buckets[k].forEach((list, c) => {
        if (!list.length) return;
        const trunk = new THREE.InstancedMesh(kind.trunk, barkMat, list.length);
        const leaves = new THREE.InstancedMesh(kind.leaves, kind.leafMat, list.length);
        list.forEach((mat, i) => {
          trunk.setMatrixAt(i, mat);
          leaves.setMatrixAt(i, mat);
          leaves.setColorAt(i, tints[k][c][i]);
        });
        for (const im of [trunk, leaves]) {
          im.castShadow = true;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          this.group.add(im);
        }
      });
    });
  }

  private async buildRocks(onProgress: (progress: number) => void) {
    const noise = new Noise(909);
    const rng = makeRng(31337);
    const mat = new THREE.MeshStandardMaterial({ map: this.tex.rock.map, normalMap: this.tex.rock.normalMap, roughness: 0.92 });
    const variants = [0, 1, 2].map((v) => blob(1, 2, 0.45, noise, v * 17.3, 0.7));
    // Kayalar da kırpma için 8x8 görünürlük hücrelerine bölünür
    const CH = 8;
    const lists = variants.map(() => Array.from({ length: CH * CH }, (): THREE.Matrix4[] => []));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const e = new THREE.Euler();
    let placed = 0;
    for (let tries = 0; tries < 6000 && placed < 420; tries++) {
      if (tries % 512 === 511) {
        onProgress((tries + 1) / 6000);
        await nextFrame();
      }
      const x = (rng() * 2 - 1) * (WORLD_HALF - 25);
      const z = (rng() * 2 - 1) * (WORLD_HALF - 25);
      if (Math.hypot(x, z) < VILLAGE_R + 6 || this.terrain.roadDist(x, z) < 5) continue;
      const h = this.terrain.getHeight(x, z);
      if (h < -0.5) continue;
      const big = rng() < 0.22;
      const sc = big ? 1.8 + rng() * 2.6 : 0.35 + rng() * 0.9;
      p.set(x, h - sc * 0.15, z);
      q.setFromEuler(e.set(rng() * 0.5, rng() * 6.28, rng() * 0.5));
      s.set(sc * (0.8 + rng() * 0.6), sc * (0.6 + rng() * 0.6), sc * (0.8 + rng() * 0.6));
      const cx = Math.floor(((x + WORLD_HALF) / WORLD_SIZE) * CH), cz = Math.floor(((z + WORLD_HALF) / WORLD_SIZE) * CH);
      lists[placed % 3][cz * CH + cx].push(m.compose(p, q, s).clone());
      if (sc > 1) this.colliders.add(x, z, sc * 0.85);
      placed++;
    }
    onProgress(1);
    lists.forEach((buckets, v) => {
      buckets.forEach((list) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(variants[v], mat, list.length);
        list.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
      });
    });
  }
}
