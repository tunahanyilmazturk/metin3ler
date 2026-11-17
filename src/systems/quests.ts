import { QUESTS, QuestDef } from '../data/quests';
import { INVENTORY_OPEN_SLOTS } from '../data/inventory';
import { ITEMS } from '../data/items';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';

export interface QuestSave { index: number; progress: number; accepted: boolean }

/** Sıralı ana görev zinciri. */
export class QuestLog {
  index = 0;
  progress = 0;
  accepted = false;

  constructor(private game: Game, save?: QuestSave) {
    if (save) Object.assign(this, save);
    game.events.on('enemyKilled', (e: Enemy) => this.onKill(e));
    game.events.on('upgraded', (plus: number) => this.onUpgrade(plus));
  }

  serialize(): QuestSave { return { index: this.index, progress: this.progress, accepted: this.accepted }; }

  get current(): QuestDef | null { return QUESTS[this.index] ?? null; }
  get complete() { const q = this.current; return !!q && this.accepted && this.progress >= q.count; }

  accept() {
    const q = this.current;
    if (!q || this.accepted) return;
    this.accepted = true;
    this.progress = 0;
    this.game.events.emit('log', { msg: `Görev alındı: ${q.title}`, cls: 'gold' });
    this.game.events.emit('changed');
  }

  private bump(to: number) {
    const q = this.current!;
    const before = this.progress;
    this.progress = Math.min(q.count, to);
    if (this.progress !== before) {
      this.game.events.emit('log', {
        msg: this.progress >= q.count ? `Görev tamamlandı: ${q.title} — Bilge Aksakal'a dön.` : `${q.title}: ${this.progress}/${q.count}`,
        cls: this.progress >= q.count ? 'gold' : '',
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

  private hasRewardSpace(items: NonNullable<QuestDef['items']>) {
    const p = this.game.player;
    const openInventory = p.inv.slice(0, INVENTORY_OPEN_SLOTS);
    const existingStacks = new Set(openInventory.flatMap((slot) => slot ? [slot.id] : []));
    let neededSlots = 0;
    for (const reward of items) {
      if (ITEMS[reward.id].stack) {
        if (!existingStacks.has(reward.id)) {
          existingStacks.add(reward.id);
          neededSlots++;
        }
      } else {
        neededSlots++;
      }
    }
    return openInventory.filter((slot) => slot === null).length >= neededSlots;
  }

  turnIn() {
    const q = this.current;
    if (!q || !this.complete) return;
    const p = this.game.player;
    if (!this.hasRewardSpace(q.items ?? [])) {
      this.game.events.emit('log', { msg: 'Görev ödülleri için envanterinde yer aç.', cls: 'warn' });
      return;
    }
    p.gold += q.gold;
    for (const it of q.items ?? []) p.addItem(it.id, it.count, 0, true);
    const names = (q.items ?? []).map((it) => `${ITEMS[it.id].name} x${it.count}`).join(', ');
    this.game.events.emit('log', { msg: `Ödül: ${q.exp} tecrübe, ${q.gold} Akçe${names ? ', ' + names : ''}`, cls: 'gold' });
    this.index++;
    this.progress = 0;
    this.accepted = false;
    this.game.audio.success();
    p.gainExp(q.exp);
  }
}
