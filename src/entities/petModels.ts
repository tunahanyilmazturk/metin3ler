import * as THREE from 'three';
import { damp } from '../core/utils';
import type { PetLook } from '../data/pets';
import { joint, mat, part } from './model';

/**
 * Küçük evcil hayvan modelleri. Yerde yürüyenler (tilki, kurt, kaplumbağa) ve uçanlar
 * (baykuş, kartal, ejder). Doku kullanmaz; +Z yönüne bakar.
 */
export class PetModel {
  root = new THREE.Group();
  readonly height: number;
  readonly flyer: boolean;
  private body: THREE.Group;
  private head: THREE.Group;
  private tail: THREE.Group;
  private legs: THREE.Group[] = [];
  private wings: THREE.Group[] = [];
  private t = Math.random() * 10;
  private phase = Math.random() * 6;
  private blend = 0;
  private lunge = 0;
  private baseY = 0;

  constructor(l: PetLook) {
    const body = mat(l.body, 0.85);
    const accent = mat(l.accent, 0.7, l.horns ? 0.3 : 0);
    const black = mat(0x0a0a0c, 0.3);
    this.flyer = l.form === 'flyer';
    this.root.scale.setScalar(l.scale);

    if (!this.flyer) {
      const shelled = l.shell !== undefined;
      this.baseY = shelled ? 0.2 : 0.32;
      this.body = joint(this.root, 0, this.baseY, 0);
      const torso = part(new THREE.CapsuleGeometry(shelled ? 0.2 : 0.15, shelled ? 0.22 : 0.32, 4, 12), body, this.body);
      torso.rotation.x = Math.PI / 2;
      if (shelled) {
        const shell = part(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(l.shell!, 0.7), this.body, 0, 0.02, 0);
        shell.scale.set(1, 0.75, 1.15);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          part(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 6), accent, this.body, Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.17, false);
        }
      }
      this.head = joint(this.body, 0, shelled ? 0.04 : 0.1, shelled ? 0.32 : 0.28);
      part(new THREE.SphereGeometry(shelled ? 0.09 : 0.12, 12, 10), body, this.head);
      if (!shelled) {
        const snout = part(new THREE.ConeGeometry(0.06, 0.16, 8), accent, this.head, 0, -0.02, 0.13);
        snout.rotation.x = Math.PI / 2;
        for (const sx of [-1, 1]) {
          part(new THREE.ConeGeometry(0.045, 0.12, 6), body, this.head, sx * 0.07, 0.11, -0.01, false).rotation.z = -sx * 0.2;
        }
      }
      for (const sx of [-1, 1]) part(new THREE.SphereGeometry(0.02, 6, 5), black, this.head, sx * 0.06, 0.04, 0.09, false);
      this.tail = joint(this.body, 0, shelled ? 0 : 0.06, shelled ? -0.3 : -0.27);
      part(new THREE.CapsuleGeometry(shelled ? 0.03 : 0.05, shelled ? 0.06 : 0.22, 4, 8), shelled ? body : accent, this.tail, 0, 0.1, -0.06).rotation.x = -0.9;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const leg = joint(this.body, sx * (shelled ? 0.18 : 0.09), shelled ? -0.02 : -0.08, sz * (shelled ? 0.18 : 0.15));
        part(new THREE.CapsuleGeometry(shelled ? 0.05 : 0.04, shelled ? 0.06 : 0.14, 4, 6), body, leg, 0, shelled ? -0.07 : -0.11, 0);
        this.legs.push(leg);
      }
      this.height = (shelled ? 0.5 : 0.55) * l.scale;
    } else {
      this.body = joint(this.root, 0, 0, 0);
      part(new THREE.SphereGeometry(0.15, 14, 10), body, this.body).scale.set(1, 1, 1.4);
      part(new THREE.SphereGeometry(0.11, 12, 10), accent, this.body, 0, -0.03, 0.05).scale.set(0.9, 0.8, 1.2);
      this.head = joint(this.body, 0, 0.09, 0.17);
      part(new THREE.SphereGeometry(0.1, 12, 10), body, this.head);
      const beak = part(new THREE.ConeGeometry(0.035, 0.1, 6), mat(0xe0a030, 0.5), this.head, 0, -0.02, 0.11, false);
      beak.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) {
        part(new THREE.SphereGeometry(0.022, 6, 5), black, this.head, sx * 0.05, 0.03, 0.07, false);
        if (l.horns) part(new THREE.ConeGeometry(0.025, 0.12, 6), accent, this.head, sx * 0.05, 0.1, -0.03, false).rotation.x = -0.5;
        const wing = joint(this.body, sx * 0.12, 0.04, 0);
        part(new THREE.BoxGeometry(0.34, 0.02, 0.18), body, wing, sx * 0.17, 0, -0.02, false);
        part(new THREE.BoxGeometry(0.2, 0.021, 0.08), accent, wing, sx * 0.25, 0, -0.1, false);
        this.wings.push(wing);
      }
      this.tail = joint(this.body, 0, 0, -0.2);
      part(new THREE.BoxGeometry(l.horns ? 0.06 : 0.16, 0.02, l.horns ? 0.3 : 0.14), l.horns ? body : accent, this.tail, 0, 0, -0.08, false);
      this.height = 0.4 * l.scale;
    }
  }

  /** Saldırı anında kısa bir atılma. */
  attack() { this.lunge = 1; }

  update(dt: number, speed: number) {
    this.t += dt;
    const moving = speed > 0.3;
    this.blend = damp(this.blend, moving ? 1 : 0, 10, dt);
    this.phase += dt * (moving ? 6 + speed * 1.2 : 0);
    this.lunge = Math.max(0, this.lunge - dt * 4);
    const s = Math.sin(this.phase);
    if (!this.flyer) {
      const amp = 0.7 * this.blend;
      const offs = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.x = Math.sin(this.phase + offs[i]) * amp;
      this.body.position.z = this.lunge * 0.18;
      this.head.rotation.x = Math.sin(this.t * 1.5) * 0.08 * (1 - this.blend) - this.lunge * 0.3;
      this.tail.rotation.y = Math.sin(this.t * (moving ? 10 : 3)) * 0.4;
      this.body.position.y = this.baseY + Math.abs(s) * 0.03 * this.blend;
    } else {
      const flap = Math.sin(this.t * (moving ? 16 : 9)) * (moving ? 0.8 : 0.45);
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
      this.body.rotation.x = 0.15 * this.blend - this.lunge * 0.5;
      this.body.position.z = this.lunge * 0.25;
      this.head.rotation.y = Math.sin(this.t * 0.8) * 0.3 * (1 - this.blend);
      this.tail.rotation.x = Math.sin(this.t * 4) * 0.12;
    }
  }
}
