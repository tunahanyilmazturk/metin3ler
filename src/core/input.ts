/** Klavye ve fare durumunu kare bazında toplar. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { x: 0, y: 0, dx: 0, dy: 0, wheel: 0, down: false, button: 0, clicked: false, moved: 0 };
  virtualMove = { x: 0, y: 0 };
  virtualAttack = false;
  private activePointer: number | null = null;
  private pointerX = 0;
  private pointerY = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.virtualMove.x = 0;
      this.virtualMove.y = 0;
      this.virtualAttack = false;
      this.activePointer = null;
      this.mouse.down = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.activePointer !== null) return;
      e.preventDefault();
      this.activePointer = e.pointerId;
      this.mouse.down = true;
      this.mouse.button = e.button;
      this.mouse.moved = 0;
      this.mouse.x = this.pointerX = e.clientX;
      this.mouse.y = this.pointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.pointerId === this.activePointer) {
        const dx = e.clientX - this.pointerX;
        const dy = e.clientY - this.pointerY;
        this.mouse.dx += dx;
        this.mouse.dy += dy;
        this.mouse.moved += Math.abs(dx) + Math.abs(dy);
        this.pointerX = e.clientX;
        this.pointerY = e.clientY;
      }
    });
    const endPointer = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointer) return;
      if (this.mouse.button === 0 && this.mouse.moved < 6 && e.target === canvas) {
        this.mouse.clicked = true;
      }
      this.mouse.down = false;
      this.activePointer = null;
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  down(code: string) { return this.keys.has(code); }
  hit(code: string) { return this.pressed.has(code); }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mouse.clicked = false;
  }
}
