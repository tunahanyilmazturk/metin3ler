import type { QuestNavigator } from './questNavigator';
import { LIM, MARK_COUNT, MARK_SPACING } from './questNavTypes';
import type { Objective } from './questNavTypes';
import { ENEMIES } from '../data/enemies';
import type { QuestDef } from '../data/quests';
import { SPAWN_ZONES, STONE_ZONES } from '../data/world';
import type { SpawnZone } from '../data/world';
import type { Enemy } from '../entities/enemy';
import * as THREE from 'three';
import { RoutePoint, findQuestPath } from './questPath';
import { questHandler } from './questHandlers';
import { tickMarks } from './questNavMarks';

/** Görev durumu değiştiğinde oto fazını sıfırla; zincir devam eder. */
export function autoPhaseReset(nav: QuestNavigator) {
  nav.endHunt();
  nav.huntKey = '';
  nav.noTargetT = 0;
  nav.retryT = 0;
  nav.retryObjectiveT = 0;
  nav.objective = null;
  nav.goal = null;
  nav.remaining = [];
  nav.plan = null;
  nav.stallT = 0;
  nav.stallCount = 0;
}

/** Av merkezinde izinli (filtre/öz-savunma) canlı hedef var mı? */
export function huntTargetExists(nav: QuestNavigator, ids: ReadonlySet<string> | null, stones: boolean) {
  const g = nav.game, h = g.autoHunt;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - h.center.x, e.pos.z - h.center.z) > h.settings.radius) continue;
    if (ids === null || ids.has(e.def.id) || (e.isStone && stones) || e.state === 'chase' || e.state === 'attack') return true;
  }
  return false;
}

/**
 * Oto kip durum makinesi: kabul → hazırlık → hedefe git → savaş/topla →
 * Aksakal'a dön → teslim → sonraki görev. Tür mantığı QUEST_HANDLERS'dadır
 * (questHandlers.ts); burada yalnızca zincir + sağkalım akışı yürür.
 * Seyahat fazlarında rota noktası, av/bekleme fazlarında null döner.
 */
export function updateAuto(nav: QuestNavigator, dt: number): RoutePoint | null {
  const g = nav.game, qs = g.quests, p = g.player;
  nav.retryT = Math.max(0, nav.retryT - dt);
  nav.retryObjectiveT = Math.max(0, nav.retryObjectiveT - dt);

  // Ölünce devam: 3 sn sonra diril, fazı sıfırla, zinciri kaldığı yerden sürdür.
  if (!p.alive) {
    nav.endHunt();
    if (nav.deadT < 0) nav.deadT = 3;
    nav.deadT -= dt;
    nav.setStatus(`Yenildin — diriliyor (${Math.max(0, Math.ceil(nav.deadT))} sn)`);
    if (nav.deadT <= 0) {
      p.respawn();
      autoPhaseReset(nav);
      nav.deadT = -1;
      nav.deathCount++;
      if (nav.deathCount > 3) {
        g.events.emit('log', { msg: 'Oto görev durduruldu: üst üste ölümler.', cls: 'warn' });
        nav.stop();
        return null;
      }
      nav.setStatus('Dirildi — görev sürdürülüyor');
    }
    return null;
  }
  nav.deadT = -1;

  const q = qs.current;
  if (!q) {
    g.events.emit('log', { msg: 'Oto görev bitti: bekleyen görev kalmadı.', cls: 'gold' });
    nav.stop();
    return null;
  }

  // Hayatta kalma: can %30'un altında ve can iksiri yoksa geri çekil;
  // can %60'ı geçene ya da iksir bulunana dek sürer.
  const hpRatio = p.hp / p.maxHp;
  if (!nav.retreating && hpRatio < 0.3 && p.potionCount('hp') === 0) {
    nav.retreating = true;
    nav.endHunt();
    nav.remaining = [];
    nav.plan = null;
    nav.goal = null;
    if (nav.marks) nav.marks.visible = false;
  } else if (nav.retreating && (hpRatio > 0.6 || p.potionCount('hp') > 0)) {
    nav.retreating = false;
    autoPhaseReset(nav);
  }
  if (nav.retreating) return retreat(nav);

  const obj = nav.retryObjectiveT > 0 ? null : nav.resolveObjective(true);
  if (!obj) {
    // Atlanan hedeflerden başkası kalmadı: çökme — 5 sn'de bir yeniden dene.
    if (nav.retryObjectiveT <= 0) nav.retryObjectiveT = 5;
    nav.setStatus('Uygun hedef bekleniyor');
    return null;
  }

  if (!qs.accepted) {
    return autoArrive(nav, obj, 3, 'Yeni görev alınıyor', dt, () => qs.accept());
  }
  if (qs.complete) {
    return autoArrive(nav, obj, 3, "Aksakal'a dönülüyor", dt, () => {
      if (nav.retryT > 0) return;
      nav.setStatus('Görev teslim ediliyor');
      qs.turnIn();
      // Teslim reddedildiyse (envanter dolu) günlük spamını önlemek için bekle.
      if (qs.complete) nav.retryT = 5;
    });
  }

  // Tür stratejisi: kayıtlı değilse questHandler güvenli geri dönüş verir.
  const handler = questHandler(q.kind);
  if (handler.onArrive) {
    const h = handler;
    return autoArrive(nav, obj, h.arriveDist ?? 3, 'Görev hedefine gidiliyor', dt, () => {
      if (h.onArrive!({ g, q, obj }) === 'pause') nav.stop();
    });
  }

  // Preparasyon: hedef seviyesi çok üstteyse önce uygun bölgede seviye kas.
  const need = combatNeed(nav, q);
  if (need !== null && need > p.level + 3) {
    const zone = grindZone(nav, p.level, (z) => keySkipped(nav, `prep:${z.x},${z.z}`));
    if (zone) {
      const prep: Objective = { x: zone.x, z: zone.z, stop: 8, label: 'Seviye bölgesi', key: `prep:${zone.x},${zone.z}` };
      return autoCombat(nav, dt, prep, { ids: null, stones: false, collect: false },
        `Hazırlık: seviye kasılıyor (Sv.${p.level}→${need - 3})`);
    }
  }

  // Boss hazırlığı: can %80'in altındayken boss'un dibinde bekleyip doldur;
  // hasar alınırsa oto av öz-savunması devralır.
  if (obj.enemy?.def.boss && hpRatio < 0.8 && g.time - nav.hurtAt > 5 &&
      Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z) <= 30) {
    nav.endHunt();
    nav.remaining = [];
    nav.plan = null;
    nav.goal = null;
    if (nav.marks) nav.marks.visible = false;
    nav.setStatus('Boss için can yenileniyor');
    return null;
  }

  // Envanter dolu koruması: görev eşyası sığmıyorsa toplamayı duraklat.
  if (q.kind === 'collect' && q.target && !p.canAddItem(q.target)) {
    nav.endHunt();
    if (g.time >= nav.fullWarnAt) {
      nav.fullWarnAt = g.time + 15;
      g.events.emit('log', { msg: 'Envanter dolu — görev eşyası için yer aç.', cls: 'warn' });
    }
    nav.setStatus('Envanter dolu — yer aç');
    return null;
  }

  const ids = handler.huntIds ? handler.huntIds(q, g) : null;
  const stones = handler.huntStones?.(q) ?? false;
  const collect = handler.forceCollect?.(q) ?? false;
  return autoCombat(nav, dt, obj, { ids, stones, collect });
}

/** NPC eylem fazı: hedefe `within` yaklaşınca eylemi çalıştır, değilse rotayla git. */
export function autoArrive(nav: QuestNavigator, obj: Objective, within: number, status: string, dt: number, act: () => void): RoutePoint | null {
  nav.endHunt();
  const p = nav.game.player;
  if (Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z) <= within) {
    nav.objective = obj;
    nav.remaining = [];
    nav.plan = null;
    nav.goal = null;
    if (nav.marks) nav.marks.visible = false;
    nav.setStatus(status);
    act();
    return null;
  }
  return autoRouteTo(nav, obj, dt, status);
}

/**
 * Savaş fazı (kill/stone/collect/level/preparasyon): canlı hedef yakınsa oto
 * ava devret; değilse hedefe/bölgeye rotayla git. Bölgede hedef yoksa doğmayı
 * bekle. filter: avda izinli türler + taş/ganimet izni; status: özel durum
 * etiketi (ör. preparasyon), yoksa evrensel av etiketleri kullanılır.
 */
export function autoCombat(nav: QuestNavigator, dt: number, obj: Objective,
  filter: { ids: ReadonlySet<string> | null; stones: boolean; collect: boolean },
  status?: string): RoutePoint | null {
  const g = nav.game, p = g.player, h = g.autoHunt;
  nav.objective = obj;
  const radius = h.settings.radius;
  const dist = Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z);

  // Hedef çözümü köye düştüyse (düşman/bölge yok) sıradan seyahat.
  if (obj.key.startsWith('npc:')) {
    nav.endHunt();
    return autoRouteTo(nav, obj, dt, 'Görev hedefine gidiliyor');
  }

  const isLive = obj.key.startsWith('enemy:') || obj.key.startsWith('drop:');
  const engageRange = isLive ? radius : obj.stop;
  if (dist > engageRange) {
    // Seyahat fazı
    nav.endHunt();
    nav.huntKey = '';
    return autoRouteTo(nav, obj, dt, status ?? 'Görev hedefine gidiliyor');
  }

  // Av fazı: av motorunu kur/sürdür, hareketi o yürütür.
  const { ids, stones, collect } = filter;
  if (!h.enabled) {
    h.questBegin(nav.autoV.set(obj.x, p.pos.y, obj.z), ids, stones);
    nav.hunt = true;
    nav.huntKey = obj.key;
    nav.noTargetT = 0;
    nav.remaining = [];
    nav.plan = null;
    nav.goal = null;
    if (nav.marks) nav.marks.visible = false;
  } else {
    h.setQuestFilter(ids, stones);
    // Yeni hedef türü çözümlendiğinde av merkezini oyuncuya al.
    if (nav.huntKey !== obj.key) {
      nav.huntKey = obj.key;
      h.center.copy(p.pos);
    }
  }
  h.forceCollect = collect;
  // Oyuncu merkezden fazla uzaklaşırsa av merkezini ona taşı (yarıçap kullanıcının).
  if (Math.hypot(p.pos.x - h.center.x, p.pos.z - h.center.z) > radius * 0.6) h.center.copy(p.pos);
  const anyTarget = huntTargetExists(nav, ids, stones);
  if (anyTarget) nav.noTargetT = 0;
  else {
    nav.noTargetT += dt;
    if (nav.noTargetT > 4) { nav.noTargetT = 0; h.center.copy(p.pos); }
  }
  nav.setStatus(status ?? (anyTarget ? 'Avlanıyor' : 'Düşman bekleniyor'));
  return null;
}

/** Oto kipte seyahat: hedefe A* rotasıyla yürü; takılırsa bir kez yeniden planla. */
export function autoRouteTo(nav: QuestNavigator, obj: Objective, dt: number, status: string): RoutePoint | null {
  const p = nav.game.player;
  if (nav.objective?.key !== obj.key) {
    nav.planTo(obj);
  } else if (nav.goal) {
    // Aynı hedef: konumunu tazele (canlı hedef/düşen ganimet kayabilir).
    const moved = Math.hypot(obj.x - nav.goal.x, obj.z - nav.goal.z);
    nav.goal = { x: obj.x, z: obj.z };
    nav.stopDist = obj.stop;
    if (moved > 5) nav.planTo(obj);
    else if (nav.remaining.length) nav.remaining[nav.remaining.length - 1] = { x: obj.x, z: obj.z };
  } else {
    nav.planTo(obj);
  }
  nav.drivePlan();
  if (!nav.active) return null;
  nav.setStatus(status);
  nav.trimRoute();
  const movedSq = p.pos.distanceToSquared(nav.lastPos);
  nav.lastPos.copy(p.pos);
  if (nav.remaining.length && movedSq < 0.0004) nav.stallT += dt;
  else nav.stallT = 0;
  if (nav.stallT > 2) {
    nav.stallT = 0;
    if (nav.stallCount === 0) { nav.stallCount = 1; nav.planTo(obj); }
    else { skipObjective(nav, obj); return null; } // oto kipte vazgeçmek yerine hedefi atla
  }
  if (!nav.remaining.length && !nav.plan && nav.goal && nav.replanT <= 0) {
    nav.replanT = 1.5;
    nav.planTo(obj);
  }
  while (nav.remaining.length && Math.hypot(p.pos.x - nav.remaining[0].x, p.pos.z - nav.remaining[0].z) <= 0.4) nav.remaining.shift();
  tickMarks(nav, dt);
  // Rota tükendiyse hedefe doğrudan yönel (yakın mesafe, düz yürüyüş).
  return nav.remaining[0] ?? nav.goal;
}

// ---------------------------------------------------------- oto zekâ yardımcıları

/** Takılma sayılan hedefi 60 sn'liğine atlama listesine alır; çözümleme alternatif seçer. */
export function skipObjective(nav: QuestNavigator, obj: Objective) {
  const g = nav.game, now = g.time;
  for (const [k, u] of nav.skipped) if (u <= now) nav.skipped.delete(k); // süresi dolanları ayıkla
  nav.skipped.set(obj.enemy ?? obj.key, now + 60);
  g.events.emit('log', { msg: `Hedefe ulaşılamadı, şimdilik atlanıyor: ${obj.label}`, cls: 'warn' });
  autoPhaseReset(nav);
}

/** Düşman örneği atlama listesinde mi? (süresi dolmuşsa listeden düşer) */
export function isSkipped(nav: QuestNavigator, e: Enemy) {
  const until = nav.skipped.get(e);
  if (until === undefined) return false;
  if (until > nav.game.time) return true;
  nav.skipped.delete(e);
  return false;
}

/** Hedef anahtarı (bölge/ganimet/npc) atlama listesinde mi? */
export function keySkipped(nav: QuestNavigator, key: string) {
  const until = nav.skipped.get(key);
  if (until === undefined) return false;
  if (until > nav.game.time) return true;
  nav.skipped.delete(key);
  return false;
}

/** Savaş görevi hedefinin asgari seviyesi (preparasyon eşiği için); savaşsız türlerde null. */
export function combatNeed(nav: QuestNavigator, q: QuestDef): number | null {
  switch (q.kind) {
    case 'kill': return ENEMIES[q.target!]?.level ?? null;
    case 'collect': {
      let m = Infinity;
      for (const id in ENEMIES) {
        const d = ENEMIES[id];
        if (d.drops.some((dr) => dr.id === q.target)) m = Math.min(m, d.level);
      }
      return m < Infinity ? m : null;
    }
    case 'stone': {
      let m = Infinity;
      for (const z of STONE_ZONES) m = Math.min(m, ENEMIES[z.enemy]?.level ?? Infinity);
      return m < Infinity ? m : null;
    }
    default: return null;
  }
}

/** Seviyeye uygun en yakın kasılma bölgesi: tercihen Sv-3..Sv+2; boss ve taş hariç. */
export function grindZone(nav: QuestNavigator, level: number, isSkip?: (z: SpawnZone) => boolean): SpawnZone | null {
  const p = nav.game.player;
  let zone: SpawnZone | null = null, bd = Infinity;
  for (const prefer of [true, false]) {
    for (const z of SPAWN_ZONES) {
      const d = ENEMIES[z.enemy];
      if (!d || d.stone || d.boss || d.level > level + 2) continue;
      if (prefer && d.level < level - 3) continue;
      if (isSkip?.(z)) continue;
      const dist = (z.x - p.pos.x) ** 2 + (z.z - p.pos.z) ** 2;
      if (dist < bd) { bd = dist; zone = z; }
    }
    if (zone) break;
  }
  return zone;
}

/**
 * Geri çekilme fazı: en yakın tehdidin tersine 14 m kaç; yön tıkalıysa
 * ±45°/±90° varyantları dene. Kaçış yolu yoksa ve saldırgan yakın dövüş
 * menzilindeyse aynı görev filtresiyle avı açıp karşı koy (kilitlenmez).
 */
export function retreat(nav: QuestNavigator): RoutePoint | null {
  const g = nav.game, p = g.player;
  nav.setStatus('Geri çekiliyor');
  // En yakın tehdit: önce bizi kovalayan/saldıran, yoksa en yakın aggro yarıçaplı düşman.
  let threat: Enemy | null = null, bd = Infinity;
  for (const chasing of [true, false]) {
    for (const e of g.enemies) {
      if (!e.alive || e.isStone) continue;
      const aggroed = e.state === 'chase' || e.state === 'attack';
      if (chasing ? !aggroed : e.def.aggro <= 0) continue;
      const d2 = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d2 < bd) { bd = d2; threat = e; }
    }
    if (threat) break;
  }
  if (!threat) { nav.endHunt(); return null; } // tehdit kalmadı: dur ve can doldur

  const dx = p.pos.x - threat.pos.x, dz = p.pos.z - threat.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  let flee: RoutePoint | null = null;
  for (const ang of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const x = p.pos.x + ((dx * c - dz * s) / d) * 14;
    const z = p.pos.z + ((dx * s + dz * c) / d) * 14;
    if (nav.clearAt(x, z)) { flee = { x, z }; break; }
  }
  if (flee) { nav.endHunt(); return flee; }

  // Sıkışık: saldırgan menzildeyse aynı görev filtresiyle karşı koy.
  const reach = p.attackRange * 0.85 + threat.radius + 0.3;
  if (bd <= reach * reach) {
    let ids: ReadonlySet<string> | null = null, stones = false;
    const q = g.quests.current;
    if (q) {
      const handler = questHandler(q.kind);
      ids = handler.huntIds ? handler.huntIds(q, g) : null;
      stones = handler.huntStones?.(q) ?? false;
    }
    if (!g.autoHunt.enabled) {
      g.autoHunt.questBegin(nav.autoV.set(p.pos.x, p.pos.y, p.pos.z), ids, stones);
      nav.hunt = true;
    }
  }
  return null; // dört yanı kapalı ya da savaşıyor: yerinde kal; ölüm zinciri devralır
}

