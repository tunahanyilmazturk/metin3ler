import type { WeaponKind } from '../entities/humanoid';

export type ClassId = 'warrior' | 'assassin' | 'mage';
export type StatKey = 'str' | 'dex' | 'vit' | 'int';

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  baseHp: number;
  baseMp: number;
  stats: Record<StatKey, number>;
  mainStat: StatKey;
  weapon: WeaponKind;
  ranged: boolean;
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
    desc: 'Ağır zırhlı yakın dövüş ustası. Yüksek can ve geniş alan hasarı.',
    baseHp: 260, baseMp: 60, stats: { str: 8, dex: 4, vit: 7, int: 2 }, mainStat: 'str',
    weapon: 'sword', ranged: false, range: 2.9,
    skills: ['whirl', 'charge', 'warcry', 'quake'],
    startItems: ['sword1', 'armor1'], cloth: 0x7a1c1c, hair: 0x1a1210, robe: false,
  },
  assassin: {
    id: 'assassin', name: 'Gölge',
    desc: 'Çift hançerli çevik suikastçı. Hızlı saldırır, sık kritik vurur.',
    baseHp: 210, baseMp: 80, stats: { str: 4, dex: 9, vit: 5, int: 3 }, mainStat: 'dex',
    weapon: 'dagger', ranged: false, range: 2.5,
    skills: ['venom', 'shadowstep', 'agility', 'bladestorm'],
    startItems: ['dagger1', 'armor1'], cloth: 0x1f2a3a, hair: 0x0c0c10, robe: false,
  },
  mage: {
    id: 'mage', name: 'Büyücü',
    desc: 'Uzaktan element büyüleri yapar. Kırılgan ama yıkıcı.',
    baseHp: 180, baseMp: 160, stats: { str: 2, dex: 4, vit: 4, int: 10 }, mainStat: 'int',
    weapon: 'staff', ranged: true, range: 16,
    skills: ['fireball', 'frostnova', 'manashield', 'thunder'],
    startItems: ['staff1', 'armor1'], cloth: 0x3a2a6a, hair: 0x4a3020, robe: true,
  },
};

export const expForLevel = (level: number) => Math.floor(90 * Math.pow(level, 1.85) + 30);
export const MAX_LEVEL = 40;
