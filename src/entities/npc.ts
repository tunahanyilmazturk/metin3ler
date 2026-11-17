import * as THREE from 'three';
import { dampAngle } from '../core/utils';
import { NPC_LOOKS } from './creatures';
import { Humanoid } from './humanoid';
import type { Game } from '../game';

/** Köydeki etkileşimli karakter (görev ustası, tüccar, demirci). */
export class Npc {
  pos = new THREE.Vector3();
  model: Humanoid;
  private baseYaw: number;
  private yaw: number;
  readonly height: number;

  constructor(private game: Game, public id: string, public name: string, public title: string, x: number, z: number, yaw: number) {
    this.model = new Humanoid(NPC_LOOKS[id]);
    this.pos.set(x, game.terrain.getHeight(x, z), z);
    this.baseYaw = this.yaw = yaw;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = yaw;
    this.height = this.model.height;
    game.scene.add(this.model.root);
    game.colliders.add(x, z, 0.5);
  }

  update(dt: number) {
    const p = this.game.player;
    // Oyuncu yaklaşınca ona döner
    const d = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : 99;
    const target = d < 7 ? Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : this.baseYaw;
    this.yaw = dampAngle(this.yaw, target, 4, dt);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, 0);
  }
}
