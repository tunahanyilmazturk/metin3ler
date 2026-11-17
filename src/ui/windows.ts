import { CLASSES, StatKey } from '../data/classes';
import {
  EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, MAX_PLUS, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, SLOT_NAMES,
  isEquip, itemLabel, plusMult,
} from '../data/items';
import { QUESTS } from '../data/quests';
import { INVENTORY_OPEN_PAGES, INVENTORY_PAGE_COUNT, INVENTORY_PAGE_SIZE } from '../data/inventory';
import type { DayNightMode } from '../data/settings';
import type { Quality } from '../render/pipeline';
import { AUTO_HUNT_RADII, AUTO_HUNT_THRESHOLDS } from '../systems/autoHunt';
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

  constructor(private game: Game, root: HTMLElement, private tooltip: HTMLElement) {
    (Object.keys(TITLES) as WinName[]).forEach((name) => {
      const el = document.createElement('div');
      el.className = `win win-${name} hidden`;
      el.innerHTML = `<header><h3>${TITLES[name]}</h3><button class="x" data-close="${name}" aria-label="Kapat">✕</button></header><div class="body"></div>`;
      root.appendChild(el);
      this.els[name] = el;
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

  get anyOpen() { return this.open.size > 0; }
  isOpen(n: WinName) { return this.open.has(n); }

  show(n: WinName) {
    if (n === 'shop' || n === 'smith') { this.close('shop'); this.close('smith'); this.close('quest'); }
    if (n === 'quest') { this.close('shop'); this.close('smith'); }
    this.open.add(n);
    this.syncInventoryMode();
    if (n === 'shop' || n === 'smith') this.show('inv');
    this.els[n].classList.remove('hidden');
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
              <div class="inventory-section-title"><span>Envanter</span><span>30 göz · ${this.inventoryPage + 1}/${INVENTORY_PAGE_COUNT}</span></div>
              <nav class="inventory-pages" aria-label="Envanter sayfaları">
                ${Array.from({ length: INVENTORY_PAGE_COUNT }, (_, page) => {
                  const locked = page >= INVENTORY_OPEN_PAGES;
                  return `<button class="inventory-page ${page === this.inventoryPage ? 'active' : ''} ${locked ? 'locked' : ''}" data-inv-page="${page}" ${locked ? 'disabled aria-label="Sayfa ' + (page + 1) + ', kilitli"' : 'aria-label="Sayfa ' + (page + 1) + '"'}>
                    ${locked ? '<span class="page-lock" aria-hidden="true"></span>' : ''}<b>${page + 1}</b>
                  </button>`;
                }).join('')}
              </nav>
              <div class="inventory-grid">${p.inv.slice(pageStart, pageStart + INVENTORY_PAGE_SIZE).map((s, i) => this.slot(s, `data-inv="${pageStart + i}" aria-label="Envanter gözü ${pageStart + i + 1}"`)).join('')}</div>
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
        body.innerHTML = `
          <div class="char-head"><b data-character-name></b><span>${p.cls.name} · Seviye ${p.level}</span></div>
          <div class="exp-line">Tecrübe: ${p.exp.toLocaleString('tr-TR')} / ${need.toLocaleString('tr-TR')}</div>
          <div class="points ${p.statPoints > 0 ? 'has' : ''}">Dağıtılabilir nitelik puanı: <b>${p.statPoints}</b></div>
          <div class="stats">${(Object.keys(STAT_NAMES) as StatKey[]).map((k) => `
            <div class="stat" title="${STAT_NAMES[k][1]}"><span>${STAT_NAMES[k][0]}${p.cls.mainStat === k ? ' ★' : ''}</span><b>${p.stats[k]}</b>
            <button class="plus" data-stat="${k}" ${p.statPoints > 0 ? '' : 'disabled'}>+</button></div>`).join('')}</div>
          <div class="derived">
            <div><span>Can</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
            <div><span>Mana</span><b>${Math.floor(p.mp)} / ${p.maxMp}</b></div>
            <div><span>Saldırı Gücü</span><b>${p.atk}</b></div>
            <div><span>Savunma</span><b>${p.def}</b></div>
            <div><span>Kritik Şansı</span><b>%${p.crit.toFixed(1)}</b></div>
            <div><span>Saldırı Hızı</span><b>%${Math.round(p.atkSpeed * 100)}</b></div>
            <div><span>Hareket Hızı</span><b>${p.moveSpeed.toFixed(1)}</b></div>
          </div>
          <h4>Yetenekler</h4>
          <div class="skill-list">${p.skills.map((sk, i) => `
            <div class="sk ${p.level < sk.level ? 'locked' : ''}"><i>${icon(sk.icon)}</i><div><b>[${i + 1}] ${sk.name}</b>
            <small>${p.level < sk.level ? `Seviye ${sk.level}'de açılır · ` : ''}${sk.mp} mana · ${sk.cd} sn</small><p>${sk.desc}</p></div></div>`).join('')}</div>`;
        body.querySelector<HTMLElement>('[data-character-name]')!.textContent = p.name;
        break;
      }
      case 'shop':
        body.innerHTML = `<p class="npc-say">“Hoş geldin yolcu! En iyi mallar bende. Çantandaki eşyaları sağ tıklayarak bana satabilirsin.”</p>
          <div class="shop-list">${SHOP_STOCK.map((id) => {
            const d = ITEMS[id];
            const usable = !d.cls || d.cls === p.cls.id;
            return `<div class="row ${usable ? '' : 'dim'}">${this.slot({ id, plus: 0, count: 1 }, `data-tip="${id}"`)}
              <div class="nm"><b style="color:${RARITY_COLORS[d.rarity]}">${d.name}</b><small>${d.cls ? CLASSES[d.cls].name + ' · ' : ''}Sv. ${d.level}</small></div>
              <span class="price ${p.gold < d.price ? 'no' : ''}">${d.price.toLocaleString('tr-TR')}</span>
              <button data-buy="${id}">${d.stack ? 'Al <small>(Shift: x10)</small>' : 'Al'}</button></div>`;
          }).join('')}</div>`;
        break;
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
        if (!q) {
          body.innerHTML = `<p class="npc-say">“Yapılacak her şeyi yaptın, kahraman. Gökdemir sana minnettar. Diyarı dilediğince keşfet.”</p><div class="btns"><button data-close="quest">Kapat</button></div>`;
        } else if (!g.quests.accepted) {
          body.innerHTML = `<h4>${q.title}</h4><p class="npc-say">“${q.text}”</p>
            <div class="reward"><b>Hedef:</b> ${q.kind === 'upgrade' ? 'Bir eşyayı +' + q.count + ' yap' : `${q.count} × ${q.targetName}`}</div>
            <div class="reward"><b>Ödül:</b> ${q.exp.toLocaleString('tr-TR')} tecrübe, ${q.gold.toLocaleString('tr-TR')} Akçe${(q.items ?? []).map((it) => `, ${ITEMS[it.id].name} x${it.count}`).join('')}</div>
            <div class="btns"><button class="primary" data-quest="accept">Kabul Et</button><button data-close="quest">Sonra</button></div>`;
        } else if (g.quests.complete) {
          body.innerHTML = `<h4>${q.title}</h4><p class="npc-say">“${q.done}”</p><div class="btns"><button class="primary" data-quest="turnin">Ödülü Al</button></div>`;
        } else {
          body.innerHTML = `<h4>${q.title}</h4><p class="npc-say">“${q.text}”</p>
            <div class="reward"><b>İlerleme:</b> ${g.quests.progress} / ${q.count}</div><div class="btns"><button data-close="quest">Tamam</button></div>`;
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
        const select = (key: keyof AutoHuntSettings, value: number, values: readonly number[]) =>
          `<select data-auto-setting="${key}">${values.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${option}%</option>`).join('')}</select>`;
        const radiusOptions = AUTO_HUNT_RADII.map((radius) =>
          `<option value="${radius}" ${radius === auto.settings.radius ? 'selected' : ''}>${radius} m</option>`).join('');
        const check = (key: keyof AutoHuntSettings, label: string, checked: boolean) => `
          <label class="auto-check"><input type="checkbox" data-auto-setting="${key}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
        body.innerHTML = `
          <div class="auto-status-card">
            <span class="auto-status-dot"></span>
            <div><b data-auto-heading>${auto.enabled ? 'Oto av açık' : 'Oto av kapalı'}</b><small data-auto-status>${auto.status}</small></div>
            <span class="auto-zone" data-auto-zone>${auto.enabled ? `${Math.round(auto.center.x)}, ${Math.round(auto.center.z)}` : 'Bölge seçilmedi'}</span>
          </div>
          <button class="${auto.enabled ? 'danger' : 'primary'} auto-main-toggle" data-auto-toggle data-auto-main-toggle>
            ${auto.enabled ? 'Oto Avı Durdur' : 'Bulunduğum Bölgede Başlat'}
          </button>
          <p class="auto-note">Oto av, başlatıldığı noktanın çevresinde kalır. Manuel hareket ve saldırı önceliklidir; envantere sığmayan eşyalar yerde kalır. Kısayol: <kbd>H</kbd></p>
          <h4>Av Alanı</h4>
          <label class="auto-setting-row"><span>Alan yarıçapı</span><select data-auto-setting="radius">${radiusOptions}</select></label>
          <h4>Otomatik Davranışlar</h4>
          <div class="auto-checks">
            ${check('collectItems', 'Ganimetleri topla', auto.settings.collectItems)}
            ${check('useSkills', 'Hazır yetenekleri kullan', auto.settings.useSkills)}
            ${check('usePotions', 'Can ve mana iksiri kullan', auto.settings.usePotions)}
            ${check('attackBosses', 'Patron düşmanlara saldır', auto.settings.attackBosses)}
          </div>
          <div class="auto-thresholds">
            <label class="auto-setting-row"><span>Can iksiri eşiği</span>${select('hpThreshold', auto.settings.hpThreshold, AUTO_HUNT_THRESHOLDS)}</label>
            <label class="auto-setting-row"><span>Mana iksiri eşiği</span>${select('mpThreshold', auto.settings.mpThreshold, AUTO_HUNT_THRESHOLDS)}</label>
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
      else if (d.invPage !== undefined) {
        const page = Number(d.invPage);
        if (Number.isInteger(page) && page >= 0 && page < INVENTORY_OPEN_PAGES) {
          this.inventoryPage = page;
          this.render('inv');
        }
      }
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
    } else if (ref && !this.open.has('shop') && matchMedia('(any-pointer: coarse)').matches) {
      if ('inv' in ref) p.useSlot(ref.inv);
      else p.unequip(ref.equip);
    }
  }

  private onChange(e: Event) {
    const field = (e.target as HTMLElement).closest('[data-auto-setting]') as HTMLInputElement | HTMLSelectElement | null;
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
      s = p.inv[Number(t.dataset.inv)];
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
      <div class="sub">${RARITY_NAMES[d.rarity]} · ${d.type === 'potion' ? 'İksir' : d.type === 'material' ? 'Malzeme' : SLOT_NAMES[d.type as EquipSlot]}</div>
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
