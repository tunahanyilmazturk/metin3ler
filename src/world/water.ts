import * as THREE from 'three';
import { WATER_LEVEL, WORLD_HALF, WORLD_SIZE } from '../data/world';
import type { Terrain } from './terrain';
import type { Environment } from './environment';

/** Fresnel yansımalı, kıyı köpüklü, derinliğe duyarlı su yüzeyi. */
export class Water {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(terrain: Terrain) {
    const seg = 200;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      depth[i] = WATER_LEVEL - terrain.getHeight(pos.getX(i), pos.getZ(i));
    }
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: new THREE.Color(1, 1, 1) },
        uSky: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uDay: { value: 1 },
        uFogDensity: { value: 0.0017 },
      },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        varying float vDepth;
        varying vec3 vW;
        void main() {
          vDepth = aDepth;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uDay; uniform float uFogDensity;
        uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHorizon;
        varying float vDepth; varying vec3 vW;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float hmap(vec2 p) {
          float t = uTime;
          return noise(p * 0.32 + vec2(t * 0.22, t * 0.16)) * 0.6
               + noise(p * 0.85 - vec2(t * 0.31, t * 0.2)) * 0.3
               + noise(p * 2.4 + vec2(t * 0.5, -t * 0.42)) * 0.12;
        }
        void main() {
          if (vDepth < -0.05) discard;
          vec2 p = vW.xz;
          float e = 0.18;
          float h0 = hmap(p);
          vec3 n = normalize(vec3(-(hmap(p + vec2(e, 0.0)) - h0) / e * 0.5, 1.0, -(hmap(p + vec2(0.0, e)) - h0) / e * 0.5));
          vec3 toCam = cameraPosition - vW;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n); R.y = abs(R.y);
          vec3 refl = mix(uHorizon, uSky, pow(clamp(R.y, 0.0, 1.0), 0.45));
          float sd = max(dot(R, uSunDir), 0.0);
          vec3 spec = uSun * (pow(sd, 420.0) * 3.0 + pow(sd, 36.0) * 0.06);
          float dz = smoothstep(0.0, 5.0, vDepth);
          vec3 body = mix(vec3(0.07, 0.25, 0.24), vec3(0.008, 0.045, 0.075), dz) * (0.12 + 0.88 * uDay);
          vec3 col = mix(body, refl, fres) + spec;
          float foam = smoothstep(0.5, 0.0, vDepth) * smoothstep(0.35, 0.75, noise(p * 2.6 + uTime * 0.25));
          col = mix(col, vec3(0.85) * (0.15 + 0.85 * uDay), foam * 0.6);
          float alpha = smoothstep(0.0, 0.7, vDepth) * mix(0.7, 1.0, max(fres, dz));
          alpha = max(alpha, foam * 0.45);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, uHorizon, fog);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 2;
    void WORLD_HALF;
  }

  update(time: number, env: Environment) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uSunDir.value.copy(env.lightDir);
    u.uSun.value.copy(env.sunRadiance);
    u.uSky.value.copy(env.skyColor);
    u.uHorizon.value.copy(env.fogColor);
    u.uDay.value = env.day;
  }
}
