import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/utils';
import { CreatureModel, joint, mat, part } from './model';
import type { TexPair } from '../render/textures';
import type { ClassId } from '../data/classes';
import { PlayerOutfit } from './playerOutfit';

export type WeaponKind = 'sword' | 'staff' | 'axe' | 'club' | 'spear' | 'none';

export interface HumanLook {
  skin: number;
  cloth: number;
  armor: number;
  armorMetal: number;
  armorRough: number;
  hair: number;
  weapon: WeaponKind;
  weaponColor?: number;
  /** Silah modelinin büyüklüğü (çift el silahlar için). */
  weaponScale?: number;
  /** Çift el silah: sol el silahın alt kısmını tutar. */
  twoHanded?: boolean;
  /** Silah parıltısı (yüksek artı seviyeleri) */
  glow?: number;
  helmet: boolean;
  helmetColor?: number;
  helmetMetal?: number;
  helmetRough?: number;
  bootsColor?: number;
  bootsMetal?: number;
  necklaceColor?: number;
  ringColor?: number;
  robe?: boolean;
  scale: number;
  bulk: number;
  /** Tüm gövdeye uygulanacak doku (ör. taş golem) */
  tex?: TexPair;
  eyeGlow?: number;
  playerStyle?: ClassId;
}

// Saldırı anahtar kareleri: [t, sağKolX, sağKolZ, dirsek, gövdeY, gövdeX, hamle]
const ATTACKS: number[][][] = [
  [[0, -0.15, 0.08, -0.25, 0, 0, 0], [0.2, -1.55, -0.58, -0.9, -0.42, -0.16, -0.06], [0.43, -0.45, 0.88, -0.2, 0.48, 0.18, 0.12], [0.62, -0.75, 0.48, -0.16, 0.3, 0.1, 0.06], [0.82, -0.6, -0.1, -0.25, 0.05, 0.02, 0], [1, -0.15, 0.08, -0.25, 0, 0, 0]],
  [[0, -0.15, 0.08, -0.25, 0, 0, 0], [0.18, -1.45, 0.86, -0.92, 0.48, -0.1, -0.04], [0.42, -0.52, -0.82, -0.18, -0.62, 0.17, 0.1], [0.62, -0.72, -0.6, -0.14, -0.4, 0.1, 0.05], [0.84, -0.55, 0.1, -0.25, -0.04, 0.02, 0], [1, -0.15, 0.08, -0.25, 0, 0, 0]],
  [[0, -0.15, 0.08, -0.25, 0, 0, 0], [0.28, -2.65, -0.12, -1.2, -0.18, -0.22, -0.1], [0.48, -0.05, 0.2, -0.12, 0.08, 0.38, 0.16], [0.68, 0.2, 0.46, -0.06, 0.06, 0.22, 0.06], [0.85, -0.2, 0.14, -0.3, 0, 0.04, 0], [1, -0.15, 0.08, -0.25, 0, 0, 0]],
  // 3: büyü hazırlığı, odaklanma ve bırakış
  [[0, -0.15, 0.08, -0.25, 0, 0, 0], [0.18, -1.45, -0.3, -0.8, -0.32, -0.12, -0.04], [0.4, -1.25, 0.12, -0.2, 0.15, 0.06, 0], [0.7, -1.35, 0.08, -0.2, 0.1, 0.04, 0], [0.86, -0.75, 0, -0.3, 0.04, 0, 0], [1, -0.15, 0.08, -0.25, 0, 0, 0]],
];

const pose = [0, 0, 0, 0, 0, 0];
function sampleKeys(keys: number[][], t: number) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      let k = (t - a[0]) / (b[0] - a[0]);
      k = k * k * (3 - 2 * k);
      for (let j = 0; j < 6; j++) pose[j] = lerp(a[j + 1], b[j + 1], k);
      return;
    }
  }
  for (let j = 0; j < 6; j++) pose[j] = keys[keys.length - 1][j + 1];
}

/** Eklemli, zırhlı insansı model. Karakter +Z yönüne bakar. */
export class Humanoid implements CreatureModel {
  root = new THREE.Group();
  height: number;
  private body: THREE.Group;
  private hips: THREE.Group;
  private spine: THREE.Group;
  private head: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;
  private elbowL: THREE.Group; private elbowR: THREE.Group;
  private legL: THREE.Group; private legR: THREE.Group;
  private kneeL: THREE.Group; private kneeR: THREE.Group;
  private phase = 0;
  private t = Math.random() * 10;
  private moveBlend = 0;
  private atkT = -1;
  private atkDur = 0.5;
  private atkIdx = 0;
  private flinch = 0;
  private twoHanded = false;
  private dead = false;
  private deadT = 0;
  private weaponKind: WeaponKind;
  private outfit?: PlayerOutfit;
  /** Binek üstündeyken bacaklar eyer pozu alır. */
  riding = false;

  constructor(look: HumanLook) {
    this.twoHanded = !!look.twoHanded;
    this.weaponKind = look.weapon;
    const b = look.bulk;
    const tx = look.tex ? { map: look.tex.map, normalMap: look.tex.normalMap, key: 'tex' } : {};
    const skin = mat(look.skin, look.tex ? 0.9 : 0.62, 0, tx);
    const cloth = mat(look.cloth, 0.88, 0, tx);
    const armor = mat(look.armor, look.armorRough, look.armorMetal, tx);
    if (look.playerStyle) this.outfit = new PlayerOutfit(look.playerStyle, armor);
    const leather = mat(look.tex ? look.cloth : 0x2a1c12, 0.8, 0, tx);
    const gold = mat(0xd4a03c, 0.32, 1);
    const boots = look.bootsColor === undefined
      ? leather
      : mat(look.bootsColor, 0.48, look.bootsMetal ?? 0.3);

    this.root.scale.setScalar(look.scale);
    this.height = 1.9 * look.scale;
    this.body = joint(this.root);
    this.hips = joint(this.body, 0, 0.96, 0);

    part(new THREE.CapsuleGeometry(0.125 * b, 0.16, 4, 10), cloth, this.hips, 0, 0, 0).rotation.z = Math.PI / 2;
    const skirtLen = this.outfit ? 0.24 : look.robe ? 0.78 : 0.4;
    const skirtHem = this.outfit ? 0.234 : look.robe ? 0.34 : 0.27;
    part(new THREE.CylinderGeometry(0.19 * b, skirtHem * b, skirtLen, 14, 1, true), mat(look.cloth, 0.88, 0, { ...tx, key: look.tex ? 'texds' : 'ds' }), this.hips, 0, -skirtLen / 2 + 0.06, 0).material.side = THREE.DoubleSide;

    const mkLeg = (sx: number) => {
      const leg = joint(this.hips, sx * 0.1 * b, -0.05, 0);
      part(new THREE.CapsuleGeometry(0.085 * b, 0.3, 4, 10), cloth, leg, 0, -0.22, 0);
      const knee = joint(leg, 0, -0.44, 0);
      part(new THREE.CapsuleGeometry(0.072 * b, 0.28, 4, 10), leather, knee, 0, -0.2, 0);
      if (this.outfit) {
        part(new THREE.CylinderGeometry(0.083 * b, 0.07 * b, 0.22, 10), boots, knee, 0, -0.29, 0);
      }
      const boot = part(new THREE.BoxGeometry(0.115 * b, 0.09, 0.27), boots, knee, 0, -0.42, 0.06);
      boot.rotation.x = -0.08;
      if ((look.bootsMetal ?? 0) > 0.65) {
        part(new THREE.BoxGeometry(0.12 * b, 0.035, 0.025), gold, knee, 0, -0.38, 0.2, false);
      }
      if (look.armorMetal > 0.3) part(new THREE.CapsuleGeometry(0.078 * b, 0.14, 4, 10), armor, knee, 0, -0.16, 0.012);
      return [leg, knee] as const;
    };
    [this.legL, this.kneeL] = mkLeg(1);
    [this.legR, this.kneeR] = mkLeg(-1);

    this.spine = joint(this.hips, 0, 0.1, 0);
    const torso = part(new THREE.CapsuleGeometry(0.168 * b, 0.3, 6, 14), cloth, this.spine, 0, 0.25, 0);
    torso.scale.z = 0.72;
    const chest = part(new THREE.CapsuleGeometry(0.186 * b, 0.19, 6, 14), armor, this.spine, 0, 0.33, 0);
    chest.scale.z = 0.78;
    const belt = part(new THREE.CylinderGeometry(0.18 * b, 0.185 * b, 0.085, 14), leather, this.spine, 0, 0.03, 0);
    belt.scale.z = 0.76;
    part(new THREE.BoxGeometry(0.09, 0.07, 0.03), gold, this.spine, 0, 0.03, 0.14 * b);
    if (look.armorMetal > 0.3) {
      // Zırh etekliği (tasetler)
      for (const sx of this.outfit ? [-1, 1] : [-1, 0, 1]) {
        const t = part(new THREE.BoxGeometry(0.15 * b, 0.26, 0.03), armor, this.hips, sx * 0.15 * b, -0.12, 0.15 * b);
        t.rotation.x = -0.18;
        t.rotation.y = sx * 0.5;
      }
    }
    this.outfit?.addTorso(this.spine, this.hips, b);

    this.head = joint(this.spine, 0, 0.6, 0);
    part(new THREE.CylinderGeometry(0.052 * b, 0.065 * b, 0.12, 10), skin, this.head, 0, 0, 0);
    if (look.necklaceColor !== undefined) {
      const necklace = mat(look.necklaceColor, 0.32, 0.72);
      const chain = part(new THREE.TorusGeometry(0.073, 0.009, 6, 22), necklace, this.head, 0, -0.025, 0);
      chain.rotation.x = Math.PI / 2;
      part(new THREE.OctahedronGeometry(0.027, 0), necklace, this.head, 0, -0.085, 0.055, false);
    }
    const skull = part(new THREE.SphereGeometry(0.12, 20, 16), skin, this.head, 0, 0.16, 0);
    skull.scale.set(0.9, 1.06, 0.98);
    const eyeMat = look.eyeGlow !== undefined ? mat(0x000000, 1, 0, { emissive: look.eyeGlow, emissiveIntensity: 4 }) : mat(0x120c08, 0.3);
    for (const sx of [-1, 1]) part(new THREE.SphereGeometry(look.eyeGlow !== undefined ? 0.024 : 0.016, 8, 6), eyeMat, this.head, sx * 0.045, 0.175, 0.105, false);
    if (!look.tex) part(new THREE.BoxGeometry(0.03, 0.045, 0.03), skin, this.head, 0, 0.145, 0.115, false);
    if (look.helmet) {
      const helmet = mat(look.helmetColor ?? look.armor, look.helmetRough ?? look.armorRough, look.helmetMetal ?? look.armorMetal);
      const helm = part(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), helmet, this.head, 0, 0.175, 0);
      helm.scale.set(0.98, 1.05, 1.05);
      const trim = look.helmetMetal !== undefined && look.helmetMetal < 0.2
        ? mat(0xc89152, 0.68, 0.12)
        : gold;
      part(new THREE.ConeGeometry(0.03, 0.16, 8), trim, this.head, 0, 0.38, 0);
      part(new THREE.TorusGeometry(0.132, 0.014, 6, 24), trim, this.head, 0, 0.19, 0).rotation.x = Math.PI / 2;
      const guard = part(new THREE.CylinderGeometry(0.145, 0.175, 0.14, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8), helmet, this.head, 0, 0.1, 0);
      guard.material.side = THREE.DoubleSide;
      guard.rotation.y = Math.PI;
    } else if (this.outfit && look.playerStyle !== 'warrior') {
      this.outfit.addHeadwear(this.head);
    } else if (!look.tex) {
      const hair = mat(look.hair, 0.7);
      const cap = part(new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, this.head, 0, 0.175, -0.012);
      cap.rotation.x = -0.35;
      part(new THREE.SphereGeometry(0.05, 10, 8), hair, this.head, 0, 0.31, -0.04);
      part(new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), hair, this.head, 0, 0.12, -0.14).rotation.x = 0.25;
      this.outfit?.addHeadwear(this.head);
    }

    const mkArm = (sx: number) => {
      const arm = joint(this.spine, sx * 0.25 * b, 0.5, 0);
      const shoulderSize = this.outfit ? 0.077 : 0.105;
      const shoulder = part(new THREE.SphereGeometry(shoulderSize * b, 14, 10), armor, arm, sx * 0.02, 0.03, 0);
      shoulder.scale.set(1.15, 0.8, 1.15);
      this.outfit?.addShoulder(arm, sx);
      part(new THREE.CapsuleGeometry(0.058 * b, 0.2, 4, 10), cloth, arm, 0, -0.16, 0);
      const elbow = joint(arm, 0, -0.31, 0);
      part(new THREE.CapsuleGeometry(0.052 * b, 0.18, 4, 10), look.armorMetal > 0.3 ? armor : leather, elbow, 0, -0.14, 0);
      if (this.outfit) {
        part(new THREE.CylinderGeometry(0.066 * b, 0.052 * b, 0.13, 10), armor, elbow, 0, -0.18, 0);
      }
      part(new THREE.SphereGeometry(0.052 * b, 10, 8), skin, elbow, 0, -0.29, 0);
      const hand = joint(elbow, 0, -0.29, 0);
      return [arm, elbow, hand] as const;
    };
    let handL: THREE.Group, handR: THREE.Group;
    [this.armL, this.elbowL, handL] = mkArm(1);
    [this.armR, this.elbowR, handR] = mkArm(-1);

    if (look.ringColor !== undefined) {
      const ring = part(new THREE.TorusGeometry(0.025, 0.007, 5, 14), mat(look.ringColor, 0.25, 0.82), handR, 0.035, -0.02, 0.035, false);
      ring.rotation.x = Math.PI / 2;
    }
    if (look.weapon !== 'none') {
      const wpn = this.buildWeapon(look.weapon, look.glow, look.weaponColor);
      wpn.scale.setScalar(look.weaponScale ?? 1);
      // Çift el silah gövdenin önünde, öne doğru eğik tutulur (Metin2 duruşu)
      if (look.twoHanded) wpn.rotation.x = 1.85;
      handR.add(wpn);
    }
  }

  private buildWeapon(kind: WeaponKind, glow?: number, weaponColor?: number) {
    const g = new THREE.Group();
    const steel = glow !== undefined
      ? mat(weaponColor ?? 0xdfe6f0, 0.2, 1, { emissive: glow, emissiveIntensity: 1.6 })
      : mat(weaponColor ?? 0xdfe6f0, 0.2, 1);
    const gold = mat(0xd4a03c, 0.32, 1);
    const wood = mat(0x4a3220, 0.8);
    if (kind === 'sword') {
      const len = 0.98;
      part(new THREE.CylinderGeometry(0.017, 0.017, 0.2, 8), wood, g, 0, 0, 0);
      part(new THREE.BoxGeometry(0.22, 0.03, 0.05), gold, g, 0, 0.11, 0);
      part(new THREE.SphereGeometry(0.028, 8, 6), gold, g, 0, -0.11, 0);
      const blade = new THREE.CylinderGeometry(0.004, 0.032, len, 4, 1);
      blade.rotateY(Math.PI / 4);
      const bm = part(blade, steel, g, 0, 0.12 + len / 2, 0);
      bm.scale.set(1.25, 1, 0.3);
      g.rotation.x = 1.75;
    } else if (kind === 'staff') {
      part(new THREE.CylinderGeometry(0.02, 0.026, 1.75, 8), wood, g, 0, 0.35, 0);
      part(new THREE.TorusGeometry(0.1, 0.014, 6, 20), gold, g, 0, 1.3, 0);
      part(new THREE.IcosahedronGeometry(0.075, 1), mat(0x6fd0ff, 0.2, 0, { emissive: glow ?? 0x49b6ff, emissiveIntensity: 3.2 }), g, 0, 1.3, 0, false);
      g.rotation.x = 0.3;
    } else if (kind === 'axe') {
      part(new THREE.CylinderGeometry(0.02, 0.024, 0.9, 8), wood, g, 0, 0.3, 0);
      part(new THREE.BoxGeometry(0.02, 0.28, 0.3), steel, g, 0, 0.66, 0.13);
      g.rotation.x = 1.6;
    } else if (kind === 'spear') {
      part(new THREE.CylinderGeometry(0.018, 0.024, 1.7, 8), wood, g, 0, 0.32, 0);
      part(new THREE.SphereGeometry(0.035, 8, 6), gold, g, 0, 1.22, 0);
      const tip = part(new THREE.CylinderGeometry(0.055, 0.008, 0.5, 6), steel, g, 0, 1.5, 0);
      tip.scale.set(1, 1, 0.4);
      part(new THREE.BoxGeometry(0.16, 0.03, 0.03), gold, g, 0, 1.22, 0);
      g.rotation.x = 0.35;
    } else if (kind === 'club') {
      part(new THREE.CylinderGeometry(0.11, 0.04, 1.2, 8), wood, g, 0, 0.45, 0);
      for (let i = 0; i < 6; i++) {
        const s = part(new THREE.ConeGeometry(0.03, 0.1, 5), steel, g, Math.cos(i * 1.05) * 0.11, 0.75 + (i % 2) * 0.18, Math.sin(i * 1.05) * 0.11);
        s.rotation.z = -Math.cos(i * 1.05) * 1.57;
        s.rotation.x = Math.sin(i * 1.05) * 1.57;
      }
      g.rotation.x = 1.6;
    }
    return g;
  }

  get attacking() { return this.atkT >= 0; }

  attack(duration: number, idx = 0) {
    this.atkT = 0;
    this.atkDur = duration;
    this.atkIdx = idx % ATTACKS.length;
  }

  hit() { this.flinch = 1; }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.atkT = -1;
  }

  revive() {
    this.dead = false;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
  }

  update(dt: number, speed: number) {
    this.t += dt;
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 1.8);
      const k = 1 - (1 - this.deadT) * (1 - this.deadT);
      this.body.rotation.x = -k * 1.5;
      this.body.position.y = k * 0.16;
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.9, k);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.9, k);
      return;
    }
    const moving = speed > 0.25;
    const run = clamp(speed / 6.5, 0, 1.3);
    this.moveBlend = damp(this.moveBlend, moving ? 1 : 0, 12, dt);
    if (moving) this.phase += dt * (4.2 + speed * 1.3);
    const mb = this.moveBlend;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const A = 0.5 + 0.38 * run;
    const breath = Math.sin(this.t * 1.7);
    const attackPulse = this.atkT >= 0 ? Math.sin(this.atkT * Math.PI) : 0;

    if (this.riding) {
      // Eyer pozu: bacaklar iki yana açık ve öne kıvrık, dizler bükük
      const bounce = moving ? Math.abs(c) * 0.05 : Math.sin(this.t * 1.7) * 0.008;
      this.legL.rotation.set(-1.05, 0, 0.55);
      this.legR.rotation.set(-1.05, 0, -0.55);
      this.kneeL.rotation.x = 1.35;
      this.kneeR.rotation.x = 1.35;
      this.hips.position.y = 0.96 - bounce - attackPulse * 0.018;
      this.hips.rotation.y = attackPulse * 0.06;
    } else {
      this.legL.rotation.set(-s * A * mb - attackPulse * 0.16, 0, 0);
      this.legR.rotation.set(s * A * mb + attackPulse * 0.08, 0, 0);
      this.kneeL.rotation.x = (Math.max(0, c) * (0.7 + run * 0.6) + 0.08) * mb;
      this.kneeR.rotation.x = (Math.max(0, -c) * (0.7 + run * 0.6) + 0.08) * mb;
      this.hips.position.y = 0.96 - Math.abs(c) * 0.035 * mb * (0.6 + run) + breath * 0.004 - attackPulse * 0.018;
      this.hips.rotation.y = s * 0.1 * mb + attackPulse * 0.06;
    }

    let spX = 0.05 + 0.14 * mb * run + breath * 0.012;
    let spY = -s * 0.16 * mb;
    let aRx = -s * -0.62 * mb, aRz = -0.09, eR = -(0.22 + 0.75 * mb * run);
    let aLx = -s * 0.62 * mb, aLz = 0.09, eL = -(0.22 + 0.75 * mb * run);
    // Sol kol sol bacağın tersine sallanır
    aLx = s * 0.62 * mb;
    aRx = -s * 0.62 * mb;
    // Durağan duruşa ağırlık kayması ve kol nefesi (hareket yokken sönümlenir)
    const still = 1 - mb;
    if (!this.riding) this.hips.rotation.z = Math.sin(this.t * 0.9) * 0.025 * still;
    aLz += Math.sin(this.t * 1.7 + 0.8) * 0.02 * still;
    aRz -= Math.sin(this.t * 1.7) * 0.02 * still;
    if (this.twoHanded && !this.riding) {
      // Çift el: iki kol öne uzanır, sağ el arkada kabzayı, sol el ortada gövdeyi tutar
      aRx = lerp(aRx, -0.6 + s * 0.04 * mb, 0.85);
      // Dirsek neredeyse düz: kol açısı ile dirsek bükümü toplanıp mızrağın eğimini bozmasın
      eR = lerp(eR, -0.1, 0.85);
      aRz = lerp(aRz, -0.12, 0.85);
      aLx = lerp(aLx, -1.15 + s * 0.04 * mb, 0.85);
      eL = lerp(eL, -1.45, 0.85);
      aLz = lerp(aLz, -0.2, 0.85);
      // Gövde öne eğilir; silah belden aşağıda, yatay tutulur (Metin2 duruşu)
      spX += 0.12;
    }
    let attackLunge = 0;

    if (this.atkT >= 0) {
      this.atkT += dt / this.atkDur;
      if (this.atkT >= 1) this.atkT = -1;
      else {
        sampleKeys(ATTACKS[this.atkIdx], this.atkT);
        const edge = clamp(Math.min(this.atkT, 1 - this.atkT) * 8, 0, 1);
        const w = edge * edge * (3 - 2 * edge);
        attackLunge = pose[5] * w;
        aRx = lerp(aRx, pose[0], w);
        aRz = lerp(aRz, pose[1], w);
        eR = lerp(eR, pose[2], w);
        spY = lerp(spY, pose[3], w);
        spX = lerp(spX, pose[4], w);
        aLx = lerp(aLx, this.twoHanded ? -0.95 : -0.55, w);
        eL = lerp(eL, this.twoHanded ? -1.5 : -1.15, w);
        aLz = lerp(aLz, this.twoHanded ? -0.18 : -0.25, w);
      }
    }
    if (this.flinch > 0.01) {
      spX -= this.flinch * 0.3;
      aRx += this.flinch * 0.08;
      aLx -= this.flinch * 0.08;
      aRz -= this.flinch * 0.14;
      aLz += this.flinch * 0.14;
      this.flinch *= Math.exp(-9 * dt);
    }
    this.body.position.y = -attackPulse * 0.035;
    // Vuruş aldığında gövde hafifçe geri iter
    this.body.position.z = attackLunge - attackPulse * 0.025 - this.flinch * 0.06;
    this.spine.rotation.set(spX, spY, 0);
    this.head.rotation.set(-spX * 0.5, -spY * 0.4, 0);
    this.armR.rotation.set(aRx, 0, aRz);
    this.armL.rotation.set(aLx, 0, aLz);
    this.elbowR.rotation.x = eR;
    this.elbowL.rotation.x = eL;
    this.outfit?.update(this.t, clamp(mb * run + attackPulse * 0.35, 0, 1), spY, this.riding);
  }
}
