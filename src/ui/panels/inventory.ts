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

export function renderInventory(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const mode = w.open.has('shop') ? 'Sağ tık: sat' : w.open.has('smith') ? 'Sol tık: yükseltmek için seç' : w.open.has('vault') ? 'Sağ tık: kasaya koy' : 'Sağ tık / çift tık: kullan veya kuşan';
    const pageStart = w.inventoryPage * INVENTORY_PAGE_SIZE;
    const equipmentSlot = (slot: EquipSlot) => `
      <div class="paperdoll-equip" title="${SLOT_NAMES[slot]}">
        ${w.slot(p.equip[slot], `data-equip="${slot}" aria-label="${SLOT_NAMES[slot]}"`, 'paperdoll-slot')}
        <small>${SLOT_NAMES[slot]}</small>
      </div>`;
    body.innerHTML = `
      <div class="inventory-layout">
        <section class="inventory-paperdoll">
          <div class="inventory-section-title"><span>Karakter</span><span>Giydiklerin</span></div>
          <div class="paperdoll-stage">
            <div class="paperdoll-rail">${(['weapon', 'shield', 'earring'] as EquipSlot[]).map(equipmentSlot).join('')}</div>
            <div class="paperdoll-portrait">
              <div class="paperdoll-canvas-host"></div>
              <div class="paperdoll-caption"><b data-inventory-name></b><small>Seviye ${p.level} · ${p.cls.name}</small></div>
            </div>
            <div class="paperdoll-rail">${(['helmet', 'armor', 'boots'] as EquipSlot[]).map(equipmentSlot).join('')}</div>
          </div>
          <div class="paperdoll-acc">${(['necklace', 'ring', 'bracelet', 'belt'] as EquipSlot[]).map(equipmentSlot).join('')}</div>
          <div class="paperdoll-stats">
            <div><small>Saldırı</small><b>${p.atk}</b></div>
            <div><small>Savunma</small><b>${p.def}</b></div>
            <div><small>Kritik</small><b>%${p.crit.toFixed(0)}</b></div>
          </div>
        </section>
        <section class="inventory-bag">
          <div class="inventory-section-title"><span>Envanter</span><span><button class="inventory-sort" data-inv-sort title="Eşyaları tür ve enderliğe göre düzenle">⇅ Sırala</button>30 göz · ${w.inventoryPage + 1}/${INVENTORY_PAGE_COUNT}</span></div>
          <nav class="inventory-pages" aria-label="Envanter sayfaları">
            ${Array.from({ length: INVENTORY_PAGE_COUNT }, (_, page) => {
              const locked = page >= INVENTORY_OPEN_PAGES;
              return `<button class="inventory-page ${page === w.inventoryPage ? 'active' : ''} ${locked ? 'locked' : ''}" data-inv-page="${page}" ${locked ? 'disabled aria-label="Sayfa ' + (page + 1) + ', kilitli"' : 'aria-label="Sayfa ' + (page + 1) + '"'}>
                ${locked ? '<span class="page-lock" aria-hidden="true"></span>' : ''}<b>${page + 1}</b>
              </button>`;
            }).join('')}
          </nav>
          <div class="inventory-grid">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => w.invCell(pageStart + i)).join('')}</div>
        </section>
      </div>
      <footer class="inventory-footer">
        <span class="gold">${icon('coin', '#f0c040')}${p.gold.toLocaleString('tr-TR')} Akçe</span>
        <small>${mode} · Eşyayı çubuğa da sürükleyebilirsin</small>
      </footer>`;
    body.querySelector<HTMLElement>('[data-inventory-name]')!.textContent = p.name;
    w.characterPreview ??= new CharacterPreview();
    w.characterPreview.mount(body.querySelector<HTMLElement>('.paperdoll-canvas-host')!, p);
}

export function renderVault(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
    const v = g.vault;
    const vaultCell = (i: number) => {
      const c = v.cells[i];
      if (c && isLink(c)) return '';
      const s = asStack(c);
      const size = s ? itemSize(s.id) : 1;
      const col = (i % INVENTORY_COLS) + 1;
      const row = Math.floor((i % INVENTORY_PAGE_SIZE) / INVENTORY_COLS) + 1;
      const style = `grid-column:${col};grid-row:${row} / span ${size}`;
      const extra = size > 1 ? `multi s${size}` : '';
      return w.slot(s, `data-vault="${i}" style="${style}" aria-label="Kasa gözü ${i + 1}"`, extra);
    };
    const pageStart = w.inventoryPage * INVENTORY_PAGE_SIZE;
    body.innerHTML = `<p class="npc-say">“Eşyaların burada güvende. Sağ tıkla kasaya koy, kasadan sağ tıkla geri al. Kasan kayıtlıdır — oyuna döndüğünde aynen durur.”</p>
      <div class="shop-layout">
        <section class="shop-stock">
          <div class="inventory-section-title"><span>Kasa</span><span>${v.usedCount} / 60 göz</span></div>
          <div class="vault-grids">
            ${[0, 1].map((pg) => `<div class="inventory-grid shop-inv">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => vaultCell(pg * INVENTORY_PAGE_SIZE + i)).join('')}</div>`).join('')}
          </div>
        </section>
        <section class="shop-sell">
          <div class="inventory-section-title"><span>Çantan</span><span>Sağ tık: kasaya koy</span></div>
          <nav class="inventory-pages">${Array.from({ length: INVENTORY_OPEN_PAGES }, (_, page) =>
            `<button class="inventory-page ${page === w.inventoryPage ? 'active' : ''}" data-inv-page="${page}" aria-label="Sayfa ${page + 1}"><b>${page + 1}</b></button>`).join('')}</nav>
          <div class="inventory-grid shop-inv">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => w.invCell(pageStart + i)).join('')}</div>
          <div class="shop-gold">${icon('coin', '#f0c040')}<b>${p.gold.toLocaleString('tr-TR')}</b> Akçe</div>
        </section>
      </div>`;
}

