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

export function bindBar(ui: UI, hb: HTMLElement) {
  const game = ui.game;
  hb.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-auto-settings]')) {
      ui.windows.toggle('autohunt');
      return;
    }
    if (target.closest('[data-auto-toggle]')) {
      game.autoHunt.toggle(game.player);
      return;
    }
    const s = target.closest('[data-hb]') as HTMLElement | null;
    if (s && game.started) game.player.useHotbar(Number(s.dataset.hb));
  });
  // Sağ tık: gözü boşalt.
  hb.addEventListener('contextmenu', (e) => {
    const s = (e.target as HTMLElement).closest('[data-hb]') as HTMLElement | null;
    if (!s) return;
    e.preventDefault();
    if (game.player.hotbar[Number(s.dataset.hb)]) {
      game.player.hotbar[Number(s.dataset.hb)] = null;
      game.events.emit('changed');
    }
  });
  // Sürükle-bırak: envanter eşyaları, karakter penceresindeki yetenekler ve çubuk içi taşıma.
  const HB_ACCEPT = ['application/x-gokdemir-item', 'application/x-gokdemir-skill', 'application/x-gokdemir-hb'];
  hb.addEventListener('dragstart', (e) => {
    const de = e as DragEvent;
    const s = (de.target as HTMLElement).closest('[data-hb]') as HTMLElement | null;
    if (!s || !de.dataTransfer || !game.player.hotbar[Number(s.dataset.hb)]) { de.preventDefault(); return; }
    de.dataTransfer.setData('application/x-gokdemir-hb', s.dataset.hb!);
    de.dataTransfer.effectAllowed = 'move';
    s.classList.add('dragging');
  });
  hb.addEventListener('dragover', (e) => {
    const s = (e.target as HTMLElement).closest('[data-hb]') as HTMLElement | null;
    if (!s || !HB_ACCEPT.some((t) => e.dataTransfer?.types.includes(t))) return;
    e.preventDefault();
    s.classList.add('drop-hover');
  });
  hb.addEventListener('dragleave', (e) => {
    (e.target as HTMLElement).closest('[data-hb]')?.classList.remove('drop-hover');
  });
  hb.addEventListener('dragend', () => hb.querySelectorAll('.dragging,.drop-hover').forEach((el) => el.classList.remove('dragging', 'drop-hover')));
  hb.addEventListener('drop', (e) => {
    const s = (e.target as HTMLElement).closest('[data-hb]') as HTMLElement | null;
    if (!s || !e.dataTransfer) return;
    e.preventDefault();
    s.classList.remove('drop-hover');
    const p = game.player;
    const i = Number(s.dataset.hb);
    const fromBar = e.dataTransfer.getData('application/x-gokdemir-hb');
    if (fromBar !== '') {
      const j = Number(fromBar);
      [p.hotbar[i], p.hotbar[j]] = [p.hotbar[j], p.hotbar[i]];
    } else {
      let entry: HotbarEntry | null = null;
      try {
        const rawSkill = e.dataTransfer.getData('application/x-gokdemir-skill');
        const rawItem = e.dataTransfer.getData('application/x-gokdemir-item');
        if (rawSkill) {
          const n = Number(JSON.parse(rawSkill));
          if (Number.isInteger(n) && n >= 0 && n < p.skills.length) entry = { t: 'skill', i: n };
        } else if (rawItem) {
          const ref = JSON.parse(rawItem) as { inv?: number };
          if (Number.isInteger(ref.inv) && (ref.inv as number) >= 0 && (ref.inv as number) < p.inv.length) {
            const stack = asStack(p.inv[anchorOf(p.inv, ref.inv!)]);
            if (stack) entry = { t: 'item', id: stack.id, plus: stack.plus };
          }
        }
      } catch { return; }
      if (!entry) return;
      p.hotbar[i] = entry;
    }
    game.audio.click();
    game.events.emit('changed');
  });
}

/** Dokunmatik sanal çubuk, saldırı düğmesi ve mini harita etkileşimleri. */
export function bindTouch(ui: UI) {
  const game = ui.game;
  const stick = $('.touch-stick', ui.hud);
  const knob = $('.touch-knob', stick);
  let stickPointer: number | null = null;
  const moveStick = (e: PointerEvent) => {
    const rect = stick.getBoundingClientRect();
    const limit = rect.width * 0.28;
    const dx = clamp(e.clientX - (rect.left + rect.width / 2), -limit, limit);
    const dy = clamp(e.clientY - (rect.top + rect.height / 2), -limit, limit);
    game.input.virtualMove.x = dx / limit;
    game.input.virtualMove.y = dy / limit;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const releaseStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    game.input.virtualMove.x = 0;
    game.input.virtualMove.y = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null) return;
    e.preventDefault();
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickPointer) moveStick(e);
  });
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  const attack = $('.touch-attack', ui.hud);
  attack.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.input.virtualAttack = true;
    attack.setPointerCapture(e.pointerId);
  });
  const releaseAttack = () => { game.input.virtualAttack = false; };
  attack.addEventListener('pointerup', releaseAttack);
  attack.addEventListener('pointercancel', releaseAttack);
  attack.addEventListener('lostpointercapture', releaseAttack);

  // Mini harita: +/- yakınlaştırma, tekerlek, büyük harita düğmesi.
  // pointerdown'da durdur ki tıklamalar oyun tuvaline (yürüme/hedef) sızmasın.
  const mmWrap = $('.mm-wrap', ui.hud);
  mmWrap.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault();
  });
  mmWrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || !ui.minimap) return;
    e.preventDefault();
    if (b.classList.contains('mm-zoom')) ui.minimap.zoomBy(b.dataset.zoom === 'in' ? -1 : 1);
    else if (b.classList.contains('mm-expand')) ui.worldmap?.toggle();
  });
  $('#minimap').addEventListener('wheel', (e) => {
    e.preventDefault();
    if (ui.minimap) ui.minimap.zoomBy(Math.sign((e as WheelEvent).deltaY));
  }, { passive: false });
}

// ------------------------------------------------------------------ başlangıç
