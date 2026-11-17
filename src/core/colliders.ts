import type * as THREE from 'three';

/** Ağaç, kaya ve bina gibi sabit engeller için ızgara tabanlı dairesel çarpışma. */
export class Colliders {
  private cell = 10;
  private grid = new Map<number, number[]>();
  private xs: number[] = [];
  private zs: number[] = [];
  private rs: number[] = [];

  private key(cx: number, cz: number) { return (cx + 512) * 2048 + (cz + 512); }

  add(x: number, z: number, r: number) {
    const id = this.xs.length;
    this.xs.push(x); this.zs.push(z); this.rs.push(r);
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const list = this.grid.get(k);
    if (list) list.push(id); else this.grid.set(k, [id]);
  }

  /** Konumu engellerin dışına iter. */
  resolve(pos: THREE.Vector3, radius: number) {
    const cx = Math.floor(pos.x / this.cell);
    const cz = Math.floor(pos.z / this.cell);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.grid.get(this.key(cx + i, cz + j));
        if (!list) continue;
        for (const id of list) {
          const dx = pos.x - this.xs[id];
          const dz = pos.z - this.zs[id];
          const min = this.rs[id] + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (min - d);
            pos.z += (dz / d) * (min - d);
          }
        }
      }
    }
  }
}
