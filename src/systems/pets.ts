import * as THREE from 'three';
import { dampAngle } from '../core/utils';
import { ITEMS, ItemStack, itemLabel } from '../data/items';
import { PETS, PET_SLOTS, PetBonus, PetDef } from '../data/pets';
import type { Enemy } from '../entities/enemy';
import { disposeModel } from '../entities/model';
import { PetModel } from '../entities/petModels';
import type { Player } from '../entities/player';
import type { Drop } from './loot';

/** Sahip olunan pet: kimliği ve (destek petlerinde) çantası. */
export interface OwnedPet { id: string; bag: (ItemStack | null)[] }
/** Kayıtta tutulan pet bilgisi. */
export interface PetSave { owned: OwnedPet[]; active: (string | null)[] }

/** Dünyadaki canlı pet: model, konum ve davranış durumu. */
interface PetActor {
  id: string;
  def: PetDef;
  model: PetModel;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  cd: number;
  target: Enemy | null;
  pickup: Drop | null;
  bob: number;
}

const FOLLOW_DIST = 1.7;
const BASE_SPEED = 9;
const TELEPORT_DIST = 25;
/** Saldırı petlerinin oyuncu çevresinde hedef arama yarıçapı. */
const AGGRO_RANGE = 12;
const FLY_HEIGHT = 1.5;

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Evcil hayvan sistemi: sahip olunan petler, iki aktif slot, destek petlerinin pasif bonusu,
 * çantası ve otomatik ganimet toplaması, saldırı petlerinin hedefe saldırması.
 */
export class PetSystem {
  owned: OwnedPet[] = [];
  active: (string | null)[] = new Array(PET_SLOTS).fill(null);
  private actors = new Map<string, PetActor>();

  constructor(private p: Player, save?: PetSave | null) {
    if (!save) return;
    for (const o of save.owned) {
      const d = PETS[o.id];
      if (!d || this.owns(o.id)) continue;
      const bag: (ItemStack | null)[] = new Array(d.bag ?? 0).fill(null);
      (o.bag ?? []).slice(0, bag.length).forEach((s, i) => { if (s && ITEMS[s.id]) bag[i] = { ...s }; });
      this.owned.push({ id: o.id, bag });
    }
    save.active.slice(0, PET_SLOTS).forEach((id, i) => {
      if (id && this.owns(id) && !this.active.includes(id)) this.active[i] = id;
    });
  }

  owns(id: string) { return this.owned.some((o) => o.id === id); }
  get(id: string) { return this.owned.find((o) => o.id === id); }
  isActive(id: string) { return this.active.includes(id); }

  /** Kuşanılı destek petlerinin toplam pasif bonusu. */
  get bonus(): Required<PetBonus> {
    const b = { atkPct: 0, defPct: 0, hp: 0, crit: 0, speedPct: 0, expPct: 0 };
    for (const id of this.active) {
      const d = id ? PETS[id] : undefined;
      if (d?.kind !== 'support' || !d.bonus) continue;
      for (const k of Object.keys(b) as (keyof PetBonus)[]) b[k] += d.bonus[k] ?? 0;
    }
    return b;
  }

  serialize(): PetSave {
    return {
      owned: this.owned.map((o) => ({ id: o.id, bag: o.bag.map((s) => (s ? { ...s } : null)) })),
      active: [...this.active],
    };
  }

  private log(msg: string, cls = '') { this.p.game.events.emit('log', { msg, cls }); }
  private changed() { this.p.game.events.emit('changed'); }

  /** Pet satın alır (seviye ve akçe kontrolü); boş slot varsa hemen kuşanır. */
  buy(id: string): boolean {
    const d = PETS[id];
    const g = this.p.game;
    if (!d || this.owns(id)) return false;
    if (this.p.level < d.level) { this.log(`${d.name} için ${d.level}. seviye gerekli.`, 'warn'); return false; }
    if (this.p.gold < d.cost) { this.log('Yeterli akçen yok.', 'warn'); g.audio.fail(); return false; }
    this.p.gold -= d.cost;
    this.owned.push({ id, bag: new Array(d.bag ?? 0).fill(null) });
    g.audio.coin();
    this.log(`${d.name} artık seninle! Petlerini P ile yönetebilirsin.`, 'gold');
    if (this.active.includes(null)) this.equip(id, undefined, true);
    this.changed();
    return true;
  }

  /** Peti bir slota kuşanır (slot verilmezse ilk boş slot). */
  equip(id: string, slot?: number, silent = false): boolean {
    if (!this.owns(id) || this.isActive(id)) return false;
    const i = slot ?? this.active.indexOf(null);
    if (i < 0 || i >= PET_SLOTS) { this.log('İki pet slotun da dolu; önce birini çıkar.', 'warn'); return false; }
    if (this.active[i]) this.unequip(this.active[i]!, true);
    this.active[i] = id;
    this.p.recalc();
    if (!silent) this.log(`${PETS[id].name} yanına geldi.`, 'good');
    this.changed();
    return true;
  }

  unequip(id: string, silent = false) {
    const i = this.active.indexOf(id);
    if (i < 0) return;
    this.active[i] = null;
    this.despawn(id);
    this.p.recalc();
    if (!silent) this.log(`${PETS[id].name} ahıra döndü.`);
    this.changed();
  }

  /** Eşya pet çantasına sığar mı (yığın birleşimi dahil)? */
  canStash(o: OwnedPet, item: ItemStack) {
    const def = ITEMS[item.id];
    if (!def) return false;
    if (def.stack && o.bag.some((s) => s && s.id === item.id && s.plus === item.plus)) return true;
    return o.bag.includes(null);
  }

  /** Eşyayı pet çantasına koyar. */
  stash(o: OwnedPet, item: ItemStack): boolean {
    const def = ITEMS[item.id];
    if (!def || !this.canStash(o, item)) return false;
    const same = def.stack ? o.bag.find((s) => s && s.id === item.id && s.plus === item.plus) : undefined;
    if (same) same.count += item.count;
    else o.bag[o.bag.indexOf(null)] = { ...item };
    return true;
  }

  /** Pet çantasındaki eşyayı oyuncunun envanterine taşır. */
  takeFromBag(petId: string, index: number): boolean {
    const o = this.get(petId);
    const s = o?.bag[index];
    if (!o || !s) return false;
    if (!this.p.canAddItem(s.id) || !this.p.addItem(s.id, s.count, s.plus, true)) {
      this.log('Envanterin dolu.', 'warn');
      return false;
    }
    o.bag[index] = null;
    this.p.game.audio.pickup();
    this.changed();
    return true;
  }

  /** Pet çantasındaki her şeyi sığdığı kadar oyuncuya taşır. */
  takeAll(petId: string): number {
    const o = this.get(petId);
    if (!o) return 0;
    let moved = 0;
    for (let i = 0; i < o.bag.length; i++) {
      const s = o.bag[i];
      if (!s) continue;
      if (!this.p.canAddItem(s.id) || !this.p.addItem(s.id, s.count, s.plus, true)) break;
      o.bag[i] = null;
      moved++;
    }
    if (moved) { this.p.game.audio.pickup(); this.log(`${moved} eşya ${PETS[petId].name} çantasından alındı.`, 'good'); }
    else if (o.bag.some(Boolean)) this.log('Envanterin dolu.', 'warn');
    this.changed();
    return moved;
  }

  // ------------------------------------------------------------------ dünya

  private spawn(id: string): PetActor {
    const def = PETS[id];
    const model = new PetModel(def.look);
    const p = this.p;
    const pos = new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * FOLLOW_DIST, 0, p.pos.z - Math.cos(p.yaw) * FOLLOW_DIST);
    p.game.scene.add(model.root);
    p.game.effects.ring(pos.clone().setY(p.game.terrain.getHeight(pos.x, pos.z)), 0.9, def.look.accent, 0.4);
    const a: PetActor = { id, def, model, pos, yaw: p.yaw, speed: 0, cd: 0, target: null, pickup: null, bob: Math.random() * 6 };
    this.actors.set(id, a);
    return a;
  }

  private despawn(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    disposeModel(a.model.root);
    this.actors.delete(id);
  }

  /** Saldırı peti için hedef: oyuncunun hedefi, yoksa oyuncuyla savaşan en yakın düşman. */
  private pickTarget(): Enemy | null {
    const p = this.p;
    if (p.target?.alive && dist2(p.target.pos, p.pos) < AGGRO_RANGE) return p.target;
    let best: Enemy | null = null, bd = AGGRO_RANGE;
    for (const e of p.game.enemies) {
      if (!e.alive || e.isStone || (e.state !== 'chase' && e.state !== 'attack')) continue;
      const d = dist2(e.pos, p.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Destek peti için toplanacak en yakın ganimet (başka petin hedeflemediği). */
  private pickDrop(a: PetActor, o: OwnedPet): Drop | null {
    const p = this.p;
    const taken = new Set([...this.actors.values()].map((x) => x.pickup).filter(Boolean));
    let best: Drop | null = null, bd = Infinity;
    for (const d of p.game.loot.drops) {
      if (d.t < 0.4 || taken.has(d)) continue;
      if (d.item && !this.canStash(o, d.item)) continue;
      const pos = d.group.position;
      if (dist2(pos, p.pos) > (a.def.pickupRadius ?? 10)) continue;
      const dd = dist2(pos, a.pos);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  private collect(a: PetActor, o: OwnedPet, d: Drop) {
    const g = this.p.game;
    if (d.gold) {
      this.p.gold += d.gold;
      g.audio.coin();
      this.log(`${a.def.name} getirdi: +${d.gold} Akçe`, 'gold');
    } else if (d.item) {
      if (!this.stash(o, d.item)) return;
      g.audio.pickup();
      this.log(`${a.def.name} topladı: ${itemLabel(d.item)}${d.item.count > 1 ? ` x${d.item.count}` : ''}`, `r${ITEMS[d.item.id].rarity}`);
    }
    g.loot.takeDrop(d);
    this.changed();
  }

  update(dt: number) {
    const p = this.p, g = p.game;
    // Aktif petlerin dünyadaki karşılıklarını eşitle
    for (const id of this.active) if (id && !this.actors.has(id)) this.spawn(id);
    for (const id of [...this.actors.keys()]) if (!this.active.includes(id)) this.despawn(id);

    for (const a of this.actors.values()) {
      const slot = this.active.indexOf(a.id);
      const side = slot === 0 ? 1 : -1;
      const ang = p.yaw + Math.PI + side * 0.7;
      let tx = p.pos.x + Math.sin(ang) * FOLLOW_DIST, tz = p.pos.z + Math.cos(ang) * FOLLOW_DIST;
      let face: number | null = null;
      a.cd = Math.max(0, a.cd - dt);

      if (a.def.kind === 'attack' && a.def.attack) {
        if (a.target && (!a.target.alive || dist2(a.target.pos, p.pos) > AGGRO_RANGE + 4)) a.target = null;
        if (!a.target && p.alive) a.target = this.pickTarget();
        const e = a.target;
        if (e && p.alive) {
          const reach = a.def.attack.range + e.radius;
          const d = dist2(a.pos, e.pos);
          face = Math.atan2(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
          if (d > reach * 0.9) { tx = e.pos.x; tz = e.pos.z; }
          else {
            tx = a.pos.x; tz = a.pos.z;
            if (a.cd <= 0) {
              g.combat.hitEnemy(e, a.def.attack.mult, { pet: true });
              a.cd = a.def.attack.cd;
              a.model.attack();
            }
          }
        }
      } else {
        const o = this.get(a.id);
        if (o) {
          if (a.pickup && !g.loot.drops.includes(a.pickup)) a.pickup = null;
          if (!a.pickup && p.alive) a.pickup = this.pickDrop(a, o);
          if (a.pickup) {
            const dp = a.pickup.group.position;
            tx = dp.x; tz = dp.z;
            if (dist2(dp, a.pos) < 0.7) { this.collect(a, o, a.pickup); a.pickup = null; }
          }
        }
      }

      // Hareket: hedefe yürü / uç; çok uzaktaysa oyuncunun yanına ışınlan
      const dx = tx - a.pos.x, dz = tz - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (dist2(a.pos, p.pos) > TELEPORT_DIST) {
        a.pos.set(p.pos.x + Math.sin(ang) * FOLLOW_DIST, 0, p.pos.z + Math.cos(ang) * FOLLOW_DIST);
        a.speed = 0;
      } else if (d > 0.12) {
        const speed = Math.max(BASE_SPEED, p.speedNow * 1.2);
        const step = Math.min(d, speed * dt);
        a.pos.x += (dx / d) * step;
        a.pos.z += (dz / d) * step;
        a.speed = step / Math.max(dt, 1e-4);
        a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 10, dt);
      } else {
        a.speed = 0;
        a.yaw = dampAngle(a.yaw, face ?? p.yaw, 6, dt);
      }
      if (face !== null && d <= 0.12) a.yaw = dampAngle(a.yaw, face, 12, dt);

      a.bob += dt;
      const ground = g.terrain.getHeight(a.pos.x, a.pos.z);
      const y = a.model.flyer ? ground + FLY_HEIGHT + Math.sin(a.bob * 2.4) * 0.12 : ground;
      a.model.root.position.set(a.pos.x, y, a.pos.z);
      a.model.root.rotation.y = a.yaw;
      a.model.update(dt, a.speed);
    }
  }
}
