import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { lerp, smoothstep } from '../core/utils';
import type { DayNightMode } from '../data/settings';

const DAY_FOG = new THREE.Color(0.5, 0.66, 0.84);
const DUSK_FOG = new THREE.Color(0.82, 0.56, 0.42);
const NIGHT_FOG = new THREE.Color(0.035, 0.055, 0.1);

/** Gökyüzü, güneş/ay ışığı, sis ve gece-gündüz döngüsü. */
export class Environment {
  /** Oyun saati (0-24) */
  time = 9.5;
  mode: DayNightMode = 'cycle';
  /** 0 = gece, 1 = gündüz */
  day = 1;
  sunDir = new THREE.Vector3();
  lightDir = new THREE.Vector3();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fogColor = new THREE.Color();
  skyColor = new THREE.Color();
  /** Güneş rengi x şiddet (özel shader'lar için) */
  sunRadiance = new THREE.Color();

  private sky: Sky;
  private envSky: Sky;
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private stars: THREE.Points;
  private tmp = new THREE.Color();

  private shadowFrame = 0;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.sky = new Sky();
    this.sky.scale.setScalar(5000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.envSky = new Sky();
    this.envSky.scale.setScalar(5000);
    this.envScene.add(this.envSky);
    // Gölge haritasını her karede değil, update içinde aralıklı yeniden çiziyoruz
    renderer.shadowMap.autoUpdate = false;
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun = new THREE.DirectionalLight(0xffffff, 4);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(4096, 4096);
    sh.camera.left = sh.camera.bottom = -75;
    sh.camera.right = sh.camera.top = 75;
    sh.camera.near = 1;
    sh.camera.far = 420;
    sh.bias = -0.0003;
    sh.normalBias = 0.35;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4030, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xa0b8d0, 0.0017);

    // Yıldızlar
    const count = 1800;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * 2200;
      pos[i * 3 + 1] = Math.abs(u) * 2200 + 40;
      pos[i * 3 + 2] = Math.sin(a) * r * 2200;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xdde6ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.update(0, new THREE.Vector3(), true);
  }

  setShadowSize(size: number) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as any;
    this.renderer.shadowMap.needsUpdate = true;
  }

  get clock() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setMode(mode: DayNightMode, focus: THREE.Vector3) {
    const refresh = this.mode !== mode ||
      (mode === 'day' && this.time !== 12) ||
      (mode === 'night' && this.time !== 0);
    this.mode = mode;
    if (mode === 'day') this.time = 12;
    else if (mode === 'night') this.time = 0;
    if (refresh) this.update(0, focus, true);
  }

  update(dt: number, focus: THREE.Vector3, force = false) {
    // Gölge haritası her 3 karede bir yenilenir (güneş yavaş hareket ettiği için görünmez)
    // Bekleyen bir güncellemeyi ezme (ör. kalite değişimi); harita henüz yoksa mutlaka çiz
    if (this.shadowFrame++ % 3 === 0 || !this.sun.shadow.map) this.renderer.shadowMap.needsUpdate = true;
    if (this.mode === 'cycle') {
      // 1 oyun saati ≈ 50 sn; gece iki kat hızlı geçer
      const night = this.time > 20.5 || this.time < 4.5;
      this.time = (this.time + (dt / 50) * (night ? 2.2 : 1)) % 24;
    } else {
      this.time = this.mode === 'day' ? 12 : 0;
    }

    const ang = ((this.time - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang) * 0.9, 0.42).normalize();
    const sy = this.sunDir.y;
    this.day = smoothstep(-0.1, 0.18, sy);
    const golden = 1 - smoothstep(0.02, 0.4, sy);

    // Gökyüzü
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = lerp(2.2, 8, golden);
      u.rayleigh.value = lerp(2.2, 3.4, golden);
      u.mieCoefficient.value = 0.004;
      u.mieDirectionalG.value = 0.82;
    }

    // Güneş / ay
    const sunI = 4.2 * smoothstep(-0.04, 0.22, sy);
    const moonI = 1.3 * smoothstep(-0.04, -0.22, sy);
    if (sy > -0.04) {
      this.lightDir.copy(this.sunDir);
      this.sun.color.setRGB(1, lerp(0.95, 0.62, golden), lerp(0.86, 0.36, golden));
      this.sun.intensity = sunI;
    } else {
      this.lightDir.set(-this.sunDir.x, Math.max(0.45, -sy), -this.sunDir.z).normalize();
      this.sun.color.setRGB(0.55, 0.68, 1.0);
      this.sun.intensity = moonI;
    }
    this.sunRadiance.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 200);

    // Ortam ışığı ve sis
    this.fogColor.copy(DAY_FOG).lerp(DUSK_FOG, golden * 0.85);
    this.fogColor.lerpColors(NIGHT_FOG, this.fogColor, this.day);
    (this.scene.fog as THREE.FogExp2).color.copy(this.fogColor);
    this.skyColor.setRGB(0.2, 0.42, 0.78).lerp(this.tmp.setRGB(0.3, 0.3, 0.5), golden * 0.6);
    this.skyColor.lerpColors(this.tmp.setRGB(0.01, 0.015, 0.04), this.skyColor, this.day);

    this.hemi.intensity = lerp(0.55, 0.75, this.day);
    this.hemi.color.setRGB(0.3, 0.42, 0.8).lerp(this.tmp.setRGB(0.72, 0.84, 1.0), this.day);
    this.hemi.groundColor.setRGB(0.05, 0.06, 0.1).lerp(this.tmp.setRGB(0.34, 0.3, 0.22), this.day);
    this.scene.environmentIntensity = lerp(0.1, 0.28, this.day);

    (this.stars.material as THREE.PointsMaterial).opacity = 1 - smoothstep(-0.2, 0.05, sy);
    this.stars.position.copy(focus);
    this.sky.position.copy(focus);

    // Yansımalar için ortam haritasını seyrek güncelle
    this.envTimer -= dt;
    if (force || this.envTimer <= 0) {
      this.envTimer = 7;
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 12000);
      this.scene.environment = rt.texture;
      this.envRT?.dispose();
      this.envRT = rt;
    }
  }
}
