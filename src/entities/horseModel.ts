import * as THREE from 'three';
import { clamp, damp } from '../core/utils';
import type { HorseLook } from '../data/horses';
import { joint, mat, part } from './model';

/** Gövde ölçüleri (ölçeklenmemiş). Gövde merkezi BASE_Y yüksekliğindedir. */
const R = 0.34;
const LEN = 1.15;
const BASE_Y = 1.0;
/** Eyer üstü (gövde yerel) yüksekliği. */
const SEAT = R + 0.11;
/** İnsansı modelin binicilik pozunda kalçasının köke göre yüksekliği. */
const RIDER_HIP = 0.96;

/** Bacak sırası: sol ön, sağ ön, sol arka, sağ arka. Tırıs ve dörtnala faz kaymaları (tur cinsinden). */
const LEGS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const TROT = [0, 0.5, 0.5, 0];
const GALLOP = [0, 0.1, 0.55, 0.65];

const easeOutBack = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

/**
 * Binek atı: uzun boyun ve baş, yele, kuyruk, toynaklı bacaklar, eyer, üzengi ve dizgin.
 * Yürürken tırıs, dörtnalada galop yürüyüşüyle hareket eder. +Z yönüne bakar.
 */
export class HorseModel {
  root = new THREE.Group();
  /** Biniciğin kök yüksekliği: kalçası eyerin üstüne oturur. */
  readonly riderOffset: number;
  private readonly scale: number;
  private body: THREE.Group;
  private neck: THREE.Group;
  private head: THREE.Group;
  private tailBase: THREE.Group;
  private tailSegs: THREE.Group[] = [];
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private phase = Math.random() * 6;
  private t = Math.random() * 10;
  private blend = 0;
  private gallopBlend = 0;
  private appear = 1;

  constructor(l: HorseLook) {
    const coat = mat(l.coat, 0.82);
    const dark = mat(l.dark, 0.85);
    const mane = mat(l.mane, 0.95);
    const hoof = mat(l.hoof, 0.55);
    const white = mat(0xf2ede4, 0.85);
    const leather = mat(0x3a2414, 0.7);
    const metal = mat(0xc8b888, 0.35, 0.8);
    const cloth = mat(l.cloth, 0.8);
    const trim = mat(l.trim, 0.45, 0.6);
    const plate = l.barding !== undefined ? mat(l.barding, 0.4, 0.75) : null;

    this.scale = l.scale;
    this.root.scale.setScalar(l.scale);
    this.riderOffset = (BASE_Y + SEAT) * l.scale - RIDER_HIP + 0.05;
    this.body = joint(this.root, 0, BASE_Y, 0);

    // Gövde: gövde kapsülü, göğüs, sağrı ve karın hacmi
    part(new THREE.CapsuleGeometry(R, LEN, 6, 16), coat, this.body).rotation.x = Math.PI / 2;
    part(new THREE.SphereGeometry(R * 1.08, 16, 12), coat, this.body, 0, 0.02, LEN * 0.42).scale.set(0.95, 1.05, 1);
    part(new THREE.SphereGeometry(R * 1.1, 16, 12), coat, this.body, 0, 0.05, -LEN * 0.42);
    part(new THREE.SphereGeometry(R * 0.95, 12, 10), coat, this.body, 0, -R * 0.3, 0).scale.set(1, 0.75, 1.7);

    // Boyun ve yele
    this.neck = joint(this.body, 0, R * 0.5, LEN * 0.5);
    part(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 12), coat, this.neck, 0, 0.36, 0);
    for (let i = 0; i < 8; i++) {
      part(new THREE.BoxGeometry(0.05, 0.15, 0.1), mane, this.neck, 0, 0.04 + i * 0.1, -0.15 + i * 0.008, false).rotation.x = -0.25;
    }
    if (plate) part(new THREE.BoxGeometry(0.06, 0.6, 0.16), plate, this.neck, 0, 0.38, -0.13, false);

    // Baş: kafatası, burun, çene, gözler, kulaklar, perçem, dizgin
    this.head = joint(this.neck, 0, 0.76, 0.02);
    part(new THREE.BoxGeometry(0.24, 0.27, 0.32), coat, this.head, 0, 0.02, 0.06);
    part(new THREE.BoxGeometry(0.19, 0.19, 0.3), coat, this.head, 0, -0.05, 0.33);
    part(new THREE.BoxGeometry(0.17, 0.08, 0.2), dark, this.head, 0, -0.14, 0.2, false);
    const black = mat(0x08080a, 0.3);
    for (const sx of [-1, 1]) {
      part(new THREE.SphereGeometry(0.025, 8, 6), black, this.head, sx * 0.06, -0.02, 0.48, false);
      part(new THREE.SphereGeometry(0.032, 8, 6), black, this.head, sx * 0.125, 0.07, 0.1, false);
      part(new THREE.ConeGeometry(0.045, 0.15, 6), dark, this.head, sx * 0.08, 0.21, -0.03, false).rotation.z = -sx * 0.15;
      // Yanak kayışı
      part(new THREE.BoxGeometry(0.012, 0.2, 0.025), leather, this.head, sx * 0.124, -0.02, 0.2, false);
    }
    part(new THREE.BoxGeometry(0.08, 0.13, 0.06), mane, this.head, 0, 0.17, 0.12, false).rotation.x = 0.5;
    const noseband = part(new THREE.TorusGeometry(0.11, 0.012, 6, 18), leather, this.head, 0, -0.05, 0.3, false);
    noseband.scale.set(1, 0.95, 1);
    if (l.blaze) {
      part(new THREE.BoxGeometry(0.07, 0.012, 0.3), white, this.head, 0, 0.158, 0.08, false);
      part(new THREE.BoxGeometry(0.06, 0.012, 0.28), white, this.head, 0, 0.048, 0.33, false);
    }
    if (plate) part(new THREE.BoxGeometry(0.22, 0.02, 0.3), plate, this.head, 0, 0.168, 0.1, false);

    // Kuyruk: aşağı ve geriye sarkan, uca doğru incelen zincir
    this.tailBase = joint(this.body, 0, R * 0.6, -LEN * 0.5 - R * 0.72);
    let parent: THREE.Group = this.tailBase;
    for (let i = 0; i < 4; i++) {
      const seg = joint(parent, 0, i === 0 ? 0 : 0.2, 0);
      part(new THREE.CylinderGeometry(0.06 - i * 0.008, 0.05 - i * 0.008, 0.22, 8), mane, seg, 0, 0.11, 0, false);
      this.tailSegs.push(seg);
      parent = seg;
    }
    part(new THREE.ConeGeometry(0.035, 0.14, 6), mane, parent, 0, 0.27, 0, false);

    // Bacaklar: üst bacak, diz, incik, bukağı ve toynak
    const lower = l.socks ? white : dark;
    for (const [sx, sz] of LEGS) {
      const hip = joint(this.body, sx * R * 0.55, -R * 0.25, sz * LEN * 0.45);
      part(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), coat, hip, 0, -0.21, 0);
      const knee = joint(hip, 0, -0.44, 0);
      part(new THREE.CylinderGeometry(0.05, 0.045, 0.36, 8), lower, knee, 0, -0.2, 0);
      part(new THREE.SphereGeometry(0.06, 8, 6), lower, knee, 0, -0.4, 0.01, false);
      part(new THREE.CylinderGeometry(0.07, 0.08, 0.09, 10), hoof, knee, 0, -0.46, 0.015);
      this.hips.push(hip);
      this.knees.push(knee);
    }

    // Eyer takımı: örtü ve kenar süsü, eyer, ön ve arka kaş, üzengi kayışları ve üzengiler
    part(new THREE.BoxGeometry(R * 2.05, 0.03, 0.66), trim, this.body, 0, R * 0.915, -0.02, false);
    part(new THREE.BoxGeometry(R * 1.95, 0.035, 0.6), cloth, this.body, 0, R * 0.935, -0.02, false);
    part(new THREE.BoxGeometry(0.4, 0.1, 0.44), leather, this.body, 0, R + 0.06, -0.02, false);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.08), leather, this.body, 0, R + 0.12, 0.2, false);
    part(new THREE.BoxGeometry(0.3, 0.1, 0.06), leather, this.body, 0, R + 0.11, -0.24, false);
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(0.015, 0.36, 0.04), leather, this.body, sx * R * 1.02, R * 0.55, -0.02, false);
      part(new THREE.TorusGeometry(0.06, 0.012, 6, 12), metal, this.body, sx * R * 1.05, R * 0.3, -0.02, false).rotation.y = Math.PI / 2;
    }
    // Savaş zırhı: göğüslük
    if (plate) part(new THREE.BoxGeometry(R * 1.7, R * 1.0, 0.06), plate, this.body, 0, -0.02, LEN * 0.42 + R * 1.0, false);

    this.applyPose(0);
  }

  /** Çağırıldığında küçük bir büyüyerek belirme etkisi başlatır. */
  revive() {
    this.appear = 0;
    this.root.scale.setScalar(this.scale * 0.55);
  }

  /** speed: anlık hareket hızı; gallop: dörtnala koşuyor mu. */
  update(dt: number, speed: number, gallop: boolean) {
    this.t += dt;
    const moving = speed > 0.25;
    this.blend = damp(this.blend, moving ? 1 : 0, 9, dt);
    this.gallopBlend = damp(this.gallopBlend, gallop && moving ? 1 : 0, 6, dt);
    if (moving) this.phase += dt * (3.2 + speed * 0.55 + this.gallopBlend * 2);

    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.35);
      this.root.scale.setScalar(this.scale * (0.55 + 0.45 * easeOutBack(this.appear)));
    }
    this.applyPose(speed);
  }

  private applyPose(speed: number) {
    const b = this.blend, gb = this.gallopBlend;
    const amp = (0.38 + 0.12 * clamp(speed / 8, 0, 1) + 0.25 * gb) * b;
    for (let i = 0; i < 4; i++) {
      const off = (TROT[i] * (1 - gb) + GALLOP[i] * gb) * Math.PI * 2;
      const a = this.phase + off;
      this.hips[i].rotation.x = Math.sin(a) * amp;
      // İleri giden bacak dizden bükülür
      this.knees[i].rotation.x = Math.max(0, Math.cos(a)) * (0.8 + 0.4 * gb) * b;
    }
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const idle = 1 - b;
    this.body.position.y = BASE_Y + Math.abs(s) * 0.035 * (1 - gb) * b + s * 0.06 * gb * b + Math.sin(this.t * 1.4) * 0.006 * idle;
    this.body.rotation.x = s * 0.07 * gb * b;
    this.neck.rotation.x = 0.62 + 0.18 * gb * b + c * 0.05 * b + Math.sin(this.t * 0.6) * 0.03 * idle;
    this.head.rotation.x = -0.12 - c * 0.04 * b + Math.sin(this.t * 1.1) * 0.04 * idle;
    this.tailBase.rotation.x = -2.4 + 0.45 * gb * b;
    for (let i = 0; i < this.tailSegs.length; i++) {
      const seg = this.tailSegs[i];
      seg.rotation.z = Math.sin(this.t * (b > 0.5 ? 6 : 1.8) + i * 0.7) * 0.14;
      if (i > 0) seg.rotation.x = 0.12 + 0.1 * gb;
    }
  }
}
