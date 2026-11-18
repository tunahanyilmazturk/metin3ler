import type { WeaponKind } from '../entities/humanoid';

/** Oyunda tek karakter sınıfı var: Savaşçı. Silah tipi (kılıç, mızrak, yay, asa) menzili ve saldırı biçimini belirler. */
export type ClassId = 'warrior';
export type StatKey = 'str' | 'dex' | 'vit' | 'int';

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  baseHp: number;
  baseMp: number;
  stats: Record<StatKey, number>;
  mainStat: StatKey;
  /** Silah kuşanılmadığında ve model çizimi için varsayılan silah görünümü */
  weapon: WeaponKind;
  /** Silahsız yakın dövüş menzili (metre). Silahın kendi menzili varsa o kullanılır. */
  range: number;
  skills: string[];
  startItems: string[];
  cloth: number;
  hair: number;
  robe: boolean;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Savaşçı',
    desc: 'Kılıç ve mızrakla yakın dövüşür; yay ve asayla uzaktan saldırır. Yüksek can ve geniş alan hasarı.',
    baseHp: 260, baseMp: 60, stats: { str: 8, dex: 4, vit: 7, int: 2 }, mainStat: 'str',
    weapon: 'sword', range: 2.9,
    skills: ['whirl', 'charge', 'warcry', 'quake'],
    startItems: ['sword1', 'armor1'], cloth: 0x7a1c1c, hair: 0x1a1210, robe: false,
  },
};

export const expForLevel = (level: number) => Math.floor(90 * Math.pow(level, 1.85) + 30);
export const MAX_LEVEL = 40;
export const DEFAULT_CLASS: ClassId = 'warrior';
