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
const STAT_NAMES: Record<StatKey, [string, string]> = {
  str: ['Güç', 'Saldırı gücünü artırır'],
  dex: ['Çeviklik', 'Kritik şansı ve saldırı hızını artırır'],
  vit: ['Dayanıklılık', 'Can ve savunmayı artırır'],
  int: ['Zekâ', 'Manayı artırır'],
};


export function renderCharacter(w: Windows, body: HTMLElement) {
  const g = w.game, p = g.player;
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
    if (w.charTab === 'stats') {
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
    } else if (w.charTab === 'skills') {
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
        return `<div class="sk ${locked ? 'locked' : ''} ${active ? 'active' : ''}" draggable="true" data-skill-idx="${i}" title="Kısayol çubuğuna sürükle"><i>${icon(sk.icon)}</i><div>
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
          <div><span>Saldırı Menzili</span><b>${p.attackRange.toFixed(1)} m</b></div>
          <div><span>Saniyedeki Vuruş</span><b>${(1 / (0.5 / p.atkSpeed)).toFixed(1)}</b></div>
          <div><span>Silah</span><b>${p.weaponDef ? p.weaponDef.name : 'Yok'}</b></div>
          <div><span>Kullanım</span><b>${p.weaponDef?.hands === 2 ? 'Çift el' : 'Tek el'}</b></div>
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
      <nav class="char-tabs">${tabs.map(([k, l]) => `<button data-char-tab="${k}" class="${w.charTab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      ${content}`;
    body.querySelector<HTMLElement>('[data-character-name]')!.textContent = p.name;
}

