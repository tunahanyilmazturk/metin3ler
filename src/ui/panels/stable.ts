import { HORSES, HORSE_ORDER, HorseDef } from '../../data/horses';
import { PETS, PET_ORDER, petEffectText } from '../../data/pets';
import { SUMMON_TIME } from '../../systems/mounts';
import { petBadge, petSwatch } from './pets';
import type { Windows } from '../windows';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Atın post, yele ve eyer örtüsü renklerini gösteren yuvarlak rozet. */
const swatch = (h: HorseDef) =>
  `<div class="hs-swatch" style="--coat:${hex(h.look.coat)};--mane:${hex(h.look.mane)};--cloth:${hex(h.look.cloth)}" aria-hidden="true"></div>`;

const stat = (label: string, frac: number, cls: string) =>
  `<div class="hs-stat"><small>${label}</small><div class="hs-bar ${cls}"><i style="width:${Math.round(clamp01(frac) * 100)}%"></i></div></div>`;

/** Ahır: aktif binek kartı ve sahip olunan / satın alınabilir atların kartları. */
export function renderStable(w: Windows, body: HTMLElement) {
  const p = w.game.player;
  const m = p.mounts;
  const cur = m.def;
  const state = m.mounted ? 'Şu an sırtındasın' : m.summoning ? 'Çağrılıyor…' : 'Ahırda dinleniyor';
  const active = cur ? `
    <div class="stable-active">
      ${swatch(cur)}
      <div class="hs-info">
        <b>${cur.name}</b><small>${state}${m.tired ? ' · yorgun' : ''}</small>
        <div class="hs-meter"><span>Dayanıklılık</span><div class="hs-bar stam"><i style="width:${Math.round(m.staminaFrac * 100)}%"></i></div></div>
      </div>
      <button class="${m.mounted ? 'danger' : 'primary'}" data-mount>${m.mounted ? 'İn' : m.summoning ? 'İptal' : 'Bin'} <small>(R)</small></button>
    </div>` : '<p class="dim-note">Henüz bir atın yok. Aşağıdan seviyene uygun bir binek seç.</p>';

  const cards = HORSE_ORDER.map((id) => {
    const h = HORSES[id];
    const owned = m.owns(id), isActive = m.active === id, locked = p.level < h.level;
    let action: string;
    if (owned) action = isActive ? '<span class="hs-tag">Aktif binek</span>' : `<button data-horse-select="${id}">Seç</button>`;
    else if (locked) action = `<button disabled>Sv. ${h.level} gerekli</button>`;
    else action = `<button data-horse-buy="${id}" ${p.gold < h.cost ? 'disabled' : ''}>${h.cost.toLocaleString('tr-TR')} Akçe</button>`;
    return `<div class="hs-card${isActive ? ' active' : ''}${owned ? ' owned' : ''}${locked && !owned ? ' locked' : ''}">
      ${swatch(h)}
      <div class="hs-body">
        <div class="hs-title"><b>${h.name}</b><small>Sv. ${h.level}</small></div>
        <p>${h.desc}</p>
        ${stat(`Hız +%${Math.round((h.speed - 1) * 100)}`, (h.speed - 1) / 0.7, 'spd')}
        ${stat(`Dörtnala ×${h.gallop.toFixed(2)}`, (h.gallop - 1) / 0.7, 'gal')}
        ${stat(`Dayanıklılık ${h.stamina}`, h.stamina / 200, 'stam')}
        <div class="hs-action">${action}</div>
      </div>
    </div>`;
  }).join('');

  const pets = p.pets;
  const petCards = PET_ORDER.map((id) => {
    const d = PETS[id];
    const owned = pets.owns(id), locked = p.level < d.level;
    let action: string;
    if (owned) action = '<span class="hs-tag">Sahipsin</span>';
    else if (locked) action = `<button disabled>Sv. ${d.level} gerekli</button>`;
    else action = `<button data-pet-buy="${id}" ${p.gold < d.cost ? 'disabled' : ''}>${d.cost.toLocaleString('tr-TR')} Akçe</button>`;
    return `<div class="hs-card${owned ? ' owned' : ''}${locked && !owned ? ' locked' : ''}">
      ${petSwatch(d)}
      <div class="hs-body">
        <div class="hs-title"><b>${d.name}</b><small>Sv. ${d.level}</small></div>
        ${petBadge(d)}
        <p>${d.desc}</p>
        <p class="pet-effect">${petEffectText(d)}</p>
        <div class="hs-action">${action}</div>
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <p class="npc-say">“Ahırım diyarın en iyi atlarıyla dolu. Bineğini seç; Shift ile dörtnala koşar ama yorulur, dinlendirmeyi unutma.”</p>
    ${active}
    <h4>Binekler</h4>
    <div class="hs-grid">${cards}</div>
    <h4>Evcil Hayvanlar</h4>
    <div class="hs-grid">${petCards}</div>
    <p class="dim-note">Çağırma ${SUMMON_TIME.toLocaleString('tr-TR')} saniye sürer ve hasar alırsan bölünür. Alt bardaki at düğmesi ya da R ile bin / in.</p>`;
}
