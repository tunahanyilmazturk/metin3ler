import { describe, expect, it } from 'vitest';
import { angleDiff, clamp, damp, dampAngle, makeRng } from '../src/core/utils';
import { EventBus } from '../src/core/events';
import { plusMult, upgradeCost, ITEMS, itemLabel, isEquip, MAX_PLUS, UPGRADE_CHANCE } from '../src/data/items';

describe('yardımcı matematik', () => {
  it('clamp sınırlar içinde tutar', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('angleDiff en kısa yönü verir', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(Math.PI * 1.9, 0)).toBeCloseTo(Math.PI * 0.1);
    expect(Math.abs(angleDiff(-Math.PI + 0.1, Math.PI - 0.1))).toBeCloseTo(0.2);
  });

  it('dampAngle hedefe yaklaşır ama aşmaz', () => {
    const v = dampAngle(0, 1, 10, 0.05);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('damp dt=0 iken değişmez', () => {
    expect(damp(3, 10, 5, 0)).toBe(3);
  });

  it('makeRng aynı tohumla aynı diziyi üretir', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('eşya güçlendirme', () => {
  it('artı başına çarpan doğrusal artar', () => {
    expect(plusMult(0)).toBe(1);
    expect(plusMult(5)).toBeCloseTo(1.55);
  });

  it('yükseltme şansı her kademede düşer ve tanımlı kademe sayısıyla eşleşir', () => {
    expect(UPGRADE_CHANCE).toHaveLength(MAX_PLUS);
    for (let i = 1; i < UPGRADE_CHANCE.length; i++) {
      expect(UPGRADE_CHANCE[i]).toBeLessThan(UPGRADE_CHANCE[i - 1]);
    }
  });

  it('yükseltme maliyeti en az 80 akçe', () => {
    const cheap = Object.values(ITEMS).filter(isEquip).sort((a, b) => a.price - b.price)[0];
    expect(upgradeCost(cheap, 0)).toBeGreaterThanOrEqual(80);
  });

  it('artı değeri olan eşyanın adı “+N” ile biter', () => {
    const d = Object.values(ITEMS).find((x) => isEquip(x))!;
    expect(itemLabel({ id: d.id, plus: 0, count: 1 })).toBe(d.name);
    expect(itemLabel({ id: d.id, plus: 3, count: 1 })).toBe(`${d.name} +3`);
  });
});

describe('olay yolu', () => {
  it('abone olunan olay yayınlandığında payload ile çağrılır', () => {
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.on('log', (p) => seen.push(p));
    bus.emit('log', { msg: 'merhaba' });
    bus.emit('diğer');
    expect(seen).toEqual([{ msg: 'merhaba' }]);
  });
});

describe('ekran sarsıntısı', () => {
  it('trauma sıfırken sarsıntı yok, ölçek sıfırken de yok', async () => {
    const { shakeOffset } = await import('../src/render/cameraRig');
    expect(shakeOffset(0, 1.3, 1).length()).toBe(0);
    expect(shakeOffset(1, 1.3, 0).length()).toBe(0);
  });

  it('büyük trauma küçükten daha sert, ama sınırlı', async () => {
    const { shakeOffset } = await import('../src/render/cameraRig');
    const small = shakeOffset(0.3, 2, 1).length();
    const big = shakeOffset(1, 2, 1).length();
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(0.9 * Math.SQRT2 + 1e-9);
  });
});
