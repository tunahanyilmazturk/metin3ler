import { CLASSES, StatKey } from '../data/classes';
import {
  EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, MAX_PLUS, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, SHOPS, SLOT_NAMES,
  isEquip, itemLabel, plusMult,
} from '../data/items';
import { QUESTS } from '../data/quests';
import { SKILLS } from '../data/skills';
import { NPCS } from '../data/world';
import { INVENTORY_COLS, INVENTORY_OPEN_PAGES, INVENTORY_PAGE_COUNT, INVENTORY_PAGE_SIZE, asStack, isLink, itemSize } from '../data/inventory';
import type { DayNightMode } from '../data/settings';
import type { Quality } from '../render/pipeline';
import { AUTO_HUNT_PRIORITIES, AUTO_HUNT_RADII, AUTO_HUNT_THRESHOLDS } from '../systems/autoHunt';
import type { AutoHuntSettings } from '../systems/autoHunt';
import { SaveSystem } from '../systems/save';
import type { ItemRef } from '../systems/economy';
import { CharacterPreview } from './characterPreview';
import type { Game } from '../game';
import { icon } from './icons';

export type WinName = 'inv' | 'char' | 'shop' | 'smith' | 'quest' | 'settings' | 'autohunt';

const TITLES: Record<WinName, string> = {
  inv: 'Envanter', char: 'Karakter', shop: 'Tüccar Sevinç', smith: 'Demirci Bora', quest: 'Bilge Aksakal', settings: 'Ayarlar', autohunt: 'Oto Av',
};
const STAT_NAMES: Record<StatKey, [string, string]> = {
  str: ['Güç', 'Savaşçının saldırı gücünü artırır'],
  dex: ['Çeviklik', 'Kritik şansı ve saldırı hızı; Gölge\'nin saldırı gücü'],
  vit: ['Dayanıklılık', 'Can ve savunmayı artırır'],
  int: ['Zekâ', 'Manayı artırır; Büyücü\'nün saldırı gücü'],
};

/** Oyun pencereleri: envanter, karakter, dükkân, demirci, görev ve ayarlar. */
export class Windows {
  private els = {} as Record<WinName, HTMLDivElement>;
  private open = new Set<WinName>();
  private smithRef: ItemRef | null = null;
  private characterPreview: CharacterPreview | null = null;
  private inventoryPage = 0;
  private shopNpcId = 'merchant';
  private shopCat = 'all';
  private charTab: 'stats' | 'skills' | 'combat' = 'stats';

  constructor(private game: Game, root: HTMLElement, private tooltip: HTMLElement) {
    (Object.keys(TITLES) as WinName[]).forEach((name) => {
      const el = document.createElement('div');
      el.className = `win win-${name} hidden`;
      el.innerHTML = `<header><h3>${TITLES[name]}</h3><button class="x" data-close="${name}" aria-label="Kapat">✕</button></header><div class="body"></div><div class="win-resize" aria-hidden="true"></div>`;
      root.appendChild(el);
      this.els[name] = el;
      this.makeMovable(el);
    });
    root.addEventListener('click', (e) => this.onClick(e as MouseEvent));
    root.addEventListener('change', (e) => this.onChange(e as Event));
    root.addEventListener('dblclick', (e) => {
      if (!matchMedia('(any-pointer: coarse)').matches) this.onUse(e as MouseEvent);
    });
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!matchMedia('(any-pointer: coarse)').matches) this.onUse(e as MouseEvent);
    });
    root.addEventListener('mouseover', (e) => this.onHover(e as MouseEvent));
    root.addEventListener('mouseout', () => { this.tooltip.style.display = 'none'; });
    root.addEventListener('dragstart', (e) => this.onDragStart(e as DragEvent));
    root.addEventListener('dragover', (e) => this.onDragOver(e as DragEvent));
    root.addEventListener('drop', (e) => this.onDrop(e as DragEvent));
    root.addEventListener('dragend', () => root.querySelectorAll('.drop-hover,.dragging').forEach((el) => el.classList.remove('drop-hover', 'dragging')));
    game.events.on('changed', () => this.refresh());
  }

  private zTop = 20;

  private bringFront(el: HTMLElement) { el.style.zIndex = String(++this.zTop); }

  /** Başlık çubuğundan sürükleme ve sağ-alt köşeden boyutlandırma. */
  private makeMovable(el: HTMLElement) {
    const header = el.querySelector('header')!;
    const grip = el.querySelector<HTMLElement>('.win-resize')!;

    header.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top, w = r.width;
      header.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const x = Math.min(innerWidth - 80, Math.max(80 - w, ox + ev.clientX - sx));
        const y = Math.min(innerHeight - 40, Math.max(0, oy + ev.clientY - sy));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const up = () => {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', up);
      };
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerup', up);
      this.bringFront(el);
    });

    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ow = r.width, oh = r.height;
      el.style.maxHeight = 'none';
      grip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        el.style.width = `${Math.min(innerWidth - r.left - 8, Math.max(240, ow + ev.clientX - sx))}px`;
        el.style.height = `${Math.min(innerHeight - r.top - 8, Math.max(150, oh + ev.clientY - sy))}px`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      this.bringFront(el);
    });
  }

  get anyOpen() { return this.open.size > 0; }
  isOpen(n: WinName) { return this.open.has(n); }

  show(n: WinName, npcId?: string) {
    if (n === 'shop' && npcId) this.shopNpcId = npcId;
    if (n === 'shop' || n === 'smith') { this.close('shop'); this.close('smith'); this.close('quest'); }
    if (n === 'quest') { this.close('shop'); this.close('smith'); }
    this.open.add(n);
    this.syncInventoryMode();
    if (n === 'shop' || n === 'smith') this.show('inv');
    this.els[n].classList.remove('hidden');
    this.bringFront(this.els[n]);
    this.render(n);
  }

  close(n: WinName) {
    this.open.delete(n);
    this.syncInventoryMode();
    this.els[n].classList.add('hidden');
    if (n === 'smith') this.smithRef = null;
    this.tooltip.style.display = 'none';
    if ((n === 'shop' || n === 'smith') && this.open.has('inv')) this.render('inv');
  }

  toggle(n: WinName) {
    this.game.audio.click();
    if (this.open.has(n)) this.close(n); else this.show(n);
  }

  /** Esc: en son açılan pencereyi kapatır; hiçbiri yoksa false döner. */
  closeTop() {
    const last = [...this.open].pop();
    if (!last) return false;
    this.close(last);
    return true;
  }

  refresh() { for (const n of this.open) this.render(n); }

  private syncInventoryMode() {
    this.els.inv?.classList.toggle('with-service', this.open.has('shop') || this.open.has('smith'));
  }

  update() {
    if (this.open.has('inv')) this.characterPreview?.update(this.game.player);
    if (this.open.has('autohunt')) {
      const panel = this.els.autohunt;
      const auto = this.game.autoHunt;
      const status = panel.querySelector<HTMLElement>('[data-auto-status]');
      if (status && status.textContent !== this.game.autoHunt.status) status.textContent = this.game.autoHunt.status;
      const heading = panel.querySelector<HTMLElement>('[data-auto-heading]');
      if (heading) heading.textContent = auto.enabled ? 'Oto av açık' : 'Oto av kapalı';
      const zone = panel.querySelector<HTMLElement>('[data-auto-zone]');
      if (zone) zone.textContent = auto.enabled ? `${Math.round(auto.center.x)}, ${Math.round(auto.center.z)}` : 'Bölge seçilmedi';
      const toggle = panel.querySelector<HTMLButtonElement>('[data-auto-main-toggle]');
      if (toggle) {
        toggle.textContent = auto.enabled ? 'Oto Avı Durdur' : 'Bulunduğum Bölgede Başlat';
        toggle.classList.toggle('danger', auto.enabled);
        toggle.classList.toggle('primary', !auto.enabled);
      }
      panel.classList.toggle('is-active', auto.enabled);
    }
  }

  // ------------------------------------------------------------------ çizim

  private slot(s: ItemStack | null, attrs: string, extra = '') {
    if (!s) return `<div class="slot empty ${extra}" ${attrs}></div>`;
    const d = ITEMS[s.id];
    const color = d.icon === 'potion' ? '#ff5a4a' : d.icon === 'potionmp' ? '#4a9cff' : RARITY_COLORS[d.rarity];
    return `<div class="slot r${d.rarity} ${extra}" draggable="true" ${attrs}>${icon(d.icon, color)}${s.plus > 0 ? `<b>+${s.plus}</b>` : ''}${s.count > 1 ? `<em>${s.count}</em>` : ''}</div>`;
  }

  /** Çok hücreli eşyaları açık ızgara konumu ve boyut aralığıyla çizer. */
  private invCell(i: number) {
    const p = this.game.player;
    const c = p.inv[i];
    if (c && isLink(c)) return '';
    const s = asStack(c);
    const size = s ? itemSize(s.id) : 1;
    const col = (i % INVENTORY_COLS) + 1;
    const row = Math.floor((i % INVENTORY_PAGE_SIZE) / INVENTORY_COLS) + 1;
    const style = `grid-column:${col};grid-row:${row} / span ${size}`;
    const extra = size > 1 ? `multi s${size}` : '';
    return this.slot(s, `data-inv="${i}" style="${style}" aria-label="Envanter gözü ${i + 1}"`, extra);
  }

  private render(n: WinName) {
    const body = this.els[n].querySelector('.body') as HTMLElement;
    const g = this.game, p = g.player;
    if (!p) return;
    switch (n) {
      case 'inv': {
        const mode = this.open.has('shop') ? 'Sağ tık: sat' : this.open.has('smith') ? 'Sol tık: yükseltmek için seç' : 'Sağ tık / çift tık: kullan veya kuşan';
        const pageStart = this.inventoryPage * INVENTORY_PAGE_SIZE;
        const equipmentSlot = (slot: EquipSlot) => `
          <div class="paperdoll-equip" title="${SLOT_NAMES[slot]}">
            ${this.slot(p.equip[slot], `data-equip="${slot}" aria-label="${SLOT_NAMES[slot]}"`, 'paperdoll-slot')}
            <small>${SLOT_NAMES[slot]}</small>
          </div>`;
        body.innerHTML = `
          <div class="inventory-layout">
            <section class="inventory-paperdoll">
              <div class="inventory-section-title"><span>Karakter</span><span>Giydiklerin</span></div>
              <div class="paperdoll-stage">
                <div class="paperdoll-rail">${['weapon', 'necklace', 'ring'].map((slot) => equipmentSlot(slot as EquipSlot)).join('')}</div>
                <div class="paperdoll-portrait">
                  <div class="paperdoll-canvas-host"></div>
                  <div class="paperdoll-caption"><b data-inventory-name></b><small>Seviye ${p.level} · ${p.cls.name}</small></div>
                </div>
                <div class="paperdoll-rail">${['helmet', 'armor', 'boots'].map((slot) => equipmentSlot(slot as EquipSlot)).join('')}</div>
              </div>
              <div class="paperdoll-stats">
                <div><small>Saldırı</small><b>${p.atk}</b></div>
                <div><small>Savunma</small><b>${p.def}</b></div>
                <div><small>Kritik</small><b>%${p.crit.toFixed(0)}</b></div>
              </div>
            </section>
            <section class="inventory-bag">
              <div class="inventory-section-title"><span>Envanter</span><span><button class="inventory-sort" data-inv-sort title="Eşyaları tür ve enderliğe göre düzenle">⇅ Sırala</button>30 göz · ${this.inventoryPage + 1}/${INVENTORY_PAGE_COUNT}</span></div>
              <nav class="inventory-pages" aria-label="Envanter sayfaları">
                ${Array.from({ length: INVENTORY_PAGE_COUNT }, (_, page) => {
                  const locked = page >= INVENTORY_OPEN_PAGES;
                  return `<button class="inventory-page ${page === this.inventoryPage ? 'active' : ''} ${locked ? 'locked' : ''}" data-inv-page="${page}" ${locked ? 'disabled aria-label="Sayfa ' + (page + 1) + ', kilitli"' : 'aria-label="Sayfa ' + (page + 1) + '"'}>
                    ${locked ? '<span class="page-lock" aria-hidden="true"></span>' : ''}<b>${page + 1}</b>
                  </button>`;
                }).join('')}
              </nav>
              <div class="inventory-grid">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => this.invCell(pageStart + i)).join('')}</div>
            </section>
          </div>
          <footer class="inventory-footer">
            <span class="gold">${icon('coin', '#f0c040')}${p.gold.toLocaleString('tr-TR')} Akçe</span>
            <small>${mode} · Sürükle-bırak ile taşı</small>
          </footer>`;
        body.querySelector<HTMLElement>('[data-inventory-name]')!.textContent = p.name;
        this.characterPreview ??= new CharacterPreview();
        this.characterPreview.mount(body.querySelector<HTMLElement>('.paperdoll-canvas-host')!, p);
        break;
      }
      case 'char': {
        const need = p.expNeed;
        const RANKS: [number, string][] = [[40, 'Efsane'], [30, 'Kahraman'], [20, 'Şövalye'], [10, 'Savaşçı'], [1, 'Çaylak']];
        const rank = RANKS.find(([lvl]) => p.level >= lvl)![1];
        const SKILL_TYPES: Record<string, string> = { aoe: 'Alan Hasarı', strike: 'Tek Vuruş', dash: 'Atılma', buff: 'Güçlendirme', projectile: 'Mermi', targetAoe: 'Bölge Büyüsü' };
        const statEffect: Record<StatKey, string> = {
          str: `+${(p.stats.str * 2.2).toFixed(0)} saldırı`,
          dex: `+%${(p.stats.dex * 0.35).toFixed(1)} kritik · +%${(p.stats.dex * 0.6).toFixed(0)} saldırı hızı${p.cls.mainStat === 'dex' ? ` · +${(p.stats.dex * 2.2).toFixed(0)} saldırı` : ''}`,
          vit: `+${p.stats.vit * 20} can · +${(p.stats.vit * 0.7).toFixed(0)} savunma`,
          int: `+${p.stats.int * 10} mana${p.cls.mainStat === 'int' ? ` · +${(p.stats.int * 2.2).toFixed(0)} saldırı` : ''}`,
        };
        const tabs: [string, string][] = [['stats', 'Nitelikler'], ['skills', 'Yetenekler'], ['combat', 'Savaş Özeti']];
        let content = '';
        if (this.charTab === 'stats') {
          content = `
            <div class="points ${p.statPoints > 0 ? 'has' : ''}">Dağıtılabilir nitelik puanı: <b>${p.statPoints}</b><small>Her seviye +3 puan</small></div>
            <div class="stats">${(Object.keys(STAT_NAMES) as StatKey[]).map((k) => `
              <div class="stat" title="${STAT_NAMES[k][1]}"><span>${STAT_NAMES[k][0]}${p.cls.mainStat === k ? ' ★' : ''}<small class="stat-fx">${statEffect[k]}</small></span><b>${p.stats[k]}</b>
              <button class="plus" data-stat="${k}" ${p.statPoints > 0 ? '' : 'disabled'}>+</button></div>`).join('')}</div>
            <div class="derived">
              <div><span>Can</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
              <div><span>Mana</span><b>${Math.floor(p.mp)} / ${p.maxMp}</b></div>
              <div><span>Saldırı Gücü</span><b>${p.atk}</b></div>
              <div><span>Savunma</span><b>${p.def}</b></div>
              <div><span>Kritik Şansı</span><b>%${p.crit.toFixed(1)}</b></div>
              <div><span>Saldırı Hızı</span><b>%${Math.round(p.atkSpeed * 100)}</b></div>
              <div><span>Hareket Hızı</span><b>${p.moveSpeed.toFixed(1)}</b></div>
            </div>`;
        } else if (this.charTab === 'skills') {
          content = `<div class="skill-list">${p.skills.map((sk, i) => {
            const locked = p.level < sk.level;
            const active = p.buffs.find((b) => b.id === sk.id);
            const extras = [
              sk.mult ? `Güç %${Math.round(sk.mult * 100)}` : '',
              sk.radius ? `Alan ${sk.radius} m` : '',
              sk.stun ? `Sersemletme ${sk.stun} sn` : '',
              sk.slow ? `Yavaşlatma ${sk.slow} sn` : '',
              sk.buff ? `Süre ${sk.buff.dur} sn` : '',
            ].filter(Boolean).join(' · ');
            return `<div class="sk ${locked ? 'locked' : ''} ${active ? 'active' : ''}"><i>${icon(sk.icon)}</i><div>
              <b>[${i + 1}] ${sk.name}</b><em class="sk-type">${SKILL_TYPES[sk.type] ?? sk.type}</em>
              <small>${locked ? `Seviye ${sk.level}'de açılır · ` : ''}${sk.mp} mana · ${sk.cd} sn bekleme</small>
              ${extras ? `<small class="sk-fx">${extras}</small>` : ''}
              ${active ? `<small class="sk-on">Etkin · ${active.t.toFixed(0)} sn kaldı</small>` : ''}
              <p>${sk.desc}</p></div></div>`;
          }).join('')}</div>`;
        } else {
          const eq = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, speed: 0 };
          for (const slot of EQUIP_SLOTS) {
            const s = p.equip[slot];
            if (!s) continue;
            const d = ITEMS[s.id], m = plusMult(s.plus);
            eq.atk += (d.atk ?? 0) * m; eq.def += (d.def ?? 0) * m;
            eq.hp += (d.hp ?? 0) * m; eq.mp += (d.mp ?? 0) * m;
            eq.crit += d.crit ?? 0; eq.speed += d.speed ?? 0;
          }
          const bonus = p.buffs.length ? `<h4>Etkin Güçlendirmeler</h4><div class="buff-list">${p.buffs.map((b) => {
            const def = SKILLS[b.id];
            return `<div class="buff"><b>${def?.name ?? b.id}</b><small>${[
              b.def.atk ? `+%${Math.round(b.def.atk * 100)} saldırı` : '',
              b.def.def ? `+%${Math.round(b.def.def * 100)} savunma` : '',
              b.def.speed ? `+%${Math.round(b.def.speed * 100)} hız` : '',
              b.def.crit ? `+%${b.def.crit} kritik` : '',
            ].filter(Boolean).join(' · ')} — ${b.t.toFixed(0)} sn kaldı</small></div>`;
          }).join('')}</div>` : `<p class="dim-note">Etkin güçlendirme yok.</p>`;
          content = `
            <h4>Ekipman Katkısı</h4>
            <div class="derived">
              <div><span>Saldırı Gücü</span><b>+${Math.round(eq.atk)}</b></div>
              <div><span>Savunma</span><b>+${Math.round(eq.def)}</b></div>
              <div><span>Can</span><b>+${Math.round(eq.hp)}</b></div>
              <div><span>Mana</span><b>+${Math.round(eq.mp)}</b></div>
              <div><span>Kritik</span><b>+%${eq.crit.toFixed(0)}</b></div>
              <div><span>Hız</span><b>+%${eq.speed.toFixed(0)}</b></div>
            </div>
            <h4>Savaş Değerleri</h4>
            <div class="derived">
              <div><span>Vuruş Hasarı</span><b>~${Math.round(p.atk * 0.88)}–${Math.round(p.atk * 1.12)}</b></div>
              <div><span>Kritik Vuruş</span><b>~${Math.round(p.atk * 1.12 * 1.5)}+</b></div>
              <div><span>Hasar Kesintisi</span><b>-${Math.round(p.def * 0.5)} / vuruş</b></div>
              <div><span>Saldırı Menzili</span><b>${p.cls.range.toFixed(1)} m</b></div>
              <div><span>Saniyedeki Vuruş</span><b>${(1 / (0.5 / p.atkSpeed)).toFixed(1)}</b></div>
              <div><span>Silah Türü</span><b>${({ sword: 'Kılıç', dagger: 'Hançer', staff: 'Asa', spear: 'Mızrak', axe: 'Balta', club: 'Topuz', none: 'Yok' } as Record<string, string>)[p.cls.weapon] ?? p.cls.weapon}</b></div>
            </div>
            ${bonus}
            <h4>Kaynaklar</h4>
            <div class="derived">
              <div><span>Can İksiri</span><b>${p.potionCount('hp')}</b></div>
              <div><span>Mana İksiri</span><b>${p.potionCount('mp')}</b></div>
              <div><span>Akçe</span><b>${p.gold.toLocaleString('tr-TR')}</b></div>
            </div>`;
        }
        body.innerHTML = `
          <div class="char-head"><b data-character-name></b><span>${p.cls.name} · Seviye ${p.level} · <i class="rank">${rank}</i></span></div>
          <div class="exp-bar"><i style="width:${Math.min(100, (p.exp / need) * 100).toFixed(1)}%"></i><span>${p.exp.toLocaleString('tr-TR')} / ${need.toLocaleString('tr-TR')} tecrübe</span></div>
          <nav class="char-tabs">${tabs.map(([k, l]) => `<button data-char-tab="${k}" class="${this.charTab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
          ${content}`;
        body.querySelector<HTMLElement>('[data-character-name]')!.textContent = p.name;
        break;
      }
      case 'shop': {
        const stock = SHOPS[this.shopNpcId] ?? SHOP_STOCK;
        const npc = NPCS.find((n) => n.id === this.shopNpcId);
        const say = this.shopNpcId === 'weaponsmith'
          ? '“Keskin çelik, usta işi! Kılıç mı, hançer mi, asa mı, yoksa mızrak mı? En iyileri yalnızca bende.”'
          : this.shopNpcId === 'armorer'
            ? '“Sağlam zırh hayat kurtarır. Gel, sana uygun bir zırh seçelim.”'
            : '“Hoş geldin yolcu! En iyi mallar bende. Çantandaki eşyaları sağ tıklayarak bana satabilirsin.”';
        const titleEl = this.els.shop.querySelector('h3');
        if (titleEl && npc) titleEl.textContent = npc.name;
        const CATS: [string, string][] = [['all', 'Tümü'], ['weapon', 'Silah'], ['armor', 'Zırh'], ['jewel', 'Takı'], ['consum', 'İksir/Diğer']];
        const catOf = (id: string) => {
          const t = ITEMS[id].type;
          return t === 'weapon' ? 'weapon' : ['armor', 'helmet', 'boots'].includes(t) ? 'armor' : ['necklace', 'ring'].includes(t) ? 'jewel' : 'consum';
        };
        const cats = CATS.filter(([k]) => k === 'all' || stock.some((id) => catOf(id) === k));
        const list = stock.filter((id) => this.shopCat === 'all' || catOf(id) === this.shopCat);
        const pageStart = this.inventoryPage * INVENTORY_PAGE_SIZE;
        body.innerHTML = `<p class="npc-say">${say}</p>
          <div class="shop-layout">
            <section class="shop-stock">
              <div class="shop-tabs">${cats.map(([k, l]) => `<button data-shop-cat="${k}" class="${this.shopCat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
              <div class="shop-list">${list.map((id) => {
                const d = ITEMS[id];
                const usable = !d.cls || d.cls === p.cls.id;
                return `<div class="row ${usable ? '' : 'dim'}">${this.slot({ id, plus: 0, count: 1 }, `data-tip="${id}"`)}
                  <div class="nm"><b style="color:${RARITY_COLORS[d.rarity]}">${d.name}</b><small>${d.cls ? CLASSES[d.cls].name + ' · ' : ''}Sv. ${d.level}${ITEMS[id].stack ? ' · yığın' : ''}</small></div>
                  <span class="price ${p.gold < d.price ? 'no' : ''}">${d.price.toLocaleString('tr-TR')}</span>
                  <button data-buy="${id}">${d.stack ? 'Al <small>(⇧ x10)</small>' : 'Al'}</button></div>`;
              }).join('') || '<i class="shop-empty">Bu kategoride mal yok.</i>'}</div>
            </section>
            <section class="shop-sell">
              <div class="inventory-section-title"><span>Satış</span><span>Çantandan sağ tıkla sat</span></div>
              <nav class="inventory-pages">${Array.from({ length: INVENTORY_OPEN_PAGES }, (_, page) =>
                `<button class="inventory-page ${page === this.inventoryPage ? 'active' : ''}" data-inv-page="${page}" aria-label="Sayfa ${page + 1}"><b>${page + 1}</b></button>`).join('')}</nav>
              <div class="inventory-grid shop-inv">${Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => this.invCell(pageStart + i)).join('')}</div>
              <div class="shop-sell-actions">
                <button data-sell-bulk="equip0" title="Sıradan (beyaz) ekipmanları toplu sat">Adi Eşyaları Sat</button>
                <button data-sell-bulk="materials" title="Malzemeleri toplu sat (Ruh Kristali hariç)">Malzemeleri Sat</button>
              </div>
              <div class="shop-gold">${icon('coin', '#f0c040')}<b>${p.gold.toLocaleString('tr-TR')}</b> Akçe</div>
            </section>
          </div>`;
        break;
      }
      case 'smith': {
        const s = this.smithRef ? g.economy.resolve(this.smithRef) : null;
        const info = this.smithRef ? g.economy.upgradeInfo(this.smithRef) : null;
        const crystals = p.countItem('crystal');
        body.innerHTML = `<p class="npc-say">“Örsüm sıcak, çekicim hazır. Envanterinden ya da üzerinden bir eşya seç; onu güçlendireyim. Ama unutma: başarısız olursa eşya bir kademe düşer.”</p>
          <div class="smith-box">${this.slot(s, s ? `data-tip="${s.id}" data-plus="${s.plus}"` : '', 'big')}
          <div class="smith-info">${!s ? '<i>Bir eşya seç (sol tık)</i>' : !info
            ? `<b>${itemLabel(s)}</b><i>${isEquip(ITEMS[s.id]) ? `Bu eşya en üst seviyede (+${MAX_PLUS}).` : 'Bu eşya yükseltilemez.'}</i>`
            : `<b>${itemLabel(s)} → +${s.plus + 1}</b>
               <div>Başarı şansı: <b class="chance">%${info.chance}</b></div>
               <div>Ücret: <b class="${p.gold < info.cost ? 'no' : ''}">${info.cost.toLocaleString('tr-TR')} Akçe</b></div>
               ${info.crystal ? `<div>Gerekli: <b class="${crystals < 1 ? 'no' : ''}">1 Ruh Kristali</b> (elinde: ${crystals})</div>` : ''}`}
          </div></div>
          <button class="primary" data-upgrade ${info ? '' : 'disabled'}>Yükselt</button>`;
        break;
      }
      case 'quest': {
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
          body.innerHTML = `${step}<h4>${q.title}</h4><p class="npc-say">“${q.done}”</p>${rewards}<div class="btns"><button class="primary" data-quest="turnin">Ödülü Al</button></div>`;
        } else {
          const now = g.quests.progressNow();
          const pct = Math.round((now / q.count) * 100);
          body.innerHTML = `${step}<h4>${q.title}</h4><p class="npc-say">“${q.text}”</p>
            <div class="reward"><b>İlerleme:</b> ${now} / ${q.count}</div>
            <div class="qbar"><i style="width:${pct}%"></i></div>${rewards}
            <div class="btns"><button data-close="quest">Tamam</button></div>`;
        }
        break;
      }
      case 'settings': {
        const qs: [Quality, string][] = [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra']];
        const dayModes: [DayNightMode, string][] = [['cycle', 'Döngü'], ['day', 'Gündüz sabit'], ['night', 'Gece sabit']];
        const dayModeHelp: Record<DayNightMode, string> = {
          cycle: 'Oyun saati akarak gündüz ve geceyi değiştirir.',
          day: 'Dünya sürekli 12:00 gündüzünde kalır.',
          night: 'Dünya sürekli 00:00 gecesinde kalır.',
        };
        body.innerHTML = `
          <h4>Grafik Kalitesi</h4>
          <div class="seg">${qs.map(([k, l]) => `<button data-quality="${k}" class="${g.pipeline.quality === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <h4>Dünya Zamanı</h4>
          <div class="seg day-night-options">${dayModes.map(([mode, label]) => `<button data-day-night="${mode}" class="${g.dayNightMode === mode ? 'on' : ''}">${label}</button>`).join('')}</div>
          <p class="day-night-help">${dayModeHelp[g.dayNightMode]}</p>
          <h4>Ses</h4>
          <div class="seg"><button data-mute="0" class="${g.audio.muted ? '' : 'on'}">Açık</button><button data-mute="1" class="${g.audio.muted ? 'on' : ''}">Kapalı</button></div>
          <h4>Kontroller</h4>
          <div class="keys">
            <div><kbd>W A S D</kbd> Hareket</div><div><kbd>Shift</kbd> Koş</div>
            <div><kbd>Boşluk</kbd> Saldır</div><div><kbd>1–4</kbd> Yetenekler</div>
            <div><kbd>5</kbd> / <kbd>6</kbd> Can / mana iksiri</div><div><kbd>Z</kbd> Ganimeti topla</div>
            <div><kbd>H</kbd> Oto avı aç/kapat</div><div>Oto av çubuğundaki ⚙ gelişmiş ayarlar</div>
            <div><kbd>E</kbd> Konuş</div><div><kbd>Tab</kbd> Hedef değiştir</div>
            <div><kbd>Sol tık</kbd> Hedef seç / yürü</div><div><kbd>Sürükle</kbd> Kamerayı döndür</div>
            <div><kbd>Tekerlek</kbd> Yakınlaştır</div><div><kbd>I</kbd> <kbd>C</kbd> <kbd>J</kbd> Pencereler</div>
          </div>
          <div class="btns"><button class="primary" data-save>Oyunu Kaydet</button><button class="danger" data-reset>Karakteri Sil</button></div>`;
        break;
      }
      case 'autohunt': {
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
        break;
      }
    }
  }

  // ------------------------------------------------------------------ etkileşim

  private refOf(t: HTMLElement): ItemRef | null {
    const s = t.closest('[data-inv],[data-equip]') as HTMLElement | null;
    if (!s) return null;
    return s.dataset.inv !== undefined ? { inv: Number(s.dataset.inv) } : { equip: s.dataset.equip as EquipSlot };
  }

  private onDragStart(e: DragEvent) {
    const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    const ref = slot && this.refOf(slot);
    if (this.open.has('shop') || this.open.has('smith')) { e.preventDefault(); return; }
    if (!ref || !e.dataTransfer) return;
    const item = this.game.economy.resolve(ref);
    if (!item) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-gokdemir-item', JSON.stringify(ref));
    e.dataTransfer.effectAllowed = 'move';
    slot.classList.add('dragging');
  }

  private onDragOver(e: DragEvent) {
    const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    if (!slot || this.open.has('shop') || this.open.has('smith')) return;
    if (e.dataTransfer?.types.includes('application/x-gokdemir-item')) {
      e.preventDefault();
      slot.classList.add('drop-hover');
    }
  }

  private onDrop(e: DragEvent) {
    const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    const raw = e.dataTransfer?.getData('application/x-gokdemir-item');
    if (!target || !raw || this.open.has('shop') || this.open.has('smith')) return;
    let source: ItemRef;
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return;
      const record = value as Record<string, unknown>;
      if (Number.isInteger(record.inv) && (record.inv as number) >= 0 && (record.inv as number) < this.game.player.inv.length) {
        source = { inv: record.inv as number };
      } else if (typeof record.equip === 'string' && EQUIP_SLOTS.includes(record.equip as EquipSlot)) {
        source = { equip: record.equip as EquipSlot };
      } else return;
    } catch {
      return;
    }
    const destination = this.refOf(target);
    if (!destination) return;
    e.preventDefault();
    this.game.player.moveItem(source, destination);
    target.classList.remove('drop-hover');
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const g = this.game, p = g.player;
    const btn = t.closest('button') as HTMLButtonElement | null;
    if (btn) {
      const d = btn.dataset;
      if (d.close) { g.audio.click(); this.close(d.close as WinName); }
      else if (d.invSort !== undefined) { p.sortInventory(); g.audio.click(); }
      else if (d.invPage !== undefined) {
        const page = Number(d.invPage);
        if (Number.isInteger(page) && page >= 0 && page < INVENTORY_OPEN_PAGES) {
          this.inventoryPage = page;
          this.render('inv');
          if (this.open.has('shop')) this.render('shop');
        }
      }
      else if (d.charTab) { this.charTab = d.charTab as typeof this.charTab; g.audio.click(); this.render('char'); }
      else if (d.shopCat) { this.shopCat = d.shopCat; g.audio.click(); this.render('shop'); }
      else if (d.sellBulk) { g.economy.sellBulk(d.sellBulk as 'equip0' | 'materials'); }
      else if (d.stat) { p.addStat(d.stat as StatKey); g.audio.click(); }
      else if (d.buy) g.economy.buy(d.buy, e.shiftKey ? 10 : 1);
      else if (d.upgrade !== undefined && this.smithRef) {
        g.economy.upgrade(this.smithRef);
      }
      else if (d.quest === 'accept') { g.quests.accept(); this.close('quest'); }
      else if (d.quest === 'turnin') { g.quests.turnIn(); this.render('quest'); }
      else if (d.quality) { g.setQuality(d.quality as Quality); this.render('settings'); }
      else if (d.dayNight) { g.setDayNightMode(d.dayNight as DayNightMode); this.render('settings'); }
      else if (d.autoToggle !== undefined) { g.autoHunt.toggle(p); this.render('autohunt'); }
      else if (d.mute) {
        g.audio.setMuted(d.mute === '1');
        SaveSystem.saveSettings({ quality: g.pipeline.quality, muted: g.audio.muted, dayNight: g.dayNightMode });
        this.render('settings');
      }
      else if (d.save !== undefined) { g.saveNow(); g.events.emit('log', { msg: 'Oyun kaydedildi.', cls: 'good' }); }
      else if (d.reset !== undefined) {
        if (confirm('Karakterin kalıcı olarak silinecek. Emin misin?')) {
          g.started = false;
          SaveSystem.clear();
          location.reload();
        }
      }
      return;
    }
    const ref = this.refOf(t);
    if (ref && this.open.has('smith') && g.economy.resolve(ref)) {
      this.smithRef = ref;
      g.audio.click();
      this.render('smith');
    } else if (ref && matchMedia('(any-pointer: coarse)').matches) {
      if (this.open.has('shop') && 'inv' in ref) g.economy.sell(ref.inv);
      else if (!this.open.has('shop')) { if ('inv' in ref) p.useSlot(ref.inv); else p.unequip(ref.equip); }
    }
  }

  private onChange(e: Event) {
    const t = e.target as HTMLElement;
    const skillField = t.closest('[data-auto-skill]') as HTMLInputElement | null;
    if (skillField) {
      this.game.autoHunt.setSkillEnabled(Number(skillField.dataset.autoSkill), skillField.checked);
      this.game.audio.click();
      return;
    }
    const field = t.closest('[data-auto-setting]') as HTMLInputElement | HTMLSelectElement | null;
    if (!field) return;
    const key = field.dataset.autoSetting as keyof AutoHuntSettings | undefined;
    if (!key) return;
    const value = field instanceof HTMLInputElement ? field.checked : field.value;
    this.game.autoHunt.setSetting(key, value, this.game.player);
    this.game.audio.click();
    this.render('autohunt');
  }

  /** Sağ tık / çift tık: kullan, kuşan, çıkar ya da sat. */
  private onUse(e: MouseEvent) {
    const ref = this.refOf(e.target as HTMLElement);
    if (!ref) return;
    const g = this.game;
    this.smithRef = null;
    if ('equip' in ref) g.player.unequip(ref.equip);
    else if (this.open.has('shop')) g.economy.sell(ref.inv);
    else g.player.useSlot(ref.inv);
    this.tooltip.style.display = 'none';
  }

  private onHover(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    if (!t) { this.tooltip.style.display = 'none'; return; }
    const p = this.game.player;
    let s: ItemStack | null = null;
    let hint = '';
    if (t.dataset.inv !== undefined) {
      s = p.stackAt(Number(t.dataset.inv));
      if (s) hint = this.open.has('shop') ? `Sağ tık: sat (${this.game.economy.sellPrice(Number(t.dataset.inv)).toLocaleString('tr-TR')} Akçe)` : isEquip(ITEMS[s.id]) ? 'Sağ tık: kuşan' : ITEMS[s.id].type === 'potion' ? 'Sağ tık: kullan' : '';
    } else if (t.dataset.equip) {
      s = p.equip[t.dataset.equip as EquipSlot];
      hint = 'Sağ tık: çıkar';
    } else if (t.dataset.tip) {
      s = { id: t.dataset.tip, plus: Number(t.dataset.plus ?? 0), count: 1 };
    }
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const d = ITEMS[s.id], m = plusMult(s.plus);
    const line = (label: string, v: number | undefined, scale = true, suffix = '') =>
      v ? `<div class="st">${label}: <b>+${Math.round(v * (scale ? m : 1))}${suffix}</b></div>` : '';
    const bad = (cond: boolean) => (cond ? ' class="no"' : '');
    this.tooltip.innerHTML = `
      <h5 style="color:${RARITY_COLORS[d.rarity]}">${itemLabel(s)}</h5>
      <div class="sub">${RARITY_NAMES[d.rarity]} · ${d.type === 'potion' ? 'İksir' : d.type === 'material' ? 'Malzeme' : SLOT_NAMES[d.type as EquipSlot]}${(d.size ?? 1) > 1 ? ` · ${d.size} göz` : ''}</div>
      ${line('Saldırı Gücü', d.atk)}${line('Savunma', d.def)}${line('Can', d.hp)}${line('Mana', d.mp)}${line('Kritik', d.crit, false, '%')}${line('Hareket Hızı', d.speed, false, '%')}
      ${d.desc ? `<p>${d.desc}</p>` : ''}
      ${isEquip(d) ? `<div${bad(d.level > p.level)}>Gereken seviye: ${d.level}</div>` : ''}
      ${d.cls ? `<div${bad(d.cls !== p.cls.id)}>Sınıf: ${CLASSES[d.cls].name}</div>` : ''}
      <div class="val">Değer: ${d.price.toLocaleString('tr-TR')} Akçe</div>
      ${hint ? `<div class="hint">${hint}</div>` : ''}`;
    this.tooltip.style.display = 'block';
    const r = t.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    let x = r.left - tw - 10;
    if (x < 8) x = r.right + 10;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - th - 8, r.top))}px`;
  }
}

export const QUEST_TOTAL = QUESTS.length;
