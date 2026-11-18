import { ITEMS, EquipSlot, ItemStack, isEquip, itemLabel } from '../data/items';
import type { SkillDef } from '../data/skills';
import {
  INVENTORY_OPEN_SLOTS, INVENTORY_TOTAL_SLOTS,
  anchorOf, asStack, canPlaceAt, clearAt, compareItems, findSpace, hasSpaceFor, isLink, itemSize, placeAt,
} from '../data/inventory';
import type { HotbarEntry, ItemLocation, Player } from './player';

/** Envanter, kuşanma, kısayol çubuğu ve iksir işlemleri. Hepsi Player durumu üzerinde çalışır. */

/** Kayıttan gelen eşyayı eski yerine, sığmıyorsa ilk uygun boşluğa koyar. */
export function restoreStack(p: Player, i: number, s: ItemStack) {
  const size = itemSize(s.id);
  let pos = canPlaceAt(p.inv, i, size) ? i : findSpace(p.inv, size);
  if (pos < 0) pos = findSpace(p.inv, size, INVENTORY_TOTAL_SLOTS);
  if (pos < 0) {
    pos = p.inv.indexOf(null);
    if (pos < 0) return;
    p.inv[pos] = s;
    return;
  }
  placeAt(p.inv, pos, s, size);
}

/** i gözünün çapa indeksini verir. */
export function anchorIndex(p: Player, i: number) { return anchorOf(p.inv, i); }

/** Verilen eşyalar açık envantere sığar mı? */
export function fitsAll(p: Player, ids: string[]) { return hasSpaceFor(p.inv, ids); }

/** Gözdeki eşyayı döndürür; kaplanan hücreler çapaya çözümlenir. */
export function stackAt(p: Player, i: number): ItemStack | null {
  const c = p.inv[i];
  if (!c) return null;
  return isLink(c) ? asStack(p.inv[c.link]) : c;
}

/** Eşyayı istenen çapaya (sığarsa) ya da ilk uygun boşluğa koyar. */
export function insert(p: Player, s: ItemStack, at?: number): number {
  const size = itemSize(s.id);
  const pos = at !== undefined && canPlaceAt(p.inv, at, size) ? at : findSpace(p.inv, size);
  if (pos >= 0) placeAt(p.inv, pos, s, size);
  return pos;
}

/** i gözündeki eşyayı tüm ayak iziyle birlikte kaldırır ve döndürür. */
export function removeAt(p: Player, i: number): ItemStack | null {
  const a = anchorOf(p.inv, i);
  const s = p.inv[a];
  if (!s || isLink(s)) return null;
  clearAt(p.inv, a, itemSize(s.id));
  return s;
}

export function addItem(p: Player, id: string, count = 1, plus = 0, silent = false) {
  const d = ITEMS[id];
  if (d.stack) {
    const ex = asStack(p.inv.slice(0, INVENTORY_OPEN_SLOTS).find((c) => asStack(c)?.id === id) ?? null);
    if (ex) { ex.count += count; if (!silent) p.game.events.emit('changed'); return true; }
  }
  const s: ItemStack = { id, plus, count: d.stack ? count : 1 };
  if (insert(p, s) < 0) {
    p.game.events.emit('log', { msg: 'Envanter dolu!', cls: 'warn' });
    return false;
  }
  if (!silent) p.game.events.emit('changed');
  return true;
}

export function canAddItem(p: Player, id: string) {
  const d = ITEMS[id];
  if (!d) return false;
  if (d.stack && p.inv.slice(0, INVENTORY_OPEN_SLOTS).some((c) => asStack(c)?.id === id)) return true;
  return findSpace(p.inv, itemSize(id)) >= 0;
}

/** Akıllı sıralama: tür/enderlik/seviye düzeninde yeniden yerleştirir. */
export function sortInventory(p: Player) {
  const stacks: ItemStack[] = [];
  for (let i = 0; i < INVENTORY_OPEN_SLOTS; i++) {
    const c = asStack(p.inv[i]);
    if (c) stacks.push(c);
  }
  if (stacks.length < 2) return;
  stacks.sort(compareItems);
  const snapshot = p.inv.slice(0, INVENTORY_OPEN_SLOTS);
  p.inv.fill(null, 0, INVENTORY_OPEN_SLOTS);
  for (const s of stacks) {
    if (insert(p, s) < 0) {
      snapshot.forEach((c, i) => { p.inv[i] = c; });
      p.game.events.emit('log', { msg: 'Sıralama için yer yok.', cls: 'warn' });
      return;
    }
  }
  p.game.events.emit('log', { msg: 'Envanter düzenlendi.' });
  p.game.events.emit('changed');
}

/** Envanter ↔ kuşanma ↔ envanter taşımalarını doğrular ve uygular. */
export function moveItem(p: Player, from: ItemLocation, to: ItemLocation): boolean {
  const validLocation = (location: ItemLocation) =>
    !('inv' in location) || (Number.isInteger(location.inv) && location.inv >= 0 && location.inv < INVENTORY_OPEN_SLOTS);
  if (!validLocation(from) || !validLocation(to)) return false;

  if ('inv' in from) from = { inv: anchorOf(p.inv, from.inv) };
  if ('inv' in to) to = { inv: anchorOf(p.inv, to.inv) };
  const sameSlot = ('inv' in from && 'inv' in to && from.inv === to.inv) ||
    ('equip' in from && 'equip' in to && from.equip === to.equip);
  if (sameSlot) return false;

  const source: ItemStack | null = 'inv' in from ? asStack(p.inv[from.inv]) : p.equip[from.equip];
  const target: ItemStack | null = 'inv' in to ? asStack(p.inv[to.inv]) : p.equip[to.equip];
  if (!source) return false;

  const canEquip = (item: ItemStack, slot: EquipSlot) => {
    const def = ITEMS[item.id];
    if (!isEquip(def) || def.type !== slot) return false;
    if (def.level > p.level) {
      p.game.events.emit('log', { msg: `${def.name} için ${def.level}. seviye gerekli.`, cls: 'warn' });
      return false;
    }
    return true;
  };

  if ('equip' in to && !canEquip(source, to.equip)) return false;
  // Çift el silah ile kalkan birlikte kuşanılamaz
  if ('equip' in to && (to.equip === 'weapon' || to.equip === 'shield')) {
    const weaponAfter = to.equip === 'weapon' ? source : p.equip.weapon;
    const shieldAfter = to.equip === 'shield' ? source : p.equip.shield;
    if (weaponAfter && ITEMS[weaponAfter.id].hands === 2 && shieldAfter) {
      p.game.events.emit('log', { msg: 'Çift el silahla kalkan birlikte kuşanılamaz.', cls: 'warn' });
      return false;
    }
  }
  if ('equip' in from && target && !canEquip(target, from.equip)) return false;

  const noRoom = () => {
    p.game.events.emit('log', { msg: 'Eşyayı koyacak yer yok.', cls: 'warn' });
    return false;
  };

  if ('inv' in from && 'inv' in to) {
    if (target && source.id === target.id && ITEMS[source.id].stack) {
      target.count += source.count;
      removeAt(p, from.inv);
    } else {
      const sa = itemSize(source.id);
      removeAt(p, from.inv);
      if (!target) {
        insert(p, source, to.inv);
      } else if (canPlaceAt(p.inv, to.inv, sa)) {
        const sb = itemSize(target.id);
        removeAt(p, to.inv);
        placeAt(p.inv, to.inv, source, sa);
        if (insert(p, target, from.inv) < 0) {
          removeAt(p, to.inv);
          placeAt(p.inv, to.inv, target, sb);
          placeAt(p.inv, from.inv, source, sa);
          return noRoom();
        }
      } else {
        placeAt(p.inv, from.inv, source, sa);
        return noRoom();
      }
    }
  } else if ('equip' in to) {
    const sa = itemSize(source.id);
    const fromInv = (from as { inv: number }).inv;
    removeAt(p, fromInv);
    const old = p.equip[to.equip];
    p.equip[to.equip] = source;
    if (old && insert(p, old, fromInv) < 0) {
      p.equip[to.equip] = old;
      placeAt(p.inv, fromInv, source, sa);
      return noRoom();
    }
  } else {
    const toInv = (to as { inv: number }).inv;
    const freed = target ? removeAt(p, toInv) : null;
    if (insert(p, source, toInv) < 0) {
      if (freed) placeAt(p.inv, toInv, freed, itemSize(freed.id));
      return noRoom();
    }
    p.equip[(from as { equip: EquipSlot }).equip] = freed;
  }

  if ('equip' in from || 'equip' in to) {
    p.recalc();
    p.refreshModel();
  }
  p.game.audio.click();
  p.game.events.emit('changed');
  return true;
}

export function countItem(p: Player, id: string) {
  return p.inv.slice(0, INVENTORY_OPEN_SLOTS)
    .reduce((n, c) => n + (asStack(c)?.id === id ? asStack(c)!.count : 0), 0);
}

export function removeItem(p: Player, id: string, count: number) {
  for (let i = 0; i < INVENTORY_OPEN_SLOTS && count > 0; i++) {
    const s = asStack(p.inv[i]);
    if (!s || s.id !== id) continue;
    const take = Math.min(count, s.count);
    s.count -= take;
    count -= take;
    if (s.count <= 0) clearAt(p.inv, i, itemSize(id));
  }
}

/** Envanter yuvasındaki eşyayı kullanır ya da kuşanır. */
export function useSlot(p: Player, i: number) {
  if (!Number.isInteger(i) || i < 0 || i >= INVENTORY_OPEN_SLOTS) return;
  const a = anchorOf(p.inv, i);
  const s = asStack(p.inv[a]);
  if (!s) return;
  const d = ITEMS[s.id];
  const g = p.game;
  if (d.type === 'potion') {
    if (p.potionCd > 0 || !p.alive) return;
    if (d.heal && p.hp >= p.maxHp) return;
    if (d.mana && p.mp >= p.maxMp) return;
    p.potionCd = 0.8;
    if (d.heal) { p.hp = Math.min(p.maxHp, p.hp + d.heal); g.events.emit('damageText', { pos: p.pos, y: 2.2, text: `+${d.heal}`, cls: 'heal' }); }
    if (d.mana) { p.mp = Math.min(p.maxMp, p.mp + d.mana); g.events.emit('damageText', { pos: p.pos, y: 2.2, text: `+${d.mana}`, cls: 'mana' }); }
    g.particles.emit(p.pos, { count: 22, color: d.heal ? 0xff5050 : 0x50a0ff, speed: 1, up: 3.5, life: 0.9, size: 0.4, spread: 1 });
    g.audio.pickup();
    s.count--;
    if (s.count <= 0) clearAt(p.inv, a, itemSize(s.id));
    g.events.emit('changed');
  } else if (isEquip(d)) {
    if (moveItem(p, { inv: a }, { equip: d.type as EquipSlot }))
      g.events.emit('log', { msg: `${itemLabel(s)} kuşanıldı.` });
  }
}

export function unequip(p: Player, slot: EquipSlot) {
  const s = p.equip[slot];
  if (!s) return;
  if (insert(p, s) < 0) { p.game.events.emit('log', { msg: 'Envanter dolu!', cls: 'warn' }); return; }
  p.equip[slot] = null;
  p.recalc();
  p.refreshModel();
  p.game.events.emit('changed');
}

/** Han yemeği gibi yetenek dışı geçici güçlendirme uygular. */
export function addBuff(p: Player, id: string, def: NonNullable<SkillDef['buff']>, color = 0xf0c040) {
  p.buffs = p.buffs.filter((b) => b.id !== id);
  p.buffs.push({ id, t: def.dur, def, color });
  p.recalc();
  p.game.events.emit('changed');
}

/** Kısayol çubuğu gözünü tetikler: yetenek kullanır ya da eşyayı envanterden bulup kullanır/kuşanır. */
export function useHotbar(p: Player, i: number) {
  const e = p.hotbar[i];
  if (!e) return;
  if (e.t === 'skill') { p.useSkill(e.i); return; }
  const idx = findHotbarItem(p, e);
  if (idx < 0) {
    p.game.events.emit('log', { msg: `${ITEMS[e.id]?.name ?? 'Eşya'} envanterde kalmadı.`, cls: 'warn' });
    return;
  }
  useSlot(p, idx);
}

/** Çubuktaki eşyanın envanterdeki çapa indeksini bulur; iksirler aynı türden başka bir iksire düşer. */
export function findHotbarItem(p: Player, e: Extract<HotbarEntry, { t: 'item' }>): number {
  for (let i = 0; i < INVENTORY_OPEN_SLOTS; i++) {
    if (anchorOf(p.inv, i) !== i) continue;
    const s = asStack(p.inv[i]);
    if (s && s.id === e.id && s.plus === e.plus) return i;
  }
  const d = ITEMS[e.id];
  if (d?.type === 'potion') {
    for (let i = 0; i < INVENTORY_OPEN_SLOTS; i++) {
      if (anchorOf(p.inv, i) !== i) continue;
      const s = asStack(p.inv[i]);
      const sd = s && ITEMS[s.id];
      if (s && sd?.type === 'potion' && !!sd.heal === !!d.heal) return i;
    }
  }
  return -1;
}

export function usePotion(p: Player, kind: 'hp' | 'mp') {
  const i = p.inv.slice(0, INVENTORY_OPEN_SLOTS).findIndex((c) => {
    const s = asStack(c);
    return s && (kind === 'hp' ? ITEMS[s.id].heal : ITEMS[s.id].mana);
  });
  if (i >= 0) useSlot(p, i);
  else p.game.events.emit('log', { msg: kind === 'hp' ? 'Can iksirin kalmadı.' : 'Mana iksirin kalmadı.', cls: 'warn' });
}

export function potionCount(p: Player, kind: 'hp' | 'mp') {
  return p.inv.reduce((n, c) => {
    const s = asStack(c);
    return n + (s && (kind === 'hp' ? ITEMS[s.id].heal : ITEMS[s.id].mana) ? s.count : 0);
  }, 0);
}
