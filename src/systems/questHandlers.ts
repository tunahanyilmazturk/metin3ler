import { ENEMIES } from '../data/enemies';
import type { QuestDef } from '../data/quests';
import type { Game } from '../game';

/**
 * Oto görev zincirinin görev-türüne-özel stratejileri (bildirimsel kayıt).
 * Yeni görev türü için yalnızca QUEST_HANDLERS'a kayıt ekle — questNavigator
 * durum makinesi kaydı kendiliğinden bulur; kaydı olmayan türlerde güvenli
 * geri dönüş (Aksakal'a git → uyar → duraklat) devreye girer.
 */

/** Gezginin çözdüğü hedefin asgari şekli (questNavigator'daki Objective ile uyumlu). */
export interface ObjectiveLike {
  x: number;
  z: number;
  stop: number;
  label: string;
  key: string;
}

export interface QuestHandler {
  /** Av filtresi: izin verilen düşman id'leri; null = serbest av; yoksa savaş yok */
  huntIds?: (q: QuestDef, g: Game) => ReadonlySet<string> | null;
  huntStones?: (q: QuestDef) => boolean;
  forceCollect?: (q: QuestDef) => boolean;
  /** NPC/varış eylemi: hedefe ulaşınca çalışır. 'pause' = oto durur, 'continue' = zincir sürer */
  onArrive?: (ctx: { g: Game; q: QuestDef; obj: ObjectiveLike }) => 'continue' | 'pause';
  /** Varış sayılan yaklaşım mesafesi (varsayılan 3 m). */
  arriveDist?: number;
}

export const QUEST_HANDLERS: Record<QuestDef['kind'], QuestHandler> = {
  kill: {
    huntIds: (q) => new Set([q.target!]),
  },
  stone: {
    // Yalnızca lanetli taşlar (+ öz-savunma): boş id kümesi + taş izni.
    huntIds: () => new Set<string>(),
    huntStones: () => true,
  },
  collect: {
    // Görev eşyasını düşüren tüm türler avlanabilir; ganimet zorla toplanır.
    huntIds: (q) => {
      const ids = new Set<string>();
      for (const id in ENEMIES) if (ENEMIES[id].drops.some((d) => d.id === q.target)) ids.add(id);
      return ids;
    },
    forceCollect: () => true,
  },
  level: {
    // Serbest av: seviyeye uygun bölgede ne varsa kes.
    huntIds: () => null,
  },
  talk: {
    arriveDist: 3,
    onArrive: ({ g, q }) => {
      // interact() ile aynı yol — pencere açmadan konuşma olayı (görevi verir).
      const n = g.npcs.find((x) => x.id === (q.target ?? 'elder'));
      if (n) { g.audio.click(); g.events.emit('npcTalk', n); }
      return 'continue';
    },
  },
  upgrade: {
    arriveDist: 4,
    onArrive: ({ g }) => {
      g.events.emit('log', { msg: 'Demircide bir eşyayı +2 yap; görev seni bekliyor.', cls: 'gold' });
      return 'pause';
    },
  },
};

/** Tür başına bir kez uyarıldı mı? (günlük spamını önler) */
const warnedKinds = new Set<string>();

/** Bilinmeyen/gelecek görev türü: çökme/döngüye girme; Aksakal'a git, bir kez uyar, duraklat. */
const FALLBACK_HANDLER: QuestHandler = {
  huntIds: () => null,
  arriveDist: 3,
  onArrive: ({ g, q }) => {
    if (!warnedKinds.has(q.id)) {
      warnedKinds.add(q.id);
      g.events.emit('log', { msg: `Bu görev türü otomatik desteklenmiyor: ${q.kind} (${q.title})`, cls: 'warn' });
    }
    return 'pause';
  },
};

/** Görev türünün stratejisini döndürür; kayıtlı değilse güvenli geri dönüş. */
export function questHandler(kind: string): QuestHandler {
  return (QUEST_HANDLERS as Record<string, QuestHandler | undefined>)[kind] ?? FALLBACK_HANDLER;
}
