import * as THREE from 'three';
import type { QuestNavigator } from './questNavigator';
import { MARK_COUNT, MARK_SPACING } from './questNavTypes';

// ------------------------------------------------------------------ iz işaretleri

export function tickMarks(nav: QuestNavigator, dt: number) {
  nav.markT -= dt;
  if (nav.markT > 0) return;
  nav.markT = 0.125; // en çok 8 Hz
  updateMarks(nav);
}

/** Görünen işaret sayısı (tanılama/test). */

export function ensureMarks(nav: QuestNavigator) {
  if (nav.marks) return;
  // +Z yönüne bakan yassı şevron
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.42, 0, -0.35, 0, 0, 0.55, 0, 0, -0.02,
    0, 0, 0.55, 0.42, 0, -0.35, 0, 0, -0.02,
  ]), 3));
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf0c040, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false,
  });
  nav.marks = new THREE.InstancedMesh(geo, mat, MARK_COUNT);
  nav.marks.frustumCulled = false;
  nav.marks.renderOrder = 4;
  nav.marks.count = 0;
  nav.marks.visible = false;
  nav.game.scene.add(nav.marks);
}

/** Kalan rota üzerinde ~2.75 m aralıklarla şevronları diz. */
export function updateMarks(nav: QuestNavigator) {
  ensureMarks(nav);
  const m = nav.marks!;
  const g = nav.game, p = g.player;
  const pts = nav.remaining;
  let count = 0;
  if (nav.active && pts.length) {
    let ax = p.pos.x, az = p.pos.z;
    let carry = MARK_SPACING * 0.6;
    for (let i = 0; i < pts.length && count < MARK_COUNT; i++) {
      const bx = pts[i].x, bz = pts[i].z;
      const dx = bx - ax, dz = bz - az;
      let len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ux = dx / len, uz = dz / len;
      nav.dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      while (len >= carry && count < MARK_COUNT) {
        ax += ux * carry; az += uz * carry;
        nav.dummy.position.set(ax, g.terrain.getHeight(ax, az) + 0.12, az);
        nav.dummy.updateMatrix();
        m.setMatrixAt(count++, nav.dummy.matrix);
        len -= carry;
        carry = MARK_SPACING;
      }
      carry -= len;
      ax = bx; az = bz;
    }
  }
  m.count = count;
  m.instanceMatrix.needsUpdate = true;
  m.visible = count > 0;
}
