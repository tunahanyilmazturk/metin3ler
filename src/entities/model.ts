import * as THREE from 'three';

/** Tüm canlı modellerinin ortak arayüzü (prosedürel animasyonlu). */
export interface CreatureModel {
  root: THREE.Group;
  height: number;
  update(dt: number, speed: number): void;
  /** idx: saldırı varyasyonu (insansılarda kombo adımı) */
  attack(duration: number, idx?: number): void;
  hit(): void;
  die(): void;
  revive(): void;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Paylaşılan malzeme önbelleği: aynı parametreler tek malzeme üretir. */
export function mat(
  color: number, roughness = 0.75, metalness = 0,
  extra: { map?: THREE.Texture; normalMap?: THREE.Texture; emissive?: number; emissiveIntensity?: number; emissiveMap?: THREE.Texture; key?: string } = {},
) {
  const key = `${color}|${roughness}|${metalness}|${extra.key ?? ''}|${extra.emissive ?? 0}|${extra.emissiveIntensity ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (extra.map) m.map = extra.map;
    if (extra.normalMap) m.normalMap = extra.normalMap;
    if (extra.emissive !== undefined) {
      m.emissive = new THREE.Color(extra.emissive);
      m.emissiveIntensity = extra.emissiveIntensity ?? 1;
    }
    if (extra.emissiveMap) m.emissiveMap = extra.emissiveMap;
    cache.set(key, m);
  }
  return m;
}

export function part(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

export function joint(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function disposeModel(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  root.removeFromParent();
}
