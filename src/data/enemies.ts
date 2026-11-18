export interface EnemyDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: [number, number];
  speed: number;
  /** Saldırganlık menzili; 0 ise yalnızca saldırıya uğrayınca karşılık verir */
  aggro: number;
  range: number;
  attackCd: number;
  radius: number;
  drops: { id: string; chance: number }[];
  respawn: number;
  boss?: boolean;
  /** Lanetli taşlar: çağırdığı yaratıklar */
  stone?: { wave: string[]; perWave: number };
}

const defs: EnemyDef[] = [
  { id: 'wolf', name: 'Bozkurt', level: 2, hp: 85, atk: 15, def: 2, exp: 20, gold: [6, 16], speed: 5.4, aggro: 5, range: 1.9, attackCd: 1.5, radius: 0.6,
    drops: [{ id: 'pelt', chance: 0.6 }, { id: 'hp1', chance: 0.14 }, { id: 'boots1', chance: 0.03 }, { id: 'sword1', chance: 0.02 }, { id: 'club1', chance: 0.02 }, { id: 'ring1', chance: 0.015 }], respawn: 22 },
  { id: 'alpha_wolf', name: 'Sürü Lideri', level: 6, hp: 380, atk: 34, def: 6, exp: 110, gold: [40, 80], speed: 6, aggro: 14, range: 2.4, attackCd: 1.4, radius: 0.9, boss: true,
    drops: [{ id: 'pelt', chance: 1 }, { id: 'neck1', chance: 0.2 }, { id: 'helm1', chance: 0.25 }, { id: 'hp1', chance: 0.6 }, { id: 'armor2', chance: 0.08 }, { id: 'hp2', chance: 0.15 }], respawn: 70 },
  { id: 'boar', name: 'Yaban Domuzu', level: 7, hp: 240, atk: 36, def: 8, exp: 62, gold: [18, 38], speed: 5, aggro: 9, range: 2.0, attackCd: 1.7, radius: 0.75,
    drops: [{ id: 'tusk', chance: 0.45 }, { id: 'hp1', chance: 0.18 }, { id: 'ring1', chance: 0.04 }, { id: 'armor2', chance: 0.025 }, { id: 'helm1', chance: 0.05 }], respawn: 26 },
  { id: 'bear', name: 'Dağ Ayısı', level: 11, hp: 520, atk: 58, def: 14, exp: 140, gold: [35, 70], speed: 4.8, aggro: 11, range: 2.6, attackCd: 1.9, radius: 1.1,
    drops: [{ id: 'claw', chance: 0.5 }, { id: 'hp2', chance: 0.15 }, { id: 'mp2', chance: 0.1 }, { id: 'helm2', chance: 0.05 }, { id: 'boots2', chance: 0.05 }, { id: 'ring2', chance: 0.03 }, { id: 'armor3', chance: 0.015 }, { id: 'belt2', chance: 0.04 }], respawn: 34 },
  { id: 'bandit', name: 'Haydut', level: 14, hp: 640, atk: 76, def: 20, exp: 200, gold: [60, 120], speed: 5.2, aggro: 14, range: 2.3, attackCd: 1.5, radius: 0.55,
    drops: [{ id: 'medal', chance: 0.55 }, { id: 'hp2', chance: 0.2 }, { id: 'mp2', chance: 0.12 }, { id: 'hp3', chance: 0.05 }, { id: 'sword2', chance: 0.03 }, { id: 'spear2', chance: 0.03 }, { id: 'club2', chance: 0.03 }, { id: 'spear1', chance: 0.04 }, { id: 'ring2', chance: 0.03 }, { id: 'neck2', chance: 0.02 }, { id: 'bracelet2', chance: 0.04 }, { id: 'earring2', chance: 0.04 }], respawn: 30 },
  { id: 'bandit_chief', name: 'Haydut Reisi Karaca', level: 18, hp: 3200, atk: 120, def: 32, exp: 1400, gold: [500, 900], speed: 5.4, aggro: 16, range: 2.8, attackCd: 1.4, radius: 0.75, boss: true,
    drops: [{ id: 'armor3', chance: 0.5 }, { id: 'neck2', chance: 0.4 }, { id: 'crystal', chance: 1 }, { id: 'hp2', chance: 1 }, { id: 'hp3', chance: 0.4 }, { id: 'medal', chance: 1 }, { id: 'sword3', chance: 0.12 }, { id: 'spear3', chance: 0.12 }, { id: 'club3', chance: 0.12 }, { id: 'spear2', chance: 0.15 }, { id: 'helm3', chance: 0.2 }, { id: 'boots3', chance: 0.15 }, { id: 'ring3', chance: 0.08 }], respawn: 150 },
  { id: 'golem', name: 'Taş Muhafız', level: 22, hp: 1500, atk: 135, def: 48, exp: 520, gold: [120, 220], speed: 3.8, aggro: 12, range: 3.0, attackCd: 2.1, radius: 1.0,
    drops: [{ id: 'core', chance: 0.4 }, { id: 'hp2', chance: 0.25 }, { id: 'hp3', chance: 0.1 }, { id: 'helm3', chance: 0.04 }, { id: 'boots3', chance: 0.04 }, { id: 'sword3', chance: 0.02 }, { id: 'spear3', chance: 0.02 }, { id: 'club3', chance: 0.02 }, { id: 'spear2', chance: 0.025 }, { id: 'armor4', chance: 0.02 }, { id: 'neck3', chance: 0.02 }, { id: 'ring3', chance: 0.015 }, { id: 'shield3', chance: 0.03 }], respawn: 40 },
  { id: 'ogre', name: 'Kara Dev Gorvak', level: 30, hp: 14000, atk: 230, def: 70, exp: 9000, gold: [3000, 5000], speed: 4.4, aggro: 20, range: 4.4, attackCd: 2.2, radius: 1.5, boss: true,
    drops: [{ id: 'ogrehorn', chance: 1 }, { id: 'armor4', chance: 0.6 }, { id: 'ring3', chance: 0.6 }, { id: 'sword4', chance: 0.3 }, { id: 'spear4', chance: 0.3 }, { id: 'club4', chance: 0.3 }, { id: 'spear3', chance: 0.35 }, { id: 'armor5', chance: 0.2 }, { id: 'armor6', chance: 0.12 }, { id: 'warplate', chance: 0.1 }, { id: 'sword5', chance: 0.1 }, { id: 'spear5', chance: 0.1 }, { id: 'club5', chance: 0.1 }, { id: 'helm4', chance: 0.18 }, { id: 'boots4', chance: 0.18 }, { id: 'neck4', chance: 0.12 }, { id: 'ring4', chance: 0.12 }, { id: 'shield4', chance: 0.04 }, { id: 'earring3', chance: 0.04 }, { id: 'bracelet3', chance: 0.04 }, { id: 'belt3', chance: 0.04 }, { id: 'crystal', chance: 1 }], respawn: 300 },

  // Bölge baskınları ve yeni türler
  { id: 'snake', name: 'Bataklık Yılanı', level: 4, hp: 120, atk: 24, def: 3, exp: 34, gold: [8, 18], speed: 5.8, aggro: 6, range: 1.6, attackCd: 1.3, radius: 0.45,
    drops: [{ id: 'hp1', chance: 0.16 }, { id: 'mp1', chance: 0.1 }, { id: 'sword1', chance: 0.03 }, { id: 'spear1', chance: 0.03 }, { id: 'ring1', chance: 0.02 }, { id: 'boots1', chance: 0.03 }], respawn: 24 },
  { id: 'spider', name: 'Zehirli Örümcek', level: 9, hp: 300, atk: 48, def: 10, exp: 85, gold: [20, 40], speed: 5.4, aggro: 10, range: 1.7, attackCd: 1.3, radius: 0.7,
    drops: [{ id: 'hp1', chance: 0.12 }, { id: 'hp2', chance: 0.08 }, { id: 'spear1', chance: 0.03 }, { id: 'club1', chance: 0.03 }, { id: 'neck1', chance: 0.02 }, { id: 'helm1', chance: 0.03 }], respawn: 28 },
  { id: 'horse', name: 'Yaban Atı', level: 12, hp: 460, atk: 55, def: 12, exp: 120, gold: [30, 60], speed: 7.5, aggro: 0, range: 2.2, attackCd: 1.6, radius: 0.75,
    drops: [{ id: 'hp2', chance: 0.14 }, { id: 'boots2', chance: 0.04 }, { id: 'sword2', chance: 0.02 }, { id: 'spear2', chance: 0.02 }, { id: 'neck1', chance: 0.025 }], respawn: 32 },
  { id: 'nightwolf', name: 'Kara Kurt', level: 16, hp: 780, atk: 95, def: 24, exp: 260, gold: [70, 130], speed: 6.2, aggro: 13, range: 2.1, attackCd: 1.4, radius: 0.7,
    drops: [{ id: 'pelt', chance: 0.5 }, { id: 'hp2', chance: 0.16 }, { id: 'sword3', chance: 0.03 }, { id: 'spear3', chance: 0.03 }, { id: 'ring2', chance: 0.04 }, { id: 'armor3', chance: 0.02 }], respawn: 32 },
  { id: 'scorpion', name: 'Çöl Akrebi', level: 19, hp: 1100, atk: 115, def: 42, exp: 380, gold: [90, 160], speed: 4.6, aggro: 10, range: 1.9, attackCd: 1.7, radius: 0.85,
    drops: [{ id: 'hp3', chance: 0.1 }, { id: 'mp3', chance: 0.08 }, { id: 'helm3', chance: 0.03 }, { id: 'club3', chance: 0.02 }, { id: 'ring3', chance: 0.02 }, { id: 'armor4', chance: 0.01 }], respawn: 36 },

  // Bölge baskınları
  { id: 'boar_king', name: 'Baba Kıllı', level: 10, hp: 1800, atk: 85, def: 20, exp: 750, gold: [300, 500], speed: 5.2, aggro: 12, range: 2.4, attackCd: 1.5, radius: 1.1, boss: true,
    drops: [{ id: 'tusk', chance: 1 }, { id: 'armor2', chance: 0.4 }, { id: 'helm1', chance: 0.4 }, { id: 'sword2', chance: 0.15 }, { id: 'spear2', chance: 0.15 }, { id: 'club2', chance: 0.15 }, { id: 'ring2', chance: 0.15 }, { id: 'hp2', chance: 0.8 }], respawn: 140 },
  { id: 'serpent_queen', name: 'Kobra Kraliçe Naja', level: 13, hp: 3800, atk: 140, def: 35, exp: 1500, gold: [350, 600], speed: 6.2, aggro: 15, range: 2.2, attackCd: 1.3, radius: 0.9, boss: true,
    drops: [{ id: 'neck2', chance: 0.35 }, { id: 'helm2', chance: 0.3 }, { id: 'boots2', chance: 0.3 }, { id: 'spear1', chance: 0.15 }, { id: 'sword2', chance: 0.12 }, { id: 'spear2', chance: 0.12 }, { id: 'hp2', chance: 1 }, { id: 'crystal', chance: 0.5 }], respawn: 160 },
  { id: 'bear_king', name: 'Koca Ursak', level: 15, hp: 4500, atk: 155, def: 42, exp: 1600, gold: [400, 700], speed: 5, aggro: 14, range: 3.0, attackCd: 1.7, radius: 1.3, boss: true,
    drops: [{ id: 'claw', chance: 1 }, { id: 'armor3', chance: 0.3 }, { id: 'helm2', chance: 0.35 }, { id: 'boots2', chance: 0.35 }, { id: 'neck2', chance: 0.25 }, { id: 'ring2', chance: 0.2 }, { id: 'hp2', chance: 1 }], respawn: 170 },
  { id: 'spider_queen', name: 'Ağ Ana Vexa', level: 17, hp: 5600, atk: 180, def: 45, exp: 2200, gold: [450, 750], speed: 5.6, aggro: 14, range: 2.4, attackCd: 1.3, radius: 1.2, boss: true,
    drops: [{ id: 'armor3', chance: 0.35 }, { id: 'spear3', chance: 0.15 }, { id: 'club3', chance: 0.12 }, { id: 'neck3', chance: 0.2 }, { id: 'boots3', chance: 0.2 }, { id: 'hp3', chance: 0.5 }, { id: 'crystal', chance: 0.6 }], respawn: 180 },
  { id: 'stallion', name: 'Kral Aygır Şimşek', level: 20, hp: 7000, atk: 195, def: 50, exp: 3000, gold: [500, 850], speed: 7.0, aggro: 12, range: 2.6, attackCd: 1.4, radius: 1.2, boss: true,
    drops: [{ id: 'helm3', chance: 0.3 }, { id: 'boots3', chance: 0.35 }, { id: 'spear2', chance: 0.18 }, { id: 'sword3', chance: 0.15 }, { id: 'neck3', chance: 0.15 }, { id: 'ring3', chance: 0.12 }, { id: 'hp3', chance: 0.6 }], respawn: 200 },
  { id: 'nightclaw', name: 'Gece Pençesi', level: 24, hp: 8500, atk: 220, def: 58, exp: 4200, gold: [600, 1000], speed: 6.6, aggro: 16, range: 2.4, attackCd: 1.3, radius: 1.1, boss: true,
    drops: [{ id: 'pelt', chance: 1 }, { id: 'armor4', chance: 0.3 }, { id: 'sword4', chance: 0.12 }, { id: 'spear4', chance: 0.12 }, { id: 'neck3', chance: 0.3 }, { id: 'helm3', chance: 0.3 }, { id: 'ring3', chance: 0.15 }, { id: 'earring3', chance: 0.04 }, { id: 'bracelet3', chance: 0.04 }, { id: 'hp3', chance: 0.8 }], respawn: 220 },
  { id: 'golem_king', name: 'Kadim Muhafız Rul', level: 26, hp: 12000, atk: 240, def: 80, exp: 5500, gold: [800, 1400], speed: 4.2, aggro: 15, range: 3.6, attackCd: 2.0, radius: 1.4, boss: true,
    drops: [{ id: 'core', chance: 1 }, { id: 'armor4', chance: 0.35 }, { id: 'sword4', chance: 0.14 }, { id: 'club4', chance: 0.14 }, { id: 'ring3', chance: 0.3 }, { id: 'warplate', chance: 0.1 }, { id: 'neck3', chance: 0.2 }, { id: 'shield4', chance: 0.03 }, { id: 'hp3', chance: 0.8 }, { id: 'crystal', chance: 0.8 }], respawn: 240 },
  { id: 'scorpion_king', name: 'Akrep İmparatoru Kraz', level: 27, hp: 10500, atk: 250, def: 65, exp: 6000, gold: [800, 1300], speed: 5, aggro: 15, range: 2.4, attackCd: 1.6, radius: 1.3, boss: true,
    drops: [{ id: 'armor5', chance: 0.3 }, { id: 'club4', chance: 0.15 }, { id: 'spear4', chance: 0.15 }, { id: 'ring3', chance: 0.3 }, { id: 'neck4', chance: 0.12 }, { id: 'spear2', chance: 0.2 }, { id: 'belt3', chance: 0.04 }, { id: 'earring3', chance: 0.04 }, { id: 'hp3', chance: 0.8 }], respawn: 230 },

  { id: 'stone_low', name: 'Lanetli Taş (Mor)', level: 5, hp: 900, atk: 0, def: 4, exp: 320, gold: [150, 280], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 1.5,
    drops: [{ id: 'crystal', chance: 0.7 }, { id: 'hp1', chance: 1 }, { id: 'mp1', chance: 0.5 }, { id: 'ring1', chance: 0.3 }, { id: 'helm1', chance: 0.3 }, { id: 'neck1', chance: 0.15 }], respawn: 100,
    stone: { wave: ['wolf'], perWave: 3 } },
  { id: 'stone_mid', name: 'Lanetli Taş (Kızıl)', level: 14, hp: 4200, atk: 0, def: 18, exp: 1700, gold: [600, 1000], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 1.7,
    drops: [{ id: 'crystal', chance: 1 }, { id: 'hp2', chance: 1 }, { id: 'mp2', chance: 0.5 }, { id: 'armor2', chance: 0.3 }, { id: 'ring2', chance: 0.25 }, { id: 'helm2', chance: 0.3 }, { id: 'neck2', chance: 0.12 }, { id: 'neck3', chance: 0.05 }, { id: 'spear1', chance: 0.06 }], respawn: 130,
    stone: { wave: ['boar', 'bear'], perWave: 3 } },
  { id: 'stone_high', name: 'Lanetli Taş (Gök)', level: 24, hp: 11000, atk: 0, def: 40, exp: 5200, gold: [1600, 2600], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 2.0,
    drops: [{ id: 'crystal', chance: 1 }, { id: 'crystal', chance: 0.6 }, { id: 'armor3', chance: 0.3 }, { id: 'armor5', chance: 0.08 }, { id: 'helm3', chance: 0.3 }, { id: 'boots3', chance: 0.3 }, { id: 'ring3', chance: 0.08 }, { id: 'neck4', chance: 0.04 }, { id: 'ring4', chance: 0.04 }], respawn: 170,
    stone: { wave: ['golem', 'bandit'], perWave: 3 } },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
