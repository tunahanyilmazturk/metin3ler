import { ENEMIES } from '../data/enemies';
import { LAKE, MOUNTAIN, NPCS, SPAWN_ZONES, STONE_ZONES, TRAVEL_SPOTS, WORLD_HALF, WORLD_SIZE } from '../data/world';
import type { Game } from '../game';
import { drawStar, Minimap } from './minimap';

/** Köyde adı yazılacak kilit NPC'ler: noktadan px kayması ve metin hizası. */
const NPC_LABELS: Record<string, { dx: number; dy: number; align: CanvasTextAlign }> = {
  elder: { dx: 0, dy: -13, align: 'center' },
  merchant: { dx: -8, dy: 11, align: 'right' },
  smith: { dx: 8, dy: -11, align: 'left' },
  stablemaster: { dx: 9, dy: 13, align: 'left' },
};

/**
 * Tüm diyarı gösteren büyük dünya haritası (M / B ile açılır).
 * Arazi görüntüsünü mini haritadan ödünç alır; açıkken ~4 Hz tazelenir.
 */
export class WorldMap {
  private ctx: CanvasRenderingContext2D;
  private root: HTMLElement;
  private timer = 0;
  private open = false;

  constructor(private game: Game, private canvas: HTMLCanvasElement, private minimap: Minimap) {
    this.ctx = canvas.getContext('2d')!;
    this.root = canvas.closest<HTMLElement>('#worldmap')!;
    this.root.querySelector('[data-wm-close]')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
  }

  get isOpen() { return this.open; }

  show() {
    this.open = true;
    this.root.classList.remove('hidden');
    this.timer = 0;
    this.draw();
  }

  close() {
    this.open = false;
    this.root.classList.add('hidden');
  }

  toggle() {
    this.game.audio.click();
    if (this.open) this.close(); else this.show();
  }

  /** Kapalıyken hiçbir iş yapmaz (duraklatılmış). */
  update(dt: number) {
    if (!this.open) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    this.draw();
  }

  private draw() {
    const g = this.game, p = g.player, ctx = this.ctx;
    const S = this.canvas.width;
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.minimap.base, 0, 0, S, S);

    // Dünya koordinatı (-400..400) → tuval pikseli
    const m = (v: number) => ((v + WORLD_HALF) / WORLD_SIZE) * S;
    const dot = (x: number, z: number, r: number, color: string, ring = 'rgba(0,0,0,0.55)') => {
      ctx.fillStyle = color;
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m(x), m(z), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    const text = (x: number, y: number, s: string, color: string, align: CanvasTextAlign = 'center') => {
      ctx.font = '600 11px Inter';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };

    // Bölge etiketleri
    text(m(0), m(-40), '1. Köy', '#ffd34a');
    text(m(LAKE.x), m(LAKE.z), 'Göl', '#9fd0ff');
    text(m(MOUNTAIN.x), m(MOUNTAIN.z), 'Dağ', '#e8dcc8');
    for (const t of TRAVEL_SPOTS) text(m(t.x), m(t.z), t.name, '#cfc4ab');

    // Sıradan düşman bölgeleri (sönük kırmızı noktalar)
    for (const z of SPAWN_ZONES) if (!ENEMIES[z.enemy]?.boss) dot(z.x, z.z, 2.6, '#ff4038aa');
    // Lanetli taş bölgeleri (mor)
    for (const z of STONE_ZONES) dot(z.x, z.z, 4, '#c070ff', '#2a0a3a');
    // Boss bölgeleri: turuncu elmas + patron adı (sağ kenara taşmayacak biçimde)
    for (const z of SPAWN_ZONES) {
      const def = ENEMIES[z.enemy];
      if (!def?.boss) continue;
      const x = m(z.x), y = m(z.z);
      ctx.fillStyle = '#ff9020';
      ctx.strokeStyle = '#2a1200';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 5.5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 5.5); ctx.lineTo(x - 4.5, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const align: CanvasTextAlign = x > S - 115 ? 'right' : 'left';
      text(align === 'left' ? x + 8 : x - 8, y + 1, def.name, '#ffb46a', align);
    }

    // NPC'ler: hepsi altın nokta, kilit dördüne ad
    for (const n of NPCS) {
      dot(n.x, n.z, 3, '#ffe060');
      const l = NPC_LABELS[n.id];
      if (l) text(m(n.x) + l.dx, m(n.z) + l.dy, n.name, '#ffe9a8', l.align);
    }

    // Görev rotası: altın çizgi + uç noktada nabız atan yıldız
    const route = g.questNav.remaining;
    if (g.questNav.active && route.length) {
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(m(p.pos.x), m(p.pos.z));
      for (const wp of route) ctx.lineTo(m(wp.x), m(wp.z));
      ctx.stroke();
      ctx.globalAlpha = 1;
      const last = route[route.length - 1];
      const pulse = 0.8 + 0.2 * Math.sin(g.time * 4);
      drawStar(ctx, m(last.x), m(last.z), 8.5 * pulse);
      ctx.fillStyle = '#ffd34a';
      ctx.strokeStyle = '#201604aa';
      ctx.lineWidth = 1.4;
      ctx.fill();
      ctx.stroke();
    }

    // Canlı düşmanlar: yalnızca patronlar (kalabalık engellenir)
    for (const e of g.enemies) {
      if (!e.alive || !e.def.boss) continue;
      dot(e.pos.x, e.pos.z, 3.5, '#ff9020', '#200800');
    }

    // Oyuncu oku (mini haritayla aynı biçim)
    ctx.save();
    ctx.translate(m(p.pos.x), m(p.pos.z));
    ctx.rotate(Math.PI - p.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-5.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // İnce çerçeve
    ctx.strokeStyle = '#5c4623';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }
}
