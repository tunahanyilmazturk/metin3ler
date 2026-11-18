import type { EnemyDef } from '../data/enemies';
import { ITEMS, RARITY_COLORS, RARITY_NAMES } from '../data/items';
import { effAtk, effHp, enemyKind } from '../data/balance';
import type { Player } from '../entities/player';

const KIND_LABEL = { normal: 'Sıradan', boss: 'Patron', stone: 'Lanetli Taş' } as const;
const fmtPct = (c: number) => (c < 0.1 ? c.toFixed(2) : c < 1 ? c.toFixed(1) : String(Math.round(c)));

/**
 * Hedef düşmanın kompakt bilgi paneli: temel değerler, oyuncuya göre tahmini dövüş ve düşen
 * eşyalar (nadirlik renk noktasıyla, düşme şansıyla). Oyuncunun güncel değerleri kullanılır.
 */
export function enemyInfoHtml(d: EnemyDef, p: Player): string {
  const kind = enemyKind(d);
  const hp = effHp(d), atk = effAtk(d);
  const hitsKill = Math.ceil(hp / Math.max(1, p.atk * 1.2 - d.def * 0.6));
  const hitsDeath = Math.ceil(p.maxHp / Math.max(1, atk - p.def * 0.5));
  const drops = [...d.drops].sort((a, b) => b.chance - a.chance);
  const dropItems = drops.map((dr) => {
    const it = ITEMS[dr.id];
    if (!it) return '';
    return `<li title="${RARITY_NAMES[it.rarity]}"><i style="background:${RARITY_COLORS[it.rarity]}"></i><span>${it.name}</span><b>%${fmtPct(dr.chance * 100)}</b></li>`;
  }).join('');
  return `
    <div class="ei-head">
      <h3>Sv.${d.level} ${d.name} <span class="ei-kind ${kind}">${KIND_LABEL[kind]}</span></h3>
      <button class="ei-close" type="button" data-ei-close aria-label="Kapat">✕</button>
    </div>
    <div class="ei-stats">
      <span>Can <b>${hp.toLocaleString('tr-TR')}</b></span>
      <span>Saldırı <b>${atk}</b></span>
      <span>Savunma <b>${d.def}</b></span>
      <span>Tecrübe <b>${d.exp.toLocaleString('tr-TR')}</b></span>
      <span>Akçe <b>${d.gold[0]}–${d.gold[1]}</b></span>
      <span>Doğma <b>${d.respawn} sn</b></span>
    </div>
    <p class="ei-fight">Sen: <b>~${hitsKill}</b> vuruşta yenersin · O: <b>~${hitsDeath}</b> vuruşta seni yener</p>
    ${kind === 'stone' ? '<p class="ei-note">Kırılınca çevresindeki yaratıkları çağırır.</p>' : ''}
    ${dropItems ? `<div class="ei-title">Düşen eşyalar</div><ul class="ei-drops">${dropItems}</ul>` : '<p class="ei-note">Eşya düşürmez.</p>'}`;
}
