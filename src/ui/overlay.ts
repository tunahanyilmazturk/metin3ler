import * as THREE from 'three';
import type { Game } from '../game';

interface Plate { el: HTMLDivElement; name: HTMLSpanElement; bar: HTMLElement; fill: HTMLElement; key: string }
interface FloatText { el: HTMLDivElement; pos: THREE.Vector3; t: number }

const MAX_PLATES = 22;

/** 3B dünyaya sabitlenen HTML katmanı: isim plakaları ve uçuşan hasar yazıları. */
export class Overlay {
  private plates: Plate[] = [];
  private texts: FloatText[] = [];
  private v = new THREE.Vector3();

  constructor(private game: Game, private root: HTMLElement) {
    for (let i = 0; i < MAX_PLATES; i++) {
      const el = document.createElement('div');
      el.className = 'plate';
      el.innerHTML = '<span></span><div class="pbar"><i></i></div>';
      el.style.display = 'none';
      root.appendChild(el);
      this.plates.push({ el, name: el.querySelector('span')!, bar: el.querySelector('.pbar')!, fill: el.querySelector('i')!, key: '' });
    }
    game.events.on('damageText', (d: { pos: THREE.Vector3; y: number; text: string; cls: string }) => {
      if (this.texts.length > 40) return;
      const el = document.createElement('div');
      el.className = `ftext ${d.cls}`;
      el.textContent = d.text;
      root.appendChild(el);
      const pos = d.pos.clone();
      pos.y += d.y;
      pos.x += (Math.random() - 0.5) * 0.8;
      this.texts.push({ el, pos, t: 0 });
    });
  }

  private project(x: number, y: number, z: number) {
    this.v.set(x, y, z).project(this.game.cam);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) return false;
    this.v.x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    this.v.y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    return true;
  }

  update(dt: number) {
    const g = this.game, p = g.player;
    let used = 0;
    const show = (key: string, label: string, cls: string, x: number, y: number, z: number, hp: number) => {
      if (used >= MAX_PLATES || !this.project(x, y, z)) return;
      const pl = this.plates[used++];
      if (pl.key !== key) {
        pl.key = key;
        pl.name.innerHTML = label;
        pl.el.className = `plate ${cls}`;
      }
      pl.el.style.display = '';
      pl.el.style.transform = `translate(-50%, -100%) translate(${this.v.x.toFixed(1)}px, ${this.v.y.toFixed(1)}px)`;
      pl.bar.style.display = hp < 0 ? 'none' : '';
      if (hp >= 0) pl.fill.style.width = `${(hp * 100).toFixed(1)}%`;
    };

    for (const n of g.npcs) {
      if (n.pos.distanceTo(p.pos) < 45) show(`n${n.id}`, `${n.name}<small>${n.title}</small>`, 'npc', n.pos.x, n.pos.y + n.height + 0.25, n.pos.z, -1);
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d > 50) continue;
      const engaged = e === p.target || e.sinceHit < 6 || e.state === 'chase' || e.state === 'attack';
      if (!engaged && !(d < 22) && !e.isStone && !e.def.boss) continue;
      const cls = e.isStone ? 'stone' : e.def.boss ? 'boss' : e === p.target ? 'target' : '';
      show(`e${e.def.id}${cls}${engaged ? 1 : 0}`, `<b>Sv.${e.def.level}</b> ${e.def.name}`, cls, e.pos.x, e.pos.y + e.height + 0.3, e.pos.z, engaged || e.isStone ? e.hp / e.maxHp : -1);
    }
    for (let i = used; i < MAX_PLATES; i++) {
      if (this.plates[i].el.style.display !== 'none') this.plates[i].el.style.display = 'none';
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > 1) { t.el.remove(); this.texts.splice(i, 1); continue; }
      if (this.project(t.pos.x, t.pos.y + t.t * 1.6, t.pos.z)) {
        const pop = Math.min(1, t.t / 0.12);
        const fadeIn = Math.min(1, t.t / 0.05);
        const fadeOut = Math.min(1, (1 - t.t) / 0.22);
        t.el.style.transform = `translate(-50%, -50%) translate(${this.v.x.toFixed(1)}px, ${this.v.y.toFixed(1)}px) scale(${(0.9 + pop * 0.16).toFixed(2)})`;
        t.el.style.opacity = String(Math.min(fadeIn, fadeOut).toFixed(2));
      } else t.el.style.opacity = '0';
    }
  }
}
