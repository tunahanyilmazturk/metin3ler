import { Vector3 } from 'three';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Game } from '../game';

export interface AutoHuntSettings {
  radius: number;
  collectItems: boolean;
  useSkills: boolean;
  usePotions: boolean;
  hpThreshold: number;
  mpThreshold: number;
  attackBosses: boolean;
}

export interface AutoHuntDirective {
  target: Enemy | null;
  moveTo: { x: number; z: number } | null;
  attack: boolean;
}

const KEY = 'gokdemir-autohunt-v1';
export const AUTO_HUNT_RADII = [8, 12, 16, 20, 24] as const;
export const AUTO_HUNT_THRESHOLDS = [20, 30, 40, 50, 60, 70, 80] as const;
const DEFAULT_SETTINGS: AutoHuntSettings = {
  radius: 16,
  collectItems: true,
  useSkills: true,
  usePotions: true,
  hpThreshold: 50,
  mpThreshold: 30,
  attackBosses: false,
};

/** Yerel tek oyunculu oto av: etkinleştirildiği noktanın çevresinde kalır. */
export class AutoHunt {
  readonly center = new Vector3();
  readonly settings: AutoHuntSettings;
  enabled = false;
  status = 'Kapalı';

  private skillWait = 0;
  private nextSkill = 0;

  constructor(private game: Game) {
    this.settings = this.loadSettings();
  }

  toggle(player: Player) {
    if (this.enabled) {
      this.stop('Oto av kapatıldı.');
      return;
    }
    if (!player.alive) return;
    player.intent = null;
    this.center.copy(player.pos);
    this.enabled = true;
    this.skillWait = 0;
    this.setStatus('Bölge taranıyor');
    this.game.events.emit('log', { msg: `Oto av açıldı · ${this.settings.radius} m alan.`, cls: 'good' });
  }

  stop(message?: string) {
    if (!this.enabled) return;
    this.enabled = false;
    this.skillWait = 0;
    this.setStatus('Kapalı');
    if (message) this.game.events.emit('log', { msg: message, cls: 'warn' });
  }

  setSetting(key: keyof AutoHuntSettings, value: string | boolean, player: Player) {
    switch (key) {
      case 'radius':
        if (typeof value !== 'string' || !AUTO_HUNT_RADII.includes(Number(value) as typeof AUTO_HUNT_RADII[number])) return;
        this.settings.radius = Number(value);
        if (this.enabled) this.center.copy(player.pos);
        break;
      case 'hpThreshold':
      case 'mpThreshold':
        if (typeof value !== 'string' || !AUTO_HUNT_THRESHOLDS.includes(Number(value) as typeof AUTO_HUNT_THRESHOLDS[number])) return;
        this.settings[key] = Number(value);
        break;
      case 'collectItems':
      case 'useSkills':
      case 'usePotions':
      case 'attackBosses':
        if (typeof value !== 'boolean') return;
        this.settings[key] = value;
        break;
    }
    this.saveSettings();
    this.game.events.emit('autoHuntChanged');
  }

  update(dt: number, player: Player, manualOverride: boolean): AutoHuntDirective | null {
    if (!this.enabled) return null;
    if (!player.alive) {
      this.stop();
      return null;
    }
    this.skillWait = Math.max(0, this.skillWait - dt);

    const fromCenter = Math.hypot(player.pos.x - this.center.x, player.pos.z - this.center.z);
    if (fromCenter > this.settings.radius + 0.65) {
      this.stop('Oto av alanından çıktın; oto av kapatıldı.');
      return null;
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
      const reach = player.cls.range * 0.85 + target.radius;
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

    if (this.settings.collectItems) {
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
    if (player.hp / player.maxHp <= this.settings.hpThreshold / 100 && player.canUsePotion('hp')) {
      player.usePotion('hp');
    } else if (player.mp / player.maxMp <= this.settings.mpThreshold / 100 && player.canUsePotion('mp')) {
      player.usePotion('mp');
    }
  }

  private findTarget(player: Player): Enemy | null {
    const isAllowed = (enemy: Enemy) => enemy.alive &&
      (this.settings.attackBosses || !enemy.def.boss) &&
      Math.hypot(enemy.pos.x - this.center.x, enemy.pos.z - this.center.z) <= this.settings.radius;
    if (player.target && isAllowed(player.target)) return player.target;

    let best: Enemy | null = null;
    let bestDistance = Infinity;
    for (const enemy of this.game.enemies) {
      if (!isAllowed(enemy)) continue;
      const distance = Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  private trySkill(player: Player, target: Enemy) {
    const skills = player.skills;
    for (let offset = 0; offset < skills.length; offset++) {
      const i = (this.nextSkill + offset) % skills.length;
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
        useful = distance <= (skill.radius ?? player.cls.range) + target.radius;
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

  private setStatus(status: string) {
    if (this.status === status) return;
    this.status = status;
    this.game.events.emit('autoHuntChanged');
  }

  private loadSettings(): AutoHuntSettings {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
      const data = value as Record<string, unknown>;
      return {
        radius: AUTO_HUNT_RADII.includes(data.radius as typeof AUTO_HUNT_RADII[number]) ? data.radius as number : DEFAULT_SETTINGS.radius,
        collectItems: typeof data.collectItems === 'boolean' ? data.collectItems : DEFAULT_SETTINGS.collectItems,
        useSkills: typeof data.useSkills === 'boolean' ? data.useSkills : DEFAULT_SETTINGS.useSkills,
        usePotions: typeof data.usePotions === 'boolean' ? data.usePotions : DEFAULT_SETTINGS.usePotions,
        hpThreshold: AUTO_HUNT_THRESHOLDS.includes(data.hpThreshold as typeof AUTO_HUNT_THRESHOLDS[number]) ? data.hpThreshold as number : DEFAULT_SETTINGS.hpThreshold,
        mpThreshold: AUTO_HUNT_THRESHOLDS.includes(data.mpThreshold as typeof AUTO_HUNT_THRESHOLDS[number]) ? data.mpThreshold as number : DEFAULT_SETTINGS.mpThreshold,
        attackBosses: typeof data.attackBosses === 'boolean' ? data.attackBosses : DEFAULT_SETTINGS.attackBosses,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* depolama kapalı olabilir */ }
  }
}
