import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { Player } from '../src/entities/player';
import { ITEMS } from '../src/data/items';
import { CLASSES } from '../src/data/classes';

/**
 * Oyuncuyu gerçek oyun dünyası olmadan kurar. Ses, efekt ve parçacık çağrıları
 * no-op olarak taklit edilir; olaylar gerçek EventBus üzerinden toplanır.
 */
function makeGame() {
  const events = new EventBus();
  const logs: string[] = [];
  events.on('log', (p: { msg: string }) => logs.push(p.msg));
  const noop = () => undefined;
  const stub = () => new Proxy({}, { get: () => noop });
  const game: any = {
    events,
    logs,
    time: 0,
    terrain: { getHeight: () => 0, walkable: () => true, getDirt: () => 0 },
    colliders: { resolve: noop },
    scene: { add: noop, remove: noop },
    audio: stub(),
    effects: stub(),
    particles: stub(),
    camera: { setView: noop, snap: noop, addShake: noop },
    combat: { nearestEnemy: () => null },
    tex: {},
    input: {},
  };
  return game;
}

describe('oyuncu', () => {
  it('yeni savaşçı başlangıç ekipmanı ve maksimum canıyla kurulur', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    // baseHp 260 + vit 7 × 20 + başlangıç zırhının can bonusu
    expect(p.maxHp).toBe(260 + 7 * 20 + (ITEMS.armor1.hp ?? 0));
    expect(p.hp).toBe(p.maxHp);
    expect(p.equip.weapon?.id).toBe('sword1');
    expect(p.equip.armor?.id).toBe('armor1');
    expect(p.level).toBe(1);
  });

  it('aynı yığın eşya tek gözde birleşir', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    const before = p.countItem('hp1');
    p.addItem('hp1', 4);
    expect(p.countItem('hp1')).toBe(before + 4);
  });


  it('iksir kullanılınca can yenilenir ve envanterden bir adet düşer', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.hp = 50;
    const before = p.countItem('hp1');
    p.usePotion('hp');
    expect(p.hp).toBeGreaterThan(50);
    expect(p.countItem('hp1')).toBe(before - 1);
  });

  it('tecrübe eşiği aşılınca seviye atlar ve nitelik puanı kazanır', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.gainExp(p.expNeed);
    expect(p.level).toBe(2);
    expect(p.statPoints).toBe(3);
  });

  it('hasar can düşürür; can sıfırlanınca ölür', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.takeDamage(10);
    expect(p.hp).toBeLessThan(p.maxHp);
    p.takeDamage(1_000_000);
    expect(p.alive).toBe(false);
    expect(p.hp).toBe(0);
  });

  it('ölüm sonrası dirilince tam can ile başlangıç noktasında kalkar', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.takeDamage(1_000_000);
    p.respawn();
    expect(p.alive).toBe(true);
    expect(p.hp).toBe(p.maxHp);
  });

  it('kayıt serileştirmesi ile yeniden kurulan oyuncu aynı kalır', () => {
    const game = makeGame();
    const p = new Player(game, 'Test', 'warrior');
    p.gainExp(p.expNeed);
    const copy = new Player(makeGame(), 'Test', 'warrior', p.serialize());
    expect(copy.level).toBe(p.level);
    expect(copy.statPoints).toBe(p.statPoints);
    expect(copy.countItem('hp1')).toBe(p.countItem('hp1'));
    expect(copy.equip.weapon?.id).toBe(p.equip.weapon?.id);
  });

  it('tek el kılıç kalkanla birlikte kuşanılabilir', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.addItem('shield1', 1);
    const sh = p.inv.findIndex((c) => c && 'id' in c && c.id === 'shield1');
    expect(p.moveItem({ inv: sh }, { equip: 'shield' })).toBe(true);
    expect(p.equip.weapon?.id).toBe('sword1');
    expect(p.equip.shield?.id).toBe('shield1');
  });
  it('çift el silah kalkanla birlikte kuşanılamaz', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.addItem('shield1', 1);
    expect(p.moveItem({ inv: p.inv.findIndex((c) => c && 'id' in c && c.id === 'shield1') }, { equip: 'shield' })).toBe(true);
    p.addItem('spear1', 1);
    const spear = p.inv.findIndex((c) => c && 'id' in c && c.id === 'spear1');
    expect(p.moveItem({ inv: spear }, { equip: 'weapon' })).toBe(false);
    expect(p.equip.weapon?.id).toBe('sword1');
  });

  it('kalkan çıkarılınca çift el silah kuşanılabilir', () => {
    const p = new Player(makeGame(), 'Test', 'warrior');
    p.addItem('shield1', 1);
    p.moveItem({ inv: p.inv.findIndex((c) => c && 'id' in c && c.id === 'shield1') }, { equip: 'shield' });
    p.unequip('shield');
    p.addItem('spear1', 1);
    expect(p.moveItem({ inv: p.inv.findIndex((c) => c && 'id' in c && c.id === 'spear1') }, { equip: 'weapon' })).toBe(true);
    expect(p.equip.weapon?.id).toBe('spear1');
  });
});
