import * as THREE from 'three';
import { rand, randInt } from '../core/utils';
import { ITEMS, ItemStack, RARITY_COLORS, itemLabel } from '../data/items';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';

export interface Drop {
  group: THREE.Group;
  gold: number;
  item: ItemStack | null;
  t: number;
  baseY: number;
  warnedFull?: boolean;
}

const GEM = new THREE.OctahedronGeometry(0.2);
const COIN = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12);
const BEAM = new THREE.CylinderGeometry(0.035, 0.035, 3.2, 6).translate(0, 1.6, 0);

/** Yere düşen ganimet: altın otomatik, eşyalar yaklaşınca ya da Z ile toplanır. */
export class Loot {
  drops: Drop[] = [];

  constructor(private game: Game) {}

  private add(x: number, z: number, gold: number, item: ItemStack | null) {
    const g = this.game;
    const color = new THREE.Color(item ? RARITY_COLORS[ITEMS[item.id].rarity] : '#ffcf4a');
    const group = new THREE.Group();
    const core = new THREE.Mesh(item ? GEM : COIN, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: item ? 1.4 : 0.5, metalness: item ? 0.2 : 1, roughness: 0.3,
    }));
    core.castShadow = true;
    group.add(core);
    if (item) {
      const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      beamMat.color.multiplyScalar(1.6);
      group.add(new THREE.Mesh(BEAM, beamMat));
    }
    const y = g.terrain.getHeight(x, z) + 0.45;
    group.position.set(x, y, z);
    g.scene.add(group);
    this.drops.push({ group, gold, item, t: 0, baseY: y });
  }

  dropFor(e: Enemy) {
    const d = e.def;
    const sx = () => e.pos.x + rand(-1, 1) * (0.6 + e.radius);
    const sz = () => e.pos.z + rand(-1, 1) * (0.6 + e.radius);
    const piles = d.stone || d.boss ? 4 : 1;
    const total = randInt(d.gold[0], d.gold[1]);
    for (let i = 0; i < piles; i++) this.add(sx(), sz(), Math.ceil(total / piles), null);
    for (const dr of d.drops) {
      if (Math.random() < dr.chance) {
        const def = ITEMS[dr.id];
        this.add(sx(), sz(), 0, { id: dr.id, plus: 0, count: def.stack ? (def.type === 'potion' ? randInt(1, 3) : 1) : 1 });
      }
    }
  }

  nearestDrop(pos: THREE.Vector3, center: THREE.Vector3, radius: number) {
    let nearest: Drop | null = null;
    let nearestDistance = Infinity;
    for (const drop of this.drops) {
      if (drop.t < 0.4 || (drop.item && !this.game.player.canAddItem(drop.item.id))) continue;
      const x = drop.group.position.x, z = drop.group.position.z;
      if (Math.hypot(x - center.x, z - center.z) > radius) continue;
      const distance = Math.hypot(x - pos.x, z - pos.z);
      if (distance < nearestDistance) {
        nearest = drop;
        nearestDistance = distance;
      }
    }
    return nearest ? { x: nearest.group.position.x, z: nearest.group.position.z } : null;
  }

  private pick(i: number) {
    const g = this.game, d = this.drops[i];
    if (d.gold) {
      g.player.gold += d.gold;
      g.audio.coin();
      g.events.emit('log', { msg: `+${d.gold} Akçe`, cls: 'gold' });
    } else if (d.item) {
      if (!g.player.canAddItem(d.item.id)) {
        if (!d.warnedFull) {
          g.events.emit('log', { msg: 'Envanter dolu! Yerdeki eşya alınamadı.', cls: 'warn' });
          d.warnedFull = true;
        }
        return false;
      }
      if (!g.player.addItem(d.item.id, d.item.count, d.item.plus)) return false;
      g.audio.pickup();
      g.events.emit('log', { msg: `Eşya alındı: ${itemLabel(d.item)}${d.item.count > 1 ? ` x${d.item.count}` : ''}`, cls: `r${ITEMS[d.item.id].rarity}` });
    }
    g.scene.remove(d.group);
    d.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); });
    this.drops.splice(i, 1);
    g.events.emit('lootPicked', { gold: d.gold, item: d.item });
    g.events.emit('changed');
    return true;
  }

  /** Düşüşü dünyadan kaldırır (pet topladığında; ödülü toplayan taraf verir). */
  takeDrop(d: Drop) {
    const i = this.drops.indexOf(d);
    if (i < 0) return;
    const g = this.game;
    g.scene.remove(d.group);
    d.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); });
    this.drops.splice(i, 1);
    g.events.emit('lootPicked', { gold: d.gold, item: d.item });
  }

  update(dt: number) {
    const p = this.game.player;
    const grab = this.game.input.hit('KeyZ');
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.group.position.y = d.baseY + Math.sin(d.t * 2.5) * 0.08;
      d.group.children[0].rotation.y += dt * 2;
      if (d.t > 150) { this.game.scene.remove(d.group); this.drops.splice(i, 1); continue; }
      if (!p.alive || d.t < 0.4) continue;
      const dist = Math.hypot(d.group.position.x - p.pos.x, d.group.position.z - p.pos.z);
      if (dist < (d.gold ? 2.4 : 1.3) || (grab && dist < 5)) this.pick(i);
    }
  }
}
