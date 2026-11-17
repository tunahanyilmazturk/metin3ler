import { CLASSES, MAX_LEVEL } from '../data/classes';
import type { StatKey } from '../data/classes';
import { EQUIP_SLOTS, ITEMS, MAX_PLUS, isEquip } from '../data/items';
import type { ItemStack } from '../data/items';
import { QUESTS } from '../data/quests';
import { INVENTORY_TOTAL_SLOTS } from '../data/inventory';
import { DAY_NIGHT_MODES } from '../data/settings';
import type { DayNightMode } from '../data/settings';
import type { PlayerSave } from '../entities/player';
import type { QuestSave } from './quests';
import type { Quality } from '../render/pipeline';

const KEY = 'gokdemir-save-v1';
const SETTINGS_KEY = 'gokdemir-settings-v1';

export interface SaveData {
  v: 1;
  player: PlayerSave;
  quest: QuestSave;
  time: number;
}

export interface Settings { quality: Quality; muted: boolean; dayNight: DayNightMode }

const STAT_KEYS: StatKey[] = ['str', 'dex', 'vit', 'int'];
const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown, min = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

function isItemStack(value: unknown): value is ItemStack {
  if (!isRecord(value) || typeof value.id !== 'string' || !Object.hasOwn(ITEMS, value.id)) return false;
  const item = ITEMS[value.id];
  if (!Number.isInteger(value.plus) || (value.plus as number) < 0 || (value.plus as number) > MAX_PLUS) return false;
  if (!Number.isInteger(value.count) || (value.count as number) < 1) return false;
  if (!isEquip(item) && value.plus !== 0) return false;
  return item.stack === true || value.count === 1;
}

function isPlayerSave(value: unknown): value is PlayerSave {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string' || value.name.length > 16) return false;
  if (typeof value.cls !== 'string' || !Object.hasOwn(CLASSES, value.cls)) return false;
  if (!Number.isInteger(value.level) || (value.level as number) < 1 || (value.level as number) > MAX_LEVEL) return false;
  if (!isFiniteNumber(value.exp) || !Number.isInteger(value.statPoints)) return false;
  if ((value.statPoints as number) < 0 || !isFiniteNumber(value.gold) || !isFiniteNumber(value.hp) || !isFiniteNumber(value.mp)) return false;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x) || typeof value.z !== 'number' || !Number.isFinite(value.z)) return false;

  const stats = value.stats;
  if (!isRecord(stats) || !STAT_KEYS.every((key) => Number.isInteger(stats[key]) && (stats[key] as number) >= 0)) return false;
  if (!Array.isArray(value.inv) || value.inv.length > INVENTORY_TOTAL_SLOTS || !value.inv.every((item) => item === null || isItemStack(item))) return false;
  const equip = value.equip;
  if (!isRecord(equip)) return false;
  return EQUIP_SLOTS.every((slot) => {
    const item = equip[slot];
    return item === null || (isItemStack(item) && ITEMS[item.id].type === slot);
  });
}

function isQuestSave(value: unknown): value is QuestSave {
  if (!isRecord(value) || !Number.isInteger(value.progress) || (value.progress as number) < 0 || typeof value.accepted !== 'boolean') return false;
  const idOk = typeof value.id === 'string' && (value.id === 'done' || QUESTS.some((q) => q.id === value.id));
  const indexOk = Number.isInteger(value.index) && (value.index as number) >= 0;
  return idOk || indexOk;
}

function isSaveData(value: unknown): value is SaveData {
  return isRecord(value) && value.v === 1 && isPlayerSave(value.player) &&
    isQuestSave(value.quest) && isFiniteNumber(value.time);
}

/** localStorage üzerinde kayıt/yükleme. */
export const SaveSystem = {
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data: unknown = JSON.parse(raw);
      return isSaveData(data) ? data : null;
    } catch {
      return null;
    }
  },
  save(data: SaveData) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* depolama kapalı olabilir */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* yoksay */ }
  },
  loadSettings(defaultQuality: Quality = 'high'): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (isRecord(value)) {
          return {
            quality: QUALITIES.includes(value.quality as Quality) ? value.quality as Quality : defaultQuality,
            muted: typeof value.muted === 'boolean' ? value.muted : false,
            dayNight: DAY_NIGHT_MODES.includes(value.dayNight as DayNightMode) ? value.dayNight as DayNightMode : 'cycle',
          };
        }
      }
    } catch { /* yoksay */ }
    return { quality: defaultQuality, muted: false, dayNight: 'cycle' };
  },
  saveSettings(s: Settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* yoksay */ }
  },
};
