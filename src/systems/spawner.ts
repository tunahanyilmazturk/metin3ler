import { ENEMIES } from '../data/enemies';
import { SPAWN_ZONES, STONE_ZONES, SpawnZone, VILLAGE_R } from '../data/world';
import { Enemy } from '../entities/enemy';
import type { Game } from '../game';

/** Bölgelere göre yaratık ve lanetli taş doğurur; ölenleri süre sonunda yeniler. */
export class Spawner {
  private pending: { zone: SpawnZone; t: number }[] = [];

  constructor(private game: Game) {
    for (const z of [...SPAWN_ZONES, ...STONE_ZONES]) {
      for (let i = 0; i < z.count; i++) this.spawn(z);
    }
  }

  private findSpot(z: SpawnZone, stone: boolean): [number, number] | null {
    const t = this.game.terrain;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.r;
      const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r;
      if (Math.hypot(x, zz) < VILLAGE_R + 14) continue;
      if (!t.walkable(x, zz) || t.getHeight(x, zz) < 0.8) continue;
      if (t.getSlope(x, zz) > (stone ? 0.08 : 0.25)) continue;
      return [x, zz];
    }
    return null;
  }

  private spawn(z: SpawnZone) {
    const def = ENEMIES[z.enemy];
    const spot = this.findSpot(z, !!def.stone);
    if (!spot) { this.pending.push({ zone: z, t: 10 }); return; }
    const e = new Enemy(this.game, def, spot[0], spot[1], z);
    this.game.enemies.push(e);
  }

  onDeath(e: Enemy) {
    if (e.zone) this.pending.push({ zone: e.zone, t: e.def.respawn });
  }

  update(dt: number) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        this.spawn(p.zone);
      }
    }
  }
}
