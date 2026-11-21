import { clamp } from '../core/utils';
import { CLASSES, DEFAULT_CLASS, expForLevel } from '../data/classes';
import { ITEMS, RARITY_COLORS } from '../data/items';
import { anchorOf, asStack } from '../data/inventory';
import { SKILLS } from '../data/skills';
import type { HotbarEntry } from '../entities/player';
import type { Npc } from '../entities/npc';
import { SaveSystem } from '../systems/save';
import type { Game } from '../game';
import { icon } from './icons';
import { enemyInfoHtml } from './enemyInfo';
import { Minimap } from './minimap';
import { Overlay } from './overlay';
import { Windows } from './windows';
import { WorldMap } from './worldmap';

import { $, setText, setWidth } from './uiDom';
import { bindBar, bindTouch } from './uiBindings';
import { syncHotbarSlot, showTutorial, renderTutorial, finishTutorial, syncAutoHuntButton, syncMountButton } from './uiHud';

/** Arayüz kökü: başlangıç ekranı, HUD, kayıt günlüğü ve pencere yönetimi. */
export class UI {
  root = $('#ui');
  start!: HTMLElement;
  hud!: HTMLElement;
  death!: HTMLElement;
  logEl!: HTMLElement;
  windows!: Windows;
  overlay!: Overlay;
  minimap!: Minimap;
  worldmap!: WorldMap;
  el: Record<string, HTMLElement> = {};
  hbEls: { root: HTMLElement; ic: HTMLElement; cd: HTMLElement; cdt: HTMLElement; cnt: HTMLElement }[] = [];
  hurt = 0;
  slow = 0;
  tutorialStep = 0;
  enemyInfoOpen = false;
  enemyInfoKey = '';
  readonly tutorialSteps = [
    { title: 'Diyarı keşfet', text: 'WASD ile yürü, Shift ile hızlan. Zemine tıklayarak da gideceğin yeri seçebilirsin. Dokunmatik ekranda sol çubuğu kullan.' },
    { title: 'Hedef al ve savaş', text: 'Bir düşmana tıklayarak hedef seç; Tab ile yakındaki hedefler arasında geçiş yap. Boşluk ile saldır veya dokunmatik ekrandaki Saldır düğmesine bas.' },
    { title: 'Yeteneklerini kullan', text: '1–4 tuşları alt sırayı, F1–F4 üst sırayı kullanır. Eşya ve yetenekleri çubuğa sürükleyip dizebilir, sağ tıkla çıkarabilirsin. Yetenekler mana harcar ve bekleme süresine sahiptir.' },
    { title: 'İlk görevini al', text: 'Köyde Bilge Aksakal’a yaklaş ve E’ye bas. Görevi kabul et; hedefin ekranın sol üstündeki takip alanında görünür. Oradaki Rota düğmesi seni hedefe yürütür, İz düğmesi yere iz işaretleri koyar. İlerlemen tarayıcına kaydedilir.' },
  ];

  constructor(readonly game: Game) {
    this.root.insertAdjacentHTML('beforeend', `
      <div id="overlay"></div>
      <div id="hud" class="hidden">
        <div class="hud-player-stack">
          <div class="frame player-frame">
            <div class="portrait"><span id="p-level">1</span></div>
            <div class="pf-body">
              <div class="pf-name" id="p-name"></div>
              <div class="bar hp"><i id="p-hp"></i><span id="p-hp-t"></span></div>
              <div class="bar mp"><i id="p-mp"></i><span id="p-mp-t"></span></div>
              <div class="buffs" id="p-buffs"></div>
            </div>
          </div>
          <div class="tracker" id="tracker">
            <b id="tr-title"></b>
            <span id="tr-prog"></span>
            <small class="tr-status" id="tr-status"></small>
            <div class="tr-btns" id="tr-btns">
              <button type="button" data-quest-route="walk" aria-pressed="false" title="Görev hedefine otomatik yürü">${icon('route')}<span>Rota</span></button>
              <button type="button" data-quest-route="trail" aria-pressed="false" title="Hedefe giden yolu yerde işaretle">${icon('trail')}<span>İz</span></button>
              <button type="button" data-quest-route="auto" aria-pressed="false" title="Görev zincirini otomatik yürüt: hedefe git, savaş, teslim et">${icon('sword')}<span>Oto</span></button>
            </div>
          </div>
        </div>
        <div class="frame target-frame hidden" id="target">
          <div class="tf-name" id="t-name"></div>
          <div class="bar hp"><i id="t-hp"></i><span id="t-hp-t"></span></div>
          <button class="tf-info" id="t-info" type="button" aria-label="Düşman bilgisi" title="Düşman bilgisi ve düşen eşyalar">!</button>
        </div>
        <div class="enemy-info hidden" id="enemy-info" role="dialog" aria-label="Düşman bilgisi"></div>
        <div class="mm-wrap">
          <div class="mm-ring"><canvas id="minimap" width="184" height="184"></canvas></div>
          <div class="mm-zooms">
            <button class="mm-zoom" type="button" data-zoom="in" title="Yakınlaştır" aria-label="Mini haritayı yakınlaştır">+</button>
            <button class="mm-zoom" type="button" data-zoom="out" title="Uzaklaştır" aria-label="Mini haritayı uzaklaştır">−</button>
          </div>
          <button class="mm-expand" type="button" title="Dünya haritası (M)" aria-label="Dünya haritasını aç">⤢</button>
          <div class="mm-info"><span id="mm-clock"></span><span id="mm-pos"></span></div>
        </div>
        <div class="log" id="log"></div>
        <div class="bottom">
          <div class="hint" id="hint"></div>
          <div class="hotbar" id="hotbar"></div>
          <div class="expbar"><i id="p-exp"></i><span id="p-exp-t"></span></div>
        </div>
        <div class="hotbar hb-float" id="hotbar2"></div>
        <div class="touch-controls" aria-label="Dokunmatik kontroller">
          <div class="touch-stick" aria-label="Hareket" role="application"><span class="touch-knob"></span></div>
          <button class="touch-attack" type="button" aria-label="Saldır">${icon('sword')}<span>Saldır</span></button>
        </div>
        <div class="menu-btns">
          <button data-win="char" title="Karakter (C)">${icon('helmet')}<kbd>C</kbd></button>
          <button data-win="inv" title="Envanter (I)">${icon('armor')}<kbd>I</kbd></button>
          <button data-win="quest" title="Görev (J)">${icon('buff')}<kbd>J</kbd></button>
          <button data-win="pets" title="Evcil Hayvanlar (P)">${icon('paw')}<kbd>P</kbd></button>
          <button data-win="settings" title="Ayarlar (Esc)">${icon('aoe')}<kbd>Esc</kbd></button>
        </div>
        <div class="fps" id="fps"></div>
        <div class="hurt" id="hurt"></div>
        <div class="banner" id="banner"></div>
        <div id="worldmap" class="hidden">
          <div class="wm-panel">
            <div class="wm-head"><h3>Dünya Haritası</h3><button class="x" type="button" data-wm-close aria-label="Kapat">✕</button></div>
            <canvas id="wmap" width="680" height="680"></canvas>
            <div class="wm-legend">
              <span><i style="background:#ff4038"></i>Düşman</span>
              <span><i style="background:#ff9020"></i>Boss</span>
              <span><i style="background:#ffe060"></i>NPC</span>
              <span><i style="background:#ffd34a"></i>Görev</span>
              <span><i class="line" style="background:#f0c040"></i>İz</span>
              <span><i style="background:#c070ff"></i>Taş</span>
            </div>
          </div>
        </div>
      </div>
      <div id="windows"></div>
      <div id="tooltip"></div>
      <div id="death" class="hidden"><div><h2>Yenildin</h2><p>Ruhun köye geri çağrılıyor…</p><button class="primary" id="respawn">Köyde Diril</button></div></div>
      <div id="tutorial" class="tutorial hidden"></div>
      <div id="start" class="hidden"></div>
    `);
    this.hud = $('#hud');
    this.start = $('#start');
    this.death = $('#death');
    this.logEl = $('#log');
    for (const id of ['p-level', 'p-name', 'p-hp', 'p-hp-t', 'p-mp', 'p-mp-t', 'p-buffs', 'target', 't-info', 'enemy-info', 't-name', 't-hp', 't-hp-t', 'mm-clock', 'mm-pos', 'tracker', 'tr-title', 'tr-prog', 'tr-status', 'tr-btns', 'hint', 'p-exp', 'p-exp-t', 'fps', 'hurt', 'banner']) {
      this.el[id] = $(`#${id}`);
    }
    this.windows = new Windows(game, $('#windows'), $('#tooltip'));
    this.overlay = new Overlay(game, $('#overlay'));

    const ev = game.events;
    ev.on('log', (d: { msg: string; cls?: string }) => this.log(d.msg, d.cls));
    ev.on('playerHurt', () => { this.hurt = 1; });
    ev.on('playerDied', () => {
      this.log('Savaşta yenik düştün.', 'warn');
      setTimeout(() => this.death.classList.remove('hidden'), 1200);
    });
    ev.on('playerRespawned', () => this.death.classList.add('hidden'));
    ev.on('levelUp', (lvl: number) => this.banner(`SEVİYE ${lvl}`));
    ev.on('changed', () => { this.slow = 0; });
    ev.on('autoHuntChanged', () => syncAutoHuntButton(this));

    $('#respawn').addEventListener('click', () => {
      this.death.classList.add('hidden');
      game.player.respawn();
    });
    $('#tutorial').addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tutorial]')?.dataset.tutorial;
      if (!action) return;
      if (action === 'skip') {
        finishTutorial(this);
      } else if (action === 'next') {
        this.tutorialStep++;
        if (this.tutorialStep >= this.tutorialSteps.length) finishTutorial(this);
        else renderTutorial(this);
      }
    });
    $('.menu-btns', this.hud).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (b?.dataset.win) this.windows.toggle(b.dataset.win as any);
    });
    // Görev takipçisindeki Rota/İz/Oto düğmeleri
    $('#tracker').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-quest-route]');
      const m = b?.dataset.questRoute;
      if (game.started && (m === 'walk' || m === 'trail' || m === 'auto')) game.questNav.toggle(m);
    });
    // Hedef düşmanın bilgi düğmesi ve paneli
    this.el['t-info'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.enemyInfoOpen = !this.enemyInfoOpen;
      this.enemyInfoKey = '';
    });
    this.el['enemy-info'].addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-ei-close]')) this.enemyInfoOpen = false;
    });
    bindBar(this, $('#hotbar'));
    bindBar(this, $('#hotbar2'));
    bindTouch(this);
    // Yüzen F çubuğunun kayıtlı konumu/döşeni (varsa) geri yüklenir.
    try {
      const raw = localStorage.getItem('gokdemir-bar2-v1');
      if (raw) {
        const s = JSON.parse(raw) as { x?: number; y?: number; vert?: boolean };
        const f = $('#hotbar2');
        if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
          f.style.left = `${clamp(s.x!, 0, innerWidth - 40)}px`;
          f.style.top = `${clamp(s.y!, 0, innerHeight - 40)}px`;
          f.style.bottom = 'auto';
          f.style.transform = 'none';
        }
        if (s.vert) f.classList.add('vert');
      }
    } catch { /* yoksay */ }
  }

  /** Kısayol çubuğu kabı için tık, sağ-tık temizleme ve sürükle-bırak bağlar. */

  showStart() {
    const save = SaveSystem.load();
    const cls = DEFAULT_CLASS;
    const hero = CLASSES[cls];
    const sp = save?.player;
    const saveCls = sp ? CLASSES[sp.cls] : null;
    const wpn = sp?.equip.weapon ? ITEMS[sp.equip.weapon.id] : undefined;
    const expPct = sp ? Math.min(100, Math.round((sp.exp / expForLevel(sp.level)) * 100)) : 0;
    this.start.innerHTML = `
      <div class="start-inner">
        <div class="title"><span>Kadim Taşların Gölgesinde</span><h1>GÖKDEMİR<br><em>EFSANESİ</em></h1><div class="title-rule" aria-hidden="true"><i></i></div></div>
        <div class="start-cards">
          ${sp && saveCls ? `
          <section class="scard saved">
            <div class="scard-tag">Kayıtlı Karakter</div>
            <div class="scard-head">
              <div class="scard-portrait"><span>${sp.level}</span></div>
              <div class="scard-id"><b>${sp.name}</b><small>Sv. ${sp.level} · ${saveCls.name}</small></div>
            </div>
            <div class="scard-meta">
              <span class="scard-gold">${icon('coin')} ${Math.floor(sp.gold).toLocaleString('tr-TR')} akçe</span>
              <span>${wpn ? `${icon(wpn.icon)} ${wpn.name}` : 'Silahsız'}</span>
            </div>
            <div class="scard-exp"><i style="width:${expPct}%"></i><span>Tecrübe %${expPct}</span></div>
            <button class="primary" id="btn-continue">Maceraya Devam Et</button>
          </section>` : ''}
          <section class="scard new">
            <div class="scard-tag">Yeni Macera</div>
            <label for="char-name">Kahramanının adı</label>
            <input id="char-name" maxlength="16" placeholder="Bir isim yaz" autocomplete="off" />
            <div class="hero-card"><i>${icon('sword')}</i><div><b>${hero.name}</b><small>${hero.desc}</small>
              <div class="hero-stats"><span>Can ${hero.baseHp}</span><span>Mana ${hero.baseMp}</span><span>Menzil ${hero.range} m</span></div>
            </div></div>
            <button class="primary" id="btn-new">${save ? 'Yeni Karakter Başlat' : 'Macereye Başla'}</button>
          </section>
        </div>
        <p class="start-note">WASD ile yürü, Boşluk ile saldır, 1–4 ve F1–F4 ile kısayol çubuğunu kullan. İlerlemen tarayıcına kaydedilir.</p>
      </div>`;
    const nameInput = $<HTMLInputElement>('#char-name', this.start);
    nameInput.value = save?.player.name ?? '';
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $<HTMLElement>('#btn-new', this.start).click();
    });
    // Kayıt varsa birincil eylem devam etmek; odak doğrudan oraya verilir.
    (save ? $('#btn-continue', this.start) : nameInput).focus();
    this.start.classList.remove('hidden');
    this.start.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'btn-new') {
        const name = (nameInput.value.trim() || 'Yolcu').slice(0, 16);
        if (save && !confirm('Kayıtlı karakterin silinip yeni bir oyun başlatılacak. Emin misin?')) return;
        this.start.classList.add('hidden');
        this.game.newGame(name, cls);
      } else if (t.id === 'btn-continue' && save) {
        this.start.classList.add('hidden');
        this.game.continueGame(save);
      }
    });
  }

  onGameStart() {
    const p = this.game.player;
    this.hud.classList.remove('hidden');
    this.minimap = new Minimap(this.game, $<HTMLCanvasElement>('#minimap'));
    this.worldmap = new WorldMap(this.game, $<HTMLCanvasElement>('#wmap'), this.minimap);
    setText(this.el['p-name'], `${p.name} · ${p.cls.name}`);
    // Kısayol çubukları: sabit merkez bar (1–4 + oto av) ve yüzen bar (F1–F4).
    const hbSlot = (i: number, key: string) =>
      `<div class="hb hb-slot" data-hb="${i}" draggable="false"><i class="hb-ic"></i><kbd>${key}</kbd><em class="hb-c"></em><div class="cd"></div><span class="cdt"></span></div>`;
    $('#hotbar').innerHTML = `
      ${[0, 1, 2, 3].map((i) => hbSlot(i, `${i + 1}`)).join('')}
      <div class="hb-sep"></div>
      <div class="auto-hunt-wrap">
        <button class="hb auto-hunt" data-auto-toggle aria-label="Oto avı aç veya kapat" aria-pressed="false" title="Oto avı aç/kapat (H)">
          ${icon('sword')}<kbd>H</kbd><span class="auto-word">OTO</span>
        </button>
        <button class="auto-hunt-config" data-auto-settings title="Oto av ayarları" aria-label="Oto av ayarları">⚙</button>
      </div>
      <div class="mount-wrap">
        <button class="hb mount-btn" data-mount-toggle aria-label="Ata bin veya in" aria-pressed="false" title="Ata bin / in (R)">
          ${icon('horse')}<kbd>R</kbd><span class="mount-word">BİN</span><i class="mount-stam"></i>
        </button>
      </div>`;
    const fbar = $('#hotbar2');
    fbar.innerHTML = `
      <div class="hb-grip" title="Sürükle: çubuğu taşı" aria-label="Çubuğu taşı">⋮</div>
      ${[0, 1, 2, 3].map((i) => hbSlot(4 + i, `F${i + 1}`)).join('')}
      <button class="hb-rot" type="button" title="Dikey / yatay çevir" aria-label="Çubuğu döndür">⟳</button>`;
    this.hbEls = [];
    this.hud.querySelectorAll<HTMLElement>('[data-hb]').forEach((root) => {
      this.hbEls[Number(root.dataset.hb)] = {
        root, ic: $('.hb-ic', root), cd: $('.cd', root), cdt: $('.cdt', root), cnt: $('.hb-c', root),
      };
    });

    // Yüzen çubuğu tutamaçtan taşı; konum ve yön localStorage'da saklanır.
    const grip = $('.hb-grip', fbar);
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = fbar.getBoundingClientRect();
      fbar.style.left = `${r.left}px`;
      fbar.style.top = `${r.top}px`;
      fbar.style.bottom = 'auto';
      fbar.style.transform = 'none';
      const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top;
      grip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        fbar.style.left = `${clamp(ox + ev.clientX - sx, 0, innerWidth - 40)}px`;
        fbar.style.top = `${clamp(oy + ev.clientY - sy, 0, innerHeight - 40)}px`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        this.saveBar2();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    $('.hb-rot', fbar).addEventListener('click', () => {
      fbar.classList.toggle('vert');
      this.saveBar2();
    });

    syncAutoHuntButton(this);
    showTutorial(this);
  }

  /** Yüzen F çubuğunun konumunu ve dikey/yatay durumunu kaydeder. */
  saveBar2() {
    try {
      const f = $('#hotbar2');
      const r = f.getBoundingClientRect();
      localStorage.setItem('gokdemir-bar2-v1', JSON.stringify({
        x: Math.round(r.left), y: Math.round(r.top), vert: f.classList.contains('vert'),
      }));
    } catch { /* yoksay */ }
  }


  openNpc(npc: Npc) {
    const win = npc.id === 'elder' ? 'quest'
      : npc.id === 'smith' ? 'smith'
      : npc.id === 'keeper' ? 'vault'
      : npc.id === 'guide' ? 'travel'
      : npc.id === 'innkeeper' ? 'inn'
      : npc.id === 'stablemaster' ? 'stable'
      : 'shop';
    this.windows.show(win, npc.id);
  }

  log(msg: string, cls = '') {
    const d = document.createElement('div');
    d.className = `line ${cls}`;
    d.textContent = msg;
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 9) this.logEl.firstChild!.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }

  banner(text: string) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  // ------------------------------------------------------------------ kare güncellemesi

  update(dt: number) {
    const g = this.game;
    if (!g.started) return;
    const p = g.player, inp = g.input;

    if (inp.hit('KeyI')) this.windows.toggle('inv');
    if (inp.hit('KeyC')) this.windows.toggle('char');
    if (inp.hit('KeyJ')) this.windows.toggle('quest');
    if (inp.hit('KeyP')) this.windows.toggle('pets');
    if (inp.hit('KeyH')) g.autoHunt.toggle(p);
    if (inp.hit('KeyM') || inp.hit('KeyB')) this.worldmap.toggle();
    if (inp.hit('KeyN')) g.audio.setMuted(!g.audio.muted);
    if (inp.hit('Escape')) {
      if (this.worldmap.isOpen) this.worldmap.close();
      else if (!this.windows.closeTop()) this.windows.toggle('settings');
    }

    setText(this.el['p-level'], String(p.level));
    setWidth(this.el['p-hp'], p.hp / p.maxHp);
    setText(this.el['p-hp-t'], `${Math.ceil(p.hp)} / ${p.maxHp}`);
    setWidth(this.el['p-mp'], p.mp / p.maxMp);
    setText(this.el['p-mp-t'], `${Math.floor(p.mp)} / ${p.maxMp}`);
    syncMountButton(this);
    setWidth(this.el['p-exp'], p.exp / p.expNeed);
    setText(this.el['p-exp-t'], `Tecrübe %${((p.exp / p.expNeed) * 100).toFixed(1)}`);

    const t = p.target;
    this.el.target.classList.toggle('hidden', !t);
    if (t) {
      setText(this.el['t-name'], `Sv.${t.def.level} ${t.def.name}`);
      setWidth(this.el['t-hp'], t.hp / t.maxHp);
      setText(this.el['t-hp-t'], `${Math.ceil(t.hp).toLocaleString('tr-TR')} / ${t.maxHp.toLocaleString('tr-TR')}`);
    }
    const infoShown = this.enemyInfoOpen && !!t;
    this.el['enemy-info'].classList.toggle('hidden', !infoShown);
    if (infoShown && t) {
      const key = `${t.def.id}|${p.level}|${p.atk}|${p.def}|${p.maxHp}`;
      if (key !== this.enemyInfoKey) {
        this.enemyInfoKey = key;
        this.el['enemy-info'].innerHTML = enemyInfoHtml(t.def, p);
      }
    }

    for (let i = 0; i < this.hbEls.length; i++) {
      syncHotbarSlot(this, i);
      const s = this.hbEls[i];
      const e = p.hotbar[i];
      const si = e?.t === 'skill' ? e.i : -1;
      const sk = si >= 0 ? p.skills[si] : null;
      s.root.classList.toggle('locked', !!sk && p.level < sk.level);
      s.root.classList.toggle('nomp', !!sk && p.mp < sk.mp);
      const cd = sk ? p.cooldowns[si] : 0;
      const h = sk ? `${((cd / sk.cd) * 100).toFixed(0)}%` : '0%';
      if ((s.cd as any)._h !== h) { (s.cd as any)._h = h; s.cd.style.height = h; }
      setText(s.cdt, sk ? (p.level < sk.level ? `Sv.${sk.level}` : cd > 0 ? cd.toFixed(cd < 3 ? 1 : 0) : '') : '');
    }

    // Vinyet fades by intensity only; its shape stays fixed so it never looks like a shrinking box.
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const hpRatio = p.hp / p.maxHp;
    const low = p.alive && hpRatio < 0.3
      ? 0.075 + (1 - hpRatio / 0.3) * (0.035 + Math.sin(g.time * 4) * 0.015)
      : 0;
    const hit = this.hurt * this.hurt * 0.52;
    this.el.hurt.style.opacity = String(Math.max(hit, low).toFixed(3));

    // Seyrek güncellenen öğeler
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.25;
      setText(this.el['mm-clock'], `${g.env.day > 0.5 ? '☀' : '☾'} ${g.env.clock}`);
      setText(this.el['mm-pos'], `${Math.round(p.pos.x)}, ${Math.round(p.pos.z)}`);
      setText(this.el.fps, `${Math.round(g.fps)} FPS`);

      const q = g.quests.current;
      const nav = g.questNav;
      setText(this.el['tr-title'], q ? q.title : 'Tüm görevler tamamlandı');
      const prog = !q ? ''
        : !g.quests.accepted ? 'Bilge Aksakal ile konuş'
        : g.quests.complete ? "Tamamlandı — Bilge Aksakal'a dön"
        : `${q.targetName}: ${g.quests.progressNow()} / ${q.count}`;
      setText(this.el['tr-prog'], prog);
      const isDone = !!(q && g.quests.complete);
      if ((this.el['tr-prog'] as any)._d !== isDone) { (this.el['tr-prog'] as any)._d = isDone; this.el['tr-prog'].classList.toggle('done', isDone); }
      setText(this.el['tr-status'], nav.active ? nav.status : '');
      const btns = this.el['tr-btns'];
      if (btns) {
        const hide = !q;
        if ((btns as any)._h !== hide) { (btns as any)._h = hide; btns.classList.toggle('hidden', hide); }
        for (const b of btns.querySelectorAll<HTMLButtonElement>('[data-quest-route]')) {
          const on = nav.mode === b.dataset.questRoute;
          if ((b as any)._on !== on) {
            (b as any)._on = on;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
          }
        }
      }

      const buffs = p.buffs.map((b) => `<span>${SKILLS[b.id].name} ${Math.ceil(b.t)}s</span>`).join('');
      const be = this.el['p-buffs'];
      if ((be as any)._h !== buffs) { (be as any)._h = buffs; be.innerHTML = buffs; }

      let hint = '';
      if (p.alive && !this.windows.anyOpen) {
        const npc = g.npcs.find((n) => n.pos.distanceTo(p.pos) < 4);
        if (npc) hint = `<kbd>E</kbd> ${npc.name} ile konuş`;
        else if (g.loot.drops.some((d) => d.item && d.group.position.distanceTo(p.pos) < 5)) hint = '<kbd>Z</kbd> Ganimeti topla';
      }
      const he = this.el.hint;
      if ((he as any)._h !== hint) { (he as any)._h = hint; he.innerHTML = hint; he.classList.toggle('show', !!hint); }
    }

    this.minimap.update(dt);
    this.worldmap.update(dt);
    this.overlay.update(dt);
    this.windows.update();
  }
}
