import { clamp } from '../core/utils';
import { WORLD_HALF, WORLD_SIZE } from '../data/world';
import type { Game } from '../game';

const VIEW = 95; // gösterilen yarıçap (m)

/** Araziden önceden çizilen, kuzey yukarı mini harita. */
export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private timer = 0;

  constructor(private game: Game, private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const t = game.terrain, N = t.res;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = N;
    const bctx = this.base.getContext('2d')!;
    const img = bctx.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const h = t.heights[k];
        const hl = t.heights[j * N + Math.max(0, i - 1)], hu = t.heights[Math.max(0, j - 1) * N + i];
        const light = clamp(1 + (h - hl) * 0.12 + (h - hu) * 0.12, 0.55, 1.5);
        const slope = Math.abs(h - hl) + Math.abs(h - hu);
        let r: number, g: number, b: number;
        if (h < 0) { r = 34; g = 78 + h * 3; b = 118 + h * 4; }
        else if (t.dirt[k] > 0.5) { r = 146; g = 122; b = 86; }
        else if (slope > 1.5) { r = 118; g = 112; b = 104; }
        else { r = 58 + h * 0.8; g = 100 + h * 0.9; b = 44 + h * 0.4; }
        const l = h < 0 ? 1 : light;
        img.data[k * 4] = r * l; img.data[k * 4 + 1] = g * l; img.data[k * 4 + 2] = b * l; img.data[k * 4 + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.07;
    const g = this.game, p = g.player, ctx = this.ctx;
    const S = this.canvas.width;
    const N = g.terrain.res;
    const px = ((p.pos.x + WORLD_HALF) / WORLD_SIZE) * (N - 1);
    const pz = ((p.pos.z + WORLD_HALF) / WORLD_SIZE) * (N - 1);
    const sv = (VIEW / WORLD_SIZE) * (N - 1);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, px - sv, pz - sv, sv * 2, sv * 2, 0, 0, S, S);

    const k = S / (VIEW * 2);
    const dot = (x: number, z: number, r: number, color: string) => {
      const sx = (x - p.pos.x) * k + S / 2, sy = (z - p.pos.z) * k + S / 2;
      if (sx < 0 || sy < 0 || sx > S || sy > S) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const d of g.loot.drops) if (d.item) dot(d.group.position.x, d.group.position.z, 1.6, '#ffffff');
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (e.isStone) dot(e.pos.x, e.pos.z, 4, '#c070ff');
      else dot(e.pos.x, e.pos.z, e.def.boss ? 4 : 2.2, e.def.boss ? '#ff9020' : '#ff4038');
    }
    for (const n of g.npcs) dot(n.pos.x, n.pos.z, 3.2, '#ffe060');

    // Görev rotası: altın çizgi + uç nokta işareti (görüş dışıysa daire kenarında)
    const route = g.questNav.remaining;
    if (g.questNav.active && route.length) {
      const mx = (x: number) => (x - p.pos.x) * k + S / 2;
      const my = (z: number) => (z - p.pos.z) * k + S / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      for (const wp of route) ctx.lineTo(mx(wp.x), my(wp.z));
      ctx.stroke();
      const last = route[route.length - 1];
      let ex = mx(last.x), ey = my(last.z);
      const dx = ex - S / 2, dy = ey - S / 2, d = Math.hypot(dx, dy), R = S / 2 - 5;
      if (d > R) { ex = S / 2 + (dx / d) * R; ey = S / 2 + (dy / d) * R; }
      ctx.fillStyle = '#f0c040';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Oyuncu oku
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI - p.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
