import * as THREE from 'three';
import { Vector3 } from 'three';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Game } from '../game';

export type HuntPriority = 'near' | 'weak' | 'strong';

export interface AutoHuntSettings {
  radius: number;
  collectItems: boolean;
  useSkills: boolean;
  usePotions: boolean;
  hpThreshold: number;
  mpThreshold: number;
  attackBosses: boolean;
  attackStones: boolean;
  preferAggro: boolean;
  restBelow: number;
  priority: HuntPriority;
  autoRespawn: boolean;
  skillMask: boolean[];
}

export interface AutoHuntDirective {
  target: Enemy | null;
  moveTo: { x: number; z: number } | null;
  attack: boolean;
}

export interface HuntStats {
  kills: number;
  exp: number;
  gold: number;
  items: number;
  started: number;
}

const KEY = 'gokdemir-autohunt-v2';
export const AUTO_HUNT_RADII = [8, 12, 16, 20, 24] as const;
export const AUTO_HUNT_THRESHOLDS = [20, 30, 40, 50, 60, 70, 80] as const;
export const AUTO_HUNT_PRIORITIES: [HuntPriority, string][] = [
  ['near', 'En yakın'],
  ['weak', 'En zayıf'],
  ['strong', 'En güçlü'],
];
const DEFAULT_SETTINGS: AutoHuntSettings = {
  radius: 16,
  collectItems: true,
  useSkills: true,
  usePotions: true,
  hpThreshold: 50,
  mpThreshold: 30,
  attackBosses: false,
  attackStones: false,
  preferAggro: true,
  restBelow: 0,
  priority: 'near',
  autoRespawn: false,
  skillMask: [true, true, true, true],
};

/** Yerel tek oyunculu oto av: etkinleştirildiği noktanın çevresinde kalır. */
export class AutoHunt {
  readonly center = new Vector3();
  readonly settings: AutoHuntSettings;
  enabled = false;
  status = 'Kapalı';
  stats: HuntStats = { kills: 0, exp: 0, gold: 0, items: 0, started: 0 };
  /** Görev avı filtresi: yalnızca bu düşman türleri hedeflenir (null: kısıtlama yok). */
  questIds: ReadonlySet<string> | null = null;
  /** Görev filtresi etkinken lanetli taşlara da izin ver. */
  questStones = false;
  /** collectItems ayarından bağımsız ganimet toplama (topla görevleri). */
  forceCollect = false;

  private skillWait = 0;
  private nextSkill = 0;
  private returning = false;
  private respawnTimer = -1;
  private potionWarnAt = -99;
  private stuckT = 0;
  private lastPos = new Vector3();
  private blacklist = new Map<Enemy, number>();
  private ring: THREE.LineLoop | null = null;

  constructor(private game: Game) {
    this.settings = this.loadSettings();
    game.events.on('enemyKilled', (e: Enemy) => {
      if (!this.enabled) return;
      this.stats.kills++;
      const diff = game.player.level - e.def.level;
      const scale = diff > 10 ? 0.25 : diff > 6 ? 0.6 : 1;
      this.stats.exp += Math.round(e.def.exp * scale);
    });
    game.events.on('lootPicked', (d: { gold: number; item: unknown }) => {
      if (!this.enabled) return;
      this.stats.gold += d.gold;
      if (d.item) this.stats.items++;
    });
  }

  toggle(player: Player) {
    if (this.enabled) {
      this.stop('Oto av kapatıldı.');
      return;
    }
    if (!player.alive) return;
    this.game.questNav.stop();
    player.intent = null;
    this.begin(player.pos);
    this.game.events.emit('log', { msg: `Oto av açıldı · ${this.settings.radius} m alan.`, cls: 'good' });
  }

  private begin(pos: Vector3) {
    this.center.copy(pos);
    this.enabled = true;
    this.returning = false;
    this.respawnTimer = -1;
    this.skillWait = 0;
    this.stuckT = 0;
    this.blacklist.clear();
    this.stats = { kills: 0, exp: 0, gold: 0, items: 0, started: this.game.time };
    this.lastPos.copy(pos);
    this.refreshRing();
    this.setStatus('Bölge taranıyor');
  }

  /** Görev filtresini ayarlar/temizler (ids null: kısıtlama yok; stones: lanetli taşlara izin). */
  setQuestFilter(ids: ReadonlySet<string> | null, stones: boolean) {
    this.questIds = ids;
    this.questStones = stones;
  }

  /** Görev zinciri sürüşü: avı verilen noktada başlatır ve görev filtresini kurar. */
  questBegin(pos: Vector3, ids: ReadonlySet<string> | null, stones: boolean) {
    this.begin(pos);
    this.setQuestFilter(ids, stones);
  }

  stop(message?: string) {
    this.questIds = null;
    this.questStones = false;
    this.forceCollect = false;
    if (!this.enabled) return;
    this.enabled = false;
    this.returning = false;
    this.respawnTimer = -1;
    this.skillWait = 0;
    if (this.ring) this.ring.visible = false;
    this.setStatus('Kapalı');
    if (message) this.game.events.emit('log', { msg: message, cls: 'warn' });
  }

  setSetting(key: keyof AutoHuntSettings, value: string | boolean, player: Player) {
    switch (key) {
      case 'radius':
        if (typeof value !== 'string' || !AUTO_HUNT_RADII.includes(Number(value) as typeof AUTO_HUNT_RADII[number])) return;
        this.settings.radius = Number(value);
        if (this.enabled) { this.center.copy(player.pos); this.refreshRing(); }
        break;
      case 'hpThreshold':
      case 'mpThreshold':
        if (typeof value !== 'string' || !AUTO_HUNT_THRESHOLDS.includes(Number(value) as typeof AUTO_HUNT_THRESHOLDS[number])) return;
        this.settings[key] = Number(value);
        break;
      case 'restBelow':
        if (typeof value !== 'string' || (Number(value) !== 0 && !AUTO_HUNT_THRESHOLDS.includes(Number(value) as typeof AUTO_HUNT_THRESHOLDS[number]))) return;
        this.settings.restBelow = Number(value);
        break;
      case 'priority':
        if (typeof value !== 'string' || !AUTO_HUNT_PRIORITIES.some(([k]) => k === value)) return;
        this.settings.priority = value as HuntPriority;
        break;
      case 'collectItems':
      case 'useSkills':
      case 'usePotions':
      case 'attackBosses':
      case 'attackStones':
      case 'preferAggro':
      case 'autoRespawn':
        if (typeof value !== 'boolean') return;
        this.settings[key] = value;
        break;
      default:
        return;
    }
    this.saveSettings();
    this.game.events.emit('autoHuntChanged');
  }

  setSkillEnabled(i: number, on: boolean) {
    if (i < 0 || i >= this.settings.skillMask.length) return;
    this.settings.skillMask[i] = on;
    this.saveSettings();
    this.game.events.emit('autoHuntChanged');
  }

  /** Oturum süresi (saniye). */
  elapsed() { return this.enabled ? this.game.time - this.stats.started : 0; }

  update(dt: number, player: Player, manualOverride: boolean): AutoHuntDirective | null {
    if (!this.enabled) return null;

    if (!player.alive) {
      if (this.settings.autoRespawn) {
        if (this.respawnTimer < 0) {
          this.respawnTimer = 2.8;
          this.setStatus('Dirilmeyi bekliyor');
        }
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0 && !player.alive) {
          player.respawn();
          this.returning = true;
          this.respawnTimer = -1;
          this.setStatus('Av alanına dönüyor');
          this.game.events.emit('log', { msg: 'Oto av: av alanına geri dönülüyor.', cls: 'good' });
        }
        return null;
      }
      this.stop();
      return null;
    }

    this.skillWait = Math.max(0, this.skillWait - dt);

    const fromCenter = Math.hypot(player.pos.x - this.center.x, player.pos.z - this.center.z);

    // Dirildikten sonra av alanına geri yürüme
    if (this.returning) {
      if (manualOverride) {
        this.returning = false;
        this.stop('Oto av kontrolü sana bıraktı.');
        return null;
      }
      if (fromCenter <= this.settings.radius * 0.55) {
        this.returning = false;
        this.setStatus('Bölge taranıyor');
        this.game.events.emit('log', { msg: 'Oto av: av alanına varıldı, av devam ediyor.', cls: 'good' });
      } else {
        this.tryPotion(player);
        return { target: null, moveTo: { x: this.center.x, z: this.center.z }, attack: false };
      }
    }

    if (fromCenter > this.settings.radius + 0.65) {
      this.stop('Oto av alanından çıktın; oto av kapatıldı.');
      return null;
    }

    // Takılma tespiti: hareket emri varken yerinde sayıyorsak hedefi kara listeye al
    const movedSq = player.pos.distanceToSquared(this.lastPos);
    this.lastPos.copy(player.pos);
    if (movedSq < 0.0004 && !player.attackActive) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 3 && player.target) {
      this.blacklist.set(player.target, this.game.time + 30);
      player.target = null;
      this.stuckT = 0;
      this.game.events.emit('log', { msg: 'Oto av: ulaşılamayan hedef atlandı.', cls: 'warn' });
    }

    this.tryPotion(player);
    if (manualOverride) {
      this.setStatus('Elle kontrol');
      return null;
    }

    const target = this.findTarget(player);
    if (target) {
      const dx = target.pos.x - player.pos.x;
      const dz = target.pos.z - player.pos.z;
      const distance = Math.hypot(dx, dz);
      const reach = player.attackRange * 0.85 + target.radius;
      if (distance > reach) {
        this.setStatus('Hedefe ilerliyor');
        return { target, moveTo: { x: target.pos.x, z: target.pos.z }, attack: false };
      }

      player.target = target;
      if (this.settings.useSkills && player.canAutoCast && this.skillWait <= 0 && this.trySkill(player, target)) {
        this.skillWait = 0.55;
        this.setStatus('Yetenek kullanıyor');
        return { target, moveTo: null, attack: false };
      }
      if (this.skillWait > 0 || (player.model.attacking && !player.attackActive)) {
        this.setStatus('Saldırı hazırlığı');
        return { target, moveTo: null, attack: false };
      }
      this.setStatus('Saldırıyor');
      return { target, moveTo: null, attack: true };
    }

    // Dinlenme: can düşükse ve kimse saldırmıyorsa yeni hedef alma
    if (this.settings.restBelow > 0 && player.hp / player.maxHp <= this.settings.restBelow / 100) {
      this.setStatus('Dinleniyor');
      if (fromCenter > 0.8) return { target: null, moveTo: { x: this.center.x, z: this.center.z }, attack: false };
      return { target: null, moveTo: null, attack: false };
    }

    if (this.settings.collectItems || this.forceCollect) {
      const drop = this.game.loot.nearestDrop(player.pos, this.center, this.settings.radius);
      if (drop) {
        this.setStatus('Ganimet topluyor');
        return { target: null, moveTo: drop, attack: false };
      }
    }

    if (fromCenter > 0.8) {
      this.setStatus('Bölgeye dönüyor');
      return { target: null, moveTo: { x: this.center.x, z: this.center.z }, attack: false };
    }
    this.setStatus('Bölge bekleniyor');
    return { target: null, moveTo: null, attack: false };
  }

  private tryPotion(player: Player) {
    if (!this.settings.usePotions) return;
    if (player.hp / player.maxHp <= this.settings.hpThreshold / 100) {
      if (player.canUsePotion('hp')) player.usePotion('hp');
      else if (player.potionCount('hp') === 0 && this.game.time > this.potionWarnAt) {
        this.potionWarnAt = this.game.time + 20;
        this.game.events.emit('log', { msg: 'Oto av: can iksirin kalmadı!', cls: 'warn' });
      }
    } else if (player.mp / player.maxMp <= this.settings.mpThreshold / 100) {
      if (player.canUsePotion('mp')) player.usePotion('mp');
    }
  }

  private isAllowed(enemy: Enemy, inFight: boolean) {
    if (!enemy.alive) return false;
    const bl = this.blacklist.get(enemy);
    if (bl !== undefined) {
      if (bl > this.game.time) return false;
      this.blacklist.delete(enemy);
    }
    const aggroed = enemy.state === 'chase' || enemy.state === 'attack';
    if (inFight && !aggroed) return false; // dinlenme: sadece saldıranlarla savaş
    const within = Math.hypot(enemy.pos.x - this.center.x, enemy.pos.z - this.center.z) <= this.settings.radius;
    if (this.questIds) {
      // Görev hedefi taş/boss ayarlarını es geçer; hedef dışı yalnızca öz-savunmada.
      const questTarget = this.questIds.has(enemy.def.id) || (enemy.isStone && this.questStones);
      return (questTarget || aggroed) && within;
    }
    if (enemy.isStone && !this.settings.attackStones) return false;
    if (enemy.def.boss && !this.settings.attackBosses && !aggroed) return false;
    return within;
  }

  private findTarget(player: Player): Enemy | null {
    const resting = this.settings.restBelow > 0 && player.hp / player.maxHp <= this.settings.restBelow / 100;
    const inFight = resting; // dinlenirken yalnızca bize saldıranları hedefle
    if (player.target && this.isAllowed(player.target, inFight)) return player.target;

    // Önce bize saldıranlar (tercih edilirse)
    let pool = this.game.enemies.filter((e) => this.isAllowed(e, inFight));
    if (this.settings.preferAggro) {
      const aggro = pool.filter((e) => e.state === 'chase' || e.state === 'attack');
      if (aggro.length) pool = aggro;
    }
    if (!pool.length) return null;

    const px = player.pos.x, pz = player.pos.z;
    const dist = (e: Enemy) => Math.hypot(e.pos.x - px, e.pos.z - pz);
    switch (this.settings.priority) {
      case 'weak': return pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
      case 'strong': return pool.reduce((a, b) => (a.def.level >= b.def.level ? a : b));
      default: return pool.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
    }
  }

  private trySkill(player: Player, target: Enemy) {
    const skills = player.skills;
    for (let offset = 0; offset < skills.length; offset++) {
      const i = (this.nextSkill + offset) % skills.length;
      if (!this.settings.skillMask[i]) continue;
      const skill = skills[i];
      if (player.level < skill.level || player.cooldowns[i] > 0 || player.mp < skill.mp) continue;
      if (skill.type === 'dash') continue;
      if (skill.type === 'buff' && player.buffs.some((buff) => buff.id === skill.id)) continue;

      const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
      let useful = false;
      if (skill.type === 'aoe') {
        useful = this.game.enemies.some((enemy) => enemy.alive &&
          Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z) <= (skill.radius ?? 0) + enemy.radius &&
          Math.hypot(enemy.pos.x - this.center.x, enemy.pos.z - this.center.z) <= this.settings.radius);
      } else if (skill.type === 'strike') {
        useful = distance <= (skill.radius ?? player.attackRange) + target.radius;
      } else if (skill.type === 'projectile' || skill.type === 'targetAoe') {
        useful = distance <= 24;
      } else if (skill.type === 'buff') {
        useful = distance <= Math.max(6, this.settings.radius * 0.65);
      }
      if (!useful) continue;

      player.useSkill(i);
      this.nextSkill = (i + 1) % skills.length;
      return true;
    }
    return false;
  }

  /** Av alanı sınırını arazi üzerinde gösteren altın halka. */
  private refreshRing() {
    if (!this.enabled) return;
    const SEG = 96;
    const pts: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = this.center.x + Math.cos(a) * this.settings.radius;
      const z = this.center.z + Math.sin(a) * this.settings.radius;
      pts.push(x, this.game.terrain.getHeight(x, z) + 0.3, z);
    }
    if (!this.ring) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.ring = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xd9b56c, transparent: true, opacity: 0.6 }));
      this.ring.frustumCulled = false;
      this.game.scene.add(this.ring);
    } else {
      this.ring.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    }
    this.ring.visible = true;
  }

  private setStatus(status: string) {
    if (this.status === status) return;
    this.status = status;
    this.game.events.emit('autoHuntChanged');
  }

  private loadSettings(): AutoHuntSettings {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, skillMask: [...DEFAULT_SETTINGS.skillMask] };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS, skillMask: [...DEFAULT_SETTINGS.skillMask] };
      const d = value as Record<string, unknown>;
      const mask = Array.isArray(d.skillMask) ? d.skillMask.slice(0, 4).map((v) => v !== false) : [...DEFAULT_SETTINGS.skillMask];
      while (mask.length < 4) mask.push(true);
      return {
        radius: AUTO_HUNT_RADII.includes(d.radius as typeof AUTO_HUNT_RADII[number]) ? d.radius as number : DEFAULT_SETTINGS.radius,
        collectItems: typeof d.collectItems === 'boolean' ? d.collectItems : DEFAULT_SETTINGS.collectItems,
        useSkills: typeof d.useSkills === 'boolean' ? d.useSkills : DEFAULT_SETTINGS.useSkills,
        usePotions: typeof d.usePotions === 'boolean' ? d.usePotions : DEFAULT_SETTINGS.usePotions,
        hpThreshold: AUTO_HUNT_THRESHOLDS.includes(d.hpThreshold as typeof AUTO_HUNT_THRESHOLDS[number]) ? d.hpThreshold as number : DEFAULT_SETTINGS.hpThreshold,
        mpThreshold: AUTO_HUNT_THRESHOLDS.includes(d.mpThreshold as typeof AUTO_HUNT_THRESHOLDS[number]) ? d.mpThreshold as number : DEFAULT_SETTINGS.mpThreshold,
        attackBosses: typeof d.attackBosses === 'boolean' ? d.attackBosses : DEFAULT_SETTINGS.attackBosses,
        attackStones: typeof d.attackStones === 'boolean' ? d.attackStones : DEFAULT_SETTINGS.attackStones,
        preferAggro: typeof d.preferAggro === 'boolean' ? d.preferAggro : DEFAULT_SETTINGS.preferAggro,
        restBelow: AUTO_HUNT_THRESHOLDS.includes(d.restBelow as typeof AUTO_HUNT_THRESHOLDS[number]) || d.restBelow === 0 ? d.restBelow as number : DEFAULT_SETTINGS.restBelow,
        priority: AUTO_HUNT_PRIORITIES.some(([k]) => k === d.priority) ? d.priority as HuntPriority : DEFAULT_SETTINGS.priority,
        autoRespawn: typeof d.autoRespawn === 'boolean' ? d.autoRespawn : DEFAULT_SETTINGS.autoRespawn,
        skillMask: mask,
      };
    } catch {
      return { ...DEFAULT_SETTINGS, skillMask: [...DEFAULT_SETTINGS.skillMask] };
    }
  }

  private saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* depolama kapalı olabilir */ }
  }
}
