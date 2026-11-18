import * as THREE from 'three';
import type { ClassId } from '../data/classes';
import { joint, mat, part } from './model';

type Material = THREE.MeshStandardMaterial;

const STYLES = {
  warrior: { fabric: 0x722e2a, trim: 0xc99b55, lining: 0x392522 },
} satisfies Record<ClassId, { fabric: number; trim: number; lining: number }>;

function plate(points: [number, number][], depth: number, material: Material, parent: THREE.Group, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1,
  });
  return part(geometry, material, parent, x, y, z);
}

/** Oyuncunun sınıfını silüetinden tanıtan, mevcut eklemlere bağlı giysi parçaları. */
export class PlayerOutfit {
  private trim: Material;
  private fabric: Material;
  private lining: Material;
  private panels: THREE.Group[] = [];

  constructor(private style: ClassId, private armor: Material) {
    const colors = STYLES[style];
    this.trim = mat(colors.trim, 0.48, 0.46);
    this.fabric = mat(colors.fabric, 0.86);
    this.lining = mat(colors.lining, 0.9);
  }

  addTorso(spine: THREE.Group, hips: THREE.Group, bulk: number) {
    const emblem = joint(spine, 0, 0.35, 0.146 * bulk);
    if (this.style === 'warrior') {
      plate([[-0.14, 0.1], [0, 0.14], [0.14, 0.1], [0.12, -0.08], [0, -0.15], [-0.12, -0.08]], 0.022, this.armor, emblem);
      plate([[-0.042, 0.025], [0, 0.076], [0.042, 0.025], [0, -0.047]], 0.013, this.trim, emblem, 0, 0.012, 0.028);
    }

    const length = 0.48;
    const width = 0.33;
    const cape = joint(spine, 0, 0.49, -0.145 * bulk);
    plate([[-width / 2, 0], [width / 2, 0], [width * 0.58, -length * 0.86], [0, -length], [-width * 0.58, -length * 0.86]], 0.013, this.fabric, cape);
    plate([[-0.017, -0.055], [0.017, -0.055], [0.017, -length * 0.77], [0, -length * 0.88], [-0.017, -length * 0.77]], 0.006, this.trim, cape, 0, 0, -0.008);
    this.panels.push(cape);

    const hem = 0.25;
    const tabard = joint(hips, 0, 0.065, 0.162 * bulk);
    plate([[-0.089, 0], [0.089, 0], [0.073, -hem * 0.88], [0, -hem], [-0.073, -hem * 0.88]], 0.012, this.fabric, tabard);
    plate([[-0.012, -0.036], [0.012, -0.036], [0.012, -hem * 0.78], [0, -hem * 0.89], [-0.012, -hem * 0.78]], 0.006, this.trim, tabard, 0, 0, 0.016);
    this.panels.push(tabard);
  }

  addShoulder(arm: THREE.Group, side: number) {
    const size = 1;
    for (let layer = 0; layer < 2; layer++) {
      const guard = part(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.65),
        layer === 0 ? this.trim : this.armor, arm, side * (0.03 + layer * 0.014), 0.043 - layer * 0.063, 0);
      guard.scale.set(size * (1.2 - layer * 0.14), 0.61 * size, 1.06 * size);
      guard.rotation.z = -side * 0.24;
    }
  }

  addHeadwear(head: THREE.Group) {
    if (this.style === 'warrior') {
      const band = part(new THREE.TorusGeometry(0.109, 0.012, 5, 20), this.lining, head, 0, 0.217, 0.009);
      band.rotation.x = Math.PI / 2;
      part(new THREE.OctahedronGeometry(0.023), this.trim, head, 0, 0.217, 0.127).scale.z = 0.45;
      return;
    }

  }

  update(time: number, motion: number, turning: number, riding: boolean) {
    const [cape, tabard] = this.panels;
    cape.rotation.x = 0.18 + motion * 0.59 + Math.sin(time * 5) * (0.035 + motion * 0.065);
    cape.rotation.z = -turning * 0.38 + Math.sin(time * 3) * 0.035;
    tabard.rotation.x = -0.18 - motion * 0.13 - (riding ? 0.75 : 0) + Math.sin(time * 5 + 1) * 0.05;
  }
}
