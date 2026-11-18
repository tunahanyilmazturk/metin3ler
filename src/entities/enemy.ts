import * as THREE from 'three';
import { dampAngle, rand } from '../core/utils';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { DIFFICULTY } from '../data/balance';
/** Tüm düşmanların paylaştığı zemin halkası geometrisi. */const GROUND_RING = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
import { createEnemyModel } from './creatures';
import { CreatureModel, disposeModel } from './model';
import type { Game } from '../game';
import type { SpawnZone } from '../data/world';

type State = 'idle' | 'wander' | 'chase' | 'attack' | 'return' | 'dead';

/** Yapay zekâlı düşman (ve sabit duran Lanetli Taş). */
export class Enemy {
  pos = new THREE.Vector3();
  home = new THREE.Vector3();
  yaw = Math.random() * Math.PI * 2;
  hp: number;
  maxHp: number;
  state: State = 'idle';
  model: CreatureModel;
  removed = false;
  /** Son hasar alışından beri geçen süre (isim plakası için) */
  sinceHit = 99;
  stunned = 0;
  slowed = 0;
  readonly isStone: boolean;
  private timer = rand(0, 4);
  private attackCd = 0;
  private hitPending = -1;
  private deadT = 0;
  private wander = new THREE.Vector3();
  private speedNow = 0;
  private wavesDone = 0;
  /** Vuruş halkası: her vuruşta genişleyip söner. */
  private hitRing: THREE.Mesh;
  private hitT = 1;
  /** Patronların sürekli altın aurası. */
  private aura: THREE.Mesh | null = null;
  private auraT = 0;
  private fxTimer = 0;

  constructor(private game: Game, public def: EnemyDef, x: number, z: number, public zone: SpawnZone | null) {
    this.hp = this.maxHp = Math.round(def.hp * DIFFICULTY.enemyHp);
    this.isStone = !!def.stone;
    this.model = createEnemyModel(def.id, game.tex);
    this.pos.set(x, game.terrain.getHeight(x, z), z);
    this.home.copy(this.pos);
    this.model.root.position.copy(this.pos);
    game.scene.add(this.model.root);
    // Zemin halkaları: vuruşta parlama, patronlarda kalıcı aura (malzeme paylaşımına dokunmaz)
    this.hitRing = new THREE.Mesh(GROUND_RING, new THREE.MeshBasicMaterial({ color: 0xff7040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.hitRing.position.y = 0.06;
    this.model.root.add(this.hitRing);
    if (def.boss) {
      this.aura = new THREE.Mesh(GROUND_RING, new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.aura.position.y = 0.04;
      this.aura.scale.setScalar(def.radius * 2.6);
      this.model.root.add(this.aura);
    }
  }

  /** Halka ve aura animasyonu: vuruşta genişleyip söner, patron aurası nabız atar. */
  private updateRing(dt: number) {
    this.hitT = Math.min(1, this.hitT + dt / 0.35);
    const k = this.hitT;
    const hm = this.hitRing.material as THREE.MeshBasicMaterial;
    this.hitRing.scale.setScalar(this.def.radius * (1.5 + 1.1 * k));
    hm.opacity = this.alive ? 0.85 * (1 - k) * (1 - k) : 0;
    if (this.aura) {
      this.auraT += dt;
      (this.aura.material as THREE.MeshBasicMaterial).opacity = this.alive ? 0.22 + 0.12 * Math.sin(this.auraT * 2.5) : 0;
    }
  }

  get alive() { return this.state !== 'dead'; }
  get radius() { return this.def.radius; }
  get height() { return this.model.height; }

  private moveToward(tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speedNow = 0; return; }
    if (this.slowed > 0) speed *= 0.45;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 9, dt);
    const nx = this.pos.x + (dx / d) * speed * dt;
    const nz = this.pos.z + (dz / d) * speed * dt;
    if (this.game.terrain.walkable(nx, nz)) {
      this.pos.x = nx;
      this.pos.z = nz;
      this.game.colliders.resolve(this.pos, this.radius * 0.7);
    }
    this.speedNow = speed;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.player;
    this.sinceHit += dt;
    this.updateRing(dt);
    if (this.state === 'dead') {
      this.deadT += dt;
      this.model.update(dt, 0);
      if (this.deadT > 3.2) this.model.root.position.y -= dt * 0.7;
      if (this.deadT > 5.5) {
        this.removed = true;
        disposeModel(this.model.root);
      }
      return;
    }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    if (this.isStone) {
      this.model.update(dt, 0);
      this.fxTimer -= dt;
      if (dist < 70 && this.fxTimer <= 0) {
        this.fxTimer = 0.12;
        g.particles.emit(this.pos, { count: 1, color: this.stoneColor(), speed: 0.4, up: 1.8, life: 2.2, size: 0.28, spread: 3 });
      }
      return;
    }

    this.slowed = Math.max(0, this.slowed - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.speedNow = 0;

    if (this.stunned > 0) {
      this.stunned -= dt;
    } else {
      switch (this.state) {
        case 'idle':
          this.timer -= dt;
          if (this.timer <= 0) {
            const a = Math.random() * Math.PI * 2, r = rand(3, 10);
            this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
            this.state = 'wander';
            this.timer = 6;
          }
          if (this.def.aggro > 0 && dist < this.def.aggro && p.alive) this.state = 'chase';
          break;
        case 'wander':
          this.timer -= dt;
          this.moveToward(this.wander.x, this.wander.z, this.def.speed * 0.3, dt);
          if (this.timer <= 0 || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 0.6) {
            this.state = 'idle';
            this.timer = rand(2, 7);
          }
          if (this.def.aggro > 0 && dist < this.def.aggro && p.alive) this.state = 'chase';
          break;
        case 'chase': {
          const leash = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
          if (!p.alive || leash > 55 || dist > 60) { this.state = 'return'; break; }
          if (dist <= this.def.range + 0.4) this.state = 'attack';
          else this.moveToward(p.pos.x, p.pos.z, this.def.speed, dt);
          break;
        }
        case 'attack':
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
          if (this.hitPending >= 0) {
            this.hitPending -= dt;
            if (this.hitPending < 0 && dist < this.def.range + 1.3 && p.alive) p.takeDamage(this.def.atk * DIFFICULTY.enemyAtk, this);
          } else if (!p.alive) {
            this.state = 'return';
          } else if (dist > this.def.range + 0.9) {
            this.state = 'chase';
          } else if (this.attackCd <= 0) {
            const dur = this.def.boss ? 0.9 : 0.6;
            this.model.attack(dur, Math.floor(Math.random() * 3));
            this.hitPending = dur * 0.48;
            this.attackCd = this.def.attackCd;
          }
          break;
        case 'return':
          this.moveToward(this.home.x, this.home.z, this.def.speed * 1.1, dt);
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
          if (Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) < 1.5) {
            this.state = 'idle';
            this.timer = rand(1, 4);
          }
          break;
      }
    }

    this.pos.y = g.terrain.getHeight(this.pos.x, this.pos.z);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.speedNow);
  }

  private stoneColor() {
    return this.def.id === 'stone_low' ? 0x9b4dff : this.def.id === 'stone_mid' ? 0xff4a2a : 0x2ad0ff;
  }

  /** Oyuncuya saldırmaya zorla (taş dalgaları ve sürü yardımı için). */
  provoke() {
    if (this.alive && !this.isStone && this.state !== 'attack') this.state = 'chase';
  }

  damage(amount: number, opts: { stun?: number; slow?: number } = {}) {
    if (!this.alive) return;
    const g = this.game;
    this.hp -= amount;
    this.sinceHit = 0;
    this.hitT = 0;
    this.model.hit();
    if (opts.stun && !this.def.boss) this.stunned = Math.max(this.stunned, opts.stun);
    if (opts.slow) this.slowed = Math.max(this.slowed, opts.slow);

    if (this.isStone) {
      // Her %20 can kaybında bir dalga yaratık çağırır
      const lost = 1 - Math.max(0, this.hp) / this.maxHp;
      const waves = Math.min(4, Math.floor(lost / 0.2));
      while (this.wavesDone < waves) {
        this.wavesDone++;
        this.spawnWave();
      }
    } else {
      this.provoke();
      for (const e of g.enemies) {
        if (e !== this && e.def.id === this.def.id && e.pos.distanceToSquared(this.pos) < 14 * 14) e.provoke();
      }
    }
    if (this.hp <= 0) this.die();
  }

  private spawnWave() {
    const g = this.game;
    const st = this.def.stone!;
    for (let i = 0; i < st.perWave; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(3.5, 6);
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (!g.terrain.walkable(x, z)) continue;
      const id = st.wave[Math.floor(Math.random() * st.wave.length)];
      const e = new Enemy(g, ENEMIES[id], x, z, null);
      e.state = 'chase';
      g.enemies.push(e);
      g.particles.emit(e.pos, { count: 16, color: this.stoneColor(), speed: 2.5, up: 3, life: 0.7, size: 0.5, spread: 1 });
    }
    g.effects.ring(this.pos, 6, this.stoneColor(), 0.6);
    g.events.emit('log', { msg: `${this.def.name} yaratık çağırdı!`, cls: 'warn' });
  }

  private die() {
    this.state = 'dead';
    this.hp = 0;
    this.model.die();
    if (this.isStone) {
      const p = this.pos.clone().setY(this.pos.y + 1.5);
      this.game.particles.emit(p, { count: 120, color: this.stoneColor(), color2: 0xffffff, speed: 11, up: 5, life: 1.4, size: 0.7, gravity: 9, spread: 2 });
      this.game.effects.ring(this.pos, 12, this.stoneColor(), 0.9);
      this.game.effects.flash(this.pos, this.stoneColor(), 200, 0.7);
      this.game.audio.boom();
      this.game.camera.addShake(0.7);
    }
    this.game.onEnemyKilled(this);
  }
}
