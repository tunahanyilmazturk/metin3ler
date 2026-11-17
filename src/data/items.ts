import type { ClassId } from './classes';

export type ItemType = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring' | 'potion' | 'material';
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'helmet', 'armor', 'boots', 'necklace', 'ring'];
export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: 'Silah', helmet: 'Miğfer', armor: 'Zırh', boots: 'Çizme', necklace: 'Kolye', ring: 'Yüzük',
};

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  icon: string;
  /** 0 sıradan, 1 nadir, 2 destansı, 3 efsanevi */
  rarity: number;
  level: number;
  cls?: ClassId;
  atk?: number;
  def?: number;
  hp?: number;
  mp?: number;
  crit?: number;
  speed?: number;
  heal?: number;
  mana?: number;
  price: number;
  stack?: boolean;
  desc?: string;
  /** Eşyanın karakter modelinde kullanılan görünümü */
  look?: { color: number; metal: number; rough: number };
}

export interface ItemStack {
  id: string;
  plus: number;
  count: number;
}

const list: ItemDef[] = [];
const add = (d: ItemDef) => list.push(d);

// Silahlar: her sınıf için dört kademe
const tiers = [
  { lvl: 1, atk: 12, price: 120, r: 0, look: { color: 0xc5c9ce, metal: 0.75, rough: 0.3 } },
  { lvl: 8, atk: 30, price: 900, r: 1, look: { color: 0x70b59c, metal: 0.8, rough: 0.26 } },
  { lvl: 16, atk: 58, price: 4200, r: 2, look: { color: 0x77a9e2, metal: 0.85, rough: 0.22 } },
  { lvl: 25, atk: 98, price: 16000, r: 3, look: { color: 0xf0bd58, metal: 0.9, rough: 0.2 } },
];
const weaponNames: Record<string, { cls: ClassId; icon: string; names: string[] }> = {
  sword: { cls: 'warrior', icon: 'sword', names: ['Demir Kılıç', 'Bozkır Palası', 'Gökdemir Kılıcı', 'Ejder Dişi'] },
  dagger: { cls: 'assassin', icon: 'dagger', names: ['Çelik Hançer', 'Akrep İğnesi', 'Gece Fısıltısı', 'Hayalet Pençesi'] },
  staff: { cls: 'mage', icon: 'staff', names: ['Meşe Asa', 'Ay Işığı Asası', 'Fırtına Çağıran', 'Kadim Yıldız Asası'] },
};
for (const [key, w] of Object.entries(weaponNames)) {
  tiers.forEach((t, i) => add({
    id: `${key}${i + 1}`, name: w.names[i], type: 'weapon', icon: w.icon, rarity: t.r, level: t.lvl, cls: w.cls,
    atk: Math.round(t.atk * (key === 'dagger' ? 0.9 : key === 'staff' ? 1.05 : 1)), crit: key === 'dagger' ? 4 + i * 2 : undefined,
    price: t.price, look: t.look,
  }));
}

add({ id: 'armor1', name: 'Keten Cübbe', type: 'armor', icon: 'armor', rarity: 0, level: 1, def: 6, hp: 20, price: 100, look: { color: 0x6a5a48, metal: 0, rough: 0.85 } });
add({ id: 'armor2', name: 'Deri Zırh', type: 'armor', icon: 'armor', rarity: 1, level: 7, def: 16, hp: 60, price: 850, look: { color: 0x5c3a22, metal: 0.1, rough: 0.6 } });
add({ id: 'armor3', name: 'Çelik Pullu Zırh', type: 'armor', icon: 'armor', rarity: 2, level: 15, def: 34, hp: 140, price: 4000, look: { color: 0x9aa4b0, metal: 1, rough: 0.35 } });
add({ id: 'armor4', name: 'Altın Ejder Zırhı', type: 'armor', icon: 'armor', rarity: 3, level: 24, def: 60, hp: 280, price: 15000, look: { color: 0xd9a441, metal: 1, rough: 0.28 } });

add({ id: 'helm1', name: 'Deri Başlık', type: 'helmet', icon: 'helmet', rarity: 0, level: 3, def: 4, price: 180, look: { color: 0x805837, metal: 0.08, rough: 0.8 } });
add({ id: 'helm2', name: 'Demir Miğfer', type: 'helmet', icon: 'helmet', rarity: 1, level: 10, def: 11, hp: 40, price: 1200, look: { color: 0x8495a8, metal: 0.82, rough: 0.28 } });
add({ id: 'helm3', name: 'Sorguçlu Savaş Miğferi', type: 'helmet', icon: 'helmet', rarity: 2, level: 19, def: 22, hp: 90, price: 5200, look: { color: 0x9a5540, metal: 0.86, rough: 0.25 } });

add({ id: 'boots1', name: 'Yolcu Çizmesi', type: 'boots', icon: 'boots', rarity: 0, level: 2, def: 3, speed: 3, price: 160, look: { color: 0x775035, metal: 0.05, rough: 0.8 } });
add({ id: 'boots2', name: 'Rüzgâr Çizmesi', type: 'boots', icon: 'boots', rarity: 1, level: 11, def: 8, speed: 7, price: 1400, look: { color: 0x6c91b5, metal: 0.48, rough: 0.38 } });
add({ id: 'boots3', name: 'Şimşek Adımı', type: 'boots', icon: 'boots', rarity: 2, level: 20, def: 15, speed: 12, price: 5600, look: { color: 0x59c2d2, metal: 0.74, rough: 0.25 } });

add({ id: 'neck1', name: 'Kurt Dişi Kolye', type: 'necklace', icon: 'necklace', rarity: 1, level: 5, hp: 50, crit: 2, price: 700, look: { color: 0xe3d3ae, metal: 0.6, rough: 0.35 } });
add({ id: 'neck2', name: 'Yeşim Tılsım', type: 'necklace', icon: 'necklace', rarity: 2, level: 14, hp: 120, mp: 60, crit: 4, price: 3800, look: { color: 0x5fc596, metal: 0.62, rough: 0.28 } });
add({ id: 'ring1', name: 'Bakır Yüzük', type: 'ring', icon: 'ring', rarity: 0, level: 4, atk: 4, price: 400, look: { color: 0xc78350, metal: 0.82, rough: 0.25 } });
add({ id: 'ring2', name: 'Kan Taşı Yüzüğü', type: 'ring', icon: 'ring', rarity: 2, level: 13, atk: 12, crit: 3, price: 3600, look: { color: 0xc7424d, metal: 0.68, rough: 0.24 } });
add({ id: 'ring3', name: 'Devin Mührü', type: 'ring', icon: 'ring', rarity: 3, level: 22, atk: 26, crit: 6, hp: 100, price: 14000, look: { color: 0xe6bd55, metal: 0.9, rough: 0.19 } });

add({ id: 'hp1', name: 'Kırmızı İksir', type: 'potion', icon: 'potion', rarity: 0, level: 1, heal: 120, price: 25, stack: true, desc: '120 can yeniler.' });
add({ id: 'hp2', name: 'Büyük Kırmızı İksir', type: 'potion', icon: 'potion', rarity: 1, level: 10, heal: 380, price: 110, stack: true, desc: '380 can yeniler.' });
add({ id: 'mp1', name: 'Mavi İksir', type: 'potion', icon: 'potionmp', rarity: 0, level: 1, mana: 80, price: 30, stack: true, desc: '80 mana yeniler.' });
add({ id: 'mp2', name: 'Büyük Mavi İksir', type: 'potion', icon: 'potionmp', rarity: 1, level: 10, mana: 240, price: 130, stack: true, desc: '240 mana yeniler.' });

add({ id: 'pelt', name: 'Kurt Postu', type: 'material', icon: 'fur', rarity: 0, level: 1, price: 18, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'tusk', name: 'Yaban Domuzu Dişi', type: 'material', icon: 'gem', rarity: 0, level: 1, price: 40, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'claw', name: 'Ayı Pençesi', type: 'material', icon: 'gem', rarity: 1, level: 1, price: 85, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'core', name: 'Golem Çekirdeği', type: 'material', icon: 'gem', rarity: 2, level: 1, price: 260, stack: true, desc: 'Değerli bir büyü bileşeni.' });
add({ id: 'crystal', name: 'Ruh Kristali', type: 'material', icon: 'gem', rarity: 2, level: 1, price: 300, stack: true, desc: 'Lanetli taşlardan düşer. +4 ve üzeri yükseltmeler için gerekir.' });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((d) => [d.id, d]));
export const RARITY_COLORS = ['#d8d2c4', '#6fd36a', '#5aa8ff', '#f0b23c'];
export const RARITY_NAMES = ['Sıradan', 'Nadir', 'Destansı', 'Efsanevi'];
export const MAX_PLUS = 9;
export const UPGRADE_CHANCE = [90, 85, 75, 65, 55, 45, 35, 25, 15];

export const isEquip = (d: ItemDef) => d.type !== 'potion' && d.type !== 'material';
export const plusMult = (plus: number) => 1 + plus * 0.11;
export const upgradeCost = (d: ItemDef, plus: number) => Math.max(80, Math.round(d.price * 0.35 * (plus + 1)));
export const itemLabel = (s: ItemStack) => ITEMS[s.id].name + (s.plus > 0 ? ` +${s.plus}` : '');

/** Tüccarın sattığı eşyalar */
export const SHOP_STOCK = [
  'hp1', 'hp2', 'mp1', 'mp2', 'sword1', 'dagger1', 'staff1', 'sword2', 'dagger2', 'staff2',
  'armor1', 'armor2', 'helm1', 'helm2', 'boots1', 'boots2', 'ring1', 'neck1',
];
