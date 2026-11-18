import * as THREE from 'three';
import { clamp, dampAngle } from '../core/utils';
import { CLASSES, ClassDef, ClassId, MAX_LEVEL, StatKey, expForLevel } from '../data/classes';
import { EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, plusMult } from '../data/items';
import { SKILLS, SkillDef } from '../data/skills';
import { INVENTORY_TOTAL_SLOTS, InvCell, isLink } from '../data/inventory';
import { PLAYER_SPAWN, WORLD_HALF } from '../data/world';
import { HORSES } from '../data/horses';
import { Quadruped } from './creatures';
import { Humanoid } from './humanoid';
import { disposeModel } from './model';
import * as combat from './playerCombat';
import * as inv from './playerInventory';
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
  horse?: string | null;
  hotbar?: (HotbarEntry | null)[];
}

/** Kısayol çubuğu gözü: yetenek sırası ya da envanter eşyası referansı. */
export type HotbarEntry = { t: 'skill'; i: number } | { t: 'item'; id: string; plus: number };
export const HOTBAR_SLOTS = 8;

export type Intent = { kind: 'attack'; enemy: Enemy } | { kind: 'npc'; npc: Npc } | { kind: 'move'; x: number; z: number } | null;
export type ItemLocation = { inv: number } | { equip: EquipSlot };
export interface Buff { id: string; t: number; def: NonNullable<SkillDef['buff']>; color: number }
export interface DashState { t: number; dx: number; dz: number; skill: SkillDef; hit: Set<Enemy> }

/**
 * Oyuncu karakteri. Durum ve hareketi burada tutulur; dövüş mantığı `playerCombat.ts`,
 * envanter/kuşanma/kısayol mantığı `playerInventory.ts` içinde. Dış API bu sınıf üzerinden kalır.
 */
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
  inv: InvCell[] = new Array(INV_SIZE).fill(null);
  equip: Record<EquipSlot, ItemStack | null> = {
    weapon: null, shield: null, armor: null, helmet: null, boots: null,
    necklace: null, ring: null, earring: null, bracelet: null, belt: null,
  };
  alive = true;
  target: Enemy | null = null;
  intent: Intent = null;
  /** Seyisten alınan binek ve biniş durumu. */
  horseId: string | null = null;
  mounted = false;
  private horse: Quadruped | null = null;
  private mountCd = 0;
  cooldowns = [0, 0, 0, 0];
  buffs: Buff[] = [];
  /** 1–4 ve F1–F4 tuşlarına bağlı kısayol çubuğu (ilk 4 göz 1–4, son 4 göz F1–F4). */
  hotbar: (HotbarEntry | null)[] = new Array(HOTBAR_SLOTS).fill(null);
  readonly radius = 0.45;

  // Türetilmiş değerler
  maxHp = 1; maxMp = 1; atk = 1; def = 0; crit = 5; moveSpeed = 6.4; atkSpeed = 1;

  // Dövüş ve zamanlama durumu (playerCombat.ts ve playerInventory.ts tarafından da kullanılır)
  /** @internal */ speedNow = 0;
  /** @internal */ attackT = -1;
  /** @internal */ attackDur = 0.5;
  /** @internal */ attackIdx = 0;
  /** @internal */ hitDone = false;
  /** @internal */ comboTimer = 0;
  /** @internal */ spin = 0;
  /** @internal */ dash: DashState | null = null;
  /** @internal */ sinceCombat = 99;
  /** @internal */ potionCd = 0;
  /** @internal */ stepTimer = 0;
  /** @internal */ fwd = new THREE.Vector3();

  constructor(readonly game: Game, public name: string, clsId: ClassId, save?: PlayerSave) {
    this.cls = CLASSES[clsId];
    this.stats = { ...this.cls.stats };
    if (save) {
      this.level = save.level; this.exp = save.exp; this.statPoints = save.statPoints;
      this.stats = { ...save.stats }; this.gold = save.gold;
      this.horseId = save.horse && Object.hasOwn(HORSES, save.horse) ? save.horse : null;
      this.inv = new Array(INV_SIZE).fill(null);
      save.inv.slice(0, INV_SIZE).forEach((item, i) => { if (item) inv.restoreStack(this, i, item); });
      this.equip = { ...this.equip, ...save.equip };
      if (save.hotbar) save.hotbar.slice(0, HOTBAR_SLOTS).forEach((e, i) => { this.hotbar[i] = e; });
      else this.defaultHotbar();
      this.pos.set(save.x, 0, save.z);
    } else {
      this.defaultHotbar();
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

  /** Başlangıç çubuğu: 1–4 yetenekler, F1–F2 iksirler. */
  private defaultHotbar() {
    for (let i = 0; i < 4; i++) this.hotbar[i] = { t: 'skill', i };
    this.hotbar[4] = { t: 'item', id: 'hp1', plus: 0 };
    this.hotbar[5] = { t: 'item', id: 'mp1', plus: 0 };
  }

  serialize(): PlayerSave {
    return {
      name: this.name, cls: this.cls.id, level: this.level, exp: this.exp, statPoints: this.statPoints,
      stats: this.stats, gold: this.gold, hp: this.hp, mp: this.mp,
      inv: this.inv.map((c) => (c && isLink(c) ? null : c)) as (ItemStack | null)[], equip: this.equip,
      x: this.alive ? this.pos.x : PLAYER_SPAWN.x, z: this.alive ? this.pos.z : PLAYER_SPAWN.z,
      horse: this.horseId, hotbar: this.hotbar,
    };
  }

  get skills() { return this.cls.skills.map((id) => SKILLS[id]); }
  get expNeed() { return expForLevel(this.level); }
  /** Kuşanılan silahın tanımı; silahsızken undefined. */
  get weaponDef() { return this.equip.weapon ? ITEMS[this.equip.weapon.id] : undefined; }
  /** Vuruş menzili (metre): silahın menzili, yoksa savaşçının yakın dövüş menzili. */
  get attackRange() { return this.weaponDef?.range ?? this.cls.range; }
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
    if (this.mounted && this.horseId) this.moveSpeed *= HORSES[this.horseId]?.speed ?? 1;
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
      weapon: w ? (ITEMS[w.id].weapon ?? this.cls.weapon) : 'none', weaponColor: weaponLook?.color, weaponScale: w ? ITEMS[w.id].weaponScale : undefined, twoHanded: w ? ITEMS[w.id].hands === 2 : false, glow,
      helmet: !!this.equip.helmet, helmetColor: helmetLook?.color, helmetMetal: helmetLook?.metal, helmetRough: helmetLook?.rough,
      bootsColor: bootsLook?.color, bootsMetal: bootsLook?.metal,
      necklaceColor: necklaceLook?.color, ringColor: ringLook?.color,
      playerStyle: this.cls.id,
      scale: 1, bulk: 1.14,
    });
    this.model.root.position.copy(this.pos);
    if (this.mounted) this.model.root.position.y += 0.66;
    this.model.root.rotation.y = this.yaw;
    this.model.riding = this.mounted;
    this.game.scene.add(this.model.root);
    if (!this.alive) this.model.die();
  }

  /** Karakteri dünyada (duvar ve çarpışmalara uyarak) hareket ettirir. */
  tryMove(dx: number, dz: number) {
    const t = this.game.terrain;
    const lim = WORLD_HALF - 22;
    const ok = (x: number, z: number) => Math.abs(x) < lim && Math.abs(z) < lim && t.walkable(x, z);
    if (ok(this.pos.x + dx, this.pos.z + dz)) { this.pos.x += dx; this.pos.z += dz; }
    else if (ok(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else if (ok(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    this.game.colliders.resolve(this.pos, this.radius);
  }

  // ------------------------------------------------------------------ binek

  get horseDef() { return this.horseId ? HORSES[this.horseId] : undefined; }

  toggleMount() {
    if (!this.horseId || !this.alive || this.mountCd > 0) return;
    if (this.mounted) this.dismount(); else this.mount();
  }

  mount() {
    const def = this.horseDef;
    if (!def || this.mounted || !this.alive || this.mountCd > 0) return;
    if (!this.horse) this.horse = new Quadruped(def.look, this.game.tex);
    this.mounted = true;
    this.mountCd = 0.5;
    this.horse.revive();
    this.horse.root.position.copy(this.pos);
    this.horse.root.rotation.y = this.yaw;
    this.game.scene.add(this.horse.root);
    this.model.riding = true;
    this.recalc();
    this.game.audio.click();
    this.game.effects.ring(this.pos.clone(), 1.6, 0xd0b070, 0.4);
    this.game.events.emit('log', { msg: `${def.name} sırtındasın.`, cls: 'good' });
    this.game.events.emit('changed');
  }

  dismount(silent = false) {
    if (!this.mounted) return;
    this.mounted = false;
    this.mountCd = 0.5;
    if (this.horse) this.game.scene.remove(this.horse.root);
    this.model.riding = false;
    this.model.root.position.copy(this.pos);
    this.recalc();
    if (!silent) {
      this.game.audio.click();
      this.game.events.emit('log', { msg: 'Attan indin.' });
    }
    this.game.events.emit('changed');
  }

  // ---------------------------------------------------------------- güncelleme

  update(dt: number) {
    const g = this.game;
    this.sinceCombat += dt;
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.mountCd = Math.max(0, this.mountCd - dt);
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
      g.questNav.update(dt, false); // oto görev: dirilme sayacını sürdürür
      this.model.update(dt, 0);
      return;
    }
    if (this.target && !this.target.alive) this.target = null;

    // Yenilenme
    if (!this.inCombat) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
    this.mp = Math.min(this.maxMp, this.mp + this.maxMp * 0.022 * dt);

    const input = g.input;
    const cy = g.camera.yaw;
    let f = 0, r = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) f += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) f -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) r += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) r -= 1;
    f -= input.virtualMove.y;
    r += input.virtualMove.x;
    let mx = -Math.sin(cy) * f + Math.cos(cy) * r;
    let mz = -Math.cos(cy) * f - Math.sin(cy) * r;
    let wantAttack = input.down('Space') || input.virtualAttack;
    if (f !== 0 || r !== 0) this.intent = null;

    // Tıklamayla verilen niyet: hedefe yürü, saldır ya da konuş
    const it = this.intent;
    if (it) {
      if (it.kind === 'attack') {
        const e = it.enemy;
        if (!e.alive) this.intent = null;
        else {
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d > this.attackRange * 0.85 + e.radius) { mx = e.pos.x - this.pos.x; mz = e.pos.z - this.pos.z; }
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

    const manualHotbar = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].some((key) => input.hit(key));
    const manualOverride = f !== 0 || r !== 0 || this.intent !== null || wantAttack || manualHotbar;
    // Öncelik: tıklama niyeti > görev rotası > oto av. Elle girdi rotayı iptal eder.
    const waypoint = g.questNav.update(dt, manualOverride || input.mouse.clicked || input.hit('KeyE'));
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
    } else if (waypoint) {
      mx = waypoint.x - this.pos.x;
      mz = waypoint.z - this.pos.z;
    }

    const ml = Math.hypot(mx, mz);
    this.speedNow = 0;

    if (this.dash) {
      combat.updateDash(this, dt);
    } else {
      if (ml > 0.01) {
        mx /= ml; mz /= ml;
        let sp = this.moveSpeed * (input.down('ShiftLeft') ? 1.4 : 1);
        if (this.attackT >= 0) sp *= 0.3;
        this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 14, dt);
        const travel = waypoint && !auto ? Math.min(sp * dt, ml) : sp * dt;
        this.tryMove(mx * travel, mz * travel);
        this.speedNow = sp;
        this.stepTimer -= dt * sp;
        if (this.stepTimer <= 0 && g.terrain.getDirt(this.pos.x, this.pos.z) > 0.5) {
          this.stepTimer = 2.2;
          g.particles.emit(this.pos, { count: 3, color: 0x9a8468, speed: 0.6, up: 0.8, life: 0.7, size: 0.45, additive: false, spread: 0.3 });
        }
      }
      if (wantAttack && this.attackT < 0) combat.startAttack(this);
    }

    if (this.attackT >= 0) {
      this.attackT += dt / this.attackDur;
      if (!this.hitDone && this.attackT >= 0.45) { this.hitDone = true; combat.doHit(this); }
      if (this.attackT >= 1) { this.attackT = -1; this.comboTimer = 0.75; }
    } else if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.attackIdx = 0;
    }

    for (let i = 0; i < 4; i++) {
      if (input.hit(`Digit${i + 1}`)) this.useHotbar(i);
      if (input.hit(`F${i + 1}`)) this.useHotbar(4 + i);
    }
    if (input.hit('KeyR')) this.toggleMount();

    this.pos.y = g.terrain.getHeight(this.pos.x, this.pos.z);
    this.model.root.position.copy(this.pos);
    if (this.mounted && this.horse) {
      this.horse.root.position.copy(this.pos);
      this.horse.root.rotation.y = this.yaw;
      this.model.root.position.y = this.pos.y + 0.66;
      this.horse.update(dt, this.speedNow);
    }
    if (this.spin > 0) this.spin = Math.max(0, this.spin - dt * 2.6);
    this.model.root.rotation.y = this.yaw + (this.spin > 0 ? (1 - this.spin) * Math.PI * 4 : 0);
    this.model.update(dt, this.speedNow);
  }

  // ---------------------------------------------------------------- dövüş (playerCombat.ts)

  useSkill(i: number) { combat.useSkill(this, i); }
  takeDamage(raw: number, _from?: Enemy) { combat.takeDamage(this, raw); }
  respawn() { combat.respawn(this); }

  // ---------------------------------------------------------------- gelişim

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

  // ---------------------------------------------------------------- envanter (playerInventory.ts)

  stackAt(i: number): ItemStack | null { return inv.stackAt(this, i); }
  anchorIndex(i: number) { return inv.anchorIndex(this, i); }
  removeAt(i: number): ItemStack | null { return inv.removeAt(this, i); }
  fitsAll(ids: string[]) { return inv.fitsAll(this, ids); }
  addItem(id: string, count = 1, plus = 0, silent = false) { return inv.addItem(this, id, count, plus, silent); }
  canAddItem(id: string) { return inv.canAddItem(this, id); }
  sortInventory() { inv.sortInventory(this); }
  moveItem(from: ItemLocation, to: ItemLocation) { return inv.moveItem(this, from, to); }
  countItem(id: string) { return inv.countItem(this, id); }
  removeItem(id: string, count: number) { inv.removeItem(this, id, count); }
  useSlot(i: number) { inv.useSlot(this, i); }
  unequip(slot: EquipSlot) { inv.unequip(this, slot); }
  addBuff(id: string, def: NonNullable<SkillDef['buff']>, color = 0xf0c040) { inv.addBuff(this, id, def, color); }
  useHotbar(i: number) { inv.useHotbar(this, i); }
  usePotion(kind: 'hp' | 'mp') { inv.usePotion(this, kind); }
  potionCount(kind: 'hp' | 'mp') { return inv.potionCount(this, kind); }
}
