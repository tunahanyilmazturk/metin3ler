import { EquipSlot, ITEMS, MAX_PLUS, UPGRADE_CHANCE, isEquip, itemLabel, plusMult, upgradeCost } from '../data/items';
import { INVENTORY_OPEN_SLOTS } from '../data/inventory';
import type { Game } from '../game';

export type ItemRef = { inv: number } | { equip: EquipSlot };

/** Alışveriş ve demirci yükseltme kuralları. */
export class Economy {
  constructor(private game: Game) {}

  resolve(ref: ItemRef) {
    const p = this.game.player;
    return 'inv' in ref ? p.stackAt(ref.inv) : p.equip[ref.equip];
  }

  buy(id: string, count = 1) {
    const g = this.game, p = g.player, d = ITEMS[id];
    if (!d.stack) count = 1;
    const cost = d.price * count;
    if (p.gold < cost) { g.events.emit('log', { msg: 'Yeterli Akçen yok.', cls: 'warn' }); g.audio.fail(); return; }
    if (!p.addItem(id, count, 0, true)) return;
    p.gold -= cost;
    g.audio.coin();
    g.events.emit('log', { msg: `Satın alındı: ${d.name}${count > 1 ? ` x${count}` : ''} (-${cost} Akçe)` });
    g.events.emit('changed');
  }

  sellPrice(i: number) {
    const s = this.game.player.stackAt(i);
    if (!s) return 0;
    return Math.max(1, Math.floor(ITEMS[s.id].price * 0.3 * plusMult(s.plus) * (1 + s.plus * 0.25))) * s.count;
  }

  sell(i: number) {
    const g = this.game, p = g.player, s = p.stackAt(i);
    if (!s) return;
    const price = this.sellPrice(i);
    p.removeAt(i);
    p.gold += price;
    g.audio.coin();
    g.events.emit('log', { msg: `Satıldı: ${itemLabel(s)} (+${price} Akçe)`, cls: 'gold' });
    g.events.emit('changed');
  }

  /** Toplu satış: adi ekipmanlar ya da malzemeler (Ruh Kristali korunur). */
  sellBulk(kind: 'equip0' | 'materials') {
    const g = this.game, p = g.player;
    const match = (id: string) => {
      const d = ITEMS[id];
      return kind === 'equip0' ? d.rarity === 0 && isEquip(d) : d.type === 'material' && id !== 'crystal';
    };
    let total = 0, count = 0;
    for (let i = 0; i < INVENTORY_OPEN_SLOTS; i++) {
      const s = p.stackAt(i);
      if (!s || !match(s.id)) continue;
      total += this.sellPrice(i);
      count++;
      p.removeAt(i);
    }
    if (!count) {
      g.events.emit('log', { msg: 'Satılacak uygun eşya yok.', cls: 'warn' });
      return;
    }
    p.gold += total;
    g.audio.coin();
    g.events.emit('log', { msg: `${count} eşya satıldı (+${total.toLocaleString('tr-TR')} Akçe)`, cls: 'gold' });
    g.events.emit('changed');
  }

  upgradeInfo(ref: ItemRef) {
    const s = this.resolve(ref);
    if (!s) return null;
    const d = ITEMS[s.id];
    if (!isEquip(d) || s.plus >= MAX_PLUS) return null;
    return { chance: UPGRADE_CHANCE[s.plus], cost: upgradeCost(d, s.plus), crystal: s.plus >= 3 };
  }

  /** Yükseltme dener. Başarısızlıkta eşya bir kademe düşer. */
  upgrade(ref: ItemRef) {
    const g = this.game, p = g.player;
    const s = this.resolve(ref), info = this.upgradeInfo(ref);
    if (!s || !info) return;
    if (p.gold < info.cost) { g.events.emit('log', { msg: 'Yeterli Akçen yok.', cls: 'warn' }); g.audio.fail(); return; }
    if (info.crystal && p.countItem('crystal') < 1) { g.events.emit('log', { msg: 'Bu yükseltme için Ruh Kristali gerekli.', cls: 'warn' }); g.audio.fail(); return; }
    p.gold -= info.cost;
    if (info.crystal) p.removeItem('crystal', 1);
    const ok = Math.random() * 100 < info.chance;
    if (ok) {
      s.plus++;
      g.audio.success();
      g.events.emit('log', { msg: `Yükseltme başarılı! ${itemLabel(s)}`, cls: 'gold' });
      g.events.emit('upgraded', s.plus);
      g.particles.emit(g.village.forgePos, { count: 60, color: 0xffc040, color2: 0xffffff, speed: 5, up: 5, life: 1, size: 0.4, gravity: 9 });
    } else {
      if (s.plus > 0) s.plus--;
      g.audio.fail();
      g.events.emit('log', { msg: `Yükseltme başarısız oldu. ${itemLabel(s)}`, cls: 'warn' });
    }
    p.recalc();
    if ('equip' in ref) p.refreshModel();
    g.events.emit('changed');
    return ok;
  }
}
