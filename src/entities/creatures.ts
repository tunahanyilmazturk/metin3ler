import * as THREE from 'three';
import { clamp, damp, makeRng } from '../core/utils';
import { CreatureModel, joint, mat, part } from './model';
import { Humanoid, HumanLook } from './humanoid';
import type { GameTextures } from '../render/textures';

export interface QuadLook {
  color: number;
  dark: number;
  len: number;
  rad: number;
  leg: number;
  head: number;
  snout: number;
  ears: number;
  tail: number;
  tusks?: boolean;
  scale: number;
}

/** Dört ayaklı yaratık (kurt, yaban domuzu, ayı). +Z yönüne bakar. */
export class Quadruped implements CreatureModel {
  root = new THREE.Group();
  height: number;
  private body: THREE.Group;
  private headJ: THREE.Group;
  private tailJ: THREE.Group;
  private legs: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private phase = Math.random() * 6;
  private t = Math.random() * 10;
  private blend = 0;
  private atkT = -1;
  private atkDur = 0.5;
  private flinch = 0;
  private dead = false;
  private deadT = 0;
  private baseY: number;

  constructor(l: QuadLook, tex: GameTextures) {
    const fur = mat(l.color, 0.95, 0, { map: tex.fur.map, normalMap: tex.fur.normalMap, key: 'fur' });
    const dark = mat(l.dark, 0.9, 0, { map: tex.fur.map, key: 'fur' });
    this.root.scale.setScalar(l.scale);
    this.baseY = l.leg + l.rad * 0.55;
    this.height = (this.baseY + l.rad * 1.4) * l.scale;
    this.body = joint(this.root, 0, this.baseY, 0);

    const torso = part(new THREE.CapsuleGeometry(l.rad, l.len, 6, 14), fur, this.body);
    torso.rotation.x = Math.PI / 2;
    // Omuz ve kalça kütlesi
    part(new THREE.SphereGeometry(l.rad * 1.12, 14, 10), fur, this.body, 0, l.rad * 0.06, l.len * 0.36).scale.set(1, 1.05, 1.1);
    part(new THREE.SphereGeometry(l.rad * 1.02, 14, 10), fur, this.body, 0, 0, -l.len * 0.4);

    this.headJ = joint(this.body, 0, l.rad * 0.45, l.len / 2 + l.rad * 0.55);
    part(new THREE.CapsuleGeometry(l.rad * 0.5, l.rad * 0.5, 4, 10), fur, this.headJ, 0, -l.head * 0.1, -l.rad * 0.35).rotation.x = 1.1;
    part(new THREE.SphereGeometry(l.head, 14, 10), fur, this.headJ, 0, 0.02, l.head * 0.5).scale.set(1, 0.92, 1.1);
    const sn = part(new THREE.CylinderGeometry(l.head * 0.34, l.head * 0.62, l.snout, 10), fur, this.headJ, 0, -l.head * 0.18, l.head * 1.2 + l.snout * 0.3);
    sn.rotation.x = Math.PI / 2;
    part(new THREE.SphereGeometry(l.head * 0.2, 8, 6), mat(0x0e0b0a, 0.4), this.headJ, 0, -l.head * 0.12, l.head * 1.2 + l.snout * 0.8, false);
    const eye = mat(0x000000, 0.3, 0, { emissive: 0xffb030, emissiveIntensity: 1.5 });
    for (const sx of [-1, 1]) {
      part(new THREE.SphereGeometry(l.head * 0.1, 8, 6), eye, this.headJ, sx * l.head * 0.5, l.head * 0.22, l.head * 1.08, false);
      const ear = part(new THREE.ConeGeometry(l.head * 0.3, l.ears, 6), dark, this.headJ, sx * l.head * 0.55, l.head * 0.8, l.head * 0.15);
      ear.rotation.z = -sx * 0.25;
      if (l.tusks) {
        const tusk = part(new THREE.ConeGeometry(l.head * 0.1, l.head * 0.7, 6), mat(0xe8e0cc, 0.4), this.headJ, sx * l.head * 0.42, -l.head * 0.2, l.head * 1.25 + l.snout * 0.4, false);
        tusk.rotation.x = -0.5;
        tusk.rotation.z = -sx * 0.4;
      }
    }
    if (l.tusks) {
      // Sırt yelesi
      for (let i = 0; i < 5; i++) part(new THREE.ConeGeometry(l.rad * 0.22, l.rad * 0.6, 5), dark, this.body, 0, l.rad * 1.05, l.len * (0.4 - i * 0.18), false);
    }

    this.tailJ = joint(this.body, 0, l.rad * 0.35, -l.len / 2 - l.rad * 0.7);
    if (l.tail > 0) part(new THREE.CapsuleGeometry(l.rad * 0.24, l.tail, 4, 8), dark, this.tailJ, 0, -l.tail * 0.35, -l.tail * 0.3).rotation.x = -0.8;

    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const leg = joint(this.body, sx * l.rad * 0.62, -l.rad * 0.35, sz * l.len * 0.42);
      part(new THREE.CapsuleGeometry(l.rad * 0.3, l.leg * 0.38, 4, 8), fur, leg, 0, -l.leg * 0.25, 0);
      const knee = joint(leg, 0, -l.leg * 0.5, 0);
      part(new THREE.CapsuleGeometry(l.rad * 0.2, l.leg * 0.34, 4, 8), dark, knee, 0, -l.leg * 0.25, 0);
      part(new THREE.SphereGeometry(l.rad * 0.26, 8, 6), dark, knee, 0, -l.leg * 0.5, l.rad * 0.1);
      this.legs.push(leg);
      this.knees.push(knee);
    }
  }

  attack(duration: number) { this.atkT = 0; this.atkDur = duration; }
  hit() { this.flinch = 1; }
  die() { this.dead = true; this.deadT = 0; this.atkT = -1; }
  revive() {
    this.dead = false;
    this.root.rotation.z = 0;
    this.body.position.y = this.baseY;
  }

  update(dt: number, speed: number) {
    this.t += dt;
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const k = 1 - (1 - this.deadT) * (1 - this.deadT);
      this.root.rotation.z = k * 1.45;
      this.body.position.y = this.baseY * (1 - k * 0.45);
      return;
    }
    const moving = speed > 0.2;
    this.blend = damp(this.blend, moving ? 1 : 0, 10, dt);
    if (moving) this.phase += dt * (5 + speed * 1.6);
    const run = clamp(speed / 6, 0.3, 1.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const A = 0.75 * run * this.blend;
    // Çapraz bacaklar birlikte hareket eder (tırıs)
    const sw = [s, -s, -s, s], cw = [c, -c, -c, c];
    for (let i = 0; i < 4; i++) {
      this.legs[i].rotation.x = -sw[i] * A;
      this.knees[i].rotation.x = Math.max(0, cw[i]) * 0.9 * this.blend * run;
    }
    let pitch = 0, lunge = 0, headX = Math.sin(this.t * 1.3) * 0.06;
    if (this.atkT >= 0) {
      this.atkT += dt / this.atkDur;
      if (this.atkT >= 1) this.atkT = -1;
      else {
        const k = Math.sin(this.atkT * Math.PI);
        pitch = -k * 0.3;
        lunge = k * 0.55;
        headX = -k * 0.5 + (this.atkT > 0.4 ? 0.5 * k : 0);
      }
    }
    if (this.flinch > 0.01) {
      pitch += this.flinch * 0.15;
      this.flinch *= Math.exp(-9 * dt);
    }
    this.body.rotation.x = pitch;
    this.body.position.z = lunge;
    this.body.position.y = this.baseY + Math.abs(s) * 0.05 * this.blend;
    this.headJ.rotation.x = headX;
    this.tailJ.rotation.y = Math.sin(this.t * (moving ? 9 : 2.5)) * 0.35;
  }
}

/** Lanetli Taş: parlayan damarlı sivri kaya kümesi. */
export class StoneModel implements CreatureModel {
  root = new THREE.Group();
  height = 4.2;
  private shake = 0;
  private t = Math.random() * 10;
  private dead = false;
  private deadT = 0;
  private material: THREE.MeshStandardMaterial;

  constructor(color: number, tex: GameTextures, scale: number) {
    this.material = new THREE.MeshStandardMaterial({
      map: tex.rock.map, normalMap: tex.rock.normalMap, color: 0x3a3440, roughness: 0.7, metalness: 0.2,
      emissive: color, emissiveMap: tex.veins.map, emissiveIntensity: 3,
    });
    const rng = makeRng(Math.floor(Math.random() * 1e6));
    const shards = 7;
    for (let i = 0; i < shards; i++) {
      const main = i === 0;
      const h = main ? 4.4 : 1.4 + rng() * 2.2;
      const r = main ? 0.95 : 0.4 + rng() * 0.4;
      const geo = new THREE.ConeGeometry(r, h, 5, 3);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        const j = Math.sin(y * 7 + k) * 0.12 * r;
        p.setX(k, p.getX(k) + j);
        p.setZ(k, p.getZ(k) - j);
      }
      geo.computeVertexNormals();
      const m = part(geo, this.material, this.root);
      const a = (i / (shards - 1)) * Math.PI * 2;
      const d = main ? 0 : 0.8 + rng() * 0.6;
      m.position.set(Math.cos(a) * d, h / 2 - 0.3, Math.sin(a) * d);
      m.rotation.set(main ? 0 : Math.sin(a) * 0.5, rng() * 6, main ? 0 : -Math.cos(a) * 0.5);
      m.receiveShadow = true;
    }
    this.root.scale.setScalar(scale);
    this.height = 4.2 * scale;
  }

  attack() {}
  hit() { this.shake = 1; }
  die() { this.dead = true; this.deadT = 0; }
  revive() { this.dead = false; this.root.scale.y = this.root.scale.x; }

  update(dt: number) {
    this.t += dt;
    this.material.emissiveIntensity = 2.6 + Math.sin(this.t * 2.2) * 1.0 + this.shake * 4;
    if (this.dead) {
      this.deadT += dt;
      const k = Math.max(0.02, 1 - this.deadT * 1.6);
      this.root.scale.y = this.root.scale.x * k;
      return;
    }
    if (this.shake > 0.01) {
      this.root.rotation.z = Math.sin(this.t * 70) * 0.035 * this.shake;
      this.root.rotation.x = Math.cos(this.t * 60) * 0.035 * this.shake;
      this.shake *= Math.exp(-7 * dt);
    }
  }
}

const HUMAN_BASE: HumanLook = {
  skin: 0xc79a78, cloth: 0x3a2f2a, armor: 0x5a4a3a, armorMetal: 0, armorRough: 0.8, hair: 0x1a1210,
  weapon: 'sword', helmet: false, scale: 1, bulk: 1,
};

/** Düşman tanımındaki model kimliğinden görsel model üretir. */
export function createEnemyModel(kind: string, tex: GameTextures): CreatureModel {
  switch (kind) {
    case 'wolf':
      return new Quadruped({ color: 0x8a8a8c, dark: 0x4a4a4e, len: 0.95, rad: 0.27, leg: 0.62, head: 0.2, snout: 0.26, ears: 0.2, tail: 0.5, scale: 1 }, tex);
    case 'alpha_wolf':
      return new Quadruped({ color: 0x3c3c44, dark: 0x1c1c22, len: 1.0, rad: 0.3, leg: 0.66, head: 0.22, snout: 0.28, ears: 0.22, tail: 0.55, scale: 1.45 }, tex);
    case 'boar':
      return new Quadruped({ color: 0x6a4a34, dark: 0x33241a, len: 0.9, rad: 0.42, leg: 0.42, head: 0.27, snout: 0.3, ears: 0.14, tail: 0.14, tusks: true, scale: 1.1 }, tex);
    case 'bear':
      return new Quadruped({ color: 0x5a3c26, dark: 0x2e1e14, len: 1.15, rad: 0.55, leg: 0.6, head: 0.32, snout: 0.26, ears: 0.12, tail: 0, scale: 1.45 }, tex);
    case 'bandit':
      return new Humanoid({ ...HUMAN_BASE, cloth: 0x4a2a22, armor: 0x3a3028, weapon: 'axe', scale: 1.02 });
    case 'bandit_chief':
      return new Humanoid({ ...HUMAN_BASE, cloth: 0x5a1616, armor: 0x2a2a30, armorMetal: 0.9, armorRough: 0.4, weapon: 'sword', helmet: true, scale: 1.25, bulk: 1.15 });
    case 'golem':
      return new Humanoid({ ...HUMAN_BASE, skin: 0x9a958c, cloth: 0x8a857c, armor: 0x77736c, armorRough: 0.95, weapon: 'none', scale: 1.7, bulk: 1.55, tex: tex.rock, eyeGlow: 0x4fd0ff });
    case 'ogre':
      return new Humanoid({ ...HUMAN_BASE, skin: 0x5c7048, cloth: 0x3a2a1c, armor: 0x2c2420, armorMetal: 0.6, armorRough: 0.6, weapon: 'club', scale: 2.5, bulk: 1.5, eyeGlow: 0xff3a20 });
    case 'stone_low':
      return new StoneModel(0x9b4dff, tex, 0.85);
    case 'stone_mid':
      return new StoneModel(0xff4a2a, tex, 1.0);
    case 'stone_high':
      return new StoneModel(0x2ad0ff, tex, 1.2);
    default:
      return new Humanoid(HUMAN_BASE);
  }
}

export const NPC_LOOKS: Record<string, HumanLook> = {
  elder: { ...HUMAN_BASE, skin: 0xc9a283, cloth: 0xd8d2c0, armor: 0x7a5a2a, hair: 0xe6e6e6, weapon: 'staff', robe: true, scale: 0.98 },
  merchant: { ...HUMAN_BASE, skin: 0xd2a584, cloth: 0x2f6a52, armor: 0xb5892e, hair: 0x3a2216, weapon: 'none', robe: true, scale: 0.96, bulk: 1.08 },
  smith: { ...HUMAN_BASE, skin: 0xb5835f, cloth: 0x3b2c22, armor: 0x44444a, armorMetal: 0.8, armorRough: 0.5, hair: 0x120d0a, weapon: 'none', scale: 1.08, bulk: 1.22 },
};
