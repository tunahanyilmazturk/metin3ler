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

export function renderShop(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const stock = SHOPS[w.shopNpcId] ?? SHOP_STOCK;
    const npc = NPCS.find((n) => n.id === w.shopNpcId);
    const say = w.shopNpcId === 'weaponsmith'
      ? '“Keskin çelik, usta işi! Kılıç mı, hançer mi, asa mı, yoksa mızrak mı? En iyileri yalnızca bende.”'
      : w.shopNpcId === 'armorer'
        ? '“Sağlam zırh hayat kurtarır. Gel, sana uygun bir zırh seçelim.”'
        : w.shopNpcId === 'jeweler'
          ? '“Parlayan her şey altın değildir ama bendekiler öyledir. Malzemelerini de Ruh Kristaline çevirebilirim.”'
          : '“Hoş geldin yolcu! En iyi mallar bende. Çantandaki eşyaları sağ tıklayarak bana satabilirsin.”';
    const titleEl = w.els.shop.querySelector('h3');
    if (titleEl && npc) titleEl.textContent = npc.name;
    const CATS: [string, string][] = [['all', 'Tümü'], ['weapon', 'Silah'], ['armor', 'Zırh'], ['jewel', 'Takı'], ['consum', 'İksir/Diğer']];
    const catOf = (id: string) => {
      const t = ITEMS[id].type;
      return t === 'weapon' ? 'weapon' : ['armor', 'helmet', 'boots', 'shield'].includes(t) ? 'armor' : ['necklace', 'ring', 'earring', 'bracelet', 'belt'].includes(t) ? 'jewel' : 'consum';
    };
    const cats = CATS.filter(([k]) => k === 'all' || stock.some((id) => catOf(id) === k));
    const list = stock.filter((id) => w.shopCat === 'all' || catOf(id) === w.shopCat);
    const pageStart = w.inventoryPage * INVENTORY_PAGE_SIZE;
    body.innerHTML = `<p class="npc-say">${say}</p>
      <div class="shop-layout">
        <section class="shop-stock">
          <div class="shop-tabs">${cats.map(([k, l]) => `<button data-shop-cat="${k}" class="${w.shopCat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="shop-list">${list.map((id) => {
            const d = ITEMS[id];
            
            return `<div class="row">${w.slot({ id, plus: 0, count: 1 }, `data-tip="${id}"`)}
              <div class="nm"><b style="color:${RARITY_COLORS[d.rarity]}">${d.name}</b><small>Sv. ${d.level}${ITEMS[id].stack ? ' · yığın' : ''}</small></div>
              <span class="price ${p.gold < d.price ? 'no' : ''}">${d.price.toLocaleString('tr-TR')}</span>
              <button data-buy="${id}">${d.stack ? 'Al <small>(⇧ x10)</small>' : 'Al'}</button></div>`;
          }).join('') || '<i class="shop-empty">Bu kategoride mal yok.</i>'}</div>
          ${w.shopNpcId === 'jeweler' ? `
            <div class="inventory-section-title"><span>Değişim</span><span>Malzeme → Ruh Kristali</span></div>
            <div class="shop-list exchange-list">${EXCHANGES.map((ex, i) => {
              const gd = ITEMS[ex.give.id], rd = ITEMS[ex.get.id];
              const have = p.countItem(ex.give.id);
              const ok = have >= ex.give.count;
              return `<div class="row ${ok ? '' : 'dim'}">
                <div class="nm"><b>${gd.name} ×${ex.give.count}</b><small>elinde: ${have} → ${rd.name} ×${ex.get.count}</small></div>
                <button data-exchange="${i}" ${ok ? '' : 'disabled'}>Değiştir</button></div>`;
            }).join('')}</div>` : ''}
        </section>
        <section class="shop-sell">
          <div class="inventory-section-title"><span>Satış</span><span>Çantandan sağ tıkla sat</span></div>
          <nav class="inventory-pages">${Array.from({ length: INVENTORY_OPEN_PAGES }, (_, page) =>
            `<button class="inventory-page ${page === w.inventoryPage ? 'active' : ''}" data-inv-page="${page}" aria-label="Sayfa ${page + 1}"><b>${page + 1}</b></button>`).join('')}</nav>
          <div class="inventory-grid shop-inv">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => w.invCell(pageStart + i)).join('')}</div>
          <div class="shop-sell-actions">
            <button data-sell-bulk="equip0" title="Sıradan (beyaz) ekipmanları toplu sat">Adi Eşyaları Sat</button>
            <button data-sell-bulk="materials" title="Malzemeleri toplu sat (Ruh Kristali hariç)">Malzemeleri Sat</button>
          </div>
          <div class="shop-gold">${icon('coin', '#f0c040')}<b>${p.gold.toLocaleString('tr-TR')}</b> Akçe</div>
        </section>
      </div>`;
}

