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

export function renderTravel(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    body.innerHTML = `<p class="npc-say">“Diyarın yollarını avucumun içi gibi bilirim. Nereye gitmek istersin? Küçük bir ücret karşılığı seni güvenle götürürüm.”</p>
      <div class="travel-list">${TRAVEL_SPOTS.map((s, i) => `
        <div class="travel-row">
          <div class="nm"><b>${s.name}</b><small>${s.desc}</small></div>
          <span class="price ${p.gold < s.cost ? 'no' : ''}">${s.cost.toLocaleString('tr-TR')}</span>
          <button data-travel="${i}" ${p.gold < s.cost ? 'disabled' : ''}>Git</button>
        </div>`).join('')}
      </div>
      <p class="dim-note">Köy merkezine dönmek ücretsizdir — ölürsen köyde dirilirsin.</p>`;
}

export function renderInn(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const FOODS = [
      { id: 'innstew', cost: 120 },
      { id: 'innroast', cost: 220 },
      { id: 'inntea', cost: 180 },
    ];
    const healCost = Math.round(10 + p.level * 4);
    const activeFood = p.buffs.find((b) => FOODS.some((f) => f.id === b.id));
    body.innerHTML = `<p class="npc-say">“Hoş geldin yorgun savaşçı! Biraz dinlen, karnını doyur — dışarısı tehlikeli.”</p>
      <div class="inn-box">
        <div class="travel-row">
          <div class="nm"><b>Dinlen ve Yıkan</b><small>Canını ve mananı tamamen yeniler</small></div>
          <span class="price ${p.gold < healCost ? 'no' : ''}">${healCost.toLocaleString('tr-TR')}</span>
          <button data-inn-heal ${p.gold < healCost || (p.hp >= p.maxHp && p.mp >= p.maxMp) ? 'disabled' : ''}>Dinlen</button>
        </div>
      </div>
      <h4>Han Yemekleri</h4>
      <div class="travel-list">${FOODS.map((f) => {
        const sk = SKILLS[f.id];
        const active = p.buffs.find((b) => b.id === f.id);
        return `<div class="travel-row ${active ? 'active' : ''}">
          <div class="nm"><b>${sk.name}</b><small>${sk.desc}${active ? ` — etkin, ${active.t.toFixed(0)} sn` : ''}</small></div>
          <span class="price ${p.gold < f.cost ? 'no' : ''}">${f.cost.toLocaleString('tr-TR')}</span>
          <button data-inn-food="${f.id}" data-cost="${f.cost}" ${p.gold < f.cost ? 'disabled' : ''}>${active ? 'Yenile' : 'Ye'}</button>
        </div>`;
      }).join('')}</div>
      ${activeFood ? `<p class="dim-note">Yeni bir yemek mevcut etkiyi yeniler; aynı anda bir han yemeği etkili olur.</p>` : ''}`;
}

export function renderStable(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const cur = p.horseDef;
    body.innerHTML = `<p class="npc-say">“Ahhırım diyarın en iyi taylarıyla dolu. Bir at seç; bineğin hem yoldaşın hem de gururun olur. <kbd>R</kbd> ile istediğin an binip inebilirsin.”</p>
      ${cur ? `<div class="stable-status">
        <div class="nm"><b>${cur.name}</b><small>Hız bonusu: +%${Math.round((cur.speed - 1) * 100)}${p.mounted ? ' · şu an sırtındasın' : ''}</small></div>
        <button class="${p.mounted ? 'danger' : 'primary'}" data-mount>${p.mounted ? 'İn' : 'Bin'} <small>(R)</small></button>
      </div>` : '<p class="dim-note">Henüz bir atın yok. Aşağıdan bir binek satın al.</p>'}
      <h4>Satılık Binekler</h4>
      <div class="travel-list">${Object.values(HORSES).map((h) => {
        const owned = p.horseId === h.id;
        return `<div class="travel-row ${owned ? 'active' : ''}">
          <div class="nm"><b>${h.name}</b><small>${h.desc} — +%${Math.round((h.speed - 1) * 100)} hız</small></div>
          ${owned
            ? '<span class="price">Sahipsin</span><button disabled>—</button>'
            : `<span class="price ${p.gold < h.cost ? 'no' : ''}">${h.cost.toLocaleString('tr-TR')}</span>
               <button data-horse-buy="${h.id}" ${p.gold < h.cost ? 'disabled' : ''}>${p.horseId ? 'Değiştir' : 'Satın Al'}</button>`}
        </div>`;
      }).join('')}</div>
      <p class="dim-note">Atın ölümsüzdür ve her yere girer; savaşta üstünden atlamazsın. Yeni at alınca eskisi yerine geçer.</p>`;
}

export function renderSmith(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const s = w.smithRef ? g.economy.resolve(w.smithRef) : null;
    const info = w.smithRef ? g.economy.upgradeInfo(w.smithRef) : null;
    const crystals = p.countItem('crystal');
    body.innerHTML = `<p class="npc-say">“Örsüm sıcak, çekicim hazır. Envanterinden ya da üzerinden bir eşya seç; onu güçlendireyim. Ama unutma: başarısız olursa eşya bir kademe düşer.”</p>
      <div class="smith-box">${w.slot(s, s ? `data-tip="${s.id}" data-plus="${s.plus}"` : '', 'big')}
      <div class="smith-info">${!s ? '<i>Bir eşya seç (sol tık)</i>' : !info
        ? `<b>${itemLabel(s)}</b><i>${isEquip(ITEMS[s.id]) ? `Bu eşya en üst seviyede (+${MAX_PLUS}).` : 'Bu eşya yükseltilemez.'}</i>`
        : `<b>${itemLabel(s)} → +${s.plus + 1}</b>
           <div>Başarı şansı: <b class="chance">%${info.chance}</b></div>
           <div>Ücret: <b class="${p.gold < info.cost ? 'no' : ''}">${info.cost.toLocaleString('tr-TR')} Akçe</b></div>
           ${info.crystal ? `<div>Gerekli: <b class="${crystals < 1 ? 'no' : ''}">1 Ruh Kristali</b> (elinde: ${crystals})</div>` : ''}`}
      </div></div>
      <button class="primary" data-upgrade ${info ? '' : 'disabled'}>Yükselt</button>`;
}

