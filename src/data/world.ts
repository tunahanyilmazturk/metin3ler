/** Dünya düzeni: boyutlar, yollar, yaratık bölgeleri ve NPC konumları. */
export const WORLD_SIZE = 800;
export const WORLD_HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0;
export const VILLAGE_R = 54;
export const VILLAGE_H = 6;
export const LAKE = { x: 150, z: -110, r: 55 };
export const MOUNTAIN = { x: -230, z: 230, r: 80 };

/** Köyden bölgelere uzanan toprak yollar (çoklu çizgi). */
export const ROADS: [number, number][][] = [
  [[0, 0], [0, -70], [10, -140]],
  [[0, 0], [-80, -30], [-160, -70], [-250, -230]],
  [[0, 0], [70, 60], [170, 170]],
  [[0, 0], [-60, 70], [-150, 150]],
];

export interface SpawnZone {
  enemy: string;
  x: number;
  z: number;
  r: number;
  count: number;
}

export const SPAWN_ZONES: SpawnZone[] = [
  { enemy: 'wolf', x: 10, z: -140, r: 55, count: 10 },
  { enemy: 'wolf', x: 115, z: 30, r: 45, count: 7 },
  { enemy: 'alpha_wolf', x: 30, z: -185, r: 30, count: 2 },
  { enemy: 'boar', x: -160, z: -70, r: 55, count: 10 },
  { enemy: 'boar_king', x: -178, z: -88, r: 12, count: 1 },
  { enemy: 'bear', x: -120, z: -160, r: 45, count: 5 },
  { enemy: 'bear_king', x: -135, z: -178, r: 12, count: 1 },
  { enemy: 'snake', x: 95, z: -70, r: 40, count: 8 },
  { enemy: 'snake', x: 55, z: -40, r: 25, count: 4 },
  { enemy: 'serpent_queen', x: 82, z: -88, r: 12, count: 1 },
  { enemy: 'spider', x: -60, z: 80, r: 42, count: 8 },
  { enemy: 'spider', x: -35, z: 150, r: 28, count: 4 },
  { enemy: 'spider_queen', x: -78, z: 98, r: 13, count: 1 },
  { enemy: 'horse', x: 210, z: 60, r: 48, count: 7 },
  { enemy: 'stallion', x: 228, z: 78, r: 13, count: 1 },
  { enemy: 'nightwolf', x: 250, z: -160, r: 50, count: 8 },
  { enemy: 'nightclaw', x: 268, z: -178, r: 13, count: 1 },
  { enemy: 'scorpion', x: 300, z: -270, r: 55, count: 8 },
  { enemy: 'scorpion', x: 240, z: -320, r: 30, count: 3 },
  { enemy: 'scorpion_king', x: 315, z: -282, r: 15, count: 1 },
  { enemy: 'bandit', x: 170, z: 170, r: 50, count: 10 },
  { enemy: 'bandit_chief', x: 190, z: 190, r: 14, count: 1 },
  { enemy: 'golem', x: -170, z: 170, r: 55, count: 7 },
  { enemy: 'golem_king', x: -195, z: 188, r: 14, count: 1 },
  { enemy: 'ogre', x: -250, z: -235, r: 10, count: 1 },
];

/** Lanetli taşların belirebileceği bölgeler. */
export const STONE_ZONES: SpawnZone[] = [
  { enemy: 'stone_low', x: 40, z: -110, r: 50, count: 2 },
  { enemy: 'stone_low', x: 110, z: 60, r: 40, count: 1 },
  { enemy: 'stone_mid', x: -150, z: -100, r: 60, count: 2 },
  { enemy: 'stone_mid', x: 150, z: 140, r: 45, count: 1 },
  { enemy: 'stone_high', x: -160, z: 150, r: 50, count: 2 },
];

export const NPCS = [
  { id: 'elder', name: 'Bilge Aksakal', title: 'Görev Ustası', x: 4, z: 9, yaw: Math.PI * 0.9 },
  { id: 'merchant', name: 'Tüccar Sevinç', title: 'Genel Dükkân', x: -17, z: 3, yaw: Math.PI * 0.5 },
  { id: 'weaponsmith', name: 'Silahçı Turan', title: 'Silah Dükkânı', x: 12, z: -14, yaw: -Math.PI * 0.4 },
  { id: 'armorer', name: 'Zırhçı Selma', title: 'Zırh Dükkânı', x: -17, z: 11, yaw: Math.PI * 0.55 },
  { id: 'smith', name: 'Demirci Bora', title: 'Eşya Yükseltme', x: 17, z: -6, yaw: -Math.PI * 0.5 },
  { id: 'jeweler', name: 'Kuyumcu Rafet', title: 'Kuyum Dükkânı', x: -19, z: -11, yaw: Math.PI * 0.45 },
  { id: 'keeper', name: 'Kasadar Asude', title: 'Depo Görevlisi', x: 25, z: 9, yaw: -Math.PI * 0.6 },
  { id: 'innkeeper', name: 'Hancı Gülsüm', title: 'Han', x: -8, z: -17, yaw: Math.PI * 0.2 },
  { id: 'guide', name: 'Rehber Davut', title: 'Yol Rehberi', x: -4, z: 27, yaw: Math.PI },
  { id: 'stablemaster', name: 'Seyis Rahmi', title: 'Ahır & Binek', x: 31, z: 19, yaw: -Math.PI * 0.65 },
] as const;

export const PLAYER_SPAWN = { x: 0, z: 17 };

/** Rehberin ışınlayabileceği bölge girişleri ve ücretleri. */
export const TRAVEL_SPOTS = [
  { name: 'Kuzey Çayırları', desc: 'Bozkurt ve yılan bölgesi', x: 8, z: -80, cost: 50 },
  { name: 'Göl Kıyısı', desc: 'Bataklık yılanları ve Naja', x: 70, z: -45, cost: 100 },
  { name: 'Batı Tarlaları', desc: 'Yaban domuzu ovaları', x: -110, z: -45, cost: 100 },
  { name: 'Güney Ormanı', desc: 'Zehirli örümcek ağları', x: -40, z: 60, cost: 100 },
  { name: 'Doğu Çayırları', desc: 'Yaban atı sürüleri', x: 160, z: 45, cost: 150 },
  { name: 'Haydut Yolu', desc: 'Karaca\'nın adamları', x: 120, z: 120, cost: 200 },
  { name: 'Kara Orman', desc: 'Gece kurtlarının yurdu', x: 200, z: -120, cost: 250 },
  { name: 'Kadim Harabeler', desc: 'Taş muhafızlar', x: -115, z: 120, cost: 250 },
  { name: 'Kayalık Çöl', desc: 'Akrep kumları', x: 250, z: -220, cost: 350 },
];
