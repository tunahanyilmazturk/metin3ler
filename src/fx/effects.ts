import * as THREE from 'three';

interface Fx {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  kind: 'ring' | 'slash' | 'bolt';
  radius: number;
}

/**
 * Yumuşak kenarlı halka/yay: köşe başına parlaklık, kenarda sıfır, ortada en yüksek.
 * Eklemeli karışımda siyah köşe görünmez olduğu için kenarlar kendiliğinden erir.
 * Yay ya da tam halka XZ düzlemindedir; yayın ortası -Z yönüne bakar.
 */
function softArc(inner: number, outer: number, a0: number, aLen: number, rings: number, segs: number): THREE.BufferGeometry {
  const full = aLen >= Math.PI * 2 - 1e-3;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = a0 + aLen * u;
    // Yay uçlarına doğru yumuşak sönme (tam halkada sabit)
    const along = full ? 1 : Math.pow(Math.sin(Math.PI * u), 0.5);
    for (let j = 0; j <= rings; j++) {
      const v = j / rings;
      const r = inner + (outer - inner) * v;
      // Genişlik boyunca: iç ve dış kenar sönük, orta bant parlak
      const across = Math.pow(Math.sin(Math.PI * v), 2);
      pos.push(Math.cos(a) * r, 0, -Math.sin(a) * r);
      const k = along * across;
      col.push(k, k, k);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j, b = (i + 1) * (rings + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const RING = softArc(0.5, 1, 0, Math.PI * 2, 8, 64);
const BOLT = new THREE.CylinderGeometry(0.12, 0.3, 40, 6).translate(0, 20, 0);
// Yıldırım gövdesi tekdüze beyaz köşe rengi taşır (vertexColors için gerekli)
BOLT.setAttribute('color', new THREE.Float32BufferAttribute(new Array(BOLT.attributes.position.count * 3).fill(1), 3));

/** Kısa ömürlü ağ tabanlı efektler: şok halkası, kılıç izi, yıldırım, ışık parlaması. */
export class Effects {
  private list: Fx[] = [];
  private lights: { light: THREE.PointLight; t: number; dur: number; peak: number }[] = [];
  private nextLight = 0;
  /** 0–1: flaş ışıklarının şiddet çarpanı ("Parlama Azaltıldı" ayarı bunu düşürür). */
  flashScale = 1;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 16, 2);
      scene.add(light);
      this.lights.push({ light, t: 1, dur: 1, peak: 0 });
    }
  }

  private spawn(geo: THREE.BufferGeometry, color: number, kind: Fx['kind'], dur: number, radius: number, boost = 2.2) {
    const mat = new THREE.MeshBasicMaterial({
      color, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    mat.color.multiplyScalar(boost);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const fx: Fx = { mesh, t: 0, dur, kind, radius };
    this.list.push(fx);
    return fx;
  }

  ring(pos: THREE.Vector3, radius: number, color: number, dur = 0.5) {
    const fx = this.spawn(RING, color, 'ring', dur, radius, 1.4);
    fx.mesh.position.set(pos.x, pos.y + 0.25, pos.z);
    fx.mesh.scale.setScalar(0.1);
  }

  /** Yay biçimli kılıç izi: dar, yumuşak kenarlı ve kısa süreli. */
  slash(pos: THREE.Vector3, yaw: number, radius: number, color: number, tilt = 0, arc = 2.0) {
    const r = radius * 0.78;
    const geo = softArc(r * 0.25, r, Math.PI / 2 - arc / 2, arc, 10, 40);
    const fx = this.spawn(geo, color, 'slash', 0.24, r, 0.75);
    fx.mesh.position.set(pos.x, pos.y + 1.1, pos.z);
    // Yayın ortası -Z'ye bakar; karakterin önüne çevir
    fx.mesh.rotation.set(0, yaw + Math.PI, tilt, 'YXZ');
  }

  bolt(pos: THREE.Vector3, color: number) {
    const fx = this.spawn(BOLT, color, 'bolt', 0.28, 1, 2);
    fx.mesh.position.copy(pos);
    fx.mesh.rotation.y = Math.random() * 6;
  }

  flash(pos: THREE.Vector3, color: number, peak = 60, dur = 0.35) {
    const l = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    l.light.color.setHex(color);
    l.light.position.set(pos.x, pos.y + 1.5, pos.z);
    l.t = 0; l.dur = dur; l.peak = peak * this.flashScale;
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.t += dt;
      const k = fx.t / fx.dur;
      const mat = fx.mesh.material as THREE.MeshBasicMaterial;
      if (k >= 1) {
        this.scene.remove(fx.mesh);
        mat.dispose();
        if (fx.kind === 'slash') fx.mesh.geometry.dispose();
        this.list.splice(i, 1);
        continue;
      }
      if (fx.kind === 'ring') {
        const e = 1 - (1 - k) * (1 - k);
        fx.mesh.scale.setScalar(0.1 + e * fx.radius);
        mat.opacity = (1 - k) * (1 - k);
      } else if (fx.kind === 'slash') {
        // Hızlı açılıp yumuşakça sönen iz; hafifçe genişler
        const fade = (1 - k) * (1 - k);
        mat.opacity = fade;
        fx.mesh.scale.setScalar(0.96 + k * 0.08);
      } else {
        const pulse = 0.82 + Math.sin(k * Math.PI * 18) * 0.12;
        mat.opacity = (1 - k) * pulse;
        fx.mesh.scale.set(pulse, 1, pulse);
      }
    }
    for (const l of this.lights) {
      if (l.t >= l.dur) { l.light.intensity = 0; continue; }
      l.t += dt;
      // İkinci dereceden sönüm: ilk anda parlak, sonra yumuşakça kaybolur
      const f = Math.max(0, 1 - l.t / l.dur);
      l.light.intensity = l.peak * f * f;
    }
  }
}
