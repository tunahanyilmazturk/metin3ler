import type { EnemyDef } from './enemies';

/**
 * Düşman dengesi için referans model. Oyuncu formüllerini (entities/player.ts, systems/combat.ts)
 * yansıtır; ekipman etkisi yoktur, yani "ortalama, ekipmansız savaşçı" varsayılır.
 * Amaç, her düşmanın kendi seviyesinde kaç vuruşla öldüğünü ve kaç vuruşta oyuncuyu
 * bitirdiğini hesaplamaktır. Hedefler `BALANCE_TARGETS` içinde, bant dışına çıkan düşmanlar
 * `balanceIssues` ile raporlanır.
 */

/**
 * Zorluk ayarı: düşmanların can ve saldırı çarpanları. Oyun ve denge testleri aynı değerleri
 * kullanır; zorluğu buradan değiştirmek yeterlidir.
 */
export const DIFFICULTY = { enemyHp: 1.4, enemyAtk: 1.3 };

/** Temel vuruş ortalama çarpanı: (1 + 1.1 + 1.5) / 3. */
const BASIC_MULT = (1 + 1.1 + 1.5) / 3;

export interface RefPlayer { atk: number; def: number; hp: number }

/** Seviyeye göre referans savaşçı: tüm nitelik puanları güce gider (vit sabit 7). */
export function refPlayer(level: number): RefPlayer {
  const str = 8 + 3 * (level - 1);
  return {
    atk: Math.round(str * 2.2 + level * 1.5),
    def: Math.round(7 * 0.7 + level * 0.5),
    hp: Math.round(260 + 7 * 20 + (level - 1) * 16),
  };
}

/** Bir düşmanı öldürmek için gereken temel vuruş sayısı. */
/** Zorluk çarpanı uygulanmış can ve saldırı. */
export const effHp = (e: EnemyDef) => Math.round(e.hp * DIFFICULTY.enemyHp);
export const effAtk = (e: EnemyDef) => Math.round(e.atk * DIFFICULTY.enemyAtk);

export function hitsToKill(e: EnemyDef): number {
  const p = refPlayer(e.level);
  return Math.ceil(effHp(e) / Math.max(1, p.atk * BASIC_MULT - e.def * 0.6));
}

/** Bu düşmanın saldırılarıyla oyuncunun ölmesi için gereken vuruş sayısı. */
export function hitsToSurvive(e: EnemyDef): number {
  const p = refPlayer(e.level);
  return Math.ceil(p.hp / Math.max(1, effAtk(e) - p.def * 0.5));
}

/** Tür bazlı hedef bantları (vuruş sayısı, dahil). */
export const BALANCE_TARGETS = {
  normal: { hitsToKill: [3, 8] as const, hitsToSurvive: [5, 40] as const },
  boss: { hitsToKill: [10, 80] as const, hitsToSurvive: [3, 16] as const },
  stone: { hitsToKill: [5, 80] as const },
};

export function enemyKind(e: EnemyDef): 'normal' | 'boss' | 'stone' {
  if (e.stone) return 'stone';
  return e.boss ? 'boss' : 'normal';
}

/** Hedef dışı kalan her düşman için açıklamalı bir satır. */
export function balanceIssues(enemies: EnemyDef[]): string[] {
  const out: string[] = [];
  for (const e of enemies) {
    const kind = enemyKind(e);
    const t = BALANCE_TARGETS[kind];
    const k = hitsToKill(e);
    if (k < t.hitsToKill[0] || k > t.hitsToKill[1]) out.push(`${e.id} (${kind}, Sv.${e.level}): ${k} vuruşla ölüyor, hedef ${t.hitsToKill.join('–')}`);
    if (kind !== 'stone') {
      const s = hitsToSurvive(e);
      const ts = (t as typeof BALANCE_TARGETS.normal).hitsToSurvive;
      if (s < ts[0] || s > ts[1]) out.push(`${e.id} (${kind}, Sv.${e.level}): oyuncu ${s} vuruşta ölüyor, hedef ${ts.join('–')}`);
    }
  }
  return out;
}

/** Hedef bandının orta noktası; ayarlama bu değere çekilir. */
const mid = (r: readonly [number, number]) => Math.round((r[0] + r[1]) / 2);

/** Bant dışı bir düşman için önerilen can ve saldırı (diğer değerler korunur). */
export function suggest(e: EnemyDef): { hp?: number; atk?: number } {
  const p = refPlayer(e.level);
  const kind = enemyKind(e);
  const t = BALANCE_TARGETS[kind];
  const out: { hp?: number; atk?: number } = {};
  const k = hitsToKill(e);
  if (k < t.hitsToKill[0] || k > t.hitsToKill[1]) {
    out.hp = Math.round((p.atk * BASIC_MULT - e.def * 0.6) * mid(t.hitsToKill) / DIFFICULTY.enemyHp);
  }
  if (kind !== 'stone') {
    const ts = (t as typeof BALANCE_TARGETS.normal).hitsToSurvive;
    const s = hitsToSurvive(e);
    if (s < ts[0] || s > ts[1]) out.atk = Math.round((p.hp / mid(ts) + p.def * 0.5) / DIFFICULTY.enemyAtk);
  }
  return out;
}
