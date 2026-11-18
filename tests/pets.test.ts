import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { PETS } from '../src/data/pets';
import { Player } from '../src/entities/player';

/** Oyuncuyu gerçek dünya olmadan kurar; ses, efekt ve parçacıklar no-op. */
function makeGame() {
  const events = new EventBus();
  const logs: string[] = [];
  events.on('log', (p: { msg: string }) => logs.push(p.msg));
  const noop = () => undefined;
  const stub = () => new Proxy({}, { get: () => noop });
  const game: any = {
    events, logs, time: 0, enemies: [],
    terrain: { getHeight: () => 0, walkable: () => true, getDirt: () => 0 },
    colliders: { resolve: noop },
    scene: { add: noop, remove: noop },
    audio: stub(), effects: stub(), particles: stub(),
    camera: { setView: noop, snap: noop, addShake: noop },
    combat: { nearestEnemy: () => null, hitEnemy: noop },
    loot: { drops: [], takeDrop: noop },
    tex: {}, input: {},
  };
  return game;
}

const rich = (lvl = 30) => {
  const p = new Player(makeGame(), 'Test', 'warrior');
  p.level = lvl;
  p.gold = 1_000_000;
  p.recalc();
  return p;
};

describe('evcil hayvan sistemi', () => {
  it('satın alınan pet boş slota kuşanılır ve akçe düşer', () => {
    const p = rich();
    expect(p.pets.buy('tilki')).toBe(true);
    expect(p.gold).toBe(1_000_000 - PETS.tilki.cost);
    expect(p.pets.active[0]).toBe('tilki');
  });

  it('seviyesi yetmeyen pet satın alınamaz', () => {
    const p = rich(1);
    expect(p.pets.buy('ejder')).toBe(false);
    expect(p.pets.owns('ejder')).toBe(false);
  });

  it('aynı anda en fazla iki pet kuşanılır', () => {
    const p = rich();
    p.pets.buy('tilki');
    p.pets.buy('kurt');
    p.pets.buy('baykus');
    expect(p.pets.active).toEqual(['tilki', 'kurt']);
    expect(p.pets.isActive('baykus')).toBe(false);
    expect(p.pets.equip('baykus')).toBe(false);
    p.pets.unequip('kurt');
    expect(p.pets.equip('baykus')).toBe(true);
    expect(p.pets.active).toEqual(['tilki', 'baykus']);
  });

  it('destek petinin pasif bonusu oyuncuya uygulanır, çıkarınca kalkar', () => {
    const p = rich();
    const crit = p.crit;
    p.pets.buy('tilki');
    expect(p.crit).toBeCloseTo(crit + 3);
    p.pets.unequip('tilki');
    expect(p.crit).toBeCloseTo(crit);
  });

  it('kaplumbağa can ve savunma verir', () => {
    const p = rich();
    const hp = p.maxHp, def = p.def;
    p.pets.buy('kaplumbaga');
    expect(p.maxHp).toBe(hp + 150);
    expect(p.def).toBeGreaterThan(def);
  });

  it('saldırı petinin çantası yoktur, destek petinin vardır', () => {
    const p = rich();
    p.pets.buy('kurt');
    p.pets.buy('tilki');
    expect(p.pets.get('kurt')!.bag.length).toBe(0);
    expect(p.pets.get('tilki')!.bag.length).toBe(PETS.tilki.bag);
  });

  it('pet çantasındaki eşya oyuncu envanterine taşınır', () => {
    const p = rich();
    p.pets.buy('tilki');
    const bag = p.pets.get('tilki')!;
    expect(p.pets.stash(bag, { id: 'pelt', plus: 0, count: 2 })).toBe(true);
    expect(p.pets.stash(bag, { id: 'pelt', plus: 0, count: 3 })).toBe(true);
    expect(bag.bag.filter(Boolean).length).toBe(1);
    const before = p.countItem('pelt');
    expect(p.pets.takeAll('tilki')).toBe(1);
    expect(p.countItem('pelt')).toBe(before + 5);
    expect(bag.bag.every((s) => s === null)).toBe(true);
  });

  it('dolu çanta yeni eşya kabul etmez', () => {
    const p = rich();
    p.pets.buy('tilki');
    const bag = p.pets.get('tilki')!;
    for (let i = 0; i < bag.bag.length; i++) p.pets.stash(bag, { id: 'sword1', plus: 0, count: 1 });
    expect(p.pets.canStash(bag, { id: 'sword1', plus: 0, count: 1 })).toBe(false);
  });

  it('kayıt sahip olunan petleri, çantaları ve slotları korur', () => {
    const p = rich();
    p.pets.buy('tilki');
    p.pets.buy('kurt');
    p.pets.stash(p.pets.get('tilki')!, { id: 'hp1', plus: 0, count: 4 });
    const copy = new Player(makeGame(), 'Test', 'warrior', p.serialize());
    expect(copy.pets.owned.map((o) => o.id)).toEqual(['tilki', 'kurt']);
    expect(copy.pets.active).toEqual(['tilki', 'kurt']);
    expect(copy.pets.get('tilki')!.bag[0]).toEqual({ id: 'hp1', plus: 0, count: 4 });
  });
});
