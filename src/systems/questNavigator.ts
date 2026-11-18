import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import type { QuestDef } from '../data/quests';
import { SPAWN_ZONES, STONE_ZONES, WORLD_HALF } from '../data/world';
import type { SpawnZone } from '../data/world';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';
import { RoutePoint, findQuestPath } from './questPath';
import { questHandler } from './questHandlers';

const LIM = WORLD_HALF - 22;
const MARK_COUNT = 30;
const MARK_SPACING = 2.75;

interface Objective {
  x: number;
  z: number;
  stop: number;
  label: string;
  key: string;
  /** Canlı düşman hedefinin örneği (takılma-atlama ve boss beklemesi için). */
  enemy?: Enemy;
  /** Canlı hedeflerde geçerlilik (düşman öldü, ganimet toplandı vb.) */
  valid?: () => boolean;
}

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

  private objective: Objective | null = null;
  private goal: RoutePoint | null = null;
  private stopDist = 2.5;
  private signature = '';
  private plan: Generator<void, RoutePoint[] | null> | null = null;
  private resolveT = 0;
  private replanT = 0;
  private stallT = 0;
  private stallCount = 0;
  private offRoute = 0;
  /** Oto kipte av motoru bu gezgin tarafından sürülüyor mu? */
  private hunt = false;
  /** Avın kurulduğu hedef anahtarı (yeni hedef → merkez oyuncuya alınır). */
  private huntKey = '';
  /** Avda izinli hedef bulunamayan süre (merkez tazeleme için). */
  private noTargetT = 0;
  /** Teslim reddedilirse (envanter dolu) yeniden deneme bekleme süresi. */
  private retryT = 0;
  /** Oto kipte ölüm geri sayımı (-1: oyuncu canlı). */
  private deadT = -1;
  /** Oto kipte üst üste ölüm sayısı; görev imzası değişince ve elle kipte sıfırlanır. */
  private deathCount = 0;
  /** Düşük can + iksirsizlikte geri çekilme fazı etkin. */
  private retreating = false;
  /** Ulaşılamayan hedefler: düşman örneği veya hedef anahtarı → geçerlilik bitişi. */
  private skipped = new Map<Enemy | string, number>();
  /** Çözümlenebilir hedef yoksa yeniden deneme bekleme süresi. */
  private retryObjectiveT = 0;
  /** "Envanter dolu" uyarısını sınırlayan zaman damgası. */
  private fullWarnAt = -99;
  /** Son hasar alımının oyun zamanı (boss öncesi can beklemesi için). */
  private hurtAt = -99;
  private autoV = new THREE.Vector3();
  /** Oyuncunun izi elle kapattığı görev durumu imzası (aynı durumda otomatik yeniden kurma yapılmaz). */
  private dismissedSig = '';
  private idleT = 0;
  private lastPos = new THREE.Vector3();
  private marks: THREE.InstancedMesh | null = null;
  private markT = 0;
  private dummy = new THREE.Object3D();

  constructor(private game: Game) {
    game.events.on('playerDied', () => {
      // Oto görev kipinde ölüm zinciri kırmaz: dirilip kaldığı yerden sürdürülür.
      if (this.auto && this.active) { this.endHunt(); this.deadT = 3; }
      else this.stop();
    });
    game.events.on('playerHurt', () => { this.hurtAt = this.game.time; });
  }

  private signatureNow() {
    const q = this.game.quests;
    return `${q.current?.id ?? 'none'}|${q.accepted ? 1 : 0}|${q.complete ? 1 : 0}`;
  }

  private setStatus(s: string) { this.status = s; }

  /** Etkin kip: 'off' | 'walk' | 'trail' | 'auto' (UI düğme durumu için). */
  get mode() {
    return !this.active ? 'off' : this.auto ? 'auto' : this.walking ? 'walk' : 'trail';
  }

  private modeLabel() {
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
      this.autoPhaseReset();
    }
    this.stallT = 0;
    this.stallCount = 0;
    this.lastPos.copy(this.game.player.pos);
    this.setStatus(this.modeLabel());
  }

  private start(mode: 'walk' | 'trail' | 'auto', passive = false) {
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
  private resolveObjective(smart = false): Objective | null {
    const g = this.game, p = g.player, q = g.quests.current;
    if (!q || !p) return null;
    // Görev henüz alınmadıysa ya da bittiyse hedef Bilge Aksakal (alma + teslim).
    if (!g.quests.accepted || g.quests.complete) return this.npcObjective('elder');
    const px = p.pos.x, pz = p.pos.z;
    let skippedAny = false; // adayların hepsi atlama listesindeyse köye düşmek yerine null dön
    const zoneFree = (z: SpawnZone, key: string) => {
      if (!this.keySkipped(key)) return true;
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
        if (this.isSkipped(e)) { skippedAny = true; continue; }
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
      return { x: e.pos.x, z: e.pos.z, stop: Math.max(3, e.radius + 2), label: e.def.name, key: `enemy:${e.def.id}`, enemy: e, valid: () => e.alive && !this.isSkipped(e) } satisfies Objective;
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
          if (this.keySkipped(`drop:${d.group.id}`)) { skippedAny = true; continue; }
          const dist = (d.group.position.x - px) ** 2 + (d.group.position.z - pz) ** 2;
          if (dist < bd) { bd = dist; drop = d; }
        }
        if (drop) {
          const d = drop;
          return { x: d.group.position.x, z: d.group.position.z, stop: 2, label: q.targetName, key: `drop:${d.group.id}`, valid: () => g.loot.drops.includes(d) && !this.keySkipped(`drop:${d.group.id}`) };
        }
        const live = closestEnemy((e) => e.def.drops.some((dr) => dr.id === q.target));
        if (live) return live;
        const zone = closestZone(SPAWN_ZONES, (z) => !!ENEMIES[z.enemy]?.drops.some((dr) => dr.id === q.target) && zoneFree(z, `zone:${q.target}:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 6, label: q.targetName, key: `zone:${q.target}:${zone.x},${zone.z}` };
        return fallback();
      }
      case 'level': {
        // Seviyeye uygun en yakın bölge: tercihen oyuncu seviyesi -3 .. +2.
        const zone = this.grindZone(p.level, (z) => !zoneFree(z, `level:${z.x},${z.z}`));
        if (zone) return { x: zone.x, z: zone.z, stop: 8, label: 'Seviye bölgesi', key: `level:${zone.x},${zone.z}` };
        return fallback();
      }
      default:
        // Bilinmeyen/gelecek görev türü: Aksakal'a yönlendir; eylem handler'ın işi.
        return this.npcObjective('elder');
    }
  }

  private npcObjective(id: string): Objective | null {
    if (this.keySkipped(`npc:${id}`)) return null;
    const n = this.game.npcs.find((n) => n.id === id);
    return n ? { x: n.pos.x, z: n.pos.z, stop: 2.5, label: n.name, key: `npc:${id}` } : null;
  }

  /** Rota temizlik testi: sınır içi + yürünebilir + engelsiz. */
  private clearAt = (x: number, z: number) =>
    Math.abs(x) < LIM && Math.abs(z) < LIM &&
    this.game.terrain.walkable(x, z) &&
    this.game.colliders.isClear(x, z, this.game.player.radius + 0.08);

  private beginPlan() {
    const obj = this.resolveObjective();
    if (!obj) { this.fail(); return; }
    this.planTo(obj);
  }

  /** Verilen hedefe yeni rota planı başlat. */
  private planTo(obj: Objective) {
    const p = this.game.player;
    this.objective = obj;
    this.goal = { x: obj.x, z: obj.z };
    this.stopDist = obj.stop;
    this.plan = findQuestPath({ x: p.pos.x, z: p.pos.z }, this.goal, obj.stop, this.clearAt);
    this.setStatus('Rota hesaplanıyor…');
  }

  /** Üreteci her karede en çok ~2 ms ilerlet. */
  private drivePlan() {
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

  private arrive() {
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

  private fail() {
    this.game.events.emit('log', { msg: 'Yol bulunamadı.', cls: 'warn' });
    this.stop();
  }

  /** Oyuncunun rota üzerindeki izdüşümünü bulur; geçilen ara noktaları atar. */
  private trimRoute() {
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
      if (this.auto) this.autoPhaseReset();
      else if (!sameId) { this.stop(); return null; }
      // Kabul/tamamlanma değişti: hedefi sessizce yeniden çöz (ör. Aksakal'a dönüş).
      else this.beginPlan();
    }

    if ((this.walking || this.auto) && manual) { this.stop(); return null; }

    // Canlı hedef yenileme: geçersizse hemen, değilse ~1.5 sn'de bir kontrol.
    this.resolveT -= dt;
    this.replanT -= dt;

    // Oto görev zinciri: rota + savaş + teslim.
    if (this.auto) return this.updateAuto(dt);

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
      this.tickMarks(dt);
      return this.remaining[0] ?? null;
    }

    // İz kipi: rotadan 10 m'den fazla saparsa (sınırlı aralıkla) yeniden planla.
    if (!this.plan && this.offRoute > 10 && this.replanT <= 0) {
      this.replanT = 1.5;
      this.beginPlan();
    }
    this.tickMarks(dt);
    return null;
  }

  // ------------------------------------------------------------------ oto görev zinciri

  /** Gezginin kurduğu avı durdurur (kullanıcının kendi oto avına dokunmaz). */
  private endHunt() {
    if (!this.hunt) return;
    this.hunt = false;
    this.game.autoHunt.stop();
  }

  /** Görev durumu değiştiğinde oto fazını sıfırla; zincir devam eder. */
  private autoPhaseReset() {
    this.endHunt();
    this.huntKey = '';
    this.noTargetT = 0;
    this.retryT = 0;
    this.retryObjectiveT = 0;
    this.objective = null;
    this.goal = null;
    this.remaining = [];
    this.plan = null;
    this.stallT = 0;
    this.stallCount = 0;
  }

  /** Av merkezinde izinli (filtre/öz-savunma) canlı hedef var mı? */
  private huntTargetExists(ids: ReadonlySet<string> | null, stones: boolean) {
    const g = this.game, h = g.autoHunt;
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
  private updateAuto(dt: number): RoutePoint | null {
    const g = this.game, qs = g.quests, p = g.player;
    this.retryT = Math.max(0, this.retryT - dt);
    this.retryObjectiveT = Math.max(0, this.retryObjectiveT - dt);

    // Ölünce devam: 3 sn sonra diril, fazı sıfırla, zinciri kaldığı yerden sürdür.
    if (!p.alive) {
      this.endHunt();
      if (this.deadT < 0) this.deadT = 3;
      this.deadT -= dt;
      this.setStatus(`Yenildin — diriliyor (${Math.max(0, Math.ceil(this.deadT))} sn)`);
      if (this.deadT <= 0) {
        p.respawn();
        this.autoPhaseReset();
        this.deadT = -1;
        this.deathCount++;
        if (this.deathCount > 3) {
          g.events.emit('log', { msg: 'Oto görev durduruldu: üst üste ölümler.', cls: 'warn' });
          this.stop();
          return null;
        }
        this.setStatus('Dirildi — görev sürdürülüyor');
      }
      return null;
    }
    this.deadT = -1;

    const q = qs.current;
    if (!q) {
      g.events.emit('log', { msg: 'Oto görev bitti: bekleyen görev kalmadı.', cls: 'gold' });
      this.stop();
      return null;
    }

    // Hayatta kalma: can %30'un altında ve can iksiri yoksa geri çekil;
    // can %60'ı geçene ya da iksir bulunana dek sürer.
    const hpRatio = p.hp / p.maxHp;
    if (!this.retreating && hpRatio < 0.3 && p.potionCount('hp') === 0) {
      this.retreating = true;
      this.endHunt();
      this.remaining = [];
      this.plan = null;
      this.goal = null;
      if (this.marks) this.marks.visible = false;
    } else if (this.retreating && (hpRatio > 0.6 || p.potionCount('hp') > 0)) {
      this.retreating = false;
      this.autoPhaseReset();
    }
    if (this.retreating) return this.retreat();

    const obj = this.retryObjectiveT > 0 ? null : this.resolveObjective(true);
    if (!obj) {
      // Atlanan hedeflerden başkası kalmadı: çökme — 5 sn'de bir yeniden dene.
      if (this.retryObjectiveT <= 0) this.retryObjectiveT = 5;
      this.setStatus('Uygun hedef bekleniyor');
      return null;
    }

    if (!qs.accepted) {
      return this.autoArrive(obj, 3, 'Yeni görev alınıyor', dt, () => qs.accept());
    }
    if (qs.complete) {
      return this.autoArrive(obj, 3, "Aksakal'a dönülüyor", dt, () => {
        if (this.retryT > 0) return;
        this.setStatus('Görev teslim ediliyor');
        qs.turnIn();
        // Teslim reddedildiyse (envanter dolu) günlük spamını önlemek için bekle.
        if (qs.complete) this.retryT = 5;
      });
    }

    // Tür stratejisi: kayıtlı değilse questHandler güvenli geri dönüş verir.
    const handler = questHandler(q.kind);
    if (handler.onArrive) {
      const h = handler;
      return this.autoArrive(obj, h.arriveDist ?? 3, 'Görev hedefine gidiliyor', dt, () => {
        if (h.onArrive!({ g, q, obj }) === 'pause') this.stop();
      });
    }

    // Preparasyon: hedef seviyesi çok üstteyse önce uygun bölgede seviye kas.
    const need = this.combatNeed(q);
    if (need !== null && need > p.level + 3) {
      const zone = this.grindZone(p.level, (z) => this.keySkipped(`prep:${z.x},${z.z}`));
      if (zone) {
        const prep: Objective = { x: zone.x, z: zone.z, stop: 8, label: 'Seviye bölgesi', key: `prep:${zone.x},${zone.z}` };
        return this.autoCombat(dt, prep, { ids: null, stones: false, collect: false },
          `Hazırlık: seviye kasılıyor (Sv.${p.level}→${need - 3})`);
      }
    }

    // Boss hazırlığı: can %80'in altındayken boss'un dibinde bekleyip doldur;
    // hasar alınırsa oto av öz-savunması devralır.
    if (obj.enemy?.def.boss && hpRatio < 0.8 && g.time - this.hurtAt > 5 &&
        Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z) <= 30) {
      this.endHunt();
      this.remaining = [];
      this.plan = null;
      this.goal = null;
      if (this.marks) this.marks.visible = false;
      this.setStatus('Boss için can yenileniyor');
      return null;
    }

    // Envanter dolu koruması: görev eşyası sığmıyorsa toplamayı duraklat.
    if (q.kind === 'collect' && q.target && !p.canAddItem(q.target)) {
      this.endHunt();
      if (g.time >= this.fullWarnAt) {
        this.fullWarnAt = g.time + 15;
        g.events.emit('log', { msg: 'Envanter dolu — görev eşyası için yer aç.', cls: 'warn' });
      }
      this.setStatus('Envanter dolu — yer aç');
      return null;
    }

    const ids = handler.huntIds ? handler.huntIds(q, g) : null;
    const stones = handler.huntStones?.(q) ?? false;
    const collect = handler.forceCollect?.(q) ?? false;
    return this.autoCombat(dt, obj, { ids, stones, collect });
  }

  /** NPC eylem fazı: hedefe `within` yaklaşınca eylemi çalıştır, değilse rotayla git. */
  private autoArrive(obj: Objective, within: number, status: string, dt: number, act: () => void): RoutePoint | null {
    this.endHunt();
    const p = this.game.player;
    if (Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z) <= within) {
      this.objective = obj;
      this.remaining = [];
      this.plan = null;
      this.goal = null;
      if (this.marks) this.marks.visible = false;
      this.setStatus(status);
      act();
      return null;
    }
    return this.autoRouteTo(obj, dt, status);
  }

  /**
   * Savaş fazı (kill/stone/collect/level/preparasyon): canlı hedef yakınsa oto
   * ava devret; değilse hedefe/bölgeye rotayla git. Bölgede hedef yoksa doğmayı
   * bekle. filter: avda izinli türler + taş/ganimet izni; status: özel durum
   * etiketi (ör. preparasyon), yoksa evrensel av etiketleri kullanılır.
   */
  private autoCombat(dt: number, obj: Objective,
    filter: { ids: ReadonlySet<string> | null; stones: boolean; collect: boolean },
    status?: string): RoutePoint | null {
    const g = this.game, p = g.player, h = g.autoHunt;
    this.objective = obj;
    const radius = h.settings.radius;
    const dist = Math.hypot(p.pos.x - obj.x, p.pos.z - obj.z);

    // Hedef çözümü köye düştüyse (düşman/bölge yok) sıradan seyahat.
    if (obj.key.startsWith('npc:')) {
      this.endHunt();
      return this.autoRouteTo(obj, dt, 'Görev hedefine gidiliyor');
    }

    const isLive = obj.key.startsWith('enemy:') || obj.key.startsWith('drop:');
    const engageRange = isLive ? radius : obj.stop;
    if (dist > engageRange) {
      // Seyahat fazı
      this.endHunt();
      this.huntKey = '';
      return this.autoRouteTo(obj, dt, status ?? 'Görev hedefine gidiliyor');
    }

    // Av fazı: av motorunu kur/sürdür, hareketi o yürütür.
    const { ids, stones, collect } = filter;
    if (!h.enabled) {
      h.questBegin(this.autoV.set(obj.x, p.pos.y, obj.z), ids, stones);
      this.hunt = true;
      this.huntKey = obj.key;
      this.noTargetT = 0;
      this.remaining = [];
      this.plan = null;
      this.goal = null;
      if (this.marks) this.marks.visible = false;
    } else {
      h.setQuestFilter(ids, stones);
      // Yeni hedef türü çözümlendiğinde av merkezini oyuncuya al.
      if (this.huntKey !== obj.key) {
        this.huntKey = obj.key;
        h.center.copy(p.pos);
      }
    }
    h.forceCollect = collect;
    // Oyuncu merkezden fazla uzaklaşırsa av merkezini ona taşı (yarıçap kullanıcının).
    if (Math.hypot(p.pos.x - h.center.x, p.pos.z - h.center.z) > radius * 0.6) h.center.copy(p.pos);
    const anyTarget = this.huntTargetExists(ids, stones);
    if (anyTarget) this.noTargetT = 0;
    else {
      this.noTargetT += dt;
      if (this.noTargetT > 4) { this.noTargetT = 0; h.center.copy(p.pos); }
    }
    this.setStatus(status ?? (anyTarget ? 'Avlanıyor' : 'Düşman bekleniyor'));
    return null;
  }

  /** Oto kipte seyahat: hedefe A* rotasıyla yürü; takılırsa bir kez yeniden planla. */
  private autoRouteTo(obj: Objective, dt: number, status: string): RoutePoint | null {
    const p = this.game.player;
    if (this.objective?.key !== obj.key) {
      this.planTo(obj);
    } else if (this.goal) {
      // Aynı hedef: konumunu tazele (canlı hedef/düşen ganimet kayabilir).
      const moved = Math.hypot(obj.x - this.goal.x, obj.z - this.goal.z);
      this.goal = { x: obj.x, z: obj.z };
      this.stopDist = obj.stop;
      if (moved > 5) this.planTo(obj);
      else if (this.remaining.length) this.remaining[this.remaining.length - 1] = { x: obj.x, z: obj.z };
    } else {
      this.planTo(obj);
    }
    this.drivePlan();
    if (!this.active) return null;
    this.setStatus(status);
    this.trimRoute();
    const movedSq = p.pos.distanceToSquared(this.lastPos);
    this.lastPos.copy(p.pos);
    if (this.remaining.length && movedSq < 0.0004) this.stallT += dt;
    else this.stallT = 0;
    if (this.stallT > 2) {
      this.stallT = 0;
      if (this.stallCount === 0) { this.stallCount = 1; this.planTo(obj); }
      else { this.skipObjective(obj); return null; } // oto kipte vazgeçmek yerine hedefi atla
    }
    if (!this.remaining.length && !this.plan && this.goal && this.replanT <= 0) {
      this.replanT = 1.5;
      this.planTo(obj);
    }
    while (this.remaining.length && Math.hypot(p.pos.x - this.remaining[0].x, p.pos.z - this.remaining[0].z) <= 0.4) this.remaining.shift();
    this.tickMarks(dt);
    // Rota tükendiyse hedefe doğrudan yönel (yakın mesafe, düz yürüyüş).
    return this.remaining[0] ?? this.goal;
  }

  // ---------------------------------------------------------- oto zekâ yardımcıları

  /** Takılma sayılan hedefi 60 sn'liğine atlama listesine alır; çözümleme alternatif seçer. */
  private skipObjective(obj: Objective) {
    const g = this.game, now = g.time;
    for (const [k, u] of this.skipped) if (u <= now) this.skipped.delete(k); // süresi dolanları ayıkla
    this.skipped.set(obj.enemy ?? obj.key, now + 60);
    g.events.emit('log', { msg: `Hedefe ulaşılamadı, şimdilik atlanıyor: ${obj.label}`, cls: 'warn' });
    this.autoPhaseReset();
  }

  /** Düşman örneği atlama listesinde mi? (süresi dolmuşsa listeden düşer) */
  private isSkipped(e: Enemy) {
    const until = this.skipped.get(e);
    if (until === undefined) return false;
    if (until > this.game.time) return true;
    this.skipped.delete(e);
    return false;
  }

  /** Hedef anahtarı (bölge/ganimet/npc) atlama listesinde mi? */
  private keySkipped(key: string) {
    const until = this.skipped.get(key);
    if (until === undefined) return false;
    if (until > this.game.time) return true;
    this.skipped.delete(key);
    return false;
  }

  /** Savaş görevi hedefinin asgari seviyesi (preparasyon eşiği için); savaşsız türlerde null. */
  private combatNeed(q: QuestDef): number | null {
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
  private grindZone(level: number, isSkip?: (z: SpawnZone) => boolean): SpawnZone | null {
    const p = this.game.player;
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
  private retreat(): RoutePoint | null {
    const g = this.game, p = g.player;
    this.setStatus('Geri çekiliyor');
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
    if (!threat) { this.endHunt(); return null; } // tehdit kalmadı: dur ve can doldur

    const dx = p.pos.x - threat.pos.x, dz = p.pos.z - threat.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let flee: RoutePoint | null = null;
    for (const ang of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const x = p.pos.x + ((dx * c - dz * s) / d) * 14;
      const z = p.pos.z + ((dx * s + dz * c) / d) * 14;
      if (this.clearAt(x, z)) { flee = { x, z }; break; }
    }
    if (flee) { this.endHunt(); return flee; }

    // Sıkışık: saldırgan menzildeyse aynı görev filtresiyle karşı koy.
    const reach = p.cls.range * 0.85 + threat.radius + 0.3;
    if (bd <= reach * reach) {
      let ids: ReadonlySet<string> | null = null, stones = false;
      const q = g.quests.current;
      if (q) {
        const handler = questHandler(q.kind);
        ids = handler.huntIds ? handler.huntIds(q, g) : null;
        stones = handler.huntStones?.(q) ?? false;
      }
      if (!g.autoHunt.enabled) {
        g.autoHunt.questBegin(this.autoV.set(p.pos.x, p.pos.y, p.pos.z), ids, stones);
        this.hunt = true;
      }
    }
    return null; // dört yanı kapalı ya da savaşıyor: yerinde kal; ölüm zinciri devralır
  }

  // ------------------------------------------------------------------ iz işaretleri

  private tickMarks(dt: number) {
    this.markT -= dt;
    if (this.markT > 0) return;
    this.markT = 0.125; // en çok 8 Hz
    this.updateMarks();
  }

  /** Görünen işaret sayısı (tanılama/test). */
  get markCount() { return this.marks && this.marks.visible ? this.marks.count : 0; }

  private ensureMarks() {
    if (this.marks) return;
    // +Z yönüne bakan yassı şevron
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.42, 0, -0.35, 0, 0, 0.55, 0, 0, -0.02,
      0, 0, 0.55, 0.42, 0, -0.35, 0, 0, -0.02,
    ]), 3));
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf0c040, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.marks = new THREE.InstancedMesh(geo, mat, MARK_COUNT);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 4;
    this.marks.count = 0;
    this.marks.visible = false;
    this.game.scene.add(this.marks);
  }

  /** Kalan rota üzerinde ~2.75 m aralıklarla şevronları diz. */
  private updateMarks() {
    this.ensureMarks();
    const m = this.marks!;
    const g = this.game, p = g.player;
    const pts = this.remaining;
    let count = 0;
    if (this.active && pts.length) {
      let ax = p.pos.x, az = p.pos.z;
      let carry = MARK_SPACING * 0.6;
      for (let i = 0; i < pts.length && count < MARK_COUNT; i++) {
        const bx = pts[i].x, bz = pts[i].z;
        const dx = bx - ax, dz = bz - az;
        let len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const ux = dx / len, uz = dz / len;
        this.dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        while (len >= carry && count < MARK_COUNT) {
          ax += ux * carry; az += uz * carry;
          this.dummy.position.set(ax, g.terrain.getHeight(ax, az) + 0.12, az);
          this.dummy.updateMatrix();
          m.setMatrixAt(count++, this.dummy.matrix);
          len -= carry;
          carry = MARK_SPACING;
        }
        carry -= len;
        ax = bx; az = bz;
      }
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    m.visible = count > 0;
  }
}
