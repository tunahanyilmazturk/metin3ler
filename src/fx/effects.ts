import * as THREE from 'three';

interface Fx {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  kind: 'ring' | 'slash' | 'bolt';
  radius: number;
}

const RING = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const BOLT = new THREE.CylinderGeometry(0.12, 0.3, 40, 6).translate(0, 20, 0);

/** Kısa ömürlü ağ tabanlı efektler: şok halkası, kılıç izi, yıldırım, ışık parlaması. */
export class Effects {
  private list: Fx[] = [];
  private lights: { light: THREE.PointLight; t: number; dur: number; peak: number }[] = [];
  private nextLight = 0;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 22, 1.8);
      scene.add(light);
      this.lights.push({ light, t: 1, dur: 1, peak: 0 });
    }
  }

  private spawn(geo: THREE.BufferGeometry, color: number, kind: Fx['kind'], dur: number, radius: number, boost = 2.2) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
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
    const fx = this.spawn(RING, color, 'ring', dur, radius);
    fx.mesh.position.set(pos.x, pos.y + 0.25, pos.z);
    fx.mesh.scale.setScalar(0.1);
  }

  /** Yay biçimli kılıç izi */
  slash(pos: THREE.Vector3, yaw: number, radius: number, color: number, tilt = 0, arc = 2.4) {
    const geo = new THREE.RingGeometry(radius * 0.55, radius, 24, 1, Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
    const fx = this.spawn(geo, color, 'slash', 0.2, radius, 1.6);
    fx.mesh.position.set(pos.x, pos.y + 1.15, pos.z);
    // Halka yayının ortası -Z'ye bakar; karakterin önüne çevir
    fx.mesh.rotation.set(0, yaw + Math.PI, tilt, 'YXZ');
  }

  bolt(pos: THREE.Vector3, color: number) {
    const fx = this.spawn(BOLT, color, 'bolt', 0.28, 1, 3);
    fx.mesh.position.copy(pos);
    fx.mesh.rotation.y = Math.random() * 6;
  }

  flash(pos: THREE.Vector3, color: number, peak = 60, dur = 0.35) {
    const l = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    l.light.color.setHex(color);
    l.light.position.set(pos.x, pos.y + 1.5, pos.z);
    l.t = 0; l.dur = dur; l.peak = peak;
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
        mat.opacity = (1 - k) * (1 - k);
        fx.mesh.scale.setScalar(0.94 + k * 0.16);
      } else {
        const pulse = 0.82 + Math.sin(k * Math.PI * 18) * 0.12;
        mat.opacity = (1 - k) * pulse;
        fx.mesh.scale.set(pulse, 1, pulse);
      }
    }
    for (const l of this.lights) {
      if (l.t >= l.dur) { l.light.intensity = 0; continue; }
      l.t += dt;
      l.light.intensity = l.peak * Math.max(0, 1 - l.t / l.dur);
    }
  }
}
