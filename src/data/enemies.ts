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
    drops: [{ id: 'pelt', chance: 0.45 }, { id: 'hp1', chance: 0.14 }, { id: 'boots1', chance: 0.03 }], respawn: 22 },
  { id: 'alpha_wolf', name: 'Sürü Lideri', level: 6, hp: 380, atk: 34, def: 6, exp: 110, gold: [40, 80], speed: 6, aggro: 14, range: 2.4, attackCd: 1.4, radius: 0.9,
    drops: [{ id: 'pelt', chance: 1 }, { id: 'neck1', chance: 0.2 }, { id: 'helm1', chance: 0.25 }, { id: 'hp1', chance: 0.6 }], respawn: 70 },
  { id: 'boar', name: 'Yaban Domuzu', level: 7, hp: 240, atk: 36, def: 8, exp: 62, gold: [18, 38], speed: 5, aggro: 9, range: 2.0, attackCd: 1.7, radius: 0.75,
    drops: [{ id: 'tusk', chance: 0.45 }, { id: 'hp1', chance: 0.18 }, { id: 'ring1', chance: 0.04 }, { id: 'armor2', chance: 0.025 }], respawn: 26 },
  { id: 'bear', name: 'Dağ Ayısı', level: 11, hp: 520, atk: 58, def: 14, exp: 140, gold: [35, 70], speed: 4.8, aggro: 11, range: 2.6, attackCd: 1.9, radius: 1.1,
    drops: [{ id: 'claw', chance: 0.5 }, { id: 'hp2', chance: 0.15 }, { id: 'helm2', chance: 0.05 }, { id: 'boots2', chance: 0.05 }], respawn: 34 },
  { id: 'bandit', name: 'Haydut', level: 14, hp: 640, atk: 76, def: 20, exp: 200, gold: [60, 120], speed: 5.2, aggro: 14, range: 2.3, attackCd: 1.5, radius: 0.55,
    drops: [{ id: 'hp2', chance: 0.2 }, { id: 'mp2', chance: 0.12 }, { id: 'sword2', chance: 0.03 }, { id: 'dagger2', chance: 0.03 }, { id: 'staff2', chance: 0.03 }, { id: 'ring2', chance: 0.03 }], respawn: 30 },
  { id: 'bandit_chief', name: 'Haydut Reisi Karaca', level: 18, hp: 3200, atk: 120, def: 32, exp: 1400, gold: [500, 900], speed: 5.4, aggro: 16, range: 2.8, attackCd: 1.4, radius: 0.75, boss: true,
    drops: [{ id: 'armor3', chance: 0.5 }, { id: 'neck2', chance: 0.4 }, { id: 'crystal', chance: 1 }, { id: 'hp2', chance: 1 }], respawn: 150 },
  { id: 'golem', name: 'Taş Muhafız', level: 22, hp: 1500, atk: 135, def: 48, exp: 520, gold: [120, 220], speed: 3.8, aggro: 12, range: 3.0, attackCd: 2.1, radius: 1.0,
    drops: [{ id: 'core', chance: 0.4 }, { id: 'hp2', chance: 0.25 }, { id: 'helm3', chance: 0.04 }, { id: 'boots3', chance: 0.04 }, { id: 'sword3', chance: 0.02 }, { id: 'dagger3', chance: 0.02 }, { id: 'staff3', chance: 0.02 }], respawn: 40 },
  { id: 'ogre', name: 'Kara Dev Gorvak', level: 30, hp: 14000, atk: 230, def: 70, exp: 9000, gold: [3000, 5000], speed: 4.4, aggro: 20, range: 4.4, attackCd: 2.2, radius: 1.5, boss: true,
    drops: [{ id: 'armor4', chance: 0.6 }, { id: 'ring3', chance: 0.6 }, { id: 'sword4', chance: 0.3 }, { id: 'dagger4', chance: 0.3 }, { id: 'staff4', chance: 0.3 }, { id: 'crystal', chance: 1 }], respawn: 300 },

  { id: 'stone_low', name: 'Lanetli Taş (Mor)', level: 5, hp: 900, atk: 0, def: 4, exp: 320, gold: [150, 280], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 1.5,
    drops: [{ id: 'crystal', chance: 0.7 }, { id: 'hp1', chance: 1 }, { id: 'ring1', chance: 0.3 }, { id: 'helm1', chance: 0.3 }, { id: 'neck1', chance: 0.15 }], respawn: 100,
    stone: { wave: ['wolf'], perWave: 3 } },
  { id: 'stone_mid', name: 'Lanetli Taş (Kızıl)', level: 14, hp: 4200, atk: 0, def: 18, exp: 1700, gold: [600, 1000], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 1.7,
    drops: [{ id: 'crystal', chance: 1 }, { id: 'hp2', chance: 1 }, { id: 'armor2', chance: 0.3 }, { id: 'ring2', chance: 0.25 }, { id: 'helm2', chance: 0.3 }, { id: 'neck2', chance: 0.12 }], respawn: 130,
    stone: { wave: ['boar', 'bear'], perWave: 3 } },
  { id: 'stone_high', name: 'Lanetli Taş (Gök)', level: 24, hp: 11000, atk: 0, def: 40, exp: 5200, gold: [1600, 2600], speed: 0, aggro: 0, range: 0, attackCd: 0, radius: 2.0,
    drops: [{ id: 'crystal', chance: 1 }, { id: 'crystal', chance: 0.6 }, { id: 'armor3', chance: 0.3 }, { id: 'helm3', chance: 0.3 }, { id: 'boots3', chance: 0.3 }, { id: 'ring3', chance: 0.08 }], respawn: 170,
    stone: { wave: ['golem', 'bandit'], perWave: 3 } },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
