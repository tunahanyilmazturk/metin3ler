import * as THREE from 'three';
import { AudioSystem } from './core/audio';
import { Colliders } from './core/colliders';
import { EventBus } from './core/events';
import { Input } from './core/input';
import { nextFrame } from './core/utils';
import type { ClassId } from './data/classes';
import type { DayNightMode } from './data/settings';
import { NPCS, VILLAGE_H } from './data/world';
import { Enemy } from './entities/enemy';
import { Npc } from './entities/npc';
import { Player } from './entities/player';
import { Effects } from './fx/effects';
import { Particles } from './fx/particles';
import { CameraRig } from './render/cameraRig';
import { QUALITY, Quality, RenderPipeline } from './render/pipeline';
import { GameTextures, createTextures } from './render/textures';
import { Combat } from './systems/combat';
import { AutoHunt } from './systems/autoHunt';
import { Economy } from './systems/economy';
import { Loot } from './systems/loot';
import { QuestLog } from './systems/quests';
import { QuestNavigator } from './systems/questNavigator';
import { SaveData, SaveSystem } from './systems/save';
import { Spawner } from './systems/spawner';
import { Vault } from './systems/vault';
import { UI } from './ui/ui';
import { Environment } from './world/environment';
import { Terrain } from './world/terrain';
import { Vegetation } from './world/vegetation';
import { Village } from './world/village';
import { Water } from './world/water';

/** Tüm alt sistemleri bir araya getiren ana oyun nesnesi ve döngüsü. */
export class Game {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.4, 6000);
  events = new EventBus();
  audio = new AudioSystem();
  colliders = new Colliders();
  input: Input;
  pipeline: RenderPipeline;
  tex!: GameTextures;
  terrain!: Terrain;
  camera!: CameraRig;
  env!: Environment;
  water!: Water;
  vegetation!: Vegetation;
  village!: Village;
  particles!: Particles;
  effects!: Effects;
  combat!: Combat;
  autoHunt: AutoHunt;
  readonly questNav = new QuestNavigator(this);
  loot!: Loot;
  economy!: Economy;
  spawner!: Spawner;
  quests!: QuestLog;
  vault!: Vault;
  player!: Player;
  ui!: UI;
  enemies: Enemy[] = [];
  npcs: Npc[] = [];
  started = false;
  dayNightMode: DayNightMode = 'cycle';
  autoTrail = true;
  time = 0;
  fps = 60;
  private last = performance.now();
  private saveTimer = 0;
  private hitStopT = 0;
  /** Erişilebilirlik: sarsıntıyı azaltır. */
  reduceShake = false;
  /** Erişilebilirlik: flaş/parlama şiddetini düşürür. */
  reduceFlash = false;
  /** Erişilebilirlik: arayüzü büyütür. */
  largeText = false;
  /** Kamera fare hassasiyeti (0.5–2). */
  sensitivity = 1;
  /** Sağ üstte FPS sayacı. */
  showFps = false;

  /** Kısa vuruş donması: dünya anlık yavaşlar, vuruş daha ağır hissettirir. */
  hitStop(t: number) { this.hitStopT = Math.max(this.hitStopT, t); }
  private menuCenter = new THREE.Vector3(0, VILLAGE_H + 2, 0);
  private v = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.pipeline = new RenderPipeline(canvas, this.scene, this.cam);
    this.autoHunt = new AutoHunt(this);
  }

  /** Dünyayı adım adım üretir; her adımda yükleme çubuğunu günceller. */
  async build(progress: (p: number, label: string) => void) {
    const step = async (p: number, label: string) => { progress(p, label); await nextFrame(); await nextFrame(); };
    await step(0.05, 'Dokular üretiliyor…');
    this.tex = createTextures();
    await step(0.3, 'Arazi şekillendiriliyor…');
    this.terrain = new Terrain(this.tex);
    this.scene.add(this.terrain.mesh);
    this.camera = new CameraRig(this.cam, this.terrain);
    await step(0.5, 'Gökyüzü ve su hazırlanıyor…');
    this.env = new Environment(this.scene, this.pipeline.renderer);
    this.water = new Water(this.terrain);
    this.scene.add(this.water.mesh);
    await step(0.62, 'Ormanlar yeşeriyor…');
    this.vegetation = new Vegetation(this.terrain, this.tex, this.colliders);
    await this.vegetation.build((p) => progress(0.62 + p * 0.18, 'Ormanlar yeşeriyor…'));
    this.scene.add(this.vegetation.group);
    await step(0.8, 'Köy inşa ediliyor…');
    this.village = new Village(this.terrain, this.tex, this.colliders);
    this.scene.add(this.village.group);
    this.particles = new Particles(this.scene);
    this.effects = new Effects(this.scene);
    this.combat = new Combat(this);
    this.loot = new Loot(this);
    this.economy = new Economy(this);
    for (const n of NPCS) this.npcs.push(new Npc(this, n.id, n.name, n.title, n.x, n.z, n.yaw));
    await step(0.92, 'Yaratıklar uyanıyor…');
    this.spawner = new Spawner(this);
    this.ui = new UI(this);
    const settings = SaveSystem.loadSettings(window.matchMedia('(any-pointer: coarse)').matches ? 'low' : 'high');
    this.dayNightMode = settings.dayNight;
    this.audio.muted = settings.muted;
    this.audio.volume = settings.volume;
    this.reduceShake = settings.reduceShake;
    this.reduceFlash = settings.reduceFlash;
    this.effects.flashScale = settings.reduceFlash ? 0.25 : 1;
    this.largeText = settings.largeText;
    this.sensitivity = settings.sensitivity;
    this.camera.sensitivity = settings.sensitivity;
    this.showFps = settings.showFps;
    this.updateFpsCounter();
    document.getElementById('ui')?.classList.toggle('large-text', settings.largeText);
    this.camera.shakeScale = settings.reduceShake ? 0.3 : 1;
    this.autoTrail = settings.autoTrail;
    this.setQuality(settings.quality, false);
    this.env.setMode(this.dayNightMode, this.menuCenter);
    this.camera.setView(0.6, 0.32, 58);
    this.camera.snap(this.menuCenter);
    await step(1, 'Hazır');
    window.addEventListener('beforeunload', () => this.saveNow());
    this.frame();
  }

  setQuality(q: Quality, persist = true) {
    this.pipeline.setQuality(q);
    this.env.setShadowSize(QUALITY[q].shadow);
    this.vegetation.setGrassDensity(QUALITY[q].grass);
    if (persist) this.persistSettings();
  }

  setDayNightMode(mode: DayNightMode) {
    this.dayNightMode = mode;
    this.env.setMode(mode, this.started ? this.player.pos : this.menuCenter);
    this.persistSettings();
  }

  /** Otomatik görev izi: açınca hemen kurar, kapayınca etkin izi (yürüme hariç) durdurur. */
  setAutoTrail(on: boolean) {
    this.autoTrail = on;
    this.persistSettings();
    if (on) this.questNav.ensureTrail();
    else if (this.questNav.active && !this.questNav.walking) this.questNav.stop();
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
    this.persistSettings();
  }

  setVolume(v: number) {
    this.audio.setVolume(v);
    this.persistSettings();
  }

  setReduceShake(on: boolean) {
    this.reduceShake = on;
    this.camera.shakeScale = on ? 0.3 : 1;
    this.persistSettings();
  }

  setReduceFlash(on: boolean) {
    this.reduceFlash = on;
    this.effects.flashScale = on ? 0.25 : 1;
    this.persistSettings();
  }

  setLargeText(on: boolean) {
    this.largeText = on;
    document.getElementById('ui')?.classList.toggle('large-text', on);
    this.persistSettings();
  }

  setSensitivity(v: number) {
    this.sensitivity = Math.max(0.5, Math.min(2, v));
    this.camera.sensitivity = this.sensitivity;
    this.persistSettings();
  }

  setShowFps(on: boolean) {
    this.showFps = on;
    this.updateFpsCounter();
    this.persistSettings();
  }

  /** Tüm ayarları varsayılana döndürür (karakter ve ilerleme etkilenmez). */
  resetSettings() {
    this.setQuality(matchMedia('(any-pointer: coarse)').matches ? 'low' : 'high');
    this.setVolume(0.8);
    this.setMuted(false);
    this.setDayNightMode('cycle');
    this.setAutoTrail(true);
    this.setReduceShake(false);
    this.setReduceFlash(false);
    this.setLargeText(false);
    this.setSensitivity(1);
    this.setShowFps(false);
  }

  private updateFpsCounter() {
    let el = document.getElementById('fps-counter');
    if (!this.showFps) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'fps-counter';
      el.style.cssText = 'position:fixed;top:6px;right:8px;z-index:50;font:600 12px monospace;color:#9fe39f;pointer-events:none;text-shadow:0 1px 2px #000';
      document.body.appendChild(el);
    }
    el.textContent = `${Math.round(this.fps)} FPS`;
  }

  private persistSettings() {
    SaveSystem.saveSettings({
      quality: this.pipeline.quality,
      muted: this.audio.muted,
      volume: this.audio.volume,
      reduceShake: this.reduceShake,
      reduceFlash: this.reduceFlash,
      largeText: this.largeText,
      sensitivity: this.sensitivity,
      showFps: this.showFps,
      dayNight: this.dayNightMode,
      autoTrail: this.autoTrail,
    });
  }

  newGame(name: string, cls: ClassId) {
    SaveSystem.clear();
    this.begin(new Player(this, name, cls), undefined);
    this.events.emit('log', { msg: `Gökdemir diyarına hoş geldin, ${name}!`, cls: 'gold' });
    this.events.emit('log', { msg: 'Bilge Aksakal seni bekliyor. Yanına gidip [E] ile konuş.' });
  }

  continueGame(save: SaveData) {
    this.env.time = save.time;
    this.begin(new Player(this, save.player.name, save.player.cls, save.player), save);
    this.events.emit('log', { msg: `Tekrar hoş geldin, ${save.player.name}.`, cls: 'gold' });
  }

  private begin(player: Player, save?: SaveData) {
    this.player = player;
    this.quests = new QuestLog(this, save?.quest);
    this.vault = new Vault(this, save?.vault);
    this.camera.setView(0, 0.5, 11);
    this.camera.snap(player.pos);
    this.started = true;
    this.audio.unlock();
    this.audio.setMuted(this.audio.muted);
    this.ui.onGameStart();
  }

  saveNow() {
    if (!this.started) return;
    SaveSystem.save({ v: 1, player: this.player.serialize(), quest: this.quests.serialize(), time: this.env.time, vault: this.vault.serialize() });
  }

  interact(npc: Npc) {
    this.audio.click();
    this.events.emit('npcTalk', npc);
    this.ui.openNpc(npc);
  }

  /** Rehber ışınlaması: oyuncuyu güvenli bir bölge noktasına taşır. */
  teleport(x: number, z: number, cost = 0) {
    const p = this.player;
    if (!this.terrain.walkable(x, z)) {
      this.events.emit('log', { msg: 'Oraya gidilemiyor.', cls: 'warn' });
      return false;
    }
    if (cost > 0 && p.gold < cost) {
      this.events.emit('log', { msg: 'Yeterli akçen yok.', cls: 'warn' });
      this.audio.fail();
      return false;
    }
    if (cost > 0) p.gold -= cost;
    this.autoHunt.stop();
    this.questNav.stop();
    p.intent = null;
    p.target = null;
    p.pos.set(x, this.terrain.getHeight(x, z), z);
    this.effects.ring(p.pos.clone(), 1.4, 0x8fd4ff, 0.6);
    this.camera.snap(p.pos);
    this.audio.pickup();
    this.events.emit('changed');
    return true;
  }

  onEnemyKilled(e: Enemy) {
    const p = this.player;
    const diff = p.level - e.def.level;
    const scale = diff > 10 ? 0.25 : diff > 6 ? 0.6 : 1;
    this.events.emit('log', { msg: `${e.def.name} yenildi. +${Math.round(e.def.exp * scale)} tecrübe`, cls: e.def.boss || e.isStone ? 'gold' : '' });
    this.loot.dropFor(e);
    this.spawner.onDeath(e);
    if (p.target === e) p.target = null;
    this.events.emit('enemyKilled', e);
    p.gainExp(Math.round(e.def.exp * scale));
  }

  /** Ekran konumuna en yakın düşmanı/NPC'yi bulur. */
  private pickAt(mx: number, my: number) {
    const w = window.innerWidth, h = window.innerHeight;
    const k = h / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    let best: Enemy | Npc | null = null, bd = 1e9;
    const test = (o: Enemy | Npc) => {
      this.v.set(o.pos.x, o.pos.y + o.height * 0.5, o.pos.z);
      const dist = this.cam.position.distanceTo(this.v);
      this.v.project(this.cam);
      if (this.v.z > 1 || dist > 90) return;
      const d = Math.hypot((this.v.x * 0.5 + 0.5) * w - mx, (-this.v.y * 0.5 + 0.5) * h - my);
      if (d < Math.max(26, (o.height * 0.65 / dist) * k) && d < bd) { bd = d; best = o; }
    };
    for (const e of this.enemies) if (e.alive) test(e);
    for (const n of this.npcs) test(n);
    return best as Enemy | Npc | null;
  }

  /** Fare ışınını yükseklik haritasında yürüterek zemin noktasını bulur. */
  private groundAt(mx: number, my: number) {
    this.v.set((mx / window.innerWidth) * 2 - 1, -(my / window.innerHeight) * 2 + 1, 0.5).unproject(this.cam);
    const dir = this.v.sub(this.cam.position).normalize();
    const p = this.cam.position.clone();
    for (let i = 0; i < 400; i++) {
      p.addScaledVector(dir, 0.4);
      if (p.y <= this.terrain.getHeight(p.x, p.z)) return p;
    }
    return null;
  }

  private handleClick() {
    const m = this.input.mouse;
    const hit = this.pickAt(m.x, m.y);
    const p = this.player;
    if (hit instanceof Enemy) {
      p.target = hit;
      p.intent = { kind: 'attack', enemy: hit };
    } else if (hit instanceof Npc) {
      p.intent = { kind: 'npc', npc: hit };
    } else {
      const g = this.groundAt(m.x, m.y);
      if (g && this.terrain.walkable(g.x, g.z)) {
        p.intent = { kind: 'move', x: g.x, z: g.z };
        this.effects.ring(g, 0.9, 0xfff0b0, 0.35);
      }
    }
  }

  private nearestNpc() {
    let best: Npc | null = null, bd = 4;
    for (const n of this.npcs) {
      const d = n.pos.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  private updateWorld(dt: number) {
    const p = this.player;
    const inp = this.input;
    if (p.alive) {
      if (inp.mouse.clicked) this.handleClick();
      if (inp.hit('Tab')) {
        // Sıradaki en yakın hedefi seç
        const list = this.enemies.filter((e) => e.alive && e.pos.distanceTo(p.pos) < 40).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
        if (list.length) p.target = list[(list.indexOf(p.target as Enemy) + 1) % list.length];
      }
      if (inp.hit('KeyE')) {
        const n = this.nearestNpc();
        if (n) this.interact(n);
      }
    }
    p.update(dt);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d2 = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      const near = d2 < 130 * 130;
      e.model.root.visible = d2 < 240 * 240;
      if (near || !e.alive) e.update(dt);
      if (e.removed) { this.enemies.splice(i, 1); continue; }
      // Oyuncu ile yumuşak çarpışma
      if (e.alive && near) {
        const min = e.radius * (e.isStone ? 0.9 : 0.7) + p.radius;
        if (d2 < min * min && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const push = (min - d) * (e.isStone ? 1 : 0.5);
          p.pos.x -= ((e.pos.x - p.pos.x) / d) * push;
          p.pos.z -= ((e.pos.z - p.pos.z) / d) * push;
        }
      }
    }
    // Yalnızca birbirine yakın savaşan düşmanları karşılaştır.
    const cellSize = 4;
    type Entry = { enemy: Enemy; index: number; cx: number; cz: number };
    const active: Entry[] = [];
    const buckets = new Map<string, typeof active>();
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive || enemy.isStone) continue;
      const cx = Math.floor(enemy.pos.x / cellSize), cz = Math.floor(enemy.pos.z / cellSize);
      const entry = { enemy, index: i, cx, cz };
      const key = `${cx},${cz}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
      if (enemy.state === 'chase' || enemy.state === 'attack') active.push(entry);
    }
    for (const { enemy: a, index, cx, cz } of active) {
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const bucket = buckets.get(`${cx + ox},${cz + oz}`);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.index <= index) continue;
          const b = entry.enemy;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-4) {
            const d = Math.sqrt(d2), push = (min - d) * 0.5;
            a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
            b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
          }
        }
      }
    }

    this.spawner.update(dt);
    this.combat.update(dt);
    this.loot.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.saveNow(); }
  }

  private frame = () => {
    requestAnimationFrame(this.frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    if (this.showFps) this.updateFpsCounter();

    const worldDt = dt * (this.hitStopT > 0 ? 0.12 : 1);
    this.hitStopT = Math.max(0, this.hitStopT - dt);

    let focus: THREE.Vector3;
    if (this.started) {
      this.updateWorld(worldDt);
      focus = this.player.pos;
      this.camera.update(dt, focus, this.input);
    } else {
      focus = this.menuCenter;
      this.camera.yaw += dt * 0.04;
      this.camera.update(dt, focus, null);
    }
    for (const n of this.npcs) n.update(dt);

    this.env.update(dt, focus);
    this.village.update(this.time, this.env.day);
    this.vegetation.update(this.time, focus);
    this.water.update(this.time, this.env);

    // Kamp ateşi ve demirci ocağı
    const fire = this.village.firePos;
    this.v.set(fire.x, fire.y + 0.3, fire.z);
    this.particles.emit(this.v, { count: 2, color: 0xff7a18, color2: 0xffd060, speed: 0.35, up: 2.4, life: 0.8, size: 0.75, spread: 0.6 });
    if (Math.random() < 0.3) this.particles.emit(this.v, { count: 1, color: 0xffa040, speed: 1.2, up: 4, life: 1.4, size: 0.14, spread: 0.4 });
    if (Math.random() < 0.25) this.particles.emit(this.village.forgePos, { count: 1, color: 0xff6a10, speed: 0.6, up: 1.6, life: 0.7, size: 0.4, spread: 0.9 });

    this.particles.setViewport(this.pipeline.renderer.domElement.height, this.cam.fov);
    this.particles.update(dt);
    this.effects.update(dt);
    this.ui.update(dt);
    this.pipeline.render();
    this.input.endFrame();
  };
}
