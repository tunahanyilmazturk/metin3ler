import { CLASSES, StatKey } from '../data/classes';
import {
  EQUIP_SLOTS, EquipSlot, ITEMS, ItemStack, MAX_PLUS, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, SHOPS, SLOT_NAMES,
  isEquip, itemLabel, plusMult,
} from '../data/items';
import { QUESTS } from '../data/quests';
import { SKILLS } from '../data/skills';
import { NPCS, TRAVEL_SPOTS } from '../data/world';
import { HORSES } from '../data/horses';
import { EXCHANGES } from '../data/items';
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
import { renderInventory, renderVault } from './panels/inventory';
import { renderCharacter } from './panels/character';
import { renderShop } from './panels/shop';
import { renderTravel, renderInn, renderStable, renderSmith } from './panels/services';
import { renderQuest } from './panels/quest';
import { renderSettings } from './panels/settingsMenu';
import { renderAutoHunt } from './panels/settings';

export type SettingsTab = 'graphics' | 'sound' | 'game' | 'controls' | 'system';
export type WinName = 'inv' | 'char' | 'shop' | 'smith' | 'quest' | 'settings' | 'autohunt' | 'vault' | 'travel' | 'inn' | 'stable';

const TITLES: Record<WinName, string> = {
  inv: 'Envanter', char: 'Karakter', shop: 'Tüccar Sevinç', smith: 'Demirci Bora', quest: 'Bilge Aksakal', settings: 'Ayarlar', autohunt: 'Oto Av',
  vault: 'Kasadar Asude', travel: 'Rehber Davut', inn: 'Hancı Gülsüm', stable: 'Seyis Rahmi',
};

/** Oyun pencereleri: envanter, karakter, dükkân, demirci, görev ve ayarlar. */
export class Windows {
  els = {} as Record<WinName, HTMLDivElement>;
  open = new Set<WinName>();
  smithRef: ItemRef | null = null;
  characterPreview: CharacterPreview | null = null;
  inventoryPage = 0;
  shopNpcId = 'merchant';
  shopCat = 'all';
  charTab: 'stats' | 'skills' | 'combat' = 'stats';
  settingsTab: SettingsTab = 'graphics';

  constructor(readonly game: Game, root: HTMLElement, private tooltip: HTMLElement) {
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
    if (this.isNpcWin(n)) (['shop', 'smith', 'quest', 'vault', 'travel', 'inn', 'stable'] as WinName[]).forEach((w) => { if (w !== n) this.close(w); });
    this.open.add(n);
    this.syncInventoryMode();
    if (n === 'shop' || n === 'smith' || n === 'vault') this.show('inv');
    this.els[n].classList.remove('hidden');
    this.bringFront(this.els[n]);
    this.render(n);
  }

  private isNpcWin(n: WinName) {
    return n === 'shop' || n === 'smith' || n === 'quest' || n === 'vault' || n === 'travel' || n === 'inn' || n === 'stable';
  }

  close(n: WinName) {
    this.open.delete(n);
    this.syncInventoryMode();
    this.els[n].classList.add('hidden');
    if (n === 'smith') this.smithRef = null;
    this.tooltip.style.display = 'none';
    if ((n === 'shop' || n === 'smith' || n === 'vault') && this.open.has('inv')) this.render('inv');
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
    this.els.inv?.classList.toggle('with-service', this.open.has('shop') || this.open.has('smith') || this.open.has('vault'));
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

  slot(s: ItemStack | null, attrs: string, extra = '') {
    if (!s) return `<div class="slot empty ${extra}" ${attrs}></div>`;
    const d = ITEMS[s.id];
    const color = d.icon === 'potion' ? '#ff5a4a' : d.icon === 'potionmp' ? '#4a9cff' : RARITY_COLORS[d.rarity];
    return `<div class="slot r${d.rarity} ${extra}" draggable="true" ${attrs}>${icon(d.icon, color)}${s.plus > 0 ? `<b>+${s.plus}</b>` : ''}${s.count > 1 ? `<em>${s.count}</em>` : ''}</div>`;
  }

  /** Çok hücreli eşyaları açık ızgara konumu ve boyut aralığıyla çizer. */
  invCell(i: number) {
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
    if (!this.game.player) return;
    switch (n) {
      case 'inv': renderInventory(this, body); break;
      case 'vault': renderVault(this, body); break;
      case 'char': renderCharacter(this, body); break;
      case 'shop': renderShop(this, body); break;
      case 'travel': renderTravel(this, body); break;
      case 'inn': renderInn(this, body); break;
      case 'stable': renderStable(this, body); break;
      case 'smith': renderSmith(this, body); break;
      case 'quest': renderQuest(this, body); break;
      case 'settings': renderSettings(this, body); break;
      case 'autohunt': renderAutoHunt(this, body); break;
    }
  }

  // ------------------------------------------------------------------ etkileşim

  private refOf(t: HTMLElement): ItemRef | null {
    const s = t.closest('[data-inv],[data-equip]') as HTMLElement | null;
    if (!s) return null;
    return s.dataset.inv !== undefined ? { inv: Number(s.dataset.inv) } : { equip: s.dataset.equip as EquipSlot };
  }

  private vaultOf(t: HTMLElement): number | null {
    const s = t.closest('[data-vault]') as HTMLElement | null;
    return s ? Number(s.dataset.vault) : null;
  }

  private onDragStart(e: DragEvent) {
    const t = e.target as HTMLElement;
    // Karakter penceresindeki yetenek satırları kısayol çubuğuna sürüklenebilir.
    const sk = t.closest('[data-skill-idx]') as HTMLElement | null;
    if (sk) {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData('application/x-gokdemir-skill', sk.dataset.skillIdx!);
      e.dataTransfer.effectAllowed = 'copy';
      sk.classList.add('dragging');
      return;
    }
    const slot = t.closest('.slot') as HTMLElement | null;
    const ref = slot && this.refOf(slot);
    if (this.open.has('shop') || this.open.has('smith') || this.open.has('vault')) { e.preventDefault(); return; }
    if (!ref || !e.dataTransfer) return;
    const item = this.game.economy.resolve(ref);
    if (!item) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-gokdemir-item', JSON.stringify(ref));
    e.dataTransfer.effectAllowed = 'move';
    slot.classList.add('dragging');
  }

  private onDragOver(e: DragEvent) {
    const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    if (!slot || this.open.has('shop') || this.open.has('smith') || this.open.has('vault')) return;
    if (e.dataTransfer?.types.includes('application/x-gokdemir-item')) {
      e.preventDefault();
      slot.classList.add('drop-hover');
    }
  }

  private onDrop(e: DragEvent) {
    const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
    const raw = e.dataTransfer?.getData('application/x-gokdemir-item');
    if (!target || !raw || this.open.has('shop') || this.open.has('smith') || this.open.has('vault')) return;
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
      else if (d.travel !== undefined) {
        const spot = TRAVEL_SPOTS[Number(d.travel)];
        if (spot && g.teleport(spot.x, spot.z, spot.cost)) {
          g.events.emit('log', { msg: `Rehber seni ${spot.name} bölgesine götürdü.`, cls: 'good' });
          this.close('travel');
        }
      }
      else if (d.innHeal !== undefined) {
        const cost = Math.round(10 + p.level * 4);
        if (p.gold >= cost && (p.hp < p.maxHp || p.mp < p.maxMp)) {
          p.gold -= cost;
          p.hp = p.maxHp; p.mp = p.maxMp;
          g.audio.pickup();
          g.events.emit('log', { msg: 'Handa dinlendin; canın ve manan yenilendi.', cls: 'good' });
          g.events.emit('changed');
        }
      }
      else if (d.innFood) {
        const cost = Number(d.cost);
        const sk = SKILLS[d.innFood];
        if (sk?.buff && p.gold >= cost) {
          p.gold -= cost;
          // Aynı anda tek han yemeği etkili olsun
          for (const other of ['innstew', 'innroast', 'inntea']) p.buffs = p.buffs.filter((b) => b.id !== other);
          p.addBuff(d.innFood, sk.buff, sk.color);
          g.audio.pickup();
          g.events.emit('log', { msg: `${sk.name} yedin — ${sk.desc}`, cls: 'good' });
          g.events.emit('changed');
        }
      }
      else if (d.exchange !== undefined) {
        const ex = EXCHANGES[Number(d.exchange)];
        if (ex) g.economy.exchange(ex.give, ex.get);
      }
      else if (d.horseBuy) {
        const h = HORSES[d.horseBuy];
        if (h && p.gold >= h.cost && p.horseId !== h.id) {
          p.gold -= h.cost;
          p.horseId = h.id;
          if (p.mounted) p.dismount(true);
          g.audio.coin();
          g.events.emit('log', { msg: `${h.name} senin oldu! R ile binip inebilirsin.`, cls: 'gold' });
          g.events.emit('changed');
        }
      }
      else if (d.mount !== undefined) { p.toggleMount(); this.render('stable'); }
      else if (d.stat) { p.addStat(d.stat as StatKey); g.audio.click(); }
      else if (d.buy) g.economy.buy(d.buy, e.shiftKey ? 10 : 1);
      else if (d.upgrade !== undefined && this.smithRef) {
        g.economy.upgrade(this.smithRef);
      }
      else if (d.questRoute !== undefined) { g.questNav.toggle(d.questRoute as 'walk' | 'trail' | 'auto'); this.close('quest'); }
      else if (d.quest === 'accept') { g.quests.accept(); this.close('quest'); }
      else if (d.quest === 'turnin') { g.quests.turnIn(); this.render('quest'); }
      else if (d.quality) { g.setQuality(d.quality as Quality); this.render('settings'); }
      else if (d.dayNight) { g.setDayNightMode(d.dayNight as DayNightMode); this.render('settings'); }
      else if (d.autoToggle !== undefined) { g.autoHunt.toggle(p); this.render('autohunt'); }
      else if (d.mute) { g.setMuted(d.mute === '1'); this.render('settings'); }
      else if (d.settingsTab) { this.settingsTab = d.settingsTab as SettingsTab; g.audio.click(); this.render('settings'); }
      else if (d.openWin) { this.show(d.openWin as WinName); }
      else if (d.showFps !== undefined) { g.setShowFps(d.showFps === '1'); this.render('settings'); }
      else if (d.resetSettings !== undefined) { g.resetSettings(); this.render('settings'); }
      else if (d.reduceFlash !== undefined) { g.setReduceFlash(d.reduceFlash === '1'); this.render('settings'); }
      else if (d.largeText !== undefined) { g.setLargeText(d.largeText === '1'); this.render('settings'); }
      else if (d.reduceShake !== undefined) { g.setReduceShake(d.reduceShake === '1'); this.render('settings'); }
      else if (d.autotrail !== undefined) { g.setAutoTrail(d.autotrail === '1'); this.render('settings'); }
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
      else if (this.open.has('vault') && 'inv' in ref) g.vault.deposit(ref.inv);
      else if (!this.open.has('shop') && !this.open.has('vault')) { if ('inv' in ref) p.useSlot(ref.inv); else p.unequip(ref.equip); }
    } else if (matchMedia('(any-pointer: coarse)').matches) {
      const vi = this.vaultOf(t);
      if (vi !== null && this.open.has('vault')) g.vault.withdraw(vi);
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
    const sens = t.closest('[data-sensitivity]') as HTMLInputElement | null;
    if (sens) { this.game.setSensitivity(Number(sens.value) / 100); this.render('settings'); return; }
    const volume = t.closest('[data-volume]') as HTMLInputElement | null;
    if (volume) { this.game.setVolume(Number(volume.value) / 100); this.render('settings'); return; }
    const field = t.closest('[data-auto-setting]') as HTMLInputElement | HTMLSelectElement | null;
    if (!field) return;
    const key = field.dataset.autoSetting as keyof AutoHuntSettings | undefined;
    if (!key) return;
    const value = field instanceof HTMLInputElement ? field.checked : field.value;
    this.game.autoHunt.setSetting(key, value, this.game.player);
    this.game.audio.click();
    this.render('autohunt');
  }

  /** Sağ tık / çift tık: kullan, kuşan, çıkar, sat ya da kasaya aktar. */
  private onUse(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const g = this.game;
    const vi = this.vaultOf(t);
    if (vi !== null && this.open.has('vault')) {
      g.vault.withdraw(vi);
      this.tooltip.style.display = 'none';
      return;
    }
    const ref = this.refOf(t);
    if (!ref) return;
    this.smithRef = null;
    if ('equip' in ref) g.player.unequip(ref.equip);
    else if (this.open.has('shop')) g.economy.sell(ref.inv);
    else if (this.open.has('vault')) g.vault.deposit(ref.inv);
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
      if (s) hint = this.open.has('shop') ? `Sağ tık: sat (${this.game.economy.sellPrice(Number(t.dataset.inv)).toLocaleString('tr-TR')} Akçe)` : this.open.has('vault') ? 'Sağ tık: kasaya koy' : isEquip(ITEMS[s.id]) ? 'Sağ tık: kuşan' : ITEMS[s.id].type === 'potion' ? 'Sağ tık: kullan' : '';
    } else if (t.dataset.vault !== undefined) {
      s = this.game.vault.stackAt(Number(t.dataset.vault));
      hint = 'Sağ tık: çantaya al';
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
