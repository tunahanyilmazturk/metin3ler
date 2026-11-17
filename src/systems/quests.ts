import { QUESTS, QuestDef } from '../data/quests';
import { ITEMS } from '../data/items';
import type { Enemy } from '../entities/enemy';
import type { Npc } from '../entities/npc';
import type { Game } from '../game';

export interface QuestSave { index?: number; id?: string; progress: number; accepted: boolean }

/** v1 kayıtlarındaki görev sırası; eski index → yeni id eşlemesi için */
const LEGACY_ORDER = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];

/** Sıralı ana görev zinciri. */
export class QuestLog {
  index = 0;
  progress = 0;
  accepted = false;

  constructor(private game: Game, save?: QuestSave) {
    if (save) {
      if (typeof save.id === 'string') {
        const i = QUESTS.findIndex((q) => q.id === save.id);
        this.index = i < 0 ? QUESTS.length : i;
      } else if (typeof save.index === 'number') {
        const legacyId = LEGACY_ORDER[save.index];
        const i = legacyId ? QUESTS.findIndex((q) => q.id === legacyId) : -1;
        this.index = i < 0 ? QUESTS.length : i;
      }
      this.progress = save.progress;
      this.accepted = save.accepted;
    }
    game.events.on('enemyKilled', (e: Enemy) => this.onKill(e));
    game.events.on('upgraded', (plus: number) => this.onUpgrade(plus));
    game.events.on('npcTalk', (n: Npc) => this.onTalk(n));
    game.events.on('levelUp', (lvl: number) => this.onLevel(lvl));
  }

  serialize(): QuestSave { return { id: this.current?.id ?? 'done', progress: this.progress, accepted: this.accepted }; }

  get current(): QuestDef | null { return QUESTS[this.index] ?? null; }

  /** Türüne göre güncel ilerleme (toplanan eşya/seviye canlı hesaplanır). */
  progressNow(): number {
    const q = this.current;
    if (!q) return 0;
    if (q.kind === 'collect') return Math.min(q.count, this.game.player.countItem(q.target!));
    if (q.kind === 'level') return Math.min(q.count, this.game.player.level);
    if (q.kind === 'talk') return this.progress;
    return this.progress;
  }

  get complete() { const q = this.current; return !!q && this.accepted && this.progressNow() >= q.count; }

  accept() {
    const q = this.current;
    if (!q || this.accepted) return;
    this.accepted = true;
    this.progress = 0;
    if (q.kind === 'level' && this.progressNow() >= q.count) this.progress = q.count;
    this.game.events.emit('log', { msg: `Görev alındı: ${q.title}`, cls: 'gold' });
    this.game.events.emit('changed');
  }

  private bump(to: number) {
    const q = this.current!;
    const before = this.progressNow();
    this.progress = Math.min(q.count, q.kind === 'collect' || q.kind === 'level' ? this.progress : to);
    if (this.progressNow() !== before) {
      const now = this.progressNow();
      this.game.events.emit('log', {
        msg: now >= q.count ? `Görev tamamlandı: ${q.title} — Bilge Aksakal'a dön.` : `${q.title}: ${now}/${q.count}`,
        cls: now >= q.count ? 'gold' : '',
      });
      this.game.events.emit('changed');
    }
  }

  private onKill(e: Enemy) {
    const q = this.current;
    if (!q || !this.accepted) return;
    if (q.kind === 'kill' && e.def.id === q.target) this.bump(this.progress + 1);
    if (q.kind === 'stone' && e.isStone) this.bump(this.progress + 1);
  }

  private onUpgrade(plus: number) {
    const q = this.current;
    if (q && this.accepted && q.kind === 'upgrade') this.bump(Math.max(this.progress, plus));
  }

  private onLevel(lvl: number) {
    const q = this.current;
    if (q && this.accepted && q.kind === 'level') this.bump(lvl);
  }

  private onTalk(n: Npc) {
    const q = this.current;
    if (q && this.accepted && q.kind === 'talk' && q.target === n.id) {
      this.game.events.emit('log', { msg: `${q.done}`, cls: 'gold' });
      this.grant(q);
    }
  }

  private hasRewardSpace(items: NonNullable<QuestDef['items']>) {
    return this.game.player.fitsAll(items.map((r) => r.id));
  }

  /** Ödülü verir ve zinciri ilerletir. */
  private grant(q: QuestDef) {
    const p = this.game.player;
    p.gold += q.gold;
    for (const it of q.items ?? []) p.addItem(it.id, it.count, 0, true);
    const names = (q.items ?? []).map((it) => `${ITEMS[it.id].name} x${it.count}`).join(', ');
    this.game.events.emit('log', { msg: `Ödül: ${q.exp.toLocaleString('tr-TR')} tecrübe, ${q.gold.toLocaleString('tr-TR')} Akçe${names ? ', ' + names : ''}`, cls: 'gold' });
    this.index++;
    this.progress = 0;
    this.accepted = false;
    this.game.audio.success();
    p.gainExp(q.exp);
  }

  turnIn() {
    const q = this.current;
    if (!q || !this.complete) return;
    const p = this.game.player;
    if (q.kind === 'collect') {
      p.removeItem(q.target!, q.count);
      if (!this.hasRewardSpace(q.items ?? [])) {
        p.addItem(q.target!, q.count, 0, true);
        this.game.events.emit('log', { msg: 'Görev ödülleri için envanterinde yer aç.', cls: 'warn' });
        return;
      }
    } else if (!this.hasRewardSpace(q.items ?? [])) {
      this.game.events.emit('log', { msg: 'Görev ödülleri için envanterinde yer aç.', cls: 'warn' });
      return;
    }
    this.grant(q);
  }
}
