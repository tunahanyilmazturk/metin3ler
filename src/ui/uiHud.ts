import { clamp } from '../core/utils';
import { CLASSES, ClassId } from '../data/classes';
import { ITEMS, RARITY_COLORS } from '../data/items';
import { anchorOf, asStack } from '../data/inventory';
import { SKILLS } from '../data/skills';
import type { HotbarEntry } from '../entities/player';
import type { Npc } from '../entities/npc';
import { SaveSystem } from '../systems/save';
import type { Game } from '../game';
import { icon } from './icons';
import { Minimap } from './minimap';
import { Overlay } from './overlay';
import { Windows } from './windows';
import { WorldMap } from './worldmap';
import { $, setText, setWidth } from './uiDom';
import type { UI } from './ui';

/** Göz içeriğini yalnızca giriş değiştiğinde yeniden çizer. */
export function syncHotbarSlot(ui: UI, i: number) {
  const p = ui.game.player;
  const els = ui.hbEls[i];
  const e = p.hotbar[i];
  const key = e ? JSON.stringify(e) : '';
  if ((els.root as any)._k !== key) {
    (els.root as any)._k = key;
    els.root.classList.toggle('empty', !e);
    els.root.draggable = !!e;
    if (!e) {
      els.ic.innerHTML = '';
      els.root.title = 'Boş göz — envanterden eşya ya da yetenek sekmesinden yetenek sürükle';
    } else if (e.t === 'skill') {
      const sk = p.skills[e.i];
      els.ic.innerHTML = icon(sk.icon);
      els.root.title = `${sk.name} — ${sk.desc} (${sk.mp} mana, ${sk.cd} sn) · Sağ tık: çıkar`;
    } else {
      const d = ITEMS[e.id];
      const color = d.icon === 'potion' ? '#ff5a4a' : d.icon === 'potionmp' ? '#4a9cff' : RARITY_COLORS[d.rarity];
      els.ic.innerHTML = `${icon(d.icon, color)}${e.plus > 0 ? `<b class="hb-plus">+${e.plus}</b>` : ''}`;
      els.root.title = `${d.name} · Sağ tık: çıkar`;
    }
  }
  // Eşya gözü: envanterdeki toplam adet
  if (e?.t === 'item') {
    let n = 0;
    for (let c = 0; c < p.inv.length; c++) {
      const s = asStack(p.inv[c]);
      if (s && s.id === e.id && s.plus === e.plus) n += s.count;
    }
    setText(els.cnt, n > 0 ? String(n) : '');
    els.root.classList.toggle('missing', n === 0);
  } else {
    setText(els.cnt, '');
    els.root.classList.remove('missing');
  }
}

export function showTutorial(ui: UI) {
  try {
    if (localStorage.getItem('gokdemir-tutorial-v1') === 'done') return;
  } catch { /* Depolama kapalıysa bu oturumda rehberi göster. */ }
  ui.tutorialStep = 0;
  renderTutorial(ui);
}

export function renderTutorial(ui: UI) {
  const panel = $('#tutorial');
  const step = ui.tutorialSteps[ui.tutorialStep];
  panel.innerHTML = `<div class="tutorial-count">BAŞLANGIÇ REHBERİ · ${ui.tutorialStep + 1} / ${ui.tutorialSteps.length}</div>
    <h3>${step.title}</h3><p>${step.text}</p><div class="tutorial-actions">
    <button data-tutorial="skip">Rehberi atla</button><button class="primary" data-tutorial="next">${ui.tutorialStep + 1 === ui.tutorialSteps.length ? 'Bitir' : 'Devam'}</button></div>`;
  panel.classList.remove('hidden');
}

export function finishTutorial(ui: UI) {
  $('#tutorial').classList.add('hidden');
  try { localStorage.setItem('gokdemir-tutorial-v1', 'done'); } catch { /* Bu oturumda kapalı kalır. */ }
}

export function syncAutoHuntButton(ui: UI) {
  const button = $('#hotbar [data-auto-toggle]') as HTMLButtonElement | null;
  if (!button) return;
  const auto = ui.game.autoHunt;
  button.classList.toggle('active', auto.enabled);
  button.setAttribute('aria-pressed', String(auto.enabled));
  button.title = `Oto av: ${auto.enabled ? auto.status : 'kapalı'} (H)`;
}
