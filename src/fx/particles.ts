import * as THREE from 'three';

export interface EmitOpts {
  count: number;
  color: number;
  color2?: number;
  /** Yatay/küresel hız */
  speed: number;
  /** Ek yukarı hız */
  up?: number;
  life: number;
  size: number;
  gravity?: number;
  /** Başlangıç konumu saçılımı */
  spread?: number;
  additive?: boolean;
  /** true ise yalnızca yatay düzlemde saçılır */
  flat?: boolean;
}

const VERT = /* glsl */ `
  attribute vec4 aColor; attribute float aSize;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

class Layer {
  points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private grav: Float32Array; private base: Float32Array;
  private cursor = 0;
  private geo = new THREE.BufferGeometry();
  material: THREE.ShaderMaterial;

  constructor(private n: number, additive: boolean) {
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grav = new Float32Array(n); this.base = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 800 } },
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: THREE.Vector3, o: EmitOpts, c1: THREE.Color, c2: THREE.Color) {
    for (let k = 0; k < o.count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const sp = o.spread ?? 0;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * sp * (o.flat ? 0.2 : 1);
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * sp;
      const a = Math.random() * Math.PI * 2;
      const u = o.flat ? 0 : Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = o.speed * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = Math.cos(a) * r * s;
      this.vel[i * 3 + 1] = u * s + (o.up ?? 0) * (0.5 + Math.random() * 0.5);
      this.vel[i * 3 + 2] = Math.sin(a) * r * s;
      const t = Math.random();
      this.col[i * 4] = c1.r + (c2.r - c1.r) * t;
      this.col[i * 4 + 1] = c1.g + (c2.g - c1.g) * t;
      this.col[i * 4 + 2] = c1.b + (c2.b - c1.b) * t;
      this.col[i * 4 + 3] = 1;
      this.life[i] = this.max[i] = o.life * (0.6 + Math.random() * 0.4);
      this.base[i] = o.size * (0.6 + Math.random() * 0.4);
      this.grav[i] = o.gravity ?? 0;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.6 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.max[i];
      this.col[i * 4 + 3] = Math.min(1, k * 2);
      this.size[i] = this.base[i] * (0.4 + 0.6 * k);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/** Havuzlanmış parçacık sistemi: ateş, kıvılcım, toz ve büyü efektleri. */
export class Particles {
  private add = new Layer(5000, true);
  private alpha = new Layer(1500, false);
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();

  constructor(scene: THREE.Scene) {
    scene.add(this.add.points, this.alpha.points);
  }

  setViewport(height: number, fov: number) {
    const s = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.material.uniforms.uScale.value = s;
    this.alpha.material.uniforms.uScale.value = s;
  }

  emit(pos: THREE.Vector3, o: EmitOpts) {
    this.c1.setHex(o.color);
    this.c2.setHex(o.color2 ?? o.color);
    if (o.additive !== false) {
      // HDR parlaklık: bloom'u tetikler
      this.c1.multiplyScalar(1.8);
      this.c2.multiplyScalar(1.8);
    }
    (o.additive !== false ? this.add : this.alpha).emit(pos, o, this.c1, this.c2);
  }

  update(dt: number) {
    this.add.update(dt);
    this.alpha.update(dt);
  }
}
