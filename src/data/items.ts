import type { ClassId } from './classes';
import type { WeaponKind } from '../entities/humanoid';

export type ItemType = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring' | 'shield' | 'earring' | 'bracelet' | 'belt' | 'potion' | 'material';
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring' | 'shield' | 'earring' | 'bracelet' | 'belt';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'helmet', 'armor', 'boots', 'necklace', 'ring', 'earring', 'bracelet', 'belt'];
export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: 'Silah', shield: 'Kalkan', helmet: 'Miğfer', armor: 'Zırh', boots: 'Çizme',
  necklace: 'Kolye', ring: 'Yüzük', earring: 'Küpe', bracelet: 'Bilezik', belt: 'Kemer',
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
  /** Envanterde kapladığı dikey göz sayısı (varsayılan 1, en çok 3) */
  size?: number;
  /** Kuşanıldığında kullanılacak silah modeli (varsayılan sınıf silahı) */
  weapon?: WeaponKind;
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
  { lvl: 31, atk: 132, price: 46000, r: 3, look: { color: 0xe06060, metal: 0.92, rough: 0.18 } },
];
const weaponNames: Record<string, { cls: ClassId; icon: string; names: string[] }> = {
  sword: { cls: 'warrior', icon: 'sword', names: ['Demir Kılıç', 'Bozkır Palası', 'Gökdemir Kılıcı', 'Ejder Dişi', 'Bozkurt Hakan Kılıcı'] },
  dagger: { cls: 'assassin', icon: 'dagger', names: ['Çelik Hançer', 'Akrep İğnesi', 'Gece Fısıltısı', 'Hayalet Pençesi', 'Kan Gülü'] },
  staff: { cls: 'mage', icon: 'staff', names: ['Meşe Asa', 'Ay Işığı Asası', 'Fırtına Çağıran', 'Kadim Yıldız Asası', 'Alev Yürek Asası'] },
};
for (const [key, w] of Object.entries(weaponNames)) {
  tiers.forEach((t, i) => add({
    id: `${key}${i + 1}`, name: w.names[i], type: 'weapon', icon: w.icon, rarity: t.r, level: t.lvl, cls: w.cls,
    atk: Math.round(t.atk * (key === 'dagger' ? 0.9 : key === 'staff' ? 1.05 : 1)), crit: key === 'dagger' ? 4 + i * 2 : undefined,
    price: t.price, size: key === 'dagger' ? 1 : i >= 3 ? 3 : 2, look: t.look,
  }));
}

// Mızraklar: savaşçıya özel, üç göz kaplayan uzun silahlar
add({ id: 'spear1', name: 'Avcı Mızrağı', type: 'weapon', icon: 'spear', rarity: 1, level: 12, cls: 'warrior', atk: 44, price: 2400, size: 3, weapon: 'spear', look: { color: 0x8fa8b8, metal: 0.7, rough: 0.3 } });
add({ id: 'spear2', name: 'Fırtına Mızrağı', type: 'weapon', icon: 'spear', rarity: 2, level: 20, cls: 'warrior', atk: 82, price: 9500, size: 3, weapon: 'spear', look: { color: 0x6fc2d8, metal: 0.85, rough: 0.22 } });
add({ id: 'spear3', name: 'Dev Avcısı Mızrağı', type: 'weapon', icon: 'spear', rarity: 3, level: 27, cls: 'warrior', atk: 108, price: 19000, size: 3, weapon: 'spear', look: { color: 0xe0a35a, metal: 0.9, rough: 0.2 } });

add({ id: 'armor1', name: 'Keten Cübbe', type: 'armor', icon: 'armor', rarity: 0, level: 1, def: 6, hp: 20, price: 100, size: 2, look: { color: 0x6a5a48, metal: 0, rough: 0.85 } });
add({ id: 'armor2', name: 'Deri Zırh', type: 'armor', icon: 'armor', rarity: 1, level: 7, def: 16, hp: 60, price: 850, size: 2, look: { color: 0x5c3a22, metal: 0.1, rough: 0.6 } });
add({ id: 'armor3', name: 'Çelik Pullu Zırh', type: 'armor', icon: 'armor', rarity: 2, level: 15, def: 34, hp: 140, price: 4000, size: 2, look: { color: 0x9aa4b0, metal: 1, rough: 0.35 } });
add({ id: 'armor4', name: 'Altın Ejder Zırhı', type: 'armor', icon: 'armor', rarity: 3, level: 24, def: 60, hp: 280, price: 15000, size: 2, look: { color: 0xd9a441, metal: 1, rough: 0.28 } });
add({ id: 'armor5', name: 'Savaş Lordu Plakası', type: 'armor', icon: 'armor', rarity: 2, level: 20, def: 47, hp: 200, price: 8500, size: 2, look: { color: 0x7a3b2e, metal: 0.85, rough: 0.3 } });
add({ id: 'armor6', name: 'Karanlık Kral Zırhı', type: 'armor', icon: 'armor', rarity: 3, level: 29, def: 78, hp: 380, price: 34000, size: 2, look: { color: 0x3a2f4a, metal: 0.95, rough: 0.22 } });
// Sınıf zırhları: yalnızca düşüşle elde edilen kuşak setleri
add({ id: 'warplate', name: 'Bozkurt Plaka Zırhı', type: 'armor', icon: 'armor', rarity: 3, level: 22, cls: 'warrior', def: 56, hp: 320, price: 19000, size: 2, look: { color: 0x8a2f2a, metal: 0.9, rough: 0.26 } });
add({ id: 'asnleather', name: 'Gölge Postu', type: 'armor', icon: 'armor', rarity: 3, level: 22, cls: 'assassin', def: 46, hp: 230, crit: 5, speed: 4, price: 19000, size: 2, look: { color: 0x2f2f3a, metal: 0.4, rough: 0.55 } });
add({ id: 'magerobe', name: 'Yıldız Cübbesi', type: 'armor', icon: 'armor', rarity: 3, level: 22, cls: 'mage', def: 38, hp: 170, mp: 160, price: 19000, size: 2, look: { color: 0x2f4a7a, metal: 0.3, rough: 0.5 } });

add({ id: 'helm1', name: 'Deri Başlık', type: 'helmet', icon: 'helmet', rarity: 0, level: 3, def: 4, price: 180, look: { color: 0x805837, metal: 0.08, rough: 0.8 } });
add({ id: 'helm2', name: 'Demir Miğfer', type: 'helmet', icon: 'helmet', rarity: 1, level: 10, def: 11, hp: 40, price: 1200, look: { color: 0x8495a8, metal: 0.82, rough: 0.28 } });
add({ id: 'helm3', name: 'Sorguçlu Savaş Miğferi', type: 'helmet', icon: 'helmet', rarity: 2, level: 19, def: 22, hp: 90, price: 5200, look: { color: 0x9a5540, metal: 0.86, rough: 0.25 } });
add({ id: 'helm4', name: 'Hakan Tacı', type: 'helmet', icon: 'helmet', rarity: 3, level: 28, def: 32, hp: 150, price: 13500, look: { color: 0xd4b04a, metal: 0.95, rough: 0.2 } });

add({ id: 'boots1', name: 'Yolcu Çizmesi', type: 'boots', icon: 'boots', rarity: 0, level: 2, def: 3, speed: 3, price: 160, look: { color: 0x775035, metal: 0.05, rough: 0.8 } });
add({ id: 'boots2', name: 'Rüzgâr Çizmesi', type: 'boots', icon: 'boots', rarity: 1, level: 11, def: 8, speed: 7, price: 1400, look: { color: 0x6c91b5, metal: 0.48, rough: 0.38 } });
add({ id: 'boots3', name: 'Şimşek Adımı', type: 'boots', icon: 'boots', rarity: 2, level: 20, def: 15, speed: 12, price: 5600, look: { color: 0x59c2d2, metal: 0.74, rough: 0.25 } });
add({ id: 'boots4', name: 'Yıldırım Çizmesi', type: 'boots', icon: 'boots', rarity: 3, level: 27, def: 24, speed: 17, price: 13500, look: { color: 0x8fd8e8, metal: 0.85, rough: 0.2 } });

add({ id: 'neck1', name: 'Kurt Dişi Kolye', type: 'necklace', icon: 'necklace', rarity: 1, level: 5, hp: 50, crit: 2, price: 700, look: { color: 0xe3d3ae, metal: 0.6, rough: 0.35 } });
add({ id: 'neck2', name: 'Yeşim Tılsım', type: 'necklace', icon: 'necklace', rarity: 2, level: 14, hp: 120, mp: 60, crit: 4, price: 3800, look: { color: 0x5fc596, metal: 0.62, rough: 0.28 } });
add({ id: 'neck3', name: 'Ay Taşı Kolye', type: 'necklace', icon: 'necklace', rarity: 2, level: 18, hp: 200, mp: 120, crit: 5, price: 9000, look: { color: 0xb8c8e8, metal: 0.7, rough: 0.24 } });
add({ id: 'neck4', name: 'Ejder Yüreği', type: 'necklace', icon: 'necklace', rarity: 3, level: 27, hp: 340, atk: 8, crit: 7, price: 21000, look: { color: 0xe05050, metal: 0.88, rough: 0.2 } });
add({ id: 'ring1', name: 'Bakır Yüzük', type: 'ring', icon: 'ring', rarity: 0, level: 4, atk: 4, price: 400, look: { color: 0xc78350, metal: 0.82, rough: 0.25 } });
add({ id: 'ring2', name: 'Kan Taşı Yüzüğü', type: 'ring', icon: 'ring', rarity: 2, level: 13, atk: 12, crit: 3, price: 3600, look: { color: 0xc7424d, metal: 0.68, rough: 0.24 } });
add({ id: 'ring3', name: 'Devin Mührü', type: 'ring', icon: 'ring', rarity: 3, level: 22, atk: 26, crit: 6, hp: 100, price: 14000, look: { color: 0xe6bd55, metal: 0.9, rough: 0.19 } });
add({ id: 'ring4', name: 'Taht Mührü', type: 'ring', icon: 'ring', rarity: 3, level: 26, atk: 38, crit: 8, hp: 160, price: 21000, look: { color: 0xf0d070, metal: 0.95, rough: 0.16 } });

// Kalkanlar: Metin2 geleneğine uygun olarak savaşçıya özel
add({ id: 'shield1', name: 'Ahşap Kalkan', type: 'shield', icon: 'shield', rarity: 0, level: 1, cls: 'warrior', def: 5, hp: 15, price: 120, look: { color: 0x7a5a34, metal: 0.05, rough: 0.85 } });
add({ id: 'shield2', name: 'Demir Kalkan', type: 'shield', icon: 'shield', rarity: 1, level: 9, cls: 'warrior', def: 14, hp: 50, price: 1400, look: { color: 0x8a94a0, metal: 0.8, rough: 0.3 } });
add({ id: 'shield3', name: 'Aslan Kalkan', type: 'shield', icon: 'shield', rarity: 2, level: 17, cls: 'warrior', def: 26, hp: 110, price: 6200, look: { color: 0xc79a45, metal: 0.85, rough: 0.24 } });
add({ id: 'shield4', name: 'Ejder Kalkanı', type: 'shield', icon: 'shield', rarity: 3, level: 26, cls: 'warrior', def: 40, hp: 200, price: 16000, look: { color: 0xa03a30, metal: 0.9, rough: 0.2 } });

// Küpeler: saldırı ve kritik ağırlıklı takılar
add({ id: 'earring1', name: 'Bakır Küpe', type: 'earring', icon: 'earring', rarity: 0, level: 4, atk: 3, crit: 1, price: 450, look: { color: 0xc78350, metal: 0.8, rough: 0.3 } });
add({ id: 'earring2', name: 'Gümüş Küpe', type: 'earring', icon: 'earring', rarity: 1, level: 13, atk: 8, crit: 3, price: 4200, look: { color: 0xc8d0dc, metal: 0.9, rough: 0.22 } });
add({ id: 'earring3', name: 'Ay Küpesi', type: 'earring', icon: 'earring', rarity: 2, level: 21, atk: 15, crit: 5, price: 12000, look: { color: 0xb8c8f0, metal: 0.85, rough: 0.18 } });

// Bilezikler: savunma ve can ağırlıklı takılar
add({ id: 'bracelet1', name: 'Deri Bilezik', type: 'bracelet', icon: 'bracelet', rarity: 0, level: 3, def: 2, hp: 25, price: 350, look: { color: 0x6e4a2c, metal: 0.05, rough: 0.8 } });
add({ id: 'bracelet2', name: 'Zincir Bilezik', type: 'bracelet', icon: 'bracelet', rarity: 1, level: 12, def: 5, hp: 80, atk: 4, price: 3900, look: { color: 0x9aa4b0, metal: 0.75, rough: 0.3 } });
add({ id: 'bracelet3', name: 'Kadim Bilezik', type: 'bracelet', icon: 'bracelet', rarity: 2, level: 20, def: 9, hp: 150, atk: 9, price: 11500, look: { color: 0xd0a850, metal: 0.88, rough: 0.2 } });

// Kemerler: can ağırlıklı kuşaklar
add({ id: 'belt1', name: 'Bez Kuşak', type: 'belt', icon: 'belt', rarity: 0, level: 2, hp: 25, price: 250, look: { color: 0x8a7350, metal: 0, rough: 0.85 } });
add({ id: 'belt2', name: 'Deri Kemer', type: 'belt', icon: 'belt', rarity: 1, level: 11, hp: 75, def: 3, price: 3200, look: { color: 0x5c3a22, metal: 0.15, rough: 0.7 } });
add({ id: 'belt3', name: 'Savaş Kuşağı', type: 'belt', icon: 'belt', rarity: 2, level: 19, hp: 150, def: 6, atk: 5, price: 9800, look: { color: 0x8a4a2a, metal: 0.6, rough: 0.35 } });

add({ id: 'hp1', name: 'Kırmızı İksir', type: 'potion', icon: 'potion', rarity: 0, level: 1, heal: 120, price: 25, stack: true, desc: '120 can yeniler.' });
add({ id: 'hp2', name: 'Büyük Kırmızı İksir', type: 'potion', icon: 'potion', rarity: 1, level: 10, heal: 380, price: 110, stack: true, desc: '380 can yeniler.' });
add({ id: 'hp3', name: 'Kral İksiri', type: 'potion', icon: 'potion', rarity: 2, level: 20, heal: 850, price: 400, stack: true, desc: '850 can yeniler.' });
add({ id: 'mp1', name: 'Mavi İksir', type: 'potion', icon: 'potionmp', rarity: 0, level: 1, mana: 80, price: 30, stack: true, desc: '80 mana yeniler.' });
add({ id: 'mp2', name: 'Büyük Mavi İksir', type: 'potion', icon: 'potionmp', rarity: 1, level: 10, mana: 240, price: 130, stack: true, desc: '240 mana yeniler.' });
add({ id: 'mp3', name: 'Bilge İksiri', type: 'potion', icon: 'potionmp', rarity: 2, level: 20, mana: 560, price: 450, stack: true, desc: '560 mana yeniler.' });

add({ id: 'pelt', name: 'Kurt Postu', type: 'material', icon: 'fur', rarity: 0, level: 1, price: 18, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'tusk', name: 'Yaban Domuzu Dişi', type: 'material', icon: 'gem', rarity: 0, level: 1, price: 40, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'claw', name: 'Ayı Pençesi', type: 'material', icon: 'gem', rarity: 1, level: 1, price: 85, stack: true, desc: 'Tüccara satılabilir.' });
add({ id: 'core', name: 'Golem Çekirdeği', type: 'material', icon: 'gem', rarity: 2, level: 1, price: 260, stack: true, desc: 'Değerli bir büyü bileşeni.' });
add({ id: 'crystal', name: 'Ruh Kristali', type: 'material', icon: 'gem', rarity: 2, level: 1, price: 300, stack: true, desc: 'Lanetli taşlardan düşer. +4 ve üzeri yükseltmeler için gerekir.' });
add({ id: 'medal', name: 'Haydut Madalyası', type: 'material', icon: 'gem', rarity: 1, level: 1, price: 65, stack: true, desc: 'Haydutlardan düşer. Tüccara satılabilir.' });
add({ id: 'ogrehorn', name: 'Dev Boynuzu', type: 'material', icon: 'fur', rarity: 3, level: 1, price: 900, stack: true, desc: 'Devden kesilen boynuz. Değerli bir av ganimeti.' });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((d) => [d.id, d]));
export const RARITY_COLORS = ['#d8d2c4', '#6fd36a', '#5aa8ff', '#f0b23c'];
export const RARITY_NAMES = ['Sıradan', 'Nadir', 'Destansı', 'Efsanevi'];
export const MAX_PLUS = 9;
export const UPGRADE_CHANCE = [90, 85, 75, 65, 55, 45, 35, 25, 15];

export const isEquip = (d: ItemDef) => d.type !== 'potion' && d.type !== 'material';
export const plusMult = (plus: number) => 1 + plus * 0.11;
export const upgradeCost = (d: ItemDef, plus: number) => Math.max(80, Math.round(d.price * 0.35 * (plus + 1)));
export const itemLabel = (s: ItemStack) => ITEMS[s.id].name + (s.plus > 0 ? ` +${s.plus}` : '');

/** Tüccarın sattığı genel eşyalar (iksirler ve giriş takıları) */
export const SHOP_STOCK = [
  'hp1', 'hp2', 'hp3', 'mp1', 'mp2', 'mp3', 'ring1', 'neck1',
];
/** Silahçının sattığı silahlar; üst kademeler yalnızca düşüşle bulunur */
export const WEAPON_STOCK = [
  'sword1', 'sword2', 'sword3', 'dagger1', 'dagger2', 'dagger3', 'staff1', 'staff2', 'staff3', 'spear1',
];
/** Zırhçının sattığı zırh ve parçalar; üst kademeler yalnızca düşüşle bulunur */
export const ARMOR_STOCK = [
  'armor1', 'armor2', 'armor3', 'helm1', 'helm2', 'boots1', 'boots2', 'shield1', 'shield2',
];
/** Kuyumcunun sattığı takılar; üst kademeler yalnızca düşüşle bulunur */
export const JEWEL_STOCK = [
  'ring1', 'ring2', 'neck1', 'neck2', 'neck3',
  'earring1', 'earring2', 'bracelet1', 'bracelet2', 'belt1', 'belt2',
];
/** NPC kimliğine göre dükkân stoğu */
export const SHOPS: Record<string, string[]> = {
  merchant: SHOP_STOCK, weaponsmith: WEAPON_STOCK, armorer: ARMOR_STOCK, jeweler: JEWEL_STOCK,
};

/** Kuyumcudaki malzeme değişim teklifleri: ver → al */
export const EXCHANGES: { give: { id: string; count: number }; get: { id: string; count: number } }[] = [
  { give: { id: 'pelt', count: 8 }, get: { id: 'crystal', count: 1 } },
  { give: { id: 'tusk', count: 5 }, get: { id: 'crystal', count: 1 } },
  { give: { id: 'medal', count: 6 }, get: { id: 'crystal', count: 2 } },
  { give: { id: 'claw', count: 3 }, get: { id: 'crystal', count: 2 } },
  { give: { id: 'core', count: 2 }, get: { id: 'crystal', count: 3 } },
  { give: { id: 'ogrehorn', count: 1 }, get: { id: 'crystal', count: 4 } },
];
