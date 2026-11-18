import { describe, expect, it } from 'vitest';
import { CLASSES, expForLevel, MAX_LEVEL } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { EXCHANGES, ITEMS, SHOPS } from '../src/data/items';
import { QUESTS } from '../src/data/quests';
import { SKILLS } from '../src/data/skills';
import { NPCS, SPAWN_ZONES, STONE_ZONES } from '../src/data/world';

/** Oyun verisinin iç tutarlılığı: kırık bir id ya da yanlış oran oyuncuya hiç görünmeden hataya yol açar. */
describe('oyun verisi tutarlılığı', () => {
  it('her sınıfın tüm yetenekleri tanımlı', () => {
    for (const cls of Object.values(CLASSES)) {
      for (const id of cls.skills) expect(SKILLS[id], `${cls.id} → ${id}`).toBeDefined();
    }
  });

  it('düşman ganimet id’leri ve oranları geçerli', () => {
    for (const enemy of Object.values(ENEMIES)) {
      for (const drop of enemy.drops) {
        expect(ITEMS[drop.id], `${enemy.id} → ${drop.id}`).toBeDefined();
        expect(drop.chance).toBeGreaterThan(0);
        expect(drop.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('bölge ve taş doğma noktaları tanımlı düşmanları kullanıyor', () => {
    for (const z of [...SPAWN_ZONES, ...STONE_ZONES]) {
      expect(ENEMIES[z.enemy], `zone → ${z.enemy}`).toBeDefined();
      expect(z.count).toBeGreaterThan(0);
    }
    for (const enemy of Object.values(ENEMIES)) {
      for (const id of enemy.stone?.wave ?? []) expect(ENEMIES[id], `stone wave → ${id}`).toBeDefined();
    }
  });

  it('dükkân stokları ve takas listesi geçerli eşyalara işaret ediyor', () => {
    for (const [shop, ids] of Object.entries(SHOPS)) {
      for (const id of ids) expect(ITEMS[id], `${shop} → ${id}`).toBeDefined();
    }
    for (const ex of EXCHANGES) {
      expect(ITEMS[ex.give.id]).toBeDefined();
      expect(ITEMS[ex.get.id]).toBeDefined();
    }
  });

  it('görev hedefleri ve ödülleri mevcut kayıtlara işaret ediyor', () => {
    const npcIds = new Set(NPCS.map((n) => n.id));
    for (const q of QUESTS) {
      if (q.kind === 'kill') expect(ENEMIES[q.target!], `${q.id} → ${q.target}`).toBeDefined();
      if (q.kind === 'collect') expect(ITEMS[q.target!], `${q.id} → ${q.target}`).toBeDefined();
      if (q.kind === 'talk') expect(npcIds.has(q.target!), `${q.id} → ${q.target}`).toBe(true);
      for (const it of q.items ?? []) expect(ITEMS[it.id], `${q.id} ödül → ${it.id}`).toBeDefined();
      expect(q.count).toBeGreaterThan(0);
    }
  });

  it('görev kimlikleri benzersiz', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('deneyim eğrisi', () => {
  it('seviye ilerledikçe gereken tecrübe artıyor', () => {
    for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
      expect(expForLevel(lvl + 1)).toBeGreaterThan(expForLevel(lvl));
    }
  });
});

describe('silah tanımları', () => {
  const weapons = Object.values(ITEMS).filter((d) => d.type === 'weapon');
  const families = ['sword', 'axe', 'club', 'mace', 'gsword', 'gaxe', 'spear'];

  it('her silah ailesi beş kademe tanımlı', () => {
    for (const key of families) {
      for (let i = 1; i <= 5; i++) expect(ITEMS[`${key}${i}`], `${key}${i}`).toBeDefined();
    }
  });

  it('çift el silahlar iki el; tek el silahlar bir el olarak işaretli', () => {
    for (const w of weapons) {
      if (w.id.startsWith('gsword') || w.id.startsWith('gaxe') || w.id.startsWith('spear')) expect(w.hands, w.id).toBe(2);
      else expect(w.hands, w.id).toBe(1);
    }
  });

  it('yay, asa ve hançer kalmadı', () => {
    expect(weapons.some((w) => /^(bow|staff|dagger)/.test(w.id))).toBe(false);
    expect(weapons.some((w) => w.ranged !== undefined)).toBe(false);
  });

  it('silahçı stoğundaki tüm silahlar mevcut', () => {
    for (const id of SHOPS.weaponsmith) expect(ITEMS[id], id).toBeDefined();
  });

});

describe('köy NPC\u0027leri', () => {
  it('her NPC en az üç replik taşır', async () => {
    const { NPC_LINES } = await import('../src/data/npcLines');
    const { NPCS } = await import('../src/data/world');
    for (const n of NPCS) {
      expect(NPC_LINES[n.id]?.length ?? 0, n.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('her NPC için bir model görünümü tanımlı', async () => {
    const { NPC_LOOKS } = await import('../src/entities/creatures');
    const { NPCS } = await import('../src/data/world');
    for (const n of NPCS) expect(NPC_LOOKS[n.id], n.id).toBeDefined();
  });
});
