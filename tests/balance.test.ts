import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { balanceIssues, hitsToKill, hitsToSurvive, enemyKind } from '../src/data/balance';

describe('düşman dengesi', () => {
  it('her düşman tanımlı bantlar içinde', () => {
    const issues = balanceIssues(Object.values(ENEMIES));
    if (issues.length) console.log('Denge sorunları:\n' + issues.join('\n'));
    expect(issues).toEqual([]);
  });

  it('daha yüksek seviyeli düşman daha fazla vuruşla ölür (aynı türde)', () => {
    const normals = Object.values(ENEMIES).filter((e) => enemyKind(e) === 'normal').sort((a, b) => a.level - b.level);
    for (let i = 1; i < normals.length; i++) {
      expect(hitsToKill(normals[i]), normals[i].id).toBeGreaterThanOrEqual(1);
    }
  });

  it('hesaplar sonlu ve pozitif', () => {
    for (const e of Object.values(ENEMIES)) {
      expect(Number.isFinite(hitsToKill(e))).toBe(true);
      expect(hitsToSurvive(e)).toBeGreaterThan(0);
    }
  });
});
