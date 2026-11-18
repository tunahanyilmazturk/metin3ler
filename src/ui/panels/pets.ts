import { ITEMS, RARITY_COLORS } from '../../data/items';
import { PETS, PET_SLOTS, PetDef, petEffectText } from '../../data/pets';
import { icon } from '../icons';
import type { Windows } from '../windows';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export const petBadge = (d: PetDef) =>
  `<span class="pet-kind ${d.kind}">${d.kind === 'support' ? 'Destek' : 'Saldırı'}</span>`;

/** Petin renklerini taşıyan yuvarlak rozet. */
export const petSwatch = (d: PetDef) =>
  `<div class="pet-swatch" style="--pb:${hex(d.look.body)};--pa:${hex(d.look.accent)}" aria-hidden="true">${icon('paw')}</div>`;

const itemColor = (id: string) => {
  const d = ITEMS[id];
  return d.icon === 'potion' ? '#ff5a4a' : d.icon === 'potionmp' ? '#4a9cff' : RARITY_COLORS[d.rarity];
};

/** Evcil hayvan penceresi: iki aktif slot, sahip olunan petler ve destek petlerinin çantaları. */
export function renderPets(w: Windows, body: HTMLElement) {
  const ps = w.game.player.pets;

  const slots = Array.from({ length: PET_SLOTS }, (_, i) => {
    const id = ps.active[i];
    const d = id ? PETS[id] : null;
    if (!d) return `<div class="pet-slot empty"><b>Slot ${i + 1}</b><small>Boş — aşağıdan bir pet kuşan</small></div>`;
    return `<div class="pet-slot">${petSwatch(d)}
      <div class="pet-info"><b>${d.name}</b>${petBadge(d)}<small>${petEffectText(d)}</small></div>
      <button data-pet-unequip="${d.id}">Çıkar</button></div>`;
  }).join('');

  const owned = ps.owned.map((o) => {
    const d = PETS[o.id];
    const on = ps.isActive(o.id);
    const used = o.bag.filter(Boolean).length;
    const bag = d.kind === 'support' ? `
      <div class="pet-bag-head"><span>Çanta ${used} / ${o.bag.length}</span>
        <button data-pet-take-all="${o.id}" ${used ? '' : 'disabled'}>Tümünü Al</button></div>
      <div class="pet-bag">${o.bag.map((s, i) => s
        ? `<button class="pet-item" data-pet-take="${o.id}:${i}" title="${ITEMS[s.id].name}${s.count > 1 ? ` x${s.count}` : ''} — envanterine al">${icon(ITEMS[s.id].icon, itemColor(s.id))}${s.count > 1 ? `<em>${s.count}</em>` : ''}</button>`
        : '<div class="pet-item empty"></div>').join('')}</div>`
      : '<p class="pet-note">Saldırı peti: çantası yoktur, hedefine saldırır.</p>';
    return `<div class="pet-card${on ? ' on' : ''}">
      <div class="pet-card-head">${petSwatch(d)}
        <div class="pet-info"><b>${d.name}</b>${petBadge(d)}<small>${petEffectText(d)}</small></div>
        ${on ? '<span class="hs-tag">Kuşanılı</span>' : `<button data-pet-equip="${o.id}">Kuşan</button>`}
      </div>
      ${bag}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="pet-slots">${slots}</div>
    <h4>Petlerin</h4>
    ${owned || "<p class=\"dim-note\">Henüz bir petin yok. Ahırdaki Seyis Rahmi'den pet edinebilirsin.</p>"}
    <p class="dim-note">Destek petleri pasif bonus verir ve yakındaki ganimeti kendi çantalarına toplar; eşyaya tıklayarak envanterine alabilirsin. Aynı anda iki pet kuşanabilirsin.</p>`;
}
