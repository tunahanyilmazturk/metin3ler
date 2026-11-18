import { HORSES, HorseDef } from '../data/horses';
import { HorseModel } from '../entities/horseModel';
import { disposeModel } from '../entities/model';
import type { Player } from '../entities/player';

/** Kayıtta tutulan binek bilgisi: sahip olunan atlar ve aktif at. */
export interface MountSave {
  owned: string[];
  active: string | null;
}

export type MountState = 'foot' | 'summoning' | 'mounted';

/** Atı çağırma süresi (saniye). Bu sürede hasar alınırsa çağırma bölünür. */
export const SUMMON_TIME = 0.8;
/** Biniş ve iniş sonrası kısa bekleme (art arda basmayı engeller). */
export const MOUNT_COOLDOWN = 0.6;
/** Dörtnala koşuda saniyede harcanan dayanıklılık. */
export const GALLOP_DRAIN = 25;
/** Yorgun at, dayanıklılığının bu oranına ulaşınca yeniden dörtnala koşabilir. */
export const TIRED_RECOVER = 0.3;

/**
 * Binek sistemi: sahip olunan atlar, aktif at seçimi, çağırma → biniş → iniş durumları,
 * dayanıklılık ve dörtnala. At modeli yalnızca binildiğinde sahnededir.
 */
export class MountSystem {
  owned: string[] = [];
  active: string | null = null;
  state: MountState = 'foot';
  summonT = 0;
  cooldown = 0;
  stamina = 100;
  tired = false;
  private model: HorseModel | null = null;
  private modelFor: string | null = null;

  constructor(private p: Player, save?: MountSave | null) {
    if (save) {
      this.owned = save.owned.filter((id, i, all) => Object.hasOwn(HORSES, id) && all.indexOf(id) === i);
      this.active = save.active && this.owned.includes(save.active) ? save.active : (this.owned[0] ?? null);
    }
    this.stamina = this.maxStamina;
  }

  get def(): HorseDef | undefined { return this.active ? HORSES[this.active] : undefined; }
  get mounted() { return this.state === 'mounted'; }
  get summoning() { return this.state === 'summoning'; }
  get maxStamina() { return this.def?.stamina ?? 100; }
  get staminaFrac() { return this.maxStamina > 0 ? this.stamina / this.maxStamina : 0; }
  get summonProgress() { return this.summoning ? Math.min(1, this.summonT / SUMMON_TIME) : 0; }
  /** Binekteyken hareket hızı çarpanı. */
  get speedMult() { return this.mounted ? (this.def?.speed ?? 1) : 1; }
  /** Binici modelinin kök yüksekliği. */
  get riderOffset() { return this.model?.riderOffset ?? 0.7; }

  owns(id: string) { return this.owned.includes(id); }

  serialize(): MountSave { return { owned: [...this.owned], active: this.active }; }

  private log(msg: string, cls = '') { this.p.game.events.emit('log', { msg, cls }); }
  private changed() { this.p.game.events.emit('changed'); }

  /** Seyis'ten at satın alır: seviye ve akçe kontrolü; yeni at aktif olur. */
  buy(id: string): boolean {
    const d = HORSES[id];
    const g = this.p.game;
    if (!d || this.owns(id)) return false;
    if (this.p.level < d.level) { this.log(`${d.name} için ${d.level}. seviye gerekli.`, 'warn'); return false; }
    if (this.p.gold < d.cost) { this.log('Yeterli akçen yok.', 'warn'); g.audio.fail(); return false; }
    this.p.gold -= d.cost;
    this.owned.push(id);
    g.audio.coin();
    this.log(`${d.name} senin oldu! R ile ya da alt bardaki düğmeyle binebilirsin.`, 'gold');
    this.select(id, true);
    this.changed();
    return true;
  }

  /** Sahip olunan atlardan birini aktif yapar; binili ise önce iner. */
  select(id: string, silent = false) {
    if (!this.owns(id) || this.active === id) return;
    if (this.state !== 'foot') this.dismount(true);
    this.active = id;
    this.stamina = this.maxStamina;
    this.tired = false;
    this.dropModel();
    if (!silent) this.log(`${HORSES[id].name} artık aktif bineğin.`, 'good');
    this.changed();
  }

  /** R / alt bar düğmesi: yürürken çağırır, çağırırken iptal eder, binekteyken iner. */
  toggle() {
    if (!this.p.alive || this.cooldown > 0) return;
    if (!this.active) {
      this.log("Henüz bir atın yok. Ahırdaki Seyis Rahmi'den satın alabilirsin.", 'warn');
      return;
    }
    if (this.state === 'foot') this.startSummon();
    else if (this.state === 'summoning') this.cancelSummon();
    else this.dismount();
  }

  /** Oto av / oto görev: uzun yolda sessizce at çağırır (at yoksa ya da beklemedeyse bir şey yapmaz). */
  autoMount() {
    if (!this.p.alive || this.cooldown > 0 || !this.active || this.state !== 'foot') return false;
    this.startSummon();
    return true;
  }

  private startSummon() {
    this.state = 'summoning';
    this.summonT = 0;
    this.p.game.audio.click();
    this.changed();
  }

  private cancelSummon() {
    this.state = 'foot';
    this.summonT = 0;
    this.changed();
  }

  /** Hasar alınca çağırma bölünür. */
  interrupt() {
    if (this.state !== 'summoning') return;
    this.cancelSummon();
    this.cooldown = MOUNT_COOLDOWN;
    this.log('Saldırı aldın; at çağırma bölündü.', 'warn');
  }

  private mountNow() {
    const g = this.p.game;
    const def = this.def;
    if (!def) { this.state = 'foot'; return; }
    this.ensureModel(def);
    this.state = 'mounted';
    this.cooldown = MOUNT_COOLDOWN;
    this.model!.revive();
    this.model!.root.position.copy(this.p.pos);
    this.model!.root.rotation.y = this.p.yaw;
    g.scene.add(this.model!.root);
    this.p.model.riding = true;
    this.p.recalc();
    g.effects.ring(this.p.pos.clone(), 1.8, def.look.trim, 0.45);
    this.log(`${def.name} sırtındasın.`, 'good');
    this.changed();
  }

  /** Attan iner (çağırma sürüyorsa iptal eder). silent: ölümde günlük yazmaz. */
  dismount(silent = false) {
    if (this.state === 'summoning') { this.cancelSummon(); return; }
    if (this.state !== 'mounted') return;
    this.state = 'foot';
    this.cooldown = MOUNT_COOLDOWN;
    if (this.model) this.p.game.scene.remove(this.model.root);
    this.p.model.riding = false;
    this.p.model.root.position.copy(this.p.pos);
    this.p.recalc();
    if (!silent) {
      this.p.game.audio.click();
      this.log('Attan indin.');
    }
    this.changed();
  }

  /** Dörtnala koşabilir mi: binekte, Shift basılı, hareket ediyor ve at yorgun değil. */
  wantsGallop(shift: boolean, moving: boolean) {
    return this.mounted && shift && moving && !this.tired && this.stamina > 0;
  }

  /** Dörtnala ise atın ek hız çarpanı. */
  gallopMult(gallop: boolean) { return gallop ? (this.def?.gallop ?? 1) : 1; }

  /** Bekleme ve çağırma süresini işler; çağırma tamamlanınca biner. */
  tick(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.state === 'summoning') {
      this.summonT += dt;
      if (this.summonT >= SUMMON_TIME) this.mountNow();
    }
  }

  /** Dayanıklılık: dörtnalada azalır, diğer durumlarda yenilenir; sıfırda at yorulur. */
  updateStamina(dt: number, gallop: boolean) {
    const max = this.maxStamina;
    if (gallop) {
      this.stamina = Math.max(0, this.stamina - GALLOP_DRAIN * dt);
      if (this.stamina <= 0) {
        this.tired = true;
        this.log('Atın yoruldu; biraz dinlenmesi gerek.', 'warn');
      }
    } else {
      const regen = (this.def?.regen ?? 14) * (this.tired ? 0.6 : 1);
      this.stamina = Math.min(max, this.stamina + regen * dt);
      if (this.tired && this.stamina >= max * TIRED_RECOVER) this.tired = false;
    }
  }

  /** At modelini oyuncunun konumuna taşır ve canlandırır. */
  sync(dt: number, speed: number, gallop: boolean) {
    if (!this.mounted || !this.model) return;
    this.model.root.position.copy(this.p.pos);
    this.model.root.rotation.y = this.p.yaw;
    this.model.update(dt, speed, gallop);
  }

  private ensureModel(def: HorseDef) {
    if (this.model && this.modelFor === def.id) return;
    this.dropModel();
    this.model = new HorseModel(def.look);
    this.modelFor = def.id;
  }

  private dropModel() {
    if (!this.model) return;
    disposeModel(this.model.root);
    this.model = null;
    this.modelFor = null;
  }
}
