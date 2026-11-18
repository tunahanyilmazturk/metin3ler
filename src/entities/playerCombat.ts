import { rand } from '../core/utils';
import { PLAYER_SPAWN } from '../data/world';
import type { Player } from './player';

/** Oyuncunun dövüş davranışları: temel vuruşlar, koşu saldırısı, yetenekler, hasar ve dirilme. */

/** Hedef varsa ona, yoksa önündeki en yakın düşmana döner. */
export function faceTarget(p: Player) {
  const t = p.target;
  if (t && t.alive && t.pos.distanceTo(p.pos) < p.attackRange + 8) {
    p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
  }
}

export function startAttack(p: Player) {
  const g = p.game;
  // Hedef yoksa önündeki en yakın düşmana dön
  if (!p.target) p.target = g.combat.nearestEnemy(p.pos, 4.5);
  faceTarget(p);
  if (p.comboTimer <= 0 && p.attackT < 0 && p.attackIdx > 2) p.attackIdx = 0;
  const idx = p.attackIdx % 3;
  p.attackDur = (idx === 2 ? 0.64 : 0.5) / p.atkSpeed;
  p.model.attack(p.attackDur, idx);
  p.attackT = 0;
  p.hitDone = false;
  p.attackIdx = (idx + 1) % 3;
  p.sinceCombat = Math.min(p.sinceCombat, 3);
  g.audio.swing();
}

export function doHit(p: Player) {
  const g = p.game;
  const idx = (p.attackIdx + 2) % 3;
  const mult = [1, 1.1, 1.5][idx];
  g.effects.slash(p.pos, p.yaw, p.attackRange + 0.3, 0xffb868, [0.5, -0.5, 0][idx]);
  const n = g.combat.frontDamage(p.attackRange, 1.15, mult, 6);
  if (n > 0 && idx === 2) g.camera.addShake(0.18);
}

export function updateDash(p: Player, dt: number) {
  const g = p.game, d = p.dash!;
  d.t -= dt;
  const sp = 34;
  p.tryMove(d.dx * sp * dt, d.dz * sp * dt);
  p.speedNow = 12;
  g.particles.emit(p.pos.clone().setY(p.pos.y + 1), { count: 3, color: d.skill.color, speed: 1, life: 0.4, size: 0.6, spread: 0.6 });
  for (const e of g.enemies) {
    if (!e.alive || d.hit.has(e)) continue;
    if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 2.1 + e.radius) {
      d.hit.add(e);
      g.combat.hitEnemy(e, d.skill.mult ?? 1, { stun: d.skill.stun });
    }
  }
  if (d.t <= 0) p.dash = null;
}

/** i. yeteneği (0–3) kullanır: bekleme süresi, mana ve seviye kontrolleriyle. */
export function useSkill(p: Player, i: number) {
  const g = p.game;
  const sk = p.skills[i];
  if (!sk || !p.alive || p.dash) return;
  if (p.level < sk.level) { g.events.emit('log', { msg: `${sk.name} ${sk.level}. seviyede açılır.`, cls: 'warn' }); return; }
  if (p.cooldowns[i] > 0) return;
  if (p.mp < sk.mp) { g.events.emit('log', { msg: 'Yeterli mana yok.', cls: 'warn' }); return; }
  p.mp -= sk.mp;
  p.cooldowns[i] = sk.cd;
  p.sinceCombat = Math.min(p.sinceCombat, 3);
  faceTarget(p);
  const fw = p.fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const chest = p.pos.clone().setY(p.pos.y + 1.1);
  g.audio.cast();

  switch (sk.type) {
    case 'aoe':
      p.model.attack(0.6, 1);
      p.spin = 1;
      g.effects.ring(p.pos, sk.radius!, sk.color, 0.5);
      g.effects.flash(p.pos, sk.color, 70);
      g.particles.emit(chest, { count: 70, color: sk.color, color2: 0xffffff, speed: sk.radius! * 2.2, life: 0.6, size: 0.55, flat: true, up: 1 });
      g.combat.areaDamage(p.pos, sk.radius!, sk.mult!, { stun: sk.stun, slow: sk.slow });
      if (sk.radius! > 6) { g.camera.addShake(0.6); g.audio.boom(); }
      break;
    case 'strike':
      p.model.attack(0.45, 0);
      g.effects.slash(p.pos, p.yaw, sk.radius! + 0.4, sk.color, 0.6);
      g.effects.slash(p.pos, p.yaw, sk.radius! + 0.2, sk.color, -0.6);
      g.combat.frontDamage(sk.radius!, 0.9, sk.mult!, 2);
      break;
    case 'dash':
      p.model.attack(0.4, 1);
      p.dash = { t: 0.26, dx: fw.x, dz: fw.z, skill: sk, hit: new Set() };
      g.effects.ring(p.pos, 3, sk.color, 0.35);
      break;
    case 'buff':
      p.model.attack(0.7, 3);
      p.buffs = p.buffs.filter((b) => b.id !== sk.id);
      p.buffs.push({ id: sk.id, t: sk.buff!.dur, def: sk.buff!, color: sk.color });
      p.recalc();
      g.effects.ring(p.pos, 3.5, sk.color, 0.7);
      g.particles.emit(chest, { count: 50, color: sk.color, speed: 2.5, up: 4, life: 1, size: 0.5, spread: 1 });
      g.events.emit('log', { msg: `${sk.name} etkin.`, cls: 'good' });
      break;
    case 'projectile':
      p.model.attack(0.5, 3);
      g.combat.fireProjectile(p, sk.mult!, sk.radius!, sk.color, 0.75);
      break;
    case 'targetAoe': {
      p.model.attack(0.8, 3);
      const t = p.target;
      const c = t && t.alive && t.pos.distanceTo(p.pos) < 24 ? t.pos.clone() : p.pos.clone().addScaledVector(fw, 9);
      c.y = g.terrain.getHeight(c.x, c.z);
      g.effects.ring(c, sk.radius!, sk.color, 0.9);
      for (let k = 0; k < 6; k++) {
        g.combat.later(0.15 + k * 0.11, () => {
          const q = c.clone();
          q.x += rand(-1, 1) * sk.radius! * 0.6; q.z += rand(-1, 1) * sk.radius! * 0.6;
          g.effects.bolt(q, sk.color);
          g.effects.flash(q, sk.color, 140, 0.25);
          g.particles.emit(q, { count: 24, color: sk.color, color2: 0xffffff, speed: 7, up: 4, life: 0.5, size: 0.5, gravity: 10 });
          if (k % 2 === 0) g.audio.boom();
          if (k === 2) { g.combat.areaDamage(c, sk.radius!, sk.mult!, { stun: sk.stun }); g.camera.addShake(0.5); }
        });
      }
      break;
    }
  }
  g.events.emit('changed');
}

/** Gelen hasarı zırhla azaltır; can sıfırlanırsa ölüm durumuna geçirir. */
export function takeDamage(p: Player, raw: number) {
  if (!p.alive) return;
  const g = p.game;
  const dmg = Math.max(1, Math.round(raw * rand(0.88, 1.12) - p.def * 0.5));
  p.hp -= dmg;
  p.sinceCombat = 0;
  p.model.hit();
  g.audio.hurt();
  g.events.emit('damageText', { pos: p.pos, y: 2, text: `-${dmg}`, cls: 'hurt' });
  g.events.emit('playerHurt');
  g.camera.addShake(Math.min(0.4, 0.06 + (dmg / p.maxHp) * 1.5));
  g.particles.emit(p.pos.clone().setY(p.pos.y + 1.2), { count: 8, color: 0xff3020, speed: 3, life: 0.35, size: 0.3 });
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.intent = null;
    p.target = null;
    p.dash = null;
    p.attackT = -1;
    p.dismount(true);
    p.model.die();
    g.events.emit('playerDied');
  }
}

/** Ölümden sonra başlangıç noktasında dirilir; deneyimin küçük bir kısmını kaybeder. */
export function respawn(p: Player) {
  p.alive = true;
  const lost = Math.min(p.exp, Math.ceil(p.expNeed * 0.02));
  if (lost > 0) {
    p.exp -= lost;
    p.game.events.emit('log', { msg: `Yenilgi bedeli: -${lost} tecrübe`, cls: 'warn' });
  }
  p.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
  p.yaw = Math.PI;
  p.game.camera.setView(0, 0.5, 11);
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.model.revive();
  p.game.camera.snap(p.pos);
  p.game.events.emit('playerRespawned');
  p.game.events.emit('changed');
}
