import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY: Record<Quality, { ratio: number; shadow: number; grass: number; bloom: boolean; msaa: number }> = {
  low: { ratio: 0.75, shadow: 1024, grass: 0.3, bloom: false, msaa: 0 },
  medium: { ratio: 1, shadow: 2048, grass: 0.6, bloom: true, msaa: 2 },
  high: { ratio: 1.25, shadow: 4096, grass: 1, bloom: true, msaa: 4 },
  ultra: { ratio: 2, shadow: 4096, grass: 1, bloom: true, msaa: 4 },
};

/** Son kat: ACES + sRGB çıkışının üstüne vinyet ve hafif doygunluk/kontrast ekler. */
function makeGradedOutput(): OutputPass {
  const pass = new OutputPass();
  pass.needsSwap = false;
  pass.material.fragmentShader = pass.material.fragmentShader.replace(/}\s*$/, /* glsl */ `
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, 1.14);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
    float edge = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
    gl_FragColor.rgb = c * mix(0.68, 1.0, edge);
  }`);
  return pass;
}

/** WebGL çizici + HDR post-process zinciri (bloom, ACES ton eşleme, renk düzeltme). */
export class RenderPipeline {
  renderer: THREE.WebGLRenderer;
  composer!: EffectComposer;
  quality: Quality = 'high';

  constructor(private canvas: HTMLCanvasElement, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildComposer();
    window.addEventListener('resize', () => this.resize());
  }

  private pixelRatio() {
    const { ratio } = QUALITY[this.quality];
    return Math.min(window.devicePixelRatio * (ratio >= 1 ? 1 : ratio), ratio >= 1 ? ratio : 1);
  }

  private buildComposer() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose();
      this.composer.dispose();
    }
    // Varsayılan tamponlar mantıksal boyut tutar; sahneyi taşıyan tek tampon
    // readBuffer olduğundan MSAA yalnızca ona uygulanır.
    const composer = new EffectComposer(this.renderer);
    composer.readBuffer.samples = q.msaa;
    this.composer = composer;
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.6, 1.8));
    composer.addPass(makeGradedOutput());
  }

  setQuality(q: Quality) {
    if (this.quality === q) return;
    this.quality = q;
    this.buildComposer();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ratio = this.pixelRatio();
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.composer.setPixelRatio(ratio);
    }
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
