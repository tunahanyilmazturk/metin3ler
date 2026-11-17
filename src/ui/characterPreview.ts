import * as THREE from 'three';
import type { Player } from '../entities/player';

/** Renders the currently equipped player model in the inventory paper doll. */
export class CharacterPreview {
  readonly canvas = document.createElement('canvas');
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  private renderer: THREE.WebGLRenderer | null = null;
  private source: THREE.Group | null = null;
  private avatar: THREE.Group | null = null;
  private sourceNodes: THREE.Object3D[] = [];
  private avatarNodes: THREE.Object3D[] = [];
  private pointerId: number | null = null;
  private pointerX = 0;
  private yaw = 0;
  private width = 0;
  private height = 0;

  constructor() {
    this.canvas.className = 'paperdoll-canvas';
    this.canvas.setAttribute('aria-label', 'Kuşanılan ekipmanıyla karakter önizlemesi');
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.pointerId !== null) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      this.pointerX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.yaw += (event.clientX - this.pointerX) * 0.012;
      this.pointerX = event.clientX;
    });
    const stopDrag = (event: PointerEvent) => {
      if (event.pointerId === this.pointerId) this.pointerId = null;
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);

    this.camera.position.set(0, 1.08, 4.35);
    this.camera.lookAt(0, 0.96, 0);
    this.scene.add(new THREE.HemisphereLight(0xffe4bd, 0x202b42, 2.2));
    const key = new THREE.DirectionalLight(0xffd8a0, 3.2);
    key.position.set(-2.5, 4, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x78a9e8, 1.7);
    rim.position.set(3, 2, -3);
    this.scene.add(rim);
  }

  mount(host: HTMLElement, player: Player) {
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          alpha: true,
          antialias: false,
          powerPreference: 'low-power',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.85;
      } catch {
        host.classList.add('preview-unavailable');
        return;
      }
    }
    this.syncModel(player);
    this.resize();
  }

  update(player: Player) {
    if (!this.renderer || !this.canvas.isConnected) return;
    this.syncModel(player);
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  private syncModel(player: Player) {
    const source = player.model.root;
    if (source !== this.source) {
      if (this.avatar) this.scene.remove(this.avatar);
      this.source = source;
      this.avatar = source.clone(true);
      this.sourceNodes = [];
      this.avatarNodes = [];
      source.traverse((node) => this.sourceNodes.push(node));
      this.avatar.traverse((node) => this.avatarNodes.push(node));
      this.scene.add(this.avatar);
    }

    if (!this.avatar) return;
    for (let i = 0; i < this.sourceNodes.length; i++) {
      const from = this.sourceNodes[i], to = this.avatarNodes[i];
      if (i === 0) {
        to.position.set(0, 0, 0);
        to.rotation.set(0, this.yaw, 0);
      } else {
        to.position.copy(from.position);
        to.quaternion.copy(from.quaternion);
      }
      to.scale.copy(from.scale);
      to.visible = from.visible;
    }
  }

  private resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width), height = Math.floor(rect.height);
    if (width < 1 || height < 1 || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
