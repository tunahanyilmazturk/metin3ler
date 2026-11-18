import { WORLD_HALF } from '../data/world';

export interface RoutePoint { x: number; z: number }

const CELL = 2;                       // ızgara adımı (m)
const LIM = WORLD_HALF - 22;          // oynanabilir sınır
const GRID = Math.floor((LIM * 2) / CELL) + 1; // kenar başına düğüm sayısı
const DIAG = Math.SQRT2 * CELL;
const MAX_EXPANDED = 20000;           // genişletme üst sınırı

/**
 * Görev hedefine 8 yönlü A* rotası. Üreteç (generator) olduğundan çağıran
 * zaman dilimlerine bölebilir (~32 düğüm genişletmede bir yield).
 * start/goal metre cinsinden; stop: hedefe "yeterince yakın" yarıçapı.
 * clear(x, z): nokta yürünebilir ve engelsiz mi? Oyuncuyu asla hareket ettirmez.
 */
export function* findQuestPath(
  start: RoutePoint,
  goal: RoutePoint,
  stop: number,
  clear: (x: number, z: number) => boolean,
): Generator<void, RoutePoint[] | null> {
  if (Math.hypot(goal.x - start.x, goal.z - start.z) <= stop) return [];

  // clear() sonuçlarını bu arama için 0.5 m'lik kafeste sakla.
  const memo = new Map<number, boolean>();
  const memoKey = (x: number, z: number) => (Math.round(x * 2) + 4096) * 8192 + Math.round(z * 2) + 4096;
  const clearAt = (x: number, z: number) => {
    const key = memoKey(x, z);
    let v = memo.get(key);
    if (v === undefined) {
      v = clear(Math.round(x * 2) * 0.5, Math.round(z * 2) * 0.5);
      memo.set(key, v);
    }
    return v;
  };

  // Kenar geçerliliği: doğru parçası en çok 0.5 m aralıklarla örneklenir
  // (uç nokta dahil); tüm örnekler açık olmalı.
  const edgeClear = (ax: number, az: number, bx: number, bz: number) => {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i <= steps; i++) {
      if (!clearAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps)) return false;
    }
    return true;
  };

  // Oyuncunun durduğu hücre: içinde bulunuyorsa oradan çıkılabilir sayılır.
  memo.set(memoKey(start.x, start.z), true);

  // Doğrudan düz çizgi mümkünse A* çalıştırma.
  if (edgeClear(start.x, start.z, goal.x, goal.z)) return [{ x: goal.x, z: goal.z }];

  const idx = (ix: number, iz: number) => ix * GRID + iz;
  const xOf = (i: number) => -LIM + i * CELL;
  const sx = Math.min(GRID - 1, Math.max(0, Math.round((start.x + LIM) / CELL)));
  const sz = Math.min(GRID - 1, Math.max(0, Math.round((start.z + LIM) / CELL)));
  const startNode = idx(sx, sz);

  const size = GRID * GRID;
  const gCost = new Float32Array(size).fill(Infinity);
  const fScore = new Float32Array(size);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  // İkili min-yığın (f değerine göre düğüm indeksleri)
  const heap: number[] = [];
  const push = (nd: number) => {
    heap.push(nd);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[i]]) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let c = i;
        const l = i * 2 + 1, r = l + 1;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[c]]) c = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[c]]) c = r;
        if (c === i) break;
        const t = heap[c]; heap[c] = heap[i]; heap[i] = t; i = c;
      }
    }
    return top;
  };

  const hAt = (nd: number) => {
    const ix = Math.floor(nd / GRID), iz = nd % GRID;
    return Math.max(0, Math.hypot(goal.x - xOf(ix), goal.z - xOf(iz)) - stop);
  };
  const goalReached = (nd: number) => {
    const ix = Math.floor(nd / GRID), iz = nd % GRID;
    return clearAt(xOf(ix), xOf(iz)) && Math.hypot(goal.x - xOf(ix), goal.z - xOf(iz)) <= stop;
  };

  gCost[startNode] = 0;
  fScore[startNode] = hAt(startNode);
  push(startNode);
  let expanded = 0;
  let found = -1;

  while (heap.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;
    if (goalReached(cur)) { found = cur; break; }
    if (expanded >= MAX_EXPANDED) break;
    if (expanded % 32 === 0) yield;

    const cx = Math.floor(cur / GRID), cz = cur % GRID;
    const wx = xOf(cx), wz = xOf(cz);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
        const nd = idx(nx, nz);
        if (closed[nd]) continue;
        const px = xOf(nx), pz = xOf(nz);
        if (!edgeClear(wx, wz, px, pz)) continue;
        // Köşe kesmeyi kır: çaprazda komşu kenarlardan en az biri açık olsun.
        if (dx && dz && !edgeClear(wx, wz, px, wz) && !edgeClear(wx, wz, wx, pz)) continue;
        const cost = gCost[cur] + (dx && dz ? DIAG : CELL);
        if (cost < gCost[nd]) {
          gCost[nd] = cost;
          parent[nd] = cur;
          fScore[nd] = cost + hAt(nd);
          push(nd);
        }
      }
    }
  }
  if (found < 0) return null;

  // Düğüm zincirini nokta listesine çevir (başlangıç düğümünü atla).
  const raw: RoutePoint[] = [];
  for (let nd = found; nd !== -1; nd = parent[nd]) {
    const ix = Math.floor(nd / GRID), iz = nd % GRID;
    raw.push({ x: xOf(ix), z: xOf(iz) });
  }
  raw.reverse();
  raw.shift();

  // Basit düzeltme: aynı kenar kontrolüyle en uzak görünür ara noktaya çiz.
  const out: RoutePoint[] = [];
  let ax = start.x, az = start.z, i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    for (; j > i; j--) {
      if (edgeClear(ax, az, raw[j].x, raw[j].z)) break;
    }
    out.push(raw[j]);
    ax = raw[j].x; az = raw[j].z;
    i = j + 1;
  }
  out.push({ x: goal.x, z: goal.z });
  return out;
}
