import { CLASSES, StatKey } from '../../data/classes';
import {
  EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, MAX_PLUS, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, SHOPS, SLOT_NAMES,
  isEquip, itemLabel, plusMult,
} from '../../data/items';
import { QUESTS } from '../../data/quests';
import { SKILLS } from '../../data/skills';
import { NPCS, TRAVEL_SPOTS } from '../../data/world';
import { HORSES } from '../../data/horses';
import { EXCHANGES } from '../../data/items';
import { INVENTORY_COLS, INVENTORY_OPEN_PAGES, INVENTORY_PAGE_COUNT, INVENTORY_PAGE_SIZE, asStack, isLink, itemSize } from '../../data/inventory';
import type { DayNightMode } from '../../data/settings';
import type { Quality } from '../../render/pipeline';
import { AUTO_HUNT_PRIORITIES, AUTO_HUNT_RADII, AUTO_HUNT_THRESHOLDS } from '../../systems/autoHunt';
import type { AutoHuntSettings } from '../../systems/autoHunt';
import { SaveSystem } from '../../systems/save';
import type { ItemRef } from '../../systems/economy';
import { CharacterPreview } from '../characterPreview';
import type { Game } from '../../game';
import { icon } from '../icons';
import type { Windows } from '../windows';

export function renderQuest(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const q = g.quests.current;
    const chapter = q ? [...QUESTS].slice(0, g.quests.index + 1).reverse().find((x) => x.chapter)?.chapter : null;
    const step = `<div class="qstep">${chapter ? `${chapter} · ` : ''}Görev ${Math.min(g.quests.index + 1, QUESTS.length)} / ${QUESTS.length}</div>`;
    const goalText = q ? (q.kind === 'upgrade' ? `Bir eşyayı +${q.count} yap` : q.kind === 'level' ? `${q.count}. seviyeye ulaş` : q.kind === 'talk' ? `${q.targetName} ile konuş` : `${q.count} × ${q.targetName}`) : '';
    const rewards = q ? `<div class="reward"><b>Ödül:</b> ${q.exp.toLocaleString('tr-TR')} tecrübe, ${q.gold.toLocaleString('tr-TR')} Akçe${(q.items ?? []).map((it) => `, ${ITEMS[it.id].name} x${it.count}`).join('')}</div>` : '';
    if (!q) {
      body.innerHTML = `<p class="npc-say">“Gorvak düştü, Gökdemir sustu — efsane artık sensin, kahraman! Diyar sana minnettar. Dilediğince keşfet, avlan, güçlen.”</p><div class="btns"><button data-close="quest">Kapat</button></div>`;
    } else if (!g.quests.accepted) {
      const chapterHdr = q.chapter ? `<div class="quest-chapter">— ${q.chapter} —</div>` : '';
      body.innerHTML = `${step}${chapterHdr}<h4>${q.title}</h4><p class="npc-say">“${q.text}”</p>
        <div class="reward"><b>Hedef:</b> ${goalText}</div>${rewards}
        <div class="btns"><button class="primary" data-quest="accept">Kabul Et</button><button data-close="quest">Sonra</button></div>`;
    } else if (g.quests.complete) {
      body.innerHTML = `${step}<h4>${q.title}</h4><p class="npc-say">“${q.done}”</p>${rewards}<div class="btns">
        <button data-quest-route="walk" title="Bilge Aksakal'a otomatik yürü"><i class="btn-ic">${icon('route')}</i> Rota</button>
        <button data-quest-route="trail" title="Yerde iz işaretleri göster"><i class="btn-ic">${icon('trail')}</i> İz</button>
        <button data-quest-route="auto" title="Görev zincirini otomatik yürüt"><i class="btn-ic">${icon('sword')}</i> Oto</button>
        <button class="primary" data-quest="turnin">Ödülü Al</button></div>`;
    } else {
      const now = g.quests.progressNow();
      const pct = Math.round((now / q.count) * 100);
      body.innerHTML = `${step}<h4>${q.title}</h4><p class="npc-say">“${q.text}”</p>
        <div class="reward"><b>İlerleme:</b> ${now} / ${q.count}</div>
        <div class="qbar"><i style="width:${pct}%"></i></div>${rewards}
        <div class="btns">
        <button data-quest-route="walk" title="Görev hedefine otomatik yürü"><i class="btn-ic">${icon('route')}</i> Rota</button>
        <button data-quest-route="trail" title="Yerde iz işaretleri göster"><i class="btn-ic">${icon('trail')}</i> İz</button>
        <button data-quest-route="auto" title="Görev zincirini otomatik yürüt: hedefe git, savaş, teslim et"><i class="btn-ic">${icon('sword')}</i> Oto</button>
        <button data-close="quest">Tamam</button></div>`;
    }
}

