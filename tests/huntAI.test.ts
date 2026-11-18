import { describe, expect, it } from 'vitest';
import { AIEnemy, AIPlayer, AISkill, assessDanger, pickSkill, pickTarget, retreatPoint } from '../src/systems/huntAI';

const player = (o: Partial<AIPlayer> = {}): AIPlayer => ({
  pos: { x: 0, z: 0 }, hp: 1000, maxHp: 1000, atk: 60, def: 20, level: 10, attackRange: 2.2, ...o,
});

let n = 0;
const enemy = (o: Partial<AIEnemy> & { x?: number; z?: number; level?: number; atk?: number; boss?: boolean } = {}): AIEnemy => ({
  pos: { x: o.x ?? 5, z: o.z ?? 0 }, alive: true, hp: o.hp ?? 200, maxHp: o.maxHp ?? 200, radius: 0.6,
  state: o.state ?? 'idle', isStone: o.isStone ?? false,
  def: { id: `e${n++}`, level: o.level ?? 10, boss: o.boss, atk: o.atk ?? 30, attackCd: 1.5, def: 5 },
});

const ctx = (enemies: AIEnemy[]) => ({ enemies, radius: 20, preferAggro: true });

describe('oto av yapay zekası: hedef seçimi', () => {
  it('bize saldıran düşmanı biraz daha yakın sakin düşmana tercih eder', () => {
    const calm = enemy({ x: 3 });
    const attacker = enemy({ x: 6, state: 'attack' });
    expect(pickTarget([calm, attacker], player(), ctx([calm, attacker]))).toBe(attacker);
  });

  it('yaralı düşmanı bitirmeyi tercih eder', () => {
    const full = enemy({ x: 4 });
    const hurt = enemy({ x: 4.5, hp: 30 });
    expect(pickTarget([full, hurt], player(), ctx([full, hurt]))).toBe(hurt);
  });

  it('sürünün ortasındakini değil yalnız düşmanı seçer', () => {
    const lone = enemy({ x: 0, z: 8 });
    const packLead = enemy({ x: 7 });
    const pack = [packLead, enemy({ x: 8 }), enemy({ x: 8, z: 1 }), enemy({ x: 7, z: -1 })];
    expect(pickTarget([lone, packLead], player(), ctx([lone, ...pack]))).toBe(lone);
  });

  it('sakin patronu ve çok yüksek seviyeli düşmanı sona bırakır', () => {
    const normal = enemy({ x: 9 });
    const boss = enemy({ x: 3, boss: true, level: 22, hp: 4000, maxHp: 4000 });
    expect(pickTarget([boss, normal], player(), ctx([boss, normal]))).toBe(normal);
  });
});

describe('oto av yapay zekası: tehlike', () => {
  it('saldıran yoksa güvende', () => {
    expect(assessDanger(player({ hp: 100 }), [], false).level).toBe('safe');
  });

  it('düşük can ve iksir yokken kritik', () => {
    const a = [enemy({ state: 'attack' })];
    expect(assessDanger(player({ hp: 150 }), a, false).level).toBe('critical');
    expect(assessDanger(player({ hp: 150 }), a, true).level).toBe('pressured');
  });

  it('kalabalık hızla öldürecekse kritik', () => {
    const a = Array.from({ length: 6 }, () => enemy({ state: 'attack', atk: 120 }));
    const d = assessDanger(player({ hp: 600 }), a, true);
    expect(d.secondsToDeath).toBeLessThan(1.6);
    expect(d.level).toBe('critical');
  });
});

describe('oto av yapay zekası: beceri seçimi', () => {
  const skills: AISkill[] = [
    { id: 'strike', type: 'strike', level: 1, mp: 10, radius: 2.5 },
    { id: 'spin', type: 'aoe', level: 1, mp: 20, radius: 4 },
    { id: 'dash', type: 'dash', level: 1, mp: 5 },
    { id: 'rage', type: 'buff', level: 1, mp: 15 },
  ];
  const state = (o: Partial<{ mp: number; buffIds: string[]; cooldowns: number[] }> = {}) => ({
    level: 10, mp: o.mp ?? 200, cooldowns: o.cooldowns ?? [0, 0, 0, 0], buffIds: o.buffIds ?? ['rage'], mask: [true, true, true, true],
  });

  it('tek hedefte vuruş becerisi, kalabalıkta alan becerisi', () => {
    const t = enemy({ x: 1.5 });
    expect(pickSkill(skills, state(), player(), t, [t], 'safe')).toBe(0);
    const crowd = [t, enemy({ x: 2 }), enemy({ x: -2 })];
    expect(pickSkill(skills, state(), player(), t, crowd, 'safe')).toBe(1);
  });

  it('baskı altında güçlendirme önce gelir', () => {
    const t = enemy({ x: 1.5, state: 'attack' });
    expect(pickSkill(skills, state({ buffIds: [] }), player(), t, [t], 'pressured')).toBe(3);
  });

  it('atılma hiç seçilmez; mana ya da bekleme yoksa -1', () => {
    const t = enemy({ x: 1.5 });
    expect(pickSkill(skills, state({ mp: 4 }), player(), t, [t], 'safe')).toBe(-1);
    expect(pickSkill(skills, state({ cooldowns: [3, 3, 0, 3] }), player(), t, [t], 'safe')).toBe(-1);
  });
});

describe('oto av yapay zekası: geri çekilme', () => {
  it('saldıranların tersine kaçar ve av alanında kalır', () => {
    const p = player({ pos: { x: 2, z: 0 } });
    const pt = retreatPoint(p, [enemy({ x: 4 }), enemy({ x: 4, z: 1 })], { x: 0, z: 0 }, 20);
    expect(pt.x).toBeLessThan(p.pos.x);
    expect(Math.hypot(pt.x, pt.z)).toBeLessThanOrEqual(18 + 1e-6);
  });

  it('alan kenarında sınırın içine kırpılır', () => {
    const p = player({ pos: { x: 17, z: 0 } });
    const pt = retreatPoint(p, [enemy({ x: 14 })], { x: 0, z: 0 }, 20);
    expect(Math.hypot(pt.x, pt.z)).toBeCloseTo(18, 5);
  });
});
