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


export function renderAutoHunt(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const auto = g.autoHunt;
    const s = auto.settings;
    const pctSelect = (key: keyof AutoHuntSettings, value: number) =>
      `<select data-auto-setting="${key}"><option value="0" ${value === 0 ? 'selected' : ''}>Kapalı</option>${AUTO_HUNT_THRESHOLDS.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>%${o} altında</option>`).join('')}</select>`;
    const select = (key: keyof AutoHuntSettings, value: number, values: readonly number[]) =>
      `<select data-auto-setting="${key}">${values.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${option}%</option>`).join('')}</select>`;
    const radiusOptions = AUTO_HUNT_RADII.map((radius) =>
      `<option value="${radius}" ${radius === s.radius ? 'selected' : ''}>${radius} m</option>`).join('');
    const check = (key: keyof AutoHuntSettings, label: string, checked: boolean) => `
      <label class="auto-check"><input type="checkbox" data-auto-setting="${key}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
    const fmt = (n: number) => n.toLocaleString('tr-TR');
    const mins = Math.floor(auto.elapsed() / 60), secs = Math.floor(auto.elapsed() % 60);
    const st = auto.stats;
    const statsRow = auto.enabled || st.kills || st.gold ? `
      <div class="auto-stats">
        <span>Kesilen <b>${st.kills}</b></span><span>Tecrübe <b>${fmt(st.exp)}</b></span>
        <span>Akçe <b>${fmt(st.gold)}</b></span><span>Eşya <b>${st.items}</b></span>
        <span>Süre <b>${mins}:${String(secs).padStart(2, '0')}</b></span>
      </div>` : '';
    body.innerHTML = `
      <div class="auto-status-card">
        <span class="auto-status-dot"></span>
        <div><b data-auto-heading>${auto.enabled ? 'Oto av açık' : 'Oto av kapalı'}</b><small data-auto-status>${auto.status}</small></div>
        <span class="auto-zone" data-auto-zone>${auto.enabled ? `${Math.round(auto.center.x)}, ${Math.round(auto.center.z)}` : 'Bölge seçilmedi'}</span>
      </div>
      ${statsRow}
      <button class="${auto.enabled ? 'danger' : 'primary'} auto-main-toggle" data-auto-toggle data-auto-main-toggle>
        ${auto.enabled ? 'Oto Avı Durdur' : 'Bulunduğum Bölgede Başlat'}
      </button>
      <p class="auto-note">Oto av, başlatıldığı noktanın çevresinde kalır; altın halka alanı gösterir. Manuel hareket ve saldırı önceliklidir; envantere sığmayan eşyalar yerde kalır. Kısayol: <kbd>H</kbd></p>
      <h4>Av Alanı</h4>
      <label class="auto-setting-row"><span>Alan yarıçapı</span><select data-auto-setting="radius">${radiusOptions}</select></label>
      <label class="auto-setting-row"><span>Hedef önceliği</span><select data-auto-setting="priority">${AUTO_HUNT_PRIORITIES.map(([k, l]) => `<option value="${k}" ${k === s.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <h4>Otomatik Davranışlar</h4>
      <div class="auto-checks">
        ${check('collectItems', 'Ganimetleri topla', s.collectItems)}
        ${check('useSkills', 'Hazır yetenekleri kullan', s.useSkills)}
        ${check('usePotions', 'Can ve mana iksiri kullan', s.usePotions)}
        ${check('preferAggro', 'Önce saldıranları kes', s.preferAggro)}
        ${check('attackBosses', 'Patron düşmanlara saldır', s.attackBosses)}
        ${check('attackStones', 'Lanetli taşlara saldır', s.attackStones)}
        ${check('autoRespawn', 'Ölünce dirilip ava dön', s.autoRespawn)}
        ${check('autoMount', 'Uzak yolda ata bin', s.autoMount)}
      </div>
      <div class="auto-thresholds">
        <label class="auto-setting-row"><span>Can iksiri eşiği</span>${select('hpThreshold', s.hpThreshold, AUTO_HUNT_THRESHOLDS)}</label>
        <label class="auto-setting-row"><span>Mana iksiri eşiği</span>${select('mpThreshold', s.mpThreshold, AUTO_HUNT_THRESHOLDS)}</label>
        <label class="auto-setting-row"><span>Dinlenme</span>${pctSelect('restBelow', s.restBelow)}</label>
      </div>
      <h4>Kullanılacak Yetenekler</h4>
      <div class="auto-checks auto-skills">
        ${p.skills.map((sk, i) => `
          <label class="auto-check ${p.level < sk.level ? 'dim' : ''}"><input type="checkbox" data-auto-skill="${i}" ${s.skillMask[i] && p.level >= sk.level ? 'checked' : ''} ${p.level < sk.level ? 'disabled' : ''}>
          <span>[${i + 1}] ${sk.name}</span></label>`).join('')}
      </div>`;
}

