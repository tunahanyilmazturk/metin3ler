import { ITEMS, ItemStack } from '../data/items';
import {
  InvCell, anchorOf, asStack, clearAt, findSpace, isLink, itemSize, placeAt,
} from '../data/inventory';
import type { Game } from '../game';

export const VAULT_SLOTS = 60;

/** Depo Görevlisi'nin kasası: envanterden bağımsız, çok hücreli eşya saklama. */
export class Vault {
  cells: InvCell[] = new Array(VAULT_SLOTS).fill(null);

  constructor(private game: Game, save?: (ItemStack | null)[]) {
    save?.slice(0, VAULT_SLOTS).forEach((s) => {
      if (!s) return;
      const size = itemSize(s.id);
      const idx = findSpace(this.cells, size, VAULT_SLOTS);
      if (idx >= 0) placeAt(this.cells, idx, { ...s }, size);
    });
  }

  serialize(): (ItemStack | null)[] {
    return this.cells.map((c) => (c && isLink(c) ? null : c)) as (ItemStack | null)[];
  }

  stackAt(i: number): ItemStack | null {
    const c = this.cells[i];
    if (!c) return null;
    return isLink(c) ? asStack(this.cells[c.link]) : c;
  }

  anchorIndex(i: number) { return anchorOf(this.cells, i); }

  /** Çantadan kasaya aktar. Yığınlar birleşir, sığmazsa eşya yerinde kalır. */
  deposit(i: number) {
    const p = this.game.player;
    const a = p.anchorIndex(i);
    const s = p.stackAt(a);
    if (!s) return;
    const d = ITEMS[s.id];
    // Yığınsa önce kasadaki aynı yığının üzerine ekle
    if (d.stack) {
      const ex = asStack(this.cells.find((c) => asStack(c)?.id === s.id) ?? null);
      if (ex) {
        ex.count += s.count;
        p.removeAt(a);
        this.game.audio.pickup();
        this.game.events.emit('log', { msg: `Kasaya konuldu: ${d.name} x${s.count}` });
        this.game.events.emit('changed');
        return;
      }
    }
    const size = itemSize(s.id);
    const idx = findSpace(this.cells, size, VAULT_SLOTS);
    if (idx < 0) {
      this.game.events.emit('log', { msg: 'Kasa dolu!', cls: 'warn' });
      return;
    }
    const taken = p.removeAt(a)!;
    placeAt(this.cells, idx, taken, size);
    this.game.audio.pickup();
    this.game.events.emit('log', { msg: `Kasaya konuldu: ${d.name}` });
    this.game.events.emit('changed');
  }

  /** Kasadan çantaya al. */
  withdraw(i: number) {
    const p = this.game.player;
    const a = this.anchorIndex(i);
    const s = asStack(this.cells[a]);
    if (!s) return;
    const d = ITEMS[s.id];
    if (!p.canAddItem(s.id)) {
      this.game.events.emit('log', { msg: 'Envanter dolu!', cls: 'warn' });
      return;
    }
    clearAt(this.cells, a, itemSize(s.id));
    p.addItem(s.id, s.count, s.plus, true);
    this.game.audio.pickup();
    this.game.events.emit('log', { msg: `Kasadan alındı: ${d.name}` });
    this.game.events.emit('changed');
  }

  get usedCount() {
    return this.cells.filter((c) => c !== null).length;
  }
}
