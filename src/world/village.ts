import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/utils';
import { VILLAGE_H, VILLAGE_R } from '../data/world';
import type { Colliders } from '../core/colliders';
import type { GameTextures } from '../render/textures';
import type { Terrain } from './terrain';

/** Başlangıç köyü: evler, sur, kapılar, pazar, demirci ocağı, fenerler ve kamp ateşi. */
export class Village {
  group = new THREE.Group();
  firePos = new THREE.Vector3(-6, VILLAGE_H, -10);
  forgePos = new THREE.Vector3(21, VILLAGE_H + 1.1, -9);
  private windowMat: THREE.MeshStandardMaterial;
  private lampMat: THREE.MeshStandardMaterial;
  private lamps: THREE.PointLight[] = [];
  private fireLight: THREE.PointLight;
  private m: Record<string, THREE.MeshStandardMaterial>;

  constructor(private terrain: Terrain, tex: GameTextures, private colliders: Colliders) {
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    tex.roof.map.repeat.set(0.35, 0.35);
    tex.roof.normalMap.repeat.set(0.35, 0.35);
    this.m = {
      plaster: std({ map: tex.plaster.map, normalMap: tex.plaster.normalMap, roughness: 0.9 }),
      wood: std({ map: tex.wood.map, normalMap: tex.wood.normalMap, roughness: 0.8 }),
      darkWood: std({ map: tex.wood.map, normalMap: tex.wood.normalMap, roughness: 0.8, color: 0x6b5140 }),
      roof: std({ map: tex.roof.map, normalMap: tex.roof.normalMap, roughness: 0.55, metalness: 0.1 }),
      stone: std({ map: tex.stone.map, normalMap: tex.stone.normalMap, roughness: 0.9 }),
      iron: std({ color: 0x2c2c30, roughness: 0.45, metalness: 0.9 }),
      gold: std({ color: 0xd9a441, roughness: 0.3, metalness: 1 }),
      red: std({ map: tex.cloth.map, color: 0x9c1f1f, roughness: 0.85, side: THREE.DoubleSide }),
      blue: std({ map: tex.cloth.map, color: 0x25508f, roughness: 0.85, side: THREE.DoubleSide }),
      ochre: std({ map: tex.cloth.map, color: 0xb5892e, roughness: 0.85, side: THREE.DoubleSide }),
      coal: std({ color: 0x1a0a05, emissive: 0xff4a10, emissiveIntensity: 2.5, roughness: 1 }),
    };
    this.windowMat = std({ color: 0x1a140c, emissive: 0xffb45e, emissiveIntensity: 0, roughness: 0.4 });
    this.lampMat = std({ color: 0x3a2a14, emissive: 0xffa040, emissiveIntensity: 0.2, roughness: 0.5 });

    this.group.position.y = VILLAGE_H;
    this.buildHouses();
    this.buildPalisade(tex);
    this.buildCenter();
    this.buildMarket();
    this.buildForge();
    this.buildLamps();

    this.fireLight = new THREE.PointLight(0xff8a3c, 0, 26, 1.6);
    this.fireLight.position.copy(this.firePos).add(new THREE.Vector3(0, 1.2 - VILLAGE_H, 0));
    this.group.add(this.fireLight);
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private cyl(rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group, seg = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Saçakları yukarı kıvrılan çatı kesiti. */
  private roofGeo(w: number, d: number, rise: number) {
    const hw = w / 2 + 1.2;
    const s = new THREE.Shape();
    s.moveTo(-hw, 0.35);
    s.quadraticCurveTo(-hw * 0.45, 0.05, 0, rise);
    s.quadraticCurveTo(hw * 0.45, 0.05, hw, 0.35);
    s.lineTo(hw, 0.1);
    s.quadraticCurveTo(hw * 0.45, -0.25, 0, -0.1);
    s.quadraticCurveTo(-hw * 0.45, -0.25, -hw, 0.1);
    const geo = new THREE.ExtrudeGeometry(s, { depth: d + 2, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -(d + 2) / 2);
    return geo;
  }

  private house(x: number, z: number, yaw: number, w: number, d: number, h: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.group.add(g);
    const m = this.m;
    this.box(w + 0.5, 0.7, d + 0.5, m.stone, 0, 0.35, 0, g);
    this.box(w, h, d, m.plaster, 0, 0.7 + h / 2, 0, g);
    // Ahşap karkas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.32, h, 0.32, m.darkWood, sx * w / 2, 0.7 + h / 2, sz * d / 2, g);
    for (const sz of [-1, 1]) {
      this.box(w + 0.3, 0.26, 0.3, m.darkWood, 0, 0.7 + h, sz * d / 2, g);
      this.box(w + 0.3, 0.2, 0.3, m.darkWood, 0, 0.7 + h * 0.45, sz * d / 2, g);
    }
    for (const sx of [-1, 1]) this.box(0.3, 0.26, d + 0.3, m.darkWood, sx * w / 2, 0.7 + h, 0, g);
    // Çatı + üçgen alın duvarı
    const rise = h * 0.7;
    const roof = new THREE.Mesh(this.roofGeo(w, d, rise), m.roof);
    roof.position.y = 0.7 + h + 0.05;
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    const gable = new THREE.Shape();
    gable.moveTo(-w / 2, 0); gable.lineTo(0, rise * 0.82); gable.lineTo(w / 2, 0);
    for (const sz of [-1, 1]) {
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), m.plaster);
      gm.position.set(0, 0.7 + h, sz * (d / 2 - 0.02));
      if (sz < 0) gm.rotation.y = Math.PI;
      g.add(gm);
    }
    this.box(0.3, 0.3, d + 2.3, m.darkWood, 0, 0.7 + h + rise + 0.05, 0, g);
    // Kapı ve pencereler (ön yüz +x)
    this.box(0.14, 2.2, 1.3, m.wood, w / 2 + 0.04, 0.7 + 1.1, 0, g);
    this.box(0.2, 0.2, 1.7, m.darkWood, w / 2 + 0.06, 0.7 + 2.3, 0, g);
    for (const sz of [-1, 1]) {
      this.box(0.12, 0.9, 0.9, this.windowMat, w / 2 + 0.03, 0.7 + h * 0.58, sz * d * 0.3, g);
      this.box(0.16, 0.08, 1.1, m.darkWood, w / 2 + 0.06, 0.7 + h * 0.58, sz * d * 0.3, g);
      this.box(0.16, 1.1, 0.08, m.darkWood, w / 2 + 0.06, 0.7 + h * 0.58, sz * d * 0.3, g);
    }
    for (const sx of [-1, 1]) this.box(0.9, 0.9, 0.12, this.windowMat, sx * w * 0.22, 0.7 + h * 0.58, d / 2 + 0.03, g);

    // Çarpışma: ev ayak izini dairelerle yaklaşıkla
    const r = Math.min(w, d) / 2 + 0.3;
    const long = Math.max(w, d) / 2 - r + 0.3;
    const steps = Math.max(1, Math.ceil(long / r));
    for (let i = -steps; i <= steps; i++) {
      const o = (i / steps) * long;
      const lx = w > d ? o : 0, lz = w > d ? 0 : o;
      this.colliders.add(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw), r);
    }
  }

  private buildHouses() {
    const rng = makeRng(88);
    const angles = [0.5, 1.25, 2.0, 2.75, 3.9, 4.6, 5.5];
    for (const a of angles) {
      const r = 34 + rng() * 8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Kapı (+x yüzü) köy merkezine baksın
      this.house(x, z, Math.atan2(z, -x), 6 + rng() * 2, 8 + rng() * 3.5, 3.2 + rng() * 0.8);
    }
  }

  private buildPalisade(tex: GameTextures) {
    const log = mergeGeometries([
      new THREE.CylinderGeometry(0.3, 0.34, 4.4, 7).translate(0, 2.2, 0),
      new THREE.ConeGeometry(0.3, 0.7, 7).translate(0, 4.75, 0),
    ])!;
    const mat = new THREE.MeshStandardMaterial({ map: tex.bark.map, normalMap: tex.bark.normalMap, roughness: 0.9, color: 0xb09a80 });
    const R = VILLAGE_R - 2;
    const n = Math.floor((Math.PI * 2 * R) / 0.62);
    const mats: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const gateHalf = 0.13; // radyan
    // Kapılar yolların köyden çıktığı yönlere bakar
    const gates = [-Math.PI / 2, Math.atan2(-30, -80), Math.atan2(60, 70), Math.atan2(70, -60)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI;
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateHalf)) continue;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const y = this.terrain.getHeight(x, z) - VILLAGE_H - 0.4;
      p.set(x, y, z);
      q.setFromAxisAngle(up, i * 1.3);
      const sc = 0.9 + ((i * 7) % 5) * 0.05;
      s.set(1, sc, 1);
      mats.push(m.compose(p, q, s).clone());
      if (i % 2 === 0) this.colliders.add(x, z, 0.75);
    }
    const im = new THREE.InstancedMesh(log, mat, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = im.receiveShadow = true;
    this.group.add(im);

    // Kapı kuleleri ve sancaklar
    for (const g of gates) {
      const gg = new THREE.Group();
      gg.position.set(Math.cos(g) * R, 0, Math.sin(g) * R);
      gg.rotation.y = -g;
      this.group.add(gg);
      for (const side of [-1, 1]) {
        const zz = side * (R * gateHalf + 0.7);
        this.cyl(0.5, 0.58, 7, this.m.darkWood, 0, 3.5, zz, gg, 9);
        this.box(0.08, 2.6, 1.1, side > 0 ? this.m.red : this.m.ochre, 0.62, 5.0, zz, gg);
        this.colliders.add(Math.cos(g) * R - Math.sin(g) * zz, Math.sin(g) * R + Math.cos(g) * zz, 0.9);
      }
      this.box(0.7, 0.6, R * gateHalf * 2 + 3, this.m.darkWood, 0, 6.7, 0, gg);
      const roof = new THREE.Mesh(this.roofGeo(2.2, R * gateHalf * 2 + 2.4, 1.5), this.m.roof);
      roof.position.y = 7.05;
      roof.castShadow = true;
      gg.add(roof);
    }
  }

  private buildCenter() {
    const m = this.m;
    // Basamaklı taş kaide üzerinde altın başlıklı anıt
    this.cyl(5, 5.3, 0.4, m.stone, 0, 0.2, 0, this.group, 28);
    this.cyl(3.6, 3.8, 0.4, m.stone, 0, 0.6, 0, this.group, 28);
    this.cyl(1.0, 1.5, 1.4, m.stone, 0, 1.5, 0, this.group, 8);
    this.cyl(0.55, 0.95, 5.5, m.stone, 0, 4.9, 0, this.group, 4).rotation.y = Math.PI / 4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.2, 4), m.gold);
    cap.position.y = 8.25;
    cap.rotation.y = Math.PI / 4;
    cap.castShadow = true;
    this.group.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 8, 32), m.gold);
    ring.position.y = 2.25;
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    this.colliders.add(0, 0, 3.9);

    // Kamp ateşi
    const fx = this.firePos.x, fz = this.firePos.z;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), m.stone);
      st.position.set(fx + Math.cos(a) * 1.0, 0.14, fz + Math.sin(a) * 1.0);
      st.castShadow = true;
      this.group.add(st);
    }
    for (let i = 0; i < 4; i++) {
      const lg = this.cyl(0.1, 0.12, 1.5, m.darkWood, fx, 0.4, fz, this.group, 6);
      lg.rotation.set(0.9, (i / 4) * Math.PI * 2, 0, 'YXZ');
    }
    this.cyl(0.55, 0.55, 0.1, m.coal, fx, 0.08, fz, this.group, 12).castShadow = false;
    this.colliders.add(fx, fz, 1.1);
    // Ateş başı oturma kütükleri
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 1.5;
      const b = this.cyl(0.3, 0.3, 2.4, m.wood, fx + Math.cos(a) * 3, 0.3, fz + Math.sin(a) * 3, this.group, 8);
      b.rotation.set(Math.PI / 2, 0, a, 'YXZ');
      b.rotation.y = -a + Math.PI / 2;
    }
  }

  private stall(x: number, z: number, yaw: number, cloth: THREE.Material) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.group.add(g);
    const m = this.m;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cyl(0.08, 0.08, sz > 0 ? 2.6 : 3.1, m.darkWood, sx * 1.9, (sz > 0 ? 2.6 : 3.1) / 2, sz * 1.1, g, 6);
    const top = this.box(4.4, 0.06, 2.9, cloth, 0, 2.9, 0, g);
    top.rotation.x = 0.22;
    this.box(3.8, 0.12, 1.4, m.wood, 0, 1.0, 0.4, g);
    for (const sx of [-1, 1]) this.box(0.12, 1.0, 1.3, m.darkWood, sx * 1.7, 0.5, 0.4, g);
    const rng = makeRng(Math.floor(x * 31 + z * 17));
    const wares = [m.gold, m.red, m.blue, m.iron, m.ochre];
    for (let i = 0; i < 7; i++) {
      const w = rng() < 0.5
        ? new THREE.Mesh(new THREE.SphereGeometry(0.14 + rng() * 0.08, 10, 8), wares[i % 5])
        : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2 + rng() * 0.2, 0.3), wares[i % 5]);
      w.position.set(-1.5 + i * 0.5, 1.2, 0.2 + rng() * 0.5);
      w.castShadow = true;
      g.add(w);
    }
    this.colliders.add(x, z, 1.9);
  }

  private buildMarket() {
    this.stall(-21, 3, Math.PI / 2, this.m.red);
    this.stall(-20, 10, Math.PI / 2 + 0.3, this.m.blue);
    this.stall(-20, -4.5, Math.PI / 2 - 0.3, this.m.ochre);
    // Fıçı ve sandıklar
    const rng = makeRng(5);
    for (let i = 0; i < 8; i++) {
      const x = -24 + rng() * 6, z = -12 + rng() * 26;
      if (rng() < 0.5) this.cyl(0.42, 0.36, 1.0, this.m.wood, x, 0.5, z, this.group, 10);
      else this.box(0.9, 0.7, 0.9, this.m.wood, x, 0.35, z).rotation.y = rng();
      this.colliders.add(x, z, 0.6);
    }
  }

  private buildForge() {
    const m = this.m;
    const fx = this.forgePos.x, fz = this.forgePos.z;
    this.box(2.6, 1.0, 2.2, m.stone, fx, 0.5, fz);
    this.box(1.8, 0.14, 1.4, m.coal, fx, 1.03, fz).castShadow = false;
    this.box(1.2, 3.2, 1.0, m.stone, fx + 1.0, 2.6, fz);
    this.colliders.add(fx, fz, 1.9);
    // Örs
    const ax = fx - 3.2, az = fz + 1.5;
    this.cyl(0.4, 0.45, 0.7, m.wood, ax, 0.35, az, this.group, 10);
    this.box(0.9, 0.22, 0.4, m.iron, ax, 0.95, az);
    this.box(0.5, 0.2, 0.3, m.iron, ax, 0.78, az);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8), m.iron);
    horn.rotation.z = -Math.PI / 2;
    horn.position.set(ax + 0.68, 0.96, az);
    this.group.add(horn);
    this.colliders.add(ax, az, 0.7);
    // Sundurma
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cyl(0.14, 0.14, 3.6, m.darkWood, fx - 1.2 + sx * 3.3, 1.8, fz + sz * 2.8, this.group, 6);
    const roof = new THREE.Mesh(this.roofGeo(6.4, 5.4, 1.4), m.roof);
    roof.position.set(fx - 1.2, 3.6, fz);
    roof.castShadow = true;
    this.group.add(roof);
    // Silah askısı
    this.box(2.2, 0.1, 0.1, m.darkWood, fx - 2, 1.5, fz - 2.6);
    for (let i = 0; i < 4; i++) this.box(0.07, 1.2, 0.02, m.iron, fx - 2.8 + i * 0.5, 0.95, fz - 2.6).rotation.z = 0.05 * (i - 2);
  }

  private buildLamps() {
    const spots: [number, number][] = [[9, 12], [-10, 12], [11, -13], [-13, -5], [0, 30], [0, -30], [30, 0], [-30, 0]];
    spots.forEach(([x, z], i) => {
      this.cyl(0.09, 0.12, 3.4, this.m.darkWood, x, 1.7, z, this.group, 6);
      this.box(0.9, 0.1, 0.1, this.m.darkWood, x + 0.35, 3.3, z);
      this.box(0.36, 0.5, 0.36, this.lampMat, x + 0.7, 2.9, z).castShadow = false;
      this.box(0.46, 0.06, 0.46, this.m.iron, x + 0.7, 3.18, z);
      if (i < 4) {
        const l = new THREE.PointLight(0xffa24a, 0, 24, 1.7);
        l.position.set(x + 0.7, 2.8, z);
        this.group.add(l);
        this.lamps.push(l);
      }
      this.colliders.add(x, z, 0.3);
    });
  }

  /** Gece olunca pencereler ve fenerler yanar. */
  update(time: number, day: number) {
    const night = 1 - day;
    this.windowMat.emissiveIntensity = night * 2.2;
    this.lampMat.emissiveIntensity = 0.15 + night * 5;
    for (const l of this.lamps) l.intensity = night * 170;
    const flick = 0.8 + Math.sin(time * 11) * 0.1 + Math.sin(time * 23.7) * 0.1;
    this.fireLight.intensity = (18 + night * 60) * flick;
  }
}
