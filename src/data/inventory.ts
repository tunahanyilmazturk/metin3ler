import { ITEMS, ItemStack } from './items';

export const INVENTORY_PAGE_SIZE = 30;
export const INVENTORY_PAGE_COUNT = 4;
export const INVENTORY_OPEN_PAGES = 2;
export const INVENTORY_TOTAL_SLOTS = INVENTORY_PAGE_SIZE * INVENTORY_PAGE_COUNT;
export const INVENTORY_OPEN_SLOTS = INVENTORY_PAGE_SIZE * INVENTORY_OPEN_PAGES;
export const INVENTORY_COLS = 5;
export const INVENTORY_ROWS = INVENTORY_PAGE_SIZE / INVENTORY_COLS;

/** Çok hücreli eşyada, kaplanan hücrenin çapa hücreye işaretçisi. */
export interface InvLink { link: number }
export type InvCell = ItemStack | InvLink | null;
export const isLink = (c: InvCell): c is InvLink => !!c && 'link' in c;
export const asStack = (c: InvCell): ItemStack | null => (c && !isLink(c) ? c : null);
export const itemSize = (id: string) => ITEMS[id]?.size ?? 1;

/** Çapa hücreden aşağı doğru kaplanan hücreler (aynı sayfa + sütun). Sığmazsa null. */
export function footprintCells(anchor: number, size: number): number[] | null {
  if (size < 1 || size > INVENTORY_ROWS) return null;
  const row = Math.floor((anchor % INVENTORY_PAGE_SIZE) / INVENTORY_COLS);
  if (row + size > INVENTORY_ROWS) return null;
  const cells: number[] = [];
  for (let k = 0; k < size; k++) cells.push(anchor + k * INVENTORY_COLS);
  return cells;
}

export const canPlaceAt = (inv: InvCell[], anchor: number, size: number) => {
  const cells = anchor >= 0 && anchor < inv.length ? footprintCells(anchor, size) : null;
  return !!cells && cells.every((c) => inv[c] === null);
};

export function placeAt(inv: InvCell[], anchor: number, stack: ItemStack, size: number) {
  const cells = footprintCells(anchor, size)!;
  inv[cells[0]] = stack;
  for (let k = 1; k < cells.length; k++) inv[cells[k]] = { link: cells[0] };
}

export function clearAt(inv: InvCell[], anchor: number, size: number) {
  const cells = footprintCells(anchor, size);
  if (!cells) { inv[anchor] = null; return; }
  for (const c of cells) inv[c] = null;
}

/** i gözü linkse çapa indeksini, değilse kendisini döndürür. */
export const anchorOf = (inv: InvCell[], i: number) => {
  const c = inv[i];
  return c && isLink(c) ? c.link : i;
};

/** Açık sayfalarda (veya limit'e kadar) dikey boşluk arar; çapa indeksini verir. */
export function findSpace(inv: InvCell[], size: number, limit = INVENTORY_OPEN_SLOTS): number {
  const pages = Math.ceil(limit / INVENTORY_PAGE_SIZE);
  for (let p = 0; p < pages; p++)
    for (let col = 0; col < INVENTORY_COLS; col++)
      for (let row = 0; row + size <= INVENTORY_ROWS; row++) {
        const idx = p * INVENTORY_PAGE_SIZE + col + row * INVENTORY_COLS;
        if (canPlaceAt(inv, idx, size)) return idx;
      }
  return -1;
}

const TYPE_ORDER: Record<string, number> = {
  weapon: 0, shield: 1, armor: 2, helmet: 3, boots: 4, necklace: 5, ring: 6, earring: 7, bracelet: 8, belt: 9, potion: 10, material: 11,
};

/** Akıllı sıralama: tür → enderlik → seviye → artı → ad. */
export function compareItems(a: ItemStack, b: ItemStack) {
  const A = ITEMS[a.id], B = ITEMS[b.id];
  return (TYPE_ORDER[A.type] - TYPE_ORDER[B.type])
    || (B.rarity - A.rarity)
    || (B.level - A.level)
    || (b.plus - a.plus)
    || A.name.localeCompare(B.name, 'tr')
    || (b.count - a.count);
}

/** Verilen eşya listesi açık envantere sığar mı? (yığın birleşimi hesaba katılır) */
export function hasSpaceFor(inv: InvCell[], ids: string[], limit = INVENTORY_OPEN_SLOTS): boolean {
  const grid = inv.slice(0, limit);
  for (const id of ids) {
    const d = ITEMS[id];
    if (!d) continue;
    if (d.stack && grid.some((c) => asStack(c)?.id === id)) continue;
    const size = d.size ?? 1;
    const idx = findSpace(grid, size, limit);
    if (idx < 0) return false;
    placeAt(grid, idx, { id, plus: 0, count: 1 }, size);
  }
  return true;
}
