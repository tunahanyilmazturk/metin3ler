import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY: Record<Quality, { ratio: number; shadow: number; grass: number; bloom: boolean; msaa: number }> = {
  low: { ratio: 0.75, shadow: 1024, grass: 0.3, bloom: false, msaa: 0 },
  medium: { ratio: 1, shadow: 2048, grass: 0.6, bloom: true, msaa: 2 },
  high: { ratio: 1.25, shadow: 4096, grass: 1, bloom: true, msaa: 4 },
  ultra: { ratio: 2, shadow: 4096, grass: 1, bloom: true, msaa: 4 },
};

/** Son kat: vinyet + hafif doygunluk/kontrast (ekran uzayında). */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.14);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.22);
      float v = smoothstep(0.9, 0.3, length(vUv - 0.5));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

/** WebGL çizici + HDR post-process zinciri (bloom, ACES ton eşleme, renk düzeltme). */
export class RenderPipeline {
  renderer: THREE.WebGLRenderer;
  composer!: EffectComposer;
  quality: Quality = 'high';
  private bloom!: UnrealBloomPass;

  constructor(private canvas: HTMLCanvasElement, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildComposer();
    window.addEventListener('resize', () => this.resize());
  }

  private buildComposer() {
    const q = QUALITY[this.quality];
    const ratio = Math.min(window.devicePixelRatio * (q.ratio >= 1 ? 1 : q.ratio), q.ratio >= 1 ? q.ratio : 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.6, 1.8);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GradeShader));
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.buildComposer();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
