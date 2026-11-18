import { beforeEach, describe, expect, it } from 'vitest';
import { SaveData, SaveSystem } from '../src/systems/save';

/** Node ortamında localStorage yok; basit bir bellek içi depo ile taklit ediyoruz. */
function installStorage() {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
  return data;
}

const validSave = (): SaveData => ({
  v: 1,
  time: 3.5,
  player: {
    name: 'Test', cls: 'warrior', level: 4, exp: 10, statPoints: 2,
    stats: { str: 9, dex: 4, vit: 8, int: 2 }, gold: 120, hp: 200, mp: 40,
    inv: [{ id: 'hp1', plus: 0, count: 3 }, null],
    equip: { weapon: { id: 'sword1', plus: 0, count: 1 }, shield: null, armor: null, helmet: null, boots: null, necklace: null, ring: null, earring: null, bracelet: null, belt: null },
    x: 10, z: -20, horse: null,
  },
  quest: { id: 'q01', index: 0, progress: 2, accepted: true } as any,
});

describe('kayıt sistemi', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorage(); });

  it('kayıt yokken null döner', () => {
    expect(SaveSystem.load()).toBeNull();
  });

  it('geçerli kayıt kaydedilip aynen geri okunur', () => {
    const s = validSave();
    SaveSystem.save(s);
    expect(SaveSystem.load()).toEqual(s);
  });

  it('bozuk JSON reddedilir', () => {
    store.set('gokdemir-save-v1', '{bozuk');
    expect(SaveSystem.load()).toBeNull();
  });

  it('bilinmeyen eşya kimliği olan kayıt reddedilir', () => {
    const s = validSave();
    s.player.inv[0] = { id: 'olmayan-esya', plus: 0, count: 1 };
    store.set('gokdemir-save-v1', JSON.stringify(s));
    expect(SaveSystem.load()).toBeNull();
  });

  it('geçersiz seviye reddedilir', () => {
    const s = validSave();
    s.player.level = 999;
    store.set('gokdemir-save-v1', JSON.stringify(s));
    expect(SaveSystem.load()).toBeNull();
  });

  it('sınıf dışı ekipman kuşanılmış kayıt reddedilir (slot tipi uyuşmazlığı)', () => {
    const s = validSave();
    s.player.equip.helmet = { id: 'sword1', plus: 0, count: 1 };
    store.set('gokdemir-save-v1', JSON.stringify(s));
    expect(SaveSystem.load()).toBeNull();
  });

  it('kayıt silinince load null döner', () => {
    SaveSystem.save(validSave());
    SaveSystem.clear();
    expect(SaveSystem.load()).toBeNull();
  });

  it('ayarlar yoksa varsayılanlar döner', () => {
    expect(SaveSystem.loadSettings('low')).toEqual({ quality: 'low', muted: false, volume: 0.8, dayNight: 'cycle', autoTrail: true, reduceShake: false, reduceFlash: false, largeText: false, sensitivity: 1, showFps: false });
  });

  it('ayarlar kaydedilip okunur; geçersiz değerler varsayılana düşer', () => {
    SaveSystem.saveSettings({ quality: 'ultra', muted: true, volume: 0.4, dayNight: 'night', autoTrail: false, reduceShake: false, reduceFlash: false, largeText: false, sensitivity: 1, showFps: false });
    expect(SaveSystem.loadSettings()).toEqual({ quality: 'ultra', muted: true, volume: 0.4, dayNight: 'night', autoTrail: false, reduceShake: false, reduceFlash: false, largeText: false, sensitivity: 1, showFps: false });
    store.set('gokdemir-settings-v1', JSON.stringify({ quality: 'x', dayNight: 'y' }));
    expect(SaveSystem.loadSettings('medium')).toEqual({ quality: 'medium', muted: false, volume: 0.8, dayNight: 'cycle', autoTrail: true, reduceShake: false, reduceFlash: false, largeText: false, sensitivity: 1, showFps: false });
  });
});

describe('eski kayıt göçü', () => {
  it('gölge sınıfı ve hançerli kayıt savaşçıya ve yaya çevrilerek yüklenir', async () => {
    installStorage();
    const { migrateSaveData } = await import('../src/systems/save');
    const legacy = validSave() as any;
    legacy.player.cls = 'assassin';
    legacy.player.equip.weapon = { id: 'dagger2', plus: 1, count: 1 };
    legacy.player.inv[1] = { id: 'asnleather', plus: 0, count: 1 };
    legacy.player.hotbar = [{ t: 'item', id: 'dagger2', plus: 1 }];
    const out = migrateSaveData(legacy) as any;
    expect(out.player.cls).toBe('warrior');
    expect(out.player.equip.weapon.id).toBe('sword2');
    expect(out.player.equip.weapon.plus).toBe(1);
    expect(out.player.inv[1].id).toBe('armor5');
    expect(out.player.hotbar[0].id).toBe('sword2');
  });

  it('göçten geçen eski kayıt SaveSystem.load ile doğrulanır', async () => {
    const store = installStorage();
    const legacy = validSave() as any;
    legacy.player.cls = 'mage';
    legacy.player.equip.weapon = { id: 'staff1', plus: 0, count: 1 };
    store.set('gokdemir-save-v1', JSON.stringify(legacy));
    const loaded = SaveSystem.load();
    expect(loaded?.player.cls).toBe('warrior');
    expect(loaded?.player.equip.weapon?.id).toBe('club1');
  });
});
