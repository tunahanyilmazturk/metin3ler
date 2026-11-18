import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import type { QuestDef } from '../data/quests';
import { SPAWN_ZONES, STONE_ZONES, WORLD_HALF } from '../data/world';
import type { SpawnZone } from '../data/world';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';
import { RoutePoint, findQuestPath } from './questPath';
import { questHandler } from './questHandlers';

import { autoPhaseReset, huntTargetExists, updateAuto, autoArrive, autoCombat, autoRouteTo, skipObjective, isSkipped, keySkipped, combatNeed, grindZone, retreat } from './questNavAuto';
import { tickMarks, ensureMarks, updateMarks } from './questNavMarks';
import type { Objective } from './questNavTypes';
import { LIM, MARK_COUNT, MARK_SPACING } from './questNavTypes';


/**
 * Görev takipçisinin hedefine giden rotayı hesaplar ve yönetir.
 * 'Rota' kipi oyuncuyu otomatik yürütür; 'İz' kipi yalnızca yerde
 * altın şevron işaretleri gösterir; 'Oto' kipi görev zincirini
 * uçtan uca yürütür (al → savaş → teslim → sonraki görev).
 */
export class QuestNavigator {
  active = false;
  /** true: yalnızca otomatik yürüme kipi (Oto'da false kalır). */
  walking = false;
  /** Oto görev kipi: rota + oto av + teslim zinciri. */
  auto = false;
  status = '';
  /** Henüz gidilmemiş rota noktaları (sonuncusu varış noktası). */
  remaining: RoutePoint[] = [];

  objective: Objective | null = null;
  goal: RoutePoint | null = null;
  stopDist = 2.5;
  signature = '';
  plan: Generator<void, RoutePoint[] | null> | null = null;
  resolveT = 0;
  replanT = 0;
  stallT = 0;
  stallCount = 0;
  offRoute = 0;
  /** Oto kipte av motoru bu gezgin tarafından sürülüyor mu? */
  hunt = false;
  /** Avın kurulduğu hedef anahtarı (yeni hedef → merkez oyuncuya alınır). */
  huntKey = '';
  /** Avda izinli hedef bulunamayan süre (merkez tazeleme için). */
  noTargetT = 0;
  /** Teslim reddedilirse (envanter dolu) yeniden deneme bekleme süresi. */
  retryT = 0;
  /** Oto kipte ölüm geri sayımı (-1: oyuncu canlı). */
  deadT = -1;
  /** Oto kipte üst üste ölüm sayısı; görev imzası değişince ve elle kipte sıfırlanır. */
  deathCount = 0;
  /** Düşük can + iksirsizlikte geri çekilme fazı etkin. */
  retreating = false;
  /** Ulaşılamayan hedefler: düşman örneği veya hedef anahtarı → geçerlilik bitişi. */
  skipped = new Map<Enemy | string, number>();
  /** Çözümlenebilir hedef yoksa yeniden deneme bekleme süresi. */
  retryObjectiveT = 0;
  /** "Envanter dolu" uyarısını sınırlayan zaman damgası. */
  fullWarnAt = -99;
  /** Son hasar alımının oyun zamanı (boss öncesi can beklemesi için). */
  hurtAt = -99;
  autoV = new THREE.Vector3();
  /** Oyuncunun izi elle kapattığı görev durumu imzası (aynı durumda otomatik yeniden kurma yapılmaz). */
  dismissedSig = '';
  idleT = 0;
  lastPos = new THREE.Vector3();
  marks: THREE.InstancedMesh | null = null;
  markT = 0;
  dummy = new THREE.Object3D();

  constructor(readonly game: Game) {
    game.events.on('playerDied', () => {
      // Oto görev kipinde ölüm zinciri kırmaz: dirilip kaldığı yerden sürdürülür.
      if (this.auto && this.active) { this.endHunt(); this.deadT = 3; }
      else this.stop();
    });
    game.events.on('playerHurt', () => { this.hurtAt = this.game.time; });
  }

  signatureNow() {
    const q = this.game.quests;
    return `${q.current?.id ?? 'none'}|${q.accepted ? 1 : 0}|${q.complete ? 1 : 0}`;
  }

  setStatus(s: string) { this.status = s; }

  /** Etkin kip: 'off' | 'walk' | 'trail' | 'auto' (UI düğme durumu için). */
  get mode() {
    return !this.active ? 'off' : this.auto ? 'auto' : this.walking ? 'walk' : 'trail';
  }

  modeLabel() {
    const m = this.auto ? 'Oto' : this.walking ? 'Yürüyor' : 'İz';
    return `${m} → ${this.objective?.label ?? ''}`;
  }

  /** Rota/İz/Oto düğmesi: kapalıysa başlat, aynı kipteyse durdur, farklı kipteyse rotayı koruyarak kip değiştir. */
  toggle(mode: 'walk' | 'trail' | 'auto') {
    this.deathCount = 0; // elle müdahale: ölüm sayacı sıfırlanır
    if (!this.active) { this.start(mode); return; }
    if (this.mode === mode) { this.dismissedSig = this.signatureNow(); this.stop(); return; }
    const wasAuto = this.auto;
    this.auto = mode === 'auto';
    this.walking = mode === 'walk';
    if (wasAuto && !this.auto) this.endHunt();
    if (this.auto) {
      // Karşılıklı dışlama: Oto'ya girerken elle açılmış avı durdur; avı yalnızca gezgin kurar.
      this.game.autoHunt.stop();
      autoPhaseReset(this);
    }
    this.stallT = 0;
    this.stallCount = 0;
    this.lastPos.copy(this.game.player.pos);
    this.setStatus(this.modeLabel());
  }

  start(mode: 'walk' | 'trail' | 'auto', passive = false) {
    const g = this.game, p = g.player;
    if (!p || !p.alive) return;
    if (!g.quests.current) {
      g.events.emit('log', { msg: 'İzlenecek görev yok.', cls: 'warn' });
      return;
    }
    p.intent = null;
    // Otomatik iz pasif bir katmandır; oto avı kesintiye uğratmaz.
    // Oto kipte ise av önce durdurulur, yalnızca gezgin yeniden kurar.
    if (!passive) g.autoHunt.stop();
    this.active = true;
    this.auto = mode === 'auto';
    this.walking = mode === 'walk';
    this.signature = this.signatureNow();
    this.objective = null;
    this.goal = null;
    this.remaining = [];
    this.plan = null;
    this.resolveT = 0;
    this.replanT = 0;
    this.stallT = 0;
    this.stallCount = 0;
    this.offRoute = 0;
    this.hunt = false;
    this.huntKey = '';
    this.noTargetT = 0;
    this.retryT = 0;
    this.deadT = -1;
    this.deathCount = 0;
    this.retreating = false;
    this.skipped.clear();
    this.retryObjectiveT = 0;
    this.lastPos.copy(p.pos);
    this.beginPlan();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.endHunt();
    this.auto = false;
    this.walking = false;
    this.plan = null;
    this.remaining = [];
    this.goal = null;
    this.objective = null;
    this.setStatus('');
    if (this.marks) this.marks.visible = false;
  }

  /**
   * Otomatik iz (Görev İzi ayarı): etkin rota yokken geçerli görev hedefine
   * iz kipinde yol kurar. Hedefin durma yarıçapı içindeyse (ör. teslimdeki
   * Aksakal) ya da oyuncu aynı görev durumu için izi elle kapattıysa no-op.
   */
  ensureTrail() {
    if (this.active || !this.game.autoTrail || !this.game.quests?.current || !this.game.player?.alive) return;
    const obj = this.resolveObjective();
    if (!obj) return;
    const p = this.game.player;
    if (Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z) <= obj.stop) return;
    if (this.signatureNow() === this.dismissedSig) return;
    this.start('trail', true);
  }

  /**
   * Şu anki görev durumuna göre canlı hedef çözümleme.
   * smart: oto kipte güvenli hedef puanlaması (mesafe + çevre aggro + seviye farkı);
   * yürüme/iz kipleri yalnızca en yakını seçer. Takılarak atlanan hedefler elenir.
   */
  resolveObjective(smart = false): Objective | null {
    const g = this.game, p = g.player, q = g.quests.current;
    if (!q || !p) return null;
    // Görev henüz alınmadıysa ya da bittiyse hedef Bilge Aksakal (alma + teslim).
    if (!g.quests.accepted || g.quests.complete) return this.npcObjective('elder');
    const px = p.pos.x, pz = p.pos.z;
    let skippedAny = false; // adayların hepsi atlama listesindeyse köye düşmek yerine null dön
    const zoneFree = (z: SpawnZone, key: string) => {
      if (!keySkipped(this, key)) return true;
      skippedAny = true;
      return false;
    };
    const fallback = () => (skippedAny ? null : this.npcObjective('elder'));
    const closestZone = (zones: SpawnZone[], match: (z: SpawnZone) => boolean) => {
      let best: SpawnZone | null = null, bd = Infinity;
      for (const z of zones) {
        if (!match(z)) continue;
        const d = (z.x - px) ** 2 + (z.z - pz) ** 2;
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    };
    const closestEnemy = (match: (e: Enemy) => boolean) => {
      let best: Enemy | null = null, bs = Infinity;
      for (const e of g.enemies) {
        if (!e.alive || !match(e)) continue;
        if (isSkipped(this, e)) { skippedAny = true; continue; }
        let score: number;
        if (smart) {
          // Güvenli seçim: uzaklık + 8 m içindeki aggro yaratık sayısı + seviye farkı cezası.
          const dist = Math.hypot(e.pos.x - px, e.pos.z - pz);
          let aggroNearby = 0;
          for (const o of g.enemies) {
            if (o.alive && o.def.aggro > 0 &&
                Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= 8) aggroNearby++;
          }
          score = dist + 12 * aggroNearby + 8 * Math.max(0, e.def.level - p.level);
        } else {
          score = (e.pos.x - px) ** 2 + (e.pos.z - pz) ** 2;
        }
        if (score < bs) { bs = score; best = e; }
      }
      if (!best) return null;
      const e = best;
      return { x: e.pos.x, z: e.pos.z, stop: Math.max(3, e.radius + 2), label: e.def.name, key: `enemy:${e.def.id}`, enemy: e, valid: () => e.alive && !isSkipped(this, e) } satisfies Objective;
    };
    switch (q.kind) {
      case 'talk': return this.npcObjective(q.target!) ?? this.npcObjective('elder');
      case 'upgrade': return this.npcObjective('smith') ?? this.npcObjective('elder');
      case 'kill': {
        const live = closestEnemy((e) => e.def.id === q.target);
        if (live) return live;
        const zone = closestZone(SPAWN_ZONES, (z) => z.enemy === q.target && zoneFree(z, `zone:${q.target}:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 6, label: q.targetName, key: `zone:${q.target}:${zone.x},${zone.z}` };
        return fallback();
      }
      case 'stone': {
        const live = closestEnemy((e) => e.isStone);
        if (live) return live;
        const zone = closestZone(STONE_ZONES, (z) => zoneFree(z, `stone:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 6, label: 'Lanetli Taş', key: `stone:${zone.x},${zone.z}` };
        return fallback();
      }
      case 'collect': {
        // Yerde duran uygun ganimet varsa oraya git.
        let drop: (typeof g.loot.drops)[number] | null = null, bd = Infinity;
        for (const d of g.loot.drops) {
          if (!d.item || d.item.id !== q.target) continue;
          if (keySkipped(this, `drop:${d.group.id}`)) { skippedAny = true; continue; }
          const dist = (d.group.position.x - px) ** 2 + (d.group.position.z - pz) ** 2;
          if (dist < bd) { bd = dist; drop = d; }
        }
        if (drop) {
          const d = drop;
          return { x: d.group.position.x, z: d.group.position.z, stop: 2, label: q.targetName, key: `drop:${d.group.id}`, valid: () => g.loot.drops.includes(d) && !keySkipped(this, `drop:${d.group.id}`) };
        }
        const live = closestEnemy((e) => e.def.drops.some((dr) => dr.id === q.target));
        if (live) return live;
        const zone = closestZone(SPAWN_ZONES, (z) => !!ENEMIES[z.enemy]?.drops.some((dr) => dr.id === q.target) && zoneFree(z, `zone:${q.target}:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 6, label: q.targetName, key: `zone:${q.target}:${zone.x},${zone.z}` };
        return fallback();
      }
      case 'level': {
        // Seviyeye uygun en yakın bölge: tercihen oyuncu seviyesi -3 .. +2.
        const zone = grindZone(this, p.level, (z) => !zoneFree(z, `level:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 8, label: 'Seviye bölgesi', key: `level:${zone.x},${zone.z}` };
        return fallback();
      }
      default:
        // Bilinmeyen/gelecek görev türü: Aksakal'a yönlendir; eylem handler'ın işi.
        return this.npcObjective('elder');
    }
  }

  npcObjective(id: string): Objective | null {
    if (keySkipped(this, `npc:${id}`)) return null;
    const n = this.game.npcs.find((n) => n.id === id);
    return n ? { x: n.pos.x, z: n.pos.z, stop: 2.5, label: n.name, key: `npc:${id}` } : null;
  }

  /** Rota temizlik testi: sınır içi + yürünebilir + engelsiz. */
  clearAt = (x: number, z: number) =>
    Math.abs(x) < LIM && Math.abs(z) < LIM &&
    this.game.terrain.walkable(x, z) &&
    this.game.colliders.isClear(x, z, this.game.player.radius + 0.08);

  beginPlan() {
    const obj = this.resolveObjective();
    if (!obj) { this.fail(); return; }
    this.planTo(obj);
  }

  /** Verilen hedefe yeni rota planı başlat. */
  planTo(obj: Objective) {
    const p = this.game.player;
    this.objective = obj;
    this.goal = { x: obj.x, z: obj.z };
    this.stopDist = obj.stop;
    this.plan = findQuestPath({ x: p.pos.x, z: p.pos.z }, this.goal, obj.stop, this.clearAt);
    this.setStatus('Rota hesaplanıyor…');
  }

  /** Üreteci her karede en çok ~2 ms ilerlet. */
  drivePlan() {
    if (!this.plan) return;
    const t0 = performance.now();
    for (;;) {
      const r = this.plan.next();
      if (r.done) {
        this.plan = null;
        const path = r.value;
        if (!path) { this.fail(); return; }
        this.remaining = path;
        this.stallT = 0;
        this.setStatus(this.modeLabel());
        return;
      }
      if (performance.now() - t0 > 2) return;
    }
  }

  arrive() {
    const label = this.objective?.label;
    this.game.events.emit('log', { msg: label ? `Hedefe ulaştın: ${label}.` : 'Hedefe ulaştın.', cls: 'good' });
    this.remaining = [];
    this.plan = null;
    this.goal = null;
    // Oto kipte varış zinciri kapatmaz: durum makinesi sonraki karede sürdürür.
    this.active = this.auto;
    this.setStatus('');
    if (this.marks) this.marks.visible = false;
  }

  fail() {
    this.game.events.emit('log', { msg: 'Yol bulunamadı.', cls: 'warn' });
    this.stop();
  }

  /** Oyuncunun rota üzerindeki izdüşümünü bulur; geçilen ara noktaları atar. */
  trimRoute() {
    const p = this.game.player;
    const r = this.remaining;
    this.offRoute = this.goal ? Math.hypot(p.pos.x - this.goal.x, p.pos.z - this.goal.z) : 0;
    if (!r.length) return;
    let best = Infinity, bi = 0;
    const n = Math.min(r.length, 8);
    for (let i = 0; i < n; i++) {
      const ax = i === 0 ? p.pos.x : r[i - 1].x;
      const az = i === 0 ? p.pos.z : r[i - 1].z;
      const bx = r[i].x, bz = r[i].z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-6 ? ((p.pos.x - ax) * dx + (p.pos.z - az) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d2 = (p.pos.x - (ax + dx * t)) ** 2 + (p.pos.z - (az + dz * t)) ** 2;
      if (d2 < best) { best = d2; bi = i; }
    }
    if (bi > 0) r.splice(0, bi);
    this.offRoute = Math.sqrt(best);
  }

  /**
   * Oyuncu güncellemesinden çağrılır.
   * manual: elle girdi (yürüme kipinde rota iptali).
   * Yalnızca otomatik yürüme kipinde sıradaki rota noktasını döndürür.
   */
  update(dt: number, manual: boolean): RoutePoint | null {
    if (!this.active) {
      // Otomatik iz denetimi (~1 Hz): görev durumu değiştiyse izi yeniden kur.
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 1;
        this.ensureTrail();
      }
      return null;
    }
    const g = this.game, p = g.player;

    // Görev imzası değişti mi? Yeni görev id'sine sürüklenme — durdur.
    // Oto kipte ise zincir bilinçli olarak sonraki göreve geçer: durmak yerine faz sıfırlanır.
    const sig = this.signatureNow();
    if (sig !== this.signature) {
      const sameId = sig.split('|')[0] === this.signature.split('|')[0] && !sig.startsWith('none');
      this.signature = sig;
      this.deathCount = 0; // yeni görev durumu: ölüm sayacı sıfırlanır
      if (this.auto) autoPhaseReset(this);
      else if (!sameId) { this.stop(); return null; }
      // Kabul/tamamlanma değişti: hedefi sessizce yeniden çöz (ör. Aksakal'a dönüş).
      else this.beginPlan();
    }

    if ((this.walking || this.auto) && manual) { this.stop(); return null; }

    // Canlı hedef yenileme: geçersizse hemen, değilse ~1.5 sn'de bir kontrol.
    this.resolveT -= dt;
    this.replanT -= dt;

    // Oto görev zinciri: rota + savaş + teslim.
    if (this.auto) return updateAuto(this, dt);

    if (this.objective) {
      const invalid = this.objective.valid !== undefined && !this.objective.valid();
      if (invalid || this.resolveT <= 0) {
        this.resolveT = 1.5;
        const prev = this.objective;
        const next = this.resolveObjective();
        if (next) {
          this.objective = next;
          const moved = Math.hypot(next.x - prev.x, next.z - prev.z);
          if (next.key !== prev.key || moved > 5) this.beginPlan();
          else {
            this.goal = { x: next.x, z: next.z };
            this.stopDist = next.stop;
            if (this.remaining.length) this.remaining[this.remaining.length - 1] = { x: next.x, z: next.z };
            this.setStatus(this.modeLabel());
          }
        }
      }
    }

    this.drivePlan();
    if (!this.active) return null;

    // Varış denetimi
    if (this.goal && Math.hypot(p.pos.x - this.goal.x, p.pos.z - this.goal.z) <= this.stopDist) {
      this.arrive();
      return null;
    }

    this.trimRoute();

    if (this.walking) {
      // Takılma: ~2 sn ilerleme yoksa bir kez yeniden planla, yine olmazsa vazgeç.
      const movedSq = p.pos.distanceToSquared(this.lastPos);
      this.lastPos.copy(p.pos);
      if (this.remaining.length && movedSq < 0.0004) this.stallT += dt;
      else this.stallT = 0;
      if (this.stallT > 2) {
        this.stallT = 0;
        if (this.stallCount === 0) { this.stallCount = 1; this.beginPlan(); }
        else { this.fail(); return null; }
      }
      // Rota noktası boşken plan varsa bekle; yoksa ve hedef uzaktaysa yeniden planla.
      if (!this.remaining.length && !this.plan && this.goal && this.replanT <= 0) {
        this.replanT = 1.5;
        this.beginPlan();
      }
      while (this.remaining.length && Math.hypot(p.pos.x - this.remaining[0].x, p.pos.z - this.remaining[0].z) <= 0.4) this.remaining.shift();
      tickMarks(this, dt);
      return this.remaining[0] ?? null;
    }

    // İz kipi: rotadan 10 m'den fazla saparsa (sınırlı aralıkla) yeniden planla.
    if (!this.plan && this.offRoute > 10 && this.replanT <= 0) {
      this.replanT = 1.5;
      this.beginPlan();
    }
    tickMarks(this, dt);
    return null;
  }

  // ------------------------------------------------------------------ oto görev zinciri

  /** Gezginin kurduğu avı durdurur (kullanıcının kendi oto avına dokunmaz). */
  endHunt() {
    if (!this.hunt) return;
    this.hunt = false;
    this.game.autoHunt.stop();
  }

  /** Görünen işaret sayısı (tanılama/test). */
  /** Oyuncudan rotanın sonuna kalan yol (metre). */
  routeLength() {
    const p = this.game.player;
    let len = 0, x = p.pos.x, z = p.pos.z;
    for (const pt of this.remaining) { len += Math.hypot(pt.x - x, pt.z - z); x = pt.x; z = pt.z; }
    return len;
  }

  get markCount() { return this.marks && this.marks.visible ? this.marks.count : 0; }
}
