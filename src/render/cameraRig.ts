import * as THREE from 'three';
import { clamp, damp } from '../core/utils';
import type { Input } from '../core/input';
import type { Terrain } from '../world/terrain';

/** Üçüncü şahıs yörünge kamerası: fareyle sürükleyerek döndür, tekerlekle yakınlaş. */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.42;
  dist = 11;
  private distTarget = 11;
  private focus = new THREE.Vector3();
  private shake = 0;

  constructor(public camera: THREE.PerspectiveCamera, private terrain: Terrain) {}

  addShake(a: number) { this.shake = Math.max(this.shake, a); }

  snap(target: THREE.Vector3) { this.focus.copy(target); }

  setView(yaw: number, pitch: number, dist: number) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = this.distTarget = dist;
  }

  update(dt: number, target: THREE.Vector3, input: Input | null) {
    if (input) {
      if (input.mouse.down) {
        this.yaw -= input.mouse.dx * 0.0055;
        this.pitch = clamp(this.pitch + input.mouse.dy * 0.004, -0.12, 1.35);
      }
      if (input.down('KeyQ')) this.yaw += dt * 1.8;
      if (input.down('KeyE') && false) this.yaw -= dt * 1.8;
      this.distTarget = clamp(this.distTarget + input.mouse.wheel * 1.4, 3.5, 26);
    }
    this.dist = damp(this.dist, this.distTarget, 10, dt);
    this.focus.x = damp(this.focus.x, target.x, 14, dt);
    this.focus.y = damp(this.focus.y, target.y + 1.55, 10, dt);
    this.focus.z = damp(this.focus.z, target.z, 14, dt);

    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    cam.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const ground = this.terrain.getHeight(cam.position.x, cam.position.z) + 0.7;
    if (cam.position.y < ground) cam.position.y = ground;
    if (cam.position.y < 0.5) cam.position.y = 0.5;

    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-9 * dt);
    }
    cam.lookAt(this.focus);
  }
}
