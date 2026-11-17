import * as THREE from 'three';
import { clamp, dampAngle, rand } from '../core/utils';
import { CLASSES, ClassDef, ClassId, MAX_LEVEL, StatKey, expForLevel } from '../data/classes';
import { EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, isEquip, itemLabel, plusMult } from '../data/items';
import { SKILLS, SkillDef } from '../data/skills';
import { INVENTORY_OPEN_SLOTS, INVENTORY_TOTAL_SLOTS } from '../data/inventory';
import { PLAYER_SPAWN, WORLD_HALF } from '../data/world';
import { Humanoid } from './humanoid';
import { disposeModel } from './model';
import type { Enemy } from './enemy';
import type { Npc } from './npc';
import type { Game } from '../game';

export const INV_SIZE = INVENTORY_TOTAL_SLOTS;

export interface PlayerSave {
  name: string;
  cls: ClassId;
  level: number;
  exp: number;
  statPoints: number;
  stats: Record<StatKey, number>;
  gold: number;
  hp: number;
  mp: number;
  inv: (ItemStack | null)[];
  equip: Record<EquipSlot, ItemStack | null>;
  x: number;
  z: number;
}

type Intent = { kind: 'attack'; enemy: Enemy } | { kind: 'npc'; npc: Npc } | { kind: 'move'; x: number; z: number } | null;
export type ItemLocation = { inv: number } | { equip: EquipSlot };
interface Buff { id: string; t: number; def: NonNullable<SkillDef['buff']>; color: number }

/** Oyuncu karakteri: hareket, dövüş, yetenekler, istatistikler ve envanter. */
export class Player {
  pos = new THREE.Vector3();
  yaw = Math.PI;
  cls: ClassDef;
  model!: Humanoid;
  level = 1;
  exp = 0;
  statPoints = 0;
  stats: Record<StatKey, number>;
  gold = 60;
  hp = 1;
  mp = 1;
  inv: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  equip: Record<EquipSlot, ItemStack | null> = { weapon: null, armor: null, helmet: null, boots: null, necklace: null, ring: null };
  alive = true;
  target: Enemy | null = null;
  intent: Intent = null;
  cooldowns = [0, 0, 0, 0];
  buffs: Buff[] = [];
  readonly radius = 0.45;

  // Türetilmiş değerler
  maxHp = 1; maxMp = 1; atk = 1; def = 0; crit = 5; moveSpeed = 6.4; atkSpeed = 1;

  private speedNow = 0;
  private attackT = -1;
  private attackDur = 0.5;
  private attackIdx = 0;
  private hitDone = false;
  private comboTimer = 0;
  private spin = 0;
  private dash: { t: number; dx: number; dz: number; skill: SkillDef; hit: Set<Enemy> } | null = null;
  private sinceCombat = 99;
  private potionCd = 0;
  private stepTimer = 0;
  private fwd = new THREE.Vector3();

  constructor(private game: Game, public name: string, clsId: ClassId, save?: PlayerSave) {
    this.cls = CLASSES[clsId];
    this.stats = { ...this.cls.stats };
    if (save) {
      this.level = save.level; this.exp = save.exp; this.statPoints = save.statPoints;
      this.stats = { ...save.stats }; this.gold = save.gold;
      this.inv = new Array(INV_SIZE).fill(null);
      save.inv.slice(0, INV_SIZE).forEach((item, i) => { this.inv[i] = item; });
      this.equip = { ...this.equip, ...save.equip };
      this.pos.set(save.x, 0, save.z);
    } else {
      this.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
      for (const id of this.cls.startItems) {
        const d = ITEMS[id];
        this.equip[d.type as EquipSlot] = { id, plus: 0, count: 1 };
      }
      this.addItem('hp1', 10, 0, true);
      this.addItem('mp1', 5, 0, true);
    }
    this.pos.y = game.terrain.getHeight(this.pos.x, this.pos.z);
    this.recalc();
    this.hp = save ? clamp(save.hp, 1, this.maxHp) : this.maxHp;
    this.mp = save ? clamp(save.mp, 0, this.maxMp) : this.maxMp;
    this.refreshModel();
  }

  serialize(): PlayerSave {
    return {
      name: this.name, cls: this.cls.id, level: this.level, exp: this.exp, statPoints: this.statPoints,
      stats: this.stats, gold: this.gold, hp: this.hp, mp: this.mp, inv: this.inv, equip: this.equip,
      x: this.alive ? this.pos.x : PLAYER_SPAWN.x, z: this.alive ? this.pos.z : PLAYER_SPAWN.z,
    };
  }

  get skills() { return this.cls.skills.map((id) => SKILLS[id]); }
  get expNeed() { return expForLevel(this.level); }
  get inCombat() { return this.sinceCombat < 5; }
  get attackActive() { return this.attackT >= 0; }
  get canAutoCast() { return this.alive && this.attackT < 0 && !this.dash && !this.model.attacking; }

  canUsePotion(kind: 'hp' | 'mp') {
    return this.alive && this.potionCd <= 0 && this.potionCount(kind) > 0 &&
      (kind === 'hp' ? this.hp < this.maxHp : this.mp < this.maxMp);
  }

  /** Ekipman, seviye ve güçlendirmelerden türetilen değerleri yeniden hesaplar. */
  recalc() {
    const eq = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, speed: 0 };
    for (const slot of EQUIP_SLOTS) {
      const s = this.equip[slot];
      if (!s) continue;
      const d = ITEMS[s.id], m = plusMult(s.plus);
      eq.atk += (d.atk ?? 0) * m; eq.def += (d.def ?? 0) * m;
      eq.hp += (d.hp ?? 0) * m; eq.mp += (d.mp ?? 0) * m;
      eq.crit += d.crit ?? 0; eq.speed += d.speed ?? 0;
    }
    const b = { atk: 0, def: 0, speed: 0, crit: 0 };
    for (const buff of this.buffs) {
      b.atk += buff.def.atk ?? 0; b.def += buff.def.def ?? 0;
      b.speed += buff.def.speed ?? 0; b.crit += buff.def.crit ?? 0;
    }
    const st = this.stats;
    this.maxHp = Math.round(this.cls.baseHp + st.vit * 20 + (this.level - 1) * 16 + eq.hp);
    this.maxMp = Math.round(this.cls.baseMp + st.int * 10 + (this.level - 1) * 5 + eq.mp);
    this.atk = Math.round((st[this.cls.mainStat] * 2.2 + this.level * 1.5 + eq.atk) * (1 + b.atk));
    this.def = Math.round((st.vit * 0.7 + this.level * 0.5 + eq.def) * (1 + b.def));
    this.crit = Math.min(60, 5 + st.dex * 0.35 + eq.crit + b.crit);
    this.moveSpeed = 6.4 * (1 + eq.speed / 100) * (1 + b.speed);
    this.atkSpeed = Math.min(1.6, 1 + st.dex * 0.006);
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
  }

  /** Ekipmana göre karakter modelini yeniden kurar. */
  refreshModel() {
    if (this.model) disposeModel(this.model.root);
    const armor = this.equip.armor ? ITEMS[this.equip.armor.id].look : undefined;
    const w = this.equip.weapon;
    const weaponLook = w ? ITEMS[w.id].look : undefined;
    const helmetLook = this.equip.helmet ? ITEMS[this.equip.helmet.id].look : undefined;
    const bootsLook = this.equip.boots ? ITEMS[this.equip.boots.id].look : undefined;
    const necklaceLook = this.equip.necklace ? ITEMS[this.equip.necklace.id].look : undefined;
    const ringLook = this.equip.ring ? ITEMS[this.equip.ring.id].look : undefined;
    const glow = w && w.plus >= 6 ? [0x3aa0ff, 0x3aa0ff, 0xb060ff, 0xffb030][Math.min(3, w.plus - 6)] : undefined;
    this.model = new Humanoid({
      skin: 0xd2a584, cloth: this.cls.cloth, hair: this.cls.hair,
      armor: armor?.color ?? this.cls.cloth, armorMetal: armor?.metal ?? 0, armorRough: armor?.rough ?? 0.85,
      weapon: w ? this.cls.weapon : 'none', weaponColor: weaponLook?.color, glow,
      helmet: !!this.equip.helmet, helmetColor: helmetLook?.color, helmetMetal: helmetLook?.metal, helmetRough: helmetLook?.rough,
      bootsColor: bootsLook?.color, bootsMetal: bootsLook?.metal,
      necklaceColor: necklaceLook?.color, ringColor: ringLook?.color,
      robe: this.cls.robe, scale: 1, bulk: this.cls.id === 'warrior' ? 1.1 : 1,
    });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.game.scene.add(this.model.root);
    if (!this.alive) this.model.die();
  }

  // ---------------------------------------------------------------- güncelleme

  update(dt: number) {
    const g = this.game;
    this.sinceCombat += dt;
    this.potionCd = Math.max(0, this.potionCd - dt);
    for (let i = 0; i < 4; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    if (this.buffs.length) {
      let expired = false;
      for (const b of this.buffs) {
        b.t -= dt;
        if (b.t <= 0) expired = true;
        else if (Math.random() < dt * 14) g.particles.emit(this.pos, { count: 1, color: b.color, speed: 0.5, up: 2.2, life: 0.9, size: 0.3, spread: 1.1 });
      }
      if (expired) {
        this.buffs = this.buffs.filter((b) => b.t > 0);
        this.recalc();
        g.events.emit('changed');
      }
    }
    if (!this.alive) {
      g.autoHunt.stop();
      this.model.update(dt, 0);
      return;
    }
    if (this.target && !this.target.alive) this.target = null;

    // Yenilenme
    if (!this.inCombat) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
    this.mp = Math.min(this.maxMp, this.mp + this.maxMp * 0.022 * dt);

    const inp = g.input;
    const cy = g.camera.yaw;
    let f = 0, r = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) f += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) f -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) r += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) r -= 1;
    f -= inp.virtualMove.y;
    r += inp.virtualMove.x;
    let mx = -Math.sin(cy) * f + Math.cos(cy) * r;
    let mz = -Math.cos(cy) * f - Math.sin(cy) * r;
    let wantAttack = inp.down('Space') || inp.virtualAttack;
    if (f !== 0 || r !== 0) this.intent = null;

    // Tıklamayla verilen niyet: hedefe yürü, saldır ya da konuş
    const it = this.intent;
    if (it) {
      if (it.kind === 'attack') {
        const e = it.enemy;
        if (!e.alive) this.intent = null;
        else {
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d > this.cls.range * 0.85 + e.radius) { mx = e.pos.x - this.pos.x; mz = e.pos.z - this.pos.z; }
          else wantAttack = true;
        }
      } else if (it.kind === 'npc') {
        const d = Math.hypot(it.npc.pos.x - this.pos.x, it.npc.pos.z - this.pos.z);
        if (d > 2.6) { mx = it.npc.pos.x - this.pos.x; mz = it.npc.pos.z - this.pos.z; }
        else { this.intent = null; g.interact(it.npc); }
      } else {
        const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
        if (d > 0.4) { mx = it.x - this.pos.x; mz = it.z - this.pos.z; }
        else this.intent = null;
      }
    }

    const manualHotbar = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].some((key) => inp.hit(key));
    const manualOverride = f !== 0 || r !== 0 || this.intent !== null || wantAttack || manualHotbar;
    const auto = g.autoHunt.update(dt, this, manualOverride);
    if (auto) {
      this.target = auto.target;
      if (auto.moveTo) {
        mx = auto.moveTo.x - this.pos.x;
        mz = auto.moveTo.z - this.pos.z;
      } else {
        mx = 0;
        mz = 0;
      }
      wantAttack = auto.attack;
    }

    const ml = Math.hypot(mx, mz);
    this.speedNow = 0;

    if (this.dash) {
      this.updateDash(dt);
    } else {
      if (ml > 0.01) {
        mx /= ml; mz /= ml;
        let sp = this.moveSpeed * (inp.down('ShiftLeft') ? 1.4 : 1);
        if (this.attackT >= 0) sp *= 0.3;
        this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 14, dt);
        this.tryMove(mx * sp * dt, mz * sp * dt);
        this.speedNow = sp;
        this.stepTimer -= dt * sp;
        if (this.stepTimer <= 0 && g.terrain.getDirt(this.pos.x, this.pos.z) > 0.5) {
          this.stepTimer = 2.2;
          g.particles.emit(this.pos, { count: 3, color: 0x9a8468, speed: 0.6, up: 0.8, life: 0.7, size: 0.45, additive: false, spread: 0.3 });
        }
      }
      if (wantAttack && this.attackT < 0) this.startAttack();
    }

    if (this.attackT >= 0) {
      this.attackT += dt / this.attackDur;
      if (!this.hitDone && this.attackT >= 0.45) { this.hitDone = true; this.doHit(); }
      if (this.attackT >= 1) { this.attackT = -1; this.comboTimer = 0.75; }
    } else if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.attackIdx = 0;
    }

    for (let i = 0; i < 4; i++) if (inp.hit(`Digit${i + 1}`)) this.useSkill(i);
    if (inp.hit('Digit5')) this.usePotion('hp');
    if (inp.hit('Digit6')) this.usePotion('mp');

    this.pos.y = g.terrain.getHeight(this.pos.x, this.pos.z);
    this.model.root.position.copy(this.pos);
    if (this.spin > 0) this.spin = Math.max(0, this.spin - dt * 2.6);
    this.model.root.rotation.y = this.yaw + (this.spin > 0 ? (1 - this.spin) * Math.PI * 4 : 0);
    this.model.update(dt, this.speedNow);
  }

  private tryMove(dx: number, dz: number) {
    const t = this.game.terrain;
    const lim = WORLD_HALF - 22;
    const ok = (x: number, z: number) => Math.abs(x) < lim && Math.abs(z) < lim && t.walkable(x, z);
    if (ok(this.pos.x + dx, this.pos.z + dz)) { this.pos.x += dx; this.pos.z += dz; }
    else if (ok(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else if (ok(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    this.game.colliders.resolve(this.pos, this.radius);
  }

  private forward() {
    return this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  private faceTarget() {
    const t = this.target;
    if (t && t.alive && t.pos.distanceTo(this.pos) < this.cls.range + 8) {
      this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    }
  }

  private startAttack() {
    const g = this.game;
    // Hedef yoksa önündeki en yakın düşmana dön
    if (!this.target) this.target = g.combat.nearestEnemy(this.pos, this.cls.ranged ? 18 : 4.5);
    this.faceTarget();
    if (this.comboTimer <= 0 && this.attackT < 0 && this.attackIdx > 2) this.attackIdx = 0;
    const idx = this.attackIdx % 3;
    this.attackDur = (idx === 2 ? 0.64 : 0.5) / this.atkSpeed;
    this.model.attack(this.attackDur, this.cls.ranged ? 3 : idx);
    this.attackT = 0;
    this.hitDone = false;
    this.attackIdx = (idx + 1) % 3;
    this.sinceCombat = Math.min(this.sinceCombat, 3);
    g.audio.swing();
  }

  private doHit() {
    const g = this.game;
    const idx = (this.attackIdx + 2) % 3;
    if (this.cls.ranged) {
      g.combat.fireProjectile(this, 1, 0, 0x7fd0ff);
      return;
    }
    const mult = [1, 1.1, 1.5][idx];
    g.effects.slash(this.pos, this.yaw, this.cls.range + 0.3, this.cls.id === 'assassin' ? 0xb0a0ff : 0xfff0d0, [0.5, -0.5, 0][idx]);
    const n = g.combat.frontDamage(this.cls.range, 1.15, mult, 6);
    if (n > 0 && idx === 2) g.camera.addShake(0.18);
  }

  private updateDash(dt: number) {
    const g = this.game, d = this.dash!;
    d.t -= dt;
    const sp = 34;
    this.tryMove(d.dx * sp * dt, d.dz * sp * dt);
    this.speedNow = 12;
    g.particles.emit(this.pos.clone().setY(this.pos.y + 1), { count: 3, color: d.skill.color, speed: 1, life: 0.4, size: 0.6, spread: 0.6 });
    for (const e of g.enemies) {
      if (!e.alive || d.hit.has(e)) continue;
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 2.1 + e.radius) {
        d.hit.add(e);
        g.combat.hitEnemy(e, d.skill.mult ?? 1, { stun: d.skill.stun });
      }
    }
    if (d.t <= 0) this.dash = null;
  }

  // ---------------------------------------------------------------- yetenekler

  useSkill(i: number) {
    const g = this.game;
    const sk = this.skills[i];
    if (!sk || !this.alive || this.dash) return;
    if (this.level < sk.level) { g.events.emit('log', { msg: `${sk.name} ${sk.level}. seviyede açılır.`, cls: 'warn' }); return; }
    if (this.cooldowns[i] > 0) return;
    if (this.mp < sk.mp) { g.events.emit('log', { msg: 'Yeterli mana yok.', cls: 'warn' }); return; }
    this.mp -= sk.mp;
    this.cooldowns[i] = sk.cd;
    this.sinceCombat = Math.min(this.sinceCombat, 3);
    this.faceTarget();
    const fw = this.forward();
    const chest = this.pos.clone().setY(this.pos.y + 1.1);
    g.audio.cast();

    switch (sk.type) {
      case 'aoe':
        this.model.attack(0.6, this.cls.ranged ? 3 : 1);
        if (!this.cls.ranged) this.spin = 1;
        g.effects.ring(this.pos, sk.radius!, sk.color, 0.5);
        g.effects.flash(this.pos, sk.color, 70);
        g.particles.emit(chest, { count: 70, color: sk.color, color2: 0xffffff, speed: sk.radius! * 2.2, life: 0.6, size: 0.55, flat: true, up: 1 });
        g.combat.areaDamage(this.pos, sk.radius!, sk.mult!, { stun: sk.stun, slow: sk.slow });
        if (sk.radius! > 6) { g.camera.addShake(0.6); g.audio.boom(); }
        break;
      case 'strike':
        this.model.attack(0.45, 0);
        g.effects.slash(this.pos, this.yaw, sk.radius! + 0.4, sk.color, 0.6);
        g.effects.slash(this.pos, this.yaw, sk.radius! + 0.2, sk.color, -0.6);
        g.combat.frontDamage(sk.radius!, 0.9, sk.mult!, 2);
        break;
      case 'dash':
        this.model.attack(0.4, 1);
        this.dash = { t: 0.26, dx: fw.x, dz: fw.z, skill: sk, hit: new Set() };
        g.effects.ring(this.pos, 3, sk.color, 0.35);
        break;
      case 'buff':
        this.model.attack(0.7, 3);
        this.buffs = this.buffs.filter((b) => b.id !== sk.id);
        this.buffs.push({ id: sk.id, t: sk.buff!.dur, def: sk.buff!, color: sk.color });
        this.recalc();
        g.effects.ring(this.pos, 3.5, sk.color, 0.7);
        g.particles.emit(chest, { count: 50, color: sk.color, speed: 2.5, up: 4, life: 1, size: 0.5, spread: 1 });
        g.events.emit('log', { msg: `${sk.name} etkin.`, cls: 'good' });
        break;
      case 'projectile':
        this.model.attack(0.5, 3);
        g.combat.fireProjectile(this, sk.mult!, sk.radius!, sk.color, 0.75);
        break;
      case 'targetAoe': {
        this.model.attack(0.8, 3);
        const t = this.target;
        const c = t && t.alive && t.pos.distanceTo(this.pos) < 24 ? t.pos.clone() : this.pos.clone().addScaledVector(fw, 9);
        c.y = g.terrain.getHeight(c.x, c.z);
        g.effects.ring(c, sk.radius!, sk.color, 0.9);
        for (let k = 0; k < 6; k++) {
          g.combat.later(0.15 + k * 0.11, () => {
            const p = c.clone();
            p.x += rand(-1, 1) * sk.radius! * 0.6; p.z += rand(-1, 1) * sk.radius! * 0.6;
            g.effects.bolt(p, sk.color);
            g.effects.flash(p, sk.color, 140, 0.25);
            g.particles.emit(p, { count: 24, color: sk.color, color2: 0xffffff, speed: 7, up: 4, life: 0.5, size: 0.5, gravity: 10 });
            if (k % 2 === 0) g.audio.boom();
            if (k === 2) { g.combat.areaDamage(c, sk.radius!, sk.mult!, { stun: sk.stun }); g.camera.addShake(0.5); }
          });
        }
        break;
      }
    }
    g.events.emit('changed');
  }

  // ---------------------------------------------------------------- hasar / gelişim

  takeDamage(raw: number, _from?: Enemy) {
    if (!this.alive) return;
    const g = this.game;
    const dmg = Math.max(1, Math.round(raw * rand(0.88, 1.12) - this.def * 0.5));
    this.hp -= dmg;
    this.sinceCombat = 0;
    this.model.hit();
    g.audio.hurt();
    g.events.emit('damageText', { pos: this.pos, y: 2, text: `-${dmg}`, cls: 'hurt' });
    g.events.emit('playerHurt');
    g.camera.addShake(Math.min(0.4, 0.06 + (dmg / this.maxHp) * 1.5));
    g.particles.emit(this.pos.clone().setY(this.pos.y + 1.2), { count: 8, color: 0xff3020, speed: 3, life: 0.35, size: 0.3 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.intent = null;
      this.target = null;
      this.dash = null;
      this.attackT = -1;
      this.model.die();
      g.events.emit('playerDied');
    }
  }

  respawn() {
    this.alive = true;
    const lost = Math.min(this.exp, Math.ceil(this.expNeed * 0.02));
    if (lost > 0) {
      this.exp -= lost;
      this.game.events.emit('log', { msg: `Yenilgi bedeli: -${lost} tecrübe`, cls: 'warn' });
    }
    this.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
    this.yaw = Math.PI;
    this.game.camera.setView(0, 0.5, 11);
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.model.revive();
    this.game.camera.snap(this.pos);
    this.game.events.emit('changed');
  }

  gainExp(n: number) {
    if (this.level >= MAX_LEVEL) return;
    const g = this.game;
    this.exp += n;
    let leveled = false;
    while (this.exp >= this.expNeed && this.level < MAX_LEVEL) {
      this.exp -= this.expNeed;
      this.level++;
      this.statPoints += 3;
      leveled = true;
    }
    if (leveled) {
      this.recalc();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      g.audio.levelUp();
      g.effects.ring(this.pos, 7, 0xffd060, 1.1);
      g.effects.flash(this.pos, 0xffd060, 160, 0.8);
      g.particles.emit(this.pos, { count: 140, color: 0xffd060, color2: 0xffffff, speed: 3, up: 9, life: 1.6, size: 0.55, spread: 1.6 });
      g.events.emit('log', { msg: `Seviye atladın! Artık ${this.level}. seviyesin. (+3 nitelik puanı)`, cls: 'gold' });
      g.events.emit('levelUp', this.level);
      for (const sk of this.skills) if (sk.level === this.level) g.events.emit('log', { msg: `Yeni yetenek açıldı: ${sk.name}`, cls: 'gold' });
    }
    g.events.emit('changed');
  }

  addStat(key: StatKey) {
    if (this.statPoints <= 0) return;
    this.statPoints--;
    this.stats[key]++;
    this.recalc();
    this.game.events.emit('changed');
  }

  // ---------------------------------------------------------------- envanter

  addItem(id: string, count = 1, plus = 0, silent = false) {
    const d = ITEMS[id];
    if (d.stack) {
      const ex = this.inv.slice(0, INVENTORY_OPEN_SLOTS).find((s) => s && s.id === id);
      if (ex) { ex.count += count; if (!silent) this.game.events.emit('changed'); return true; }
    }
    const free = this.inv.slice(0, INVENTORY_OPEN_SLOTS).indexOf(null);
    if (free < 0) {
      this.game.events.emit('log', { msg: 'Envanter dolu!', cls: 'warn' });
      return false;
    }
    this.inv[free] = { id, plus, count: d.stack ? count : 1 };
    if (!silent) this.game.events.emit('changed');
    return true;
  }

  canAddItem(id: string) {
    const d = ITEMS[id];
    if (!d) return false;
    if (d.stack && this.inv.slice(0, INVENTORY_OPEN_SLOTS).some((slot) => slot?.id === id)) return true;
    return this.inv.slice(0, INVENTORY_OPEN_SLOTS).some((slot) => slot === null);
  }

  moveItem(from: ItemLocation, to: ItemLocation) {
    const validLocation = (location: ItemLocation) =>
      !('inv' in location) || (Number.isInteger(location.inv) && location.inv >= 0 && location.inv < INVENTORY_OPEN_SLOTS);
    if (!validLocation(from) || !validLocation(to)) return false;
    const sameSlot = ('inv' in from && 'inv' in to && from.inv === to.inv) ||
      ('equip' in from && 'equip' in to && from.equip === to.equip);
    if (sameSlot) return false;

    const get = (location: ItemLocation) => 'inv' in location ? this.inv[location.inv] : this.equip[location.equip];
    const set = (location: ItemLocation, item: ItemStack | null) => {
      if ('inv' in location) this.inv[location.inv] = item;
      else this.equip[location.equip] = item;
    };
    const source = get(from), target = get(to);
    if (!source) return false;

    const canEquip = (item: ItemStack, slot: EquipSlot) => {
      const def = ITEMS[item.id];
      if (!isEquip(def) || def.type !== slot) return false;
      if (def.cls && def.cls !== this.cls.id) {
        this.game.events.emit('log', { msg: `${def.name}: sınıfın bu eşyayı kullanamaz.`, cls: 'warn' });
        return false;
      }
      if (def.level > this.level) {
        this.game.events.emit('log', { msg: `${def.name} için ${def.level}. seviye gerekli.`, cls: 'warn' });
        return false;
      }
      return true;
    };

    if ('equip' in to && !canEquip(source, to.equip)) return false;
    if ('equip' in from && target && !canEquip(target, from.equip)) return false;

    if ('inv' in from && 'inv' in to && target && source.id === target.id && ITEMS[source.id].stack) {
      target.count += source.count;
      set(from, null);
    } else {
      set(to, source);
      set(from, target);
    }

    if ('equip' in from || 'equip' in to) {
      this.recalc();
      this.refreshModel();
    }
    this.game.audio.click();
    this.game.events.emit('changed');
    return true;
  }

  countItem(id: string) {
    return this.inv.slice(0, INVENTORY_OPEN_SLOTS).reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  removeItem(id: string, count: number) {
    for (let i = 0; i < INVENTORY_OPEN_SLOTS && count > 0; i++) {
      const s = this.inv[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(count, s.count);
      s.count -= take;
      count -= take;
      if (s.count <= 0) this.inv[i] = null;
    }
  }

  /** Envanter yuvasındaki eşyayı kullanır ya da kuşanır. */
  useSlot(i: number) {
    if (!Number.isInteger(i) || i < 0 || i >= INVENTORY_OPEN_SLOTS) return;
    const s = this.inv[i];
    if (!s) return;
    const d = ITEMS[s.id];
    const g = this.game;
    if (d.type === 'potion') {
      if (this.potionCd > 0 || !this.alive) return;
      if (d.heal && this.hp >= this.maxHp) return;
      if (d.mana && this.mp >= this.maxMp) return;
      this.potionCd = 0.8;
      if (d.heal) { this.hp = Math.min(this.maxHp, this.hp + d.heal); g.events.emit('damageText', { pos: this.pos, y: 2.2, text: `+${d.heal}`, cls: 'heal' }); }
      if (d.mana) { this.mp = Math.min(this.maxMp, this.mp + d.mana); g.events.emit('damageText', { pos: this.pos, y: 2.2, text: `+${d.mana}`, cls: 'mana' }); }
      g.particles.emit(this.pos, { count: 22, color: d.heal ? 0xff5050 : 0x50a0ff, speed: 1, up: 3.5, life: 0.9, size: 0.4, spread: 1 });
      g.audio.pickup();
      s.count--;
      if (s.count <= 0) this.inv[i] = null;
    } else if (isEquip(d)) {
      if (d.cls && d.cls !== this.cls.id) { g.events.emit('log', { msg: `${d.name}: sınıfın bu eşyayı kullanamaz.`, cls: 'warn' }); return; }
      if (d.level > this.level) { g.events.emit('log', { msg: `${d.name} için ${d.level}. seviye gerekli.`, cls: 'warn' }); return; }
      const slot = d.type as EquipSlot;
      this.inv[i] = this.equip[slot];
      this.equip[slot] = s;
      this.recalc();
      this.refreshModel();
      g.audio.click();
      g.events.emit('log', { msg: `${itemLabel(s)} kuşanıldı.` });
    } else return;
    g.events.emit('changed');
  }

  unequip(slot: EquipSlot) {
    const s = this.equip[slot];
    if (!s) return;
    const free = this.inv.slice(0, INVENTORY_OPEN_SLOTS).indexOf(null);
    if (free < 0) { this.game.events.emit('log', { msg: 'Envanter dolu!', cls: 'warn' }); return; }
    this.inv[free] = s;
    this.equip[slot] = null;
    this.recalc();
    this.refreshModel();
    this.game.events.emit('changed');
  }

  usePotion(kind: 'hp' | 'mp') {
    const i = this.inv.slice(0, INVENTORY_OPEN_SLOTS).findIndex((s) => s && (kind === 'hp' ? ITEMS[s.id].heal : ITEMS[s.id].mana));
    if (i >= 0) this.useSlot(i);
    else this.game.events.emit('log', { msg: kind === 'hp' ? 'Can iksirin kalmadı.' : 'Mana iksirin kalmadı.', cls: 'warn' });
  }

  potionCount(kind: 'hp' | 'mp') {
    return this.inv.reduce((n, s) => n + (s && (kind === 'hp' ? ITEMS[s.id].heal : ITEMS[s.id].mana) ? s.count : 0), 0);
  }
}
