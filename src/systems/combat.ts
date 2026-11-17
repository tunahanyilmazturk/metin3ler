import * as THREE from 'three';
import { angleDiff, rand } from '../core/utils';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Game } from '../game';

interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  mult: number;
  radius: number;
  color: number;
}

const ORB = new THREE.IcosahedronGeometry(1, 2);

/** Hasar hesaplama, alan/yön taramaları, mermiler ve gecikmeli olaylar. */
export class Combat {
  private projectiles: Projectile[] = [];
  private timers: { t: number; fn: () => void }[] = [];

  constructor(private game: Game) {}

  later(t: number, fn: () => void) { this.timers.push({ t, fn }); }

  nearestEnemy(pos: THREE.Vector3, maxDist: number): Enemy | null {
    let best: Enemy | null = null, bd = maxDist;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Tek bir düşmana oyuncu hasarı uygular. */
  hitEnemy(e: Enemy, mult: number, opts: { stun?: number; slow?: number } = {}) {
    const g = this.game, p = g.player;
    const crit = Math.random() * 100 < p.crit;
    let dmg = p.atk * mult * rand(0.9, 1.1) - e.def.def * 0.6;
    if (crit) dmg *= 1.8;
    dmg = Math.max(1, Math.round(dmg));
    const at = e.pos.clone().setY(e.pos.y + e.height * 0.6);
    g.events.emit('damageText', { pos: e.pos, y: e.height + 0.3, text: crit ? `${dmg}!` : `${dmg}`, cls: crit ? 'crit' : 'dmg' });
    g.particles.emit(at, e.isStone
      ? { count: 10, color: 0xffe0a0, color2: 0xffffff, speed: 6, up: 2, life: 0.4, size: 0.3, gravity: 12 }
      : { count: crit ? 14 : 7, color: 0xff4030, color2: 0xffb080, speed: 4, up: 1.5, life: 0.4, size: 0.34, gravity: 8 });
    g.audio.hit(crit);
    // Geri savrulma: taşlar ve patronlar ağır durur, sıradan düşmanlar vuruş yönüne itilir
    const kb = e.isStone ? 0 : e.def.boss ? 0.05 : Math.min(0.34, 0.16 * mult);
    if (kb > 0) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = e.pos.x + (dx / d) * kb, nz = e.pos.z + (dz / d) * kb;
      if (g.terrain.walkable(nx, nz)) { e.pos.x = nx; e.pos.z = nz; }
    }
    g.effects.flash(at, crit ? 0xffc060 : 0xff5838, crit ? 55 : 30, 0.1);
    e.damage(dmg, opts);
    g.hitStop(!e.alive ? 0.11 : crit ? 0.085 : 0.045);
  }

  /** Oyuncunun önündeki koni içindeki düşmanlara vurur; vurulan sayısını döndürür. */
  frontDamage(range: number, halfAngle: number, mult: number, max: number) {
    const p = this.game.player;
    let n = 0;
    for (const e of this.game.enemies) {
      if (!e.alive || n >= max) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      if (d > 0.8 && Math.abs(angleDiff(p.yaw, Math.atan2(dx, dz))) > halfAngle) continue;
      this.hitEnemy(e, mult);
      n++;
    }
    return n;
  }

  areaDamage(center: THREE.Vector3, radius: number, mult: number, opts: { stun?: number; slow?: number } = {}) {
    for (const e of [...this.game.enemies]) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) <= radius + e.radius) this.hitEnemy(e, mult, opts);
    }
  }

  /** Hedefe (yoksa ileriye) doğru büyü mermisi fırlatır. radius > 0 ise patlar. */
  fireProjectile(p: Player, mult: number, radius: number, color: number, size = 0.3) {
    const fw = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const from = p.pos.clone().addScaledVector(fw, 0.8).setY(p.pos.y + 1.45);
    const t = p.target;
    const to = t && t.alive ? t.pos.clone().setY(t.pos.y + t.height * 0.5) : from.clone().addScaledVector(fw, 30);
    const mat = new THREE.MeshBasicMaterial({ color, fog: false });
    mat.color.multiplyScalar(3);
    const mesh = new THREE.Mesh(ORB, mat);
    mesh.scale.setScalar(size);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.projectiles.push({ mesh, vel: to.sub(from).normalize().multiplyScalar(34), life: 1.1, mult, radius, color });
  }

  private explode(pr: Projectile, hit: Enemy | null) {
    const g = this.game, pos = pr.mesh.position;
    if (pr.radius > 0) {
      g.effects.ring(pos.clone().setY(g.terrain.getHeight(pos.x, pos.z)), pr.radius, pr.color, 0.45);
      g.effects.flash(pos, pr.color, 150, 0.4);
      g.particles.emit(pos, { count: 60, color: pr.color, color2: 0xffffff, speed: 9, up: 3, life: 0.7, size: 0.7, gravity: 6 });
      g.audio.boom();
      g.camera.addShake(0.3);
      this.areaDamage(pos, pr.radius, pr.mult);
    } else {
      g.particles.emit(pos, { count: 14, color: pr.color, speed: 4, life: 0.35, size: 0.4 });
      if (hit) this.hitEnemy(hit, pr.mult);
    }
    g.scene.remove(pr.mesh);
    (pr.mesh.material as THREE.Material).dispose();
  }

  update(dt: number) {
    const g = this.game;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const pos = pr.mesh.position;
      pos.addScaledVector(pr.vel, dt);
      pr.life -= dt;
      g.particles.emit(pos, { count: 2, color: pr.color, speed: 0.6, life: 0.35, size: pr.radius > 0 ? 0.6 : 0.32 });
      let hit: Enemy | null = null;
      for (const e of g.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.6 && pos.y > e.pos.y - 0.5 && pos.y < e.pos.y + e.height + 0.6) { hit = e; break; }
      }
      if (hit || pr.life <= 0 || pos.y < g.terrain.getHeight(pos.x, pos.z)) {
        this.explode(pr, hit);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
