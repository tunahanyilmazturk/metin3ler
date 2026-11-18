import { describe, expect, it } from 'vitest';
import {
  INVENTORY_COLS, INVENTORY_OPEN_SLOTS, INVENTORY_PAGE_SIZE, INVENTORY_ROWS, INVENTORY_TOTAL_SLOTS,
  InvCell, anchorOf, canPlaceAt, clearAt, compareItems, findSpace, footprintCells, hasSpaceFor, isLink, placeAt,
} from '../src/data/inventory';
import { ITEMS, ItemStack } from '../src/data/items';

const empty = (n = INVENTORY_TOTAL_SLOTS): InvCell[] => new Array(n).fill(null);
const stack = (id: string, count = 1, plus = 0): ItemStack => ({ id, count, plus });

describe('envanter ızgarası', () => {
  it('sabitler tutarlı', () => {
    expect(INVENTORY_TOTAL_SLOTS).toBe(INVENTORY_PAGE_SIZE * 4);
    expect(INVENTORY_OPEN_SLOTS).toBeLessThanOrEqual(INVENTORY_TOTAL_SLOTS);
    expect(INVENTORY_PAGE_SIZE % INVENTORY_COLS).toBe(0);
  });

  it('çok hücreli eşya sütun boyunca aşağı uzar', () => {
    expect(footprintCells(0, 2)).toEqual([0, INVENTORY_COLS]);
  });

  it('sayfa sınırını aşan yerleşim reddedilir', () => {
    const lastRow = (INVENTORY_ROWS - 1) * INVENTORY_COLS;
    expect(footprintCells(lastRow, 2)).toBeNull();
    expect(footprintCells(0, INVENTORY_ROWS + 1)).toBeNull();
  });

  it('dolu hücre üstüne yerleşim reddedilir', () => {
    const inv = empty();
    placeAt(inv, 0, stack('hp1'), 1);
    expect(canPlaceAt(inv, 0, 1)).toBe(false);
    expect(canPlaceAt(inv, 1, 1)).toBe(true);
  });

  it('çok hücreli eşya bağlantı hücreleriyle çapaya çözülür', () => {
    const inv = empty();
    placeAt(inv, 3, stack('sword1'), 2);
    expect(isLink(inv[3 + INVENTORY_COLS]!)).toBe(true);
    expect(anchorOf(inv, 3 + INVENTORY_COLS)).toBe(3);
    clearAt(inv, 3, 2);
    expect(inv[3]).toBeNull();
    expect(inv[3 + INVENTORY_COLS]).toBeNull();
  });

  it('findSpace ilk uygun boş yeri bulur ve dolu envanterde -1 döner', () => {
    const inv = empty();
    expect(findSpace(inv, 1)).toBe(0);
    for (let i = 0; i < INVENTORY_OPEN_SLOTS; i++) inv[i] = stack('hp1');
    expect(findSpace(inv, 1)).toBe(-1);
  });

  it('hasSpaceFor yığın eşyayı aynı gözde saymaz, yeni yer ister', () => {
    const inv = empty();
    inv[0] = stack('hp1', 5);
    expect(hasSpaceFor(inv, ['hp1'])).toBe(true);
    expect(hasSpaceFor(inv, Array(INVENTORY_OPEN_SLOTS + 1).fill('sword1'))).toBe(false);
  });
});

describe('sıralama', () => {
  it('önce tür, sonra enderlik, sonra seviye gelir', () => {
    const weapon = Object.values(ITEMS).find((d) => d.type === 'weapon')!;
    const potion = Object.values(ITEMS).find((d) => d.type === 'potion')!;
    const sorted = [stack(potion.id), stack(weapon.id)].sort(compareItems);
    expect(sorted[0].id).toBe(weapon.id);
  });

  it('aynı tür ve enderlikte daha yüksek artı önce gelir', () => {
    const w = Object.values(ITEMS).find((d) => d.type === 'weapon')!;
    const sorted = [stack(w.id, 1, 1), stack(w.id, 1, 5)].sort(compareItems);
    expect(sorted[0].plus).toBe(5);
  });
});
