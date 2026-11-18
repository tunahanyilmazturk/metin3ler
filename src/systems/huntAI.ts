import { DIFFICULTY } from '../data/balance';

/**
 * Oto av / oto görev karar katmanı (utility AI). Oyundan bağımsız saf fonksiyonlardır;
 * her seçenek birkaç "değerlendirme" ile puanlanır ve en yüksek puanlı seçilir.
 * Böylece davranış test edilebilir ve ağırlıklar tek yerden ayarlanır.
 */

/** Karar için gereken asgari düşman bilgisi. */
export interface AIEnemy {
  pos: { x: number; z: number };
  alive: boolean;
  hp: number;
  maxHp: number;
  radius: number;
  state: string;
  isStone: boolean;
  def: { id: string; level: number; boss?: boolean; atk: number; attackCd: number; def: number };
}

/** Karar için gereken asgari oyuncu bilgisi. */
export interface AIPlayer {
  pos: { x: number; z: number };
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  attackRange: number;
}

export interface AISkill { id: string; type: string; level: number; mp: number; radius?: number }

export type Danger = 'safe' | 'pressured' | 'critical';

/** Temel vuruş zinciri ortalama çarpanı ve vuruş aralığı (saniye). */
const BASIC_MULT = 1.2;
const SWING_TIME = 0.6;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const isAggro = (e: AIEnemy) => e.state === 'chase' || e.state === 'attack';

/** Düşmanın oyuncuya saniyede vereceği tahmini hasar (zorluk çarpanı dahil). */
export function enemyDps(e: AIEnemy, p: AIPlayer): number {
  if (e.isStone || !e.alive) return 0;
  const hit = Math.max(1, e.def.atk * DIFFICULTY.enemyAtk - p.def * 0.5);
  return hit / Math.max(0.5, e.def.attackCd);
}

/** Oyuncunun bu düşmanı temel vuruşlarla öldürme süresi (saniye). */
export function timeToKill(e: AIEnemy, p: AIPlayer): number {
  const perHit = Math.max(1, p.atk * BASIC_MULT - e.def.def * 0.6);
  return Math.ceil(e.hp / perHit) * SWING_TIME;
}

/**
 * Saldıran düşmanların baskısı. pressured: canın birkaç saniyede bitebilir ya da can düşük;
 * critical: can çok düşük ve iksir yok ya da çok hızlı ölüm riski.
 */
export function assessDanger(p: AIPlayer, attackers: AIEnemy[], potionReady: boolean) {
  const dps = attackers.reduce((s, e) => s + enemyDps(e, p), 0);
  const secondsToDeath = dps > 0 ? p.hp / dps : Infinity;
  const hpFrac = p.hp / p.maxHp;
  let level: Danger = 'safe';
  if (dps > 0 && (secondsToDeath < 5 || hpFrac < 0.35)) level = 'pressured';
  if (dps > 0 && ((hpFrac < 0.22 && !potionReady) || secondsToDeath < 1.6)) level = 'critical';
  return { level, dps, secondsToDeath };
}

export interface TargetContext {
  enemies: AIEnemy[];
  radius: number;
  preferAggro: boolean;
}

/**
 * Hedef puanı: yakınlık, bize saldırıyor olması, yaralı olması ve çabuk ölmesi artırır;
 * tehlikesi, yanındaki sakin sürü (birlikte çekme riski), seviye farkı ve sakin patron azaltır.
 */
export function scoreTarget(e: AIEnemy, p: AIPlayer, ctx: TargetContext): number {
  const d = dist(e.pos, p.pos);
  const attacking = isAggro(e) ? 1 : 0;
  const proximity = 1 - clamp01(d / (ctx.radius * 2));
  const finish = 1 - e.hp / e.maxHp;
  const quick = 1 - clamp01(timeToKill(e, p) / 20);
  const danger = clamp01((enemyDps(e, p) * 6) / p.maxHp);
  const pack = attacking ? 0 : ctx.enemies.filter((o) =>
    o !== e && o.alive && !o.isStone && !isAggro(o) && dist(o.pos, e.pos) < 6).length;
  const levelGap = clamp01((e.def.level - p.level) / 10);
  const calmBoss = e.def.boss && !attacking ? 1 : 0;
  return 1.0 * proximity + (ctx.preferAggro ? 1.6 : 0.6) * attacking + 0.5 * finish + 0.8 * quick
    - 1.1 * danger - 0.35 * Math.min(pack, 3) - 0.6 * levelGap - 0.8 * calmBoss;
}

/** Adaylar arasından en yüksek puanlı hedef. */
export function pickTarget<T extends AIEnemy>(candidates: T[], p: AIPlayer, ctx: TargetContext): T | null {
  let best: T | null = null, bestScore = -Infinity;
  for (const e of candidates) {
    const s = scoreTarget(e, p, ctx);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
}

export interface SkillState {
  level: number;
  mp: number;
  cooldowns: number[];
  buffIds: string[];
  mask: boolean[];
}

/**
 * Beceri seçimi: alan becerisi ancak en az iki düşman (ya da patron/taş) menzildeyse,
 * vuruş becerisi hedef menzildeyse, güçlendirme baskı altında veya kalabalıkta değerlidir.
 * Kıt manada pahalı beceriler cezalandırılır. Uygun beceri yoksa -1.
 */
export function pickSkill(skills: AISkill[], s: SkillState, p: AIPlayer, target: AIEnemy, enemies: AIEnemy[], danger: Danger): number {
  let best = -1, bestScore = 0.3;
  const dTarget = dist(target.pos, p.pos);
  skills.forEach((sk, i) => {
    if (!s.mask[i] || s.level < sk.level || (s.cooldowns[i] ?? 0) > 0 || s.mp < sk.mp || sk.type === 'dash') return;
    let score = 0;
    if (sk.type === 'aoe') {
      const n = enemies.filter((e) => e.alive && !e.isStone && dist(e.pos, p.pos) <= (sk.radius ?? 0) + e.radius).length;
      if (n >= 2) score = 0.5 + 0.25 * Math.min(n, 5);
      else if ((target.def.boss || target.isStone) && dTarget <= (sk.radius ?? 0) + target.radius) score = 0.55;
    } else if (sk.type === 'strike') {
      score = dTarget <= (sk.radius ?? p.attackRange) + target.radius ? 0.7 : 0;
    } else if (sk.type === 'buff') {
      if (s.buffIds.includes(sk.id)) return;
      const crowd = enemies.filter((e) => e.alive && isAggro(e) && dist(e.pos, p.pos) < 8).length;
      score = danger !== 'safe' ? 1.2 : crowd >= 2 || target.def.boss ? 0.9 : 0.35;
    } else {
      score = dTarget <= 24 ? 0.6 : 0;
    }
    score -= (sk.mp / Math.max(1, s.mp)) * 0.3;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/**
 * Geri çekilme noktası: saldıranların ağırlık merkezinden uzağa, av alanının içinde kalacak şekilde.
 * Alanın kenarına yakınsa merkeze doğru kaçar.
 */
export function retreatPoint(p: AIPlayer, attackers: AIEnemy[], center: { x: number; z: number }, radius: number) {
  let cx = 0, cz = 0;
  for (const e of attackers) { cx += e.pos.x; cz += e.pos.z; }
  if (attackers.length) { cx /= attackers.length; cz /= attackers.length; } else { cx = p.pos.x; cz = p.pos.z; }
  let dx = p.pos.x - cx, dz = p.pos.z - cz;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) { dx = center.x - p.pos.x; dz = center.z - p.pos.z; } else { dx /= len; dz /= len; }
  const l2 = Math.hypot(dx, dz) || 1;
  let x = p.pos.x + (dx / l2) * 8, z = p.pos.z + (dz / l2) * 8;
  const fromCenter = Math.hypot(x - center.x, z - center.z);
  const limit = radius * 0.9;
  if (fromCenter > limit) {
    x = center.x + ((x - center.x) / fromCenter) * limit;
    z = center.z + ((z - center.z) / fromCenter) * limit;
  }
  return { x, z };
}
