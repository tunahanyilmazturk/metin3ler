import { clamp } from '../core/utils';
import { CLASSES, ClassId } from '../data/classes';
import { SKILLS } from '../data/skills';
import type { Npc } from '../entities/npc';
import { SaveSystem } from '../systems/save';
import type { Game } from '../game';
import { icon } from './icons';
import { Minimap } from './minimap';
import { Overlay } from './overlay';
import { Windows } from './windows';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** Metin değişmediyse DOM'a dokunmaz. */
function setText(el: HTMLElement, text: string) {
  if ((el as any)._t !== text) { (el as any)._t = text; el.textContent = text; }
}
function setWidth(el: HTMLElement, frac: number) {
  const w = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
  if ((el as any)._w !== w) { (el as any)._w = w; el.style.width = w; }
}

/** Arayüz kökü: başlangıç ekranı, HUD, kayıt günlüğü ve pencere yönetimi. */
export class UI {
  private root = $('#ui');
  private start!: HTMLElement;
  private hud!: HTMLElement;
  private death!: HTMLElement;
  private logEl!: HTMLElement;
  private windows!: Windows;
  private overlay!: Overlay;
  private minimap!: Minimap;
  private el: Record<string, HTMLElement> = {};
  private skillEls: { root: HTMLElement; cd: HTMLElement; cdText: HTMLElement }[] = [];
  private hurt = 0;
  private slow = 0;
  private tutorialStep = 0;
  private readonly tutorialSteps = [
    { title: 'Diyarı keşfet', text: 'WASD ile yürü, Shift ile hızlan. Zemine tıklayarak da gideceğin yeri seçebilirsin. Dokunmatik ekranda sol çubuğu kullan.' },
    { title: 'Hedef al ve savaş', text: 'Bir düşmana tıklayarak hedef seç; Tab ile yakındaki hedefler arasında geçiş yap. Boşluk ile saldır veya dokunmatik ekrandaki Saldır düğmesine bas.' },
    { title: 'Yeteneklerini kullan', text: '1–4 tuşları ya da kısayol çubuğu yeteneklerini kullanır. 5 ve 6 can ve mana iksiridir. Yetenekler mana harcar ve bekleme süresine sahiptir.' },
    { title: 'İlk görevini al', text: 'Köyde Bilge Aksakal’a yaklaş ve E’ye bas. Görevi kabul et; hedefin ekranın sol üstündeki takip alanında görünür. Oradaki Rota düğmesi seni hedefe yürütür, İz düğmesi yere iz işaretleri koyar. İlerlemen tarayıcına kaydedilir.' },
  ];

  constructor(private game: Game) {
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
        </div>
        <div class="mm-wrap">
          <div class="mm-ring"><canvas id="minimap" width="184" height="184"></canvas></div>
          <div class="mm-info"><span id="mm-clock"></span><span id="mm-pos"></span></div>
        </div>
        <div class="log" id="log"></div>
        <div class="bottom">
          <div class="hint" id="hint"></div>
          <div class="hotbar" id="hotbar"></div>
          <div class="expbar"><i id="p-exp"></i><span id="p-exp-t"></span></div>
        </div>
        <div class="touch-controls" aria-label="Dokunmatik kontroller">
          <div class="touch-stick" aria-label="Hareket" role="application"><span class="touch-knob"></span></div>
          <button class="touch-attack" type="button" aria-label="Saldır">${icon('sword')}<span>Saldır</span></button>
        </div>
        <div class="menu-btns">
          <button data-win="char" title="Karakter (C)">${icon('helmet')}<kbd>C</kbd></button>
          <button data-win="inv" title="Envanter (I)">${icon('armor')}<kbd>I</kbd></button>
          <button data-win="quest" title="Görev (J)">${icon('buff')}<kbd>J</kbd></button>
          <button data-win="settings" title="Ayarlar (Esc)">${icon('aoe')}<kbd>Esc</kbd></button>
        </div>
        <div class="fps" id="fps"></div>
        <div class="hurt" id="hurt"></div>
        <div class="banner" id="banner"></div>
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
    for (const id of ['p-level', 'p-name', 'p-hp', 'p-hp-t', 'p-mp', 'p-mp-t', 'p-buffs', 'target', 't-name', 't-hp', 't-hp-t', 'mm-clock', 'mm-pos', 'tracker', 'tr-title', 'tr-prog', 'tr-status', 'tr-btns', 'hint', 'p-exp', 'p-exp-t', 'fps', 'hurt', 'banner']) {
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
    ev.on('autoHuntChanged', () => this.syncAutoHuntButton());

    $('#respawn').addEventListener('click', () => {
      this.death.classList.add('hidden');
      game.player.respawn();
    });
    $('#tutorial').addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tutorial]')?.dataset.tutorial;
      if (!action) return;
      if (action === 'skip') {
        this.finishTutorial();
      } else if (action === 'next') {
        this.tutorialStep++;
        if (this.tutorialStep >= this.tutorialSteps.length) this.finishTutorial();
        else this.renderTutorial();
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
    $('#hotbar').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-auto-settings]')) {
        this.windows.toggle('autohunt');
        return;
      }
      if (target.closest('[data-auto-toggle]')) {
        game.autoHunt.toggle(game.player);
        return;
      }
      const s = target.closest('[data-skill],[data-pot]') as HTMLElement | null;
      if (!s || !game.started) return;
      if (s.dataset.skill) game.player.useSkill(Number(s.dataset.skill));
      else game.player.usePotion(s.dataset.pot as 'hp' | 'mp');
    });

    const stick = $('.touch-stick', this.hud);
    const knob = $('.touch-knob', stick);
    let stickPointer: number | null = null;
    const moveStick = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const limit = rect.width * 0.28;
      const dx = clamp(e.clientX - (rect.left + rect.width / 2), -limit, limit);
      const dy = clamp(e.clientY - (rect.top + rect.height / 2), -limit, limit);
      game.input.virtualMove.x = dx / limit;
      game.input.virtualMove.y = dy / limit;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const releaseStick = (e: PointerEvent) => {
      if (e.pointerId !== stickPointer) return;
      stickPointer = null;
      game.input.virtualMove.x = 0;
      game.input.virtualMove.y = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (e) => {
      if (stickPointer !== null) return;
      e.preventDefault();
      stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickPointer) moveStick(e);
    });
    stick.addEventListener('pointerup', releaseStick);
    stick.addEventListener('pointercancel', releaseStick);

    const attack = $('.touch-attack', this.hud);
    attack.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      game.input.virtualAttack = true;
      attack.setPointerCapture(e.pointerId);
    });
    const releaseAttack = () => { game.input.virtualAttack = false; };
    attack.addEventListener('pointerup', releaseAttack);
    attack.addEventListener('pointercancel', releaseAttack);
    attack.addEventListener('lostpointercapture', releaseAttack);
  }

  // ------------------------------------------------------------------ başlangıç

  showStart() {
    const save = SaveSystem.load();
    let cls: ClassId = 'warrior';
    this.start.innerHTML = `
      <div class="start-inner">
        <div class="title"><span>Kadim Taşların Gölgesinde</span><h1>GÖKDEMİR<br><em>EFSANESİ</em></h1></div>
        <div class="start-panel">
          <label for="char-name">Kahramanının adı</label>
          <input id="char-name" maxlength="16" placeholder="Bir isim yaz" autocomplete="off" />
          <div class="classes">${(Object.values(CLASSES)).map((c) => `
            <button class="class-card ${c.id === cls ? 'on' : ''}" data-cls="${c.id}">
              <i>${icon(c.weapon === 'staff' ? 'staff' : c.weapon === 'dagger' ? 'dagger' : 'sword')}</i>
              <b>${c.name}</b><small>${c.desc}</small></button>`).join('')}</div>
          <div class="start-btns">
            <button class="primary" id="btn-new">Yeni Maceraya Başla</button>
            ${save ? '<button id="btn-continue"></button>' : ''}
          </div>
          <p class="start-note">WASD ile yürü, Boşluk ile saldır, 1–4 ile yetenek kullan. İlerlemen tarayıcına kaydedilir.</p>
        </div>
      </div>`;
    $<HTMLInputElement>('#char-name', this.start).value = save?.player.name ?? '';
    if (save) {
      const clsName = CLASSES[save.player.cls].name;
      $('#btn-continue', this.start).textContent = `Devam Et — ${save.player.name} (Sv. ${save.player.level} ${clsName})`;
    }
    this.start.classList.remove('hidden');
    this.start.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const card = t.closest('.class-card') as HTMLElement | null;
      if (card) {
        cls = card.dataset.cls as ClassId;
        this.start.querySelectorAll('.class-card').forEach((c) => c.classList.toggle('on', c === card));
        return;
      }
      if (t.id === 'btn-new') {
        const name = ($<HTMLInputElement>('#char-name').value.trim() || 'Yolcu').slice(0, 16);
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
    setText(this.el['p-name'], `${p.name} · ${p.cls.name}`);
    // Kısayol çubuğu: 4 yetenek, 2 iksir ve oto av kontrolleri
    const hb = $('#hotbar');
    hb.innerHTML = p.skills.map((sk, i) => `
      <div class="hb" data-skill="${i}" title="${sk.name} — ${sk.desc} (${sk.mp} mana, ${sk.cd} sn)">
        ${icon(sk.icon)}<kbd>${i + 1}</kbd><div class="cd"></div><span class="cdt"></span></div>`).join('') + `
      <div class="hb-sep"></div>
      <div class="hb pot" data-pot="hp" title="Can iksiri">${icon('potion', '#ff5a4a')}<kbd>5</kbd><em id="pot-hp"></em></div>
      <div class="hb pot" data-pot="mp" title="Mana iksiri">${icon('potion', '#4a9cff')}<kbd>6</kbd><em id="pot-mp"></em></div>
      <div class="hb-sep"></div>
      <div class="auto-hunt-wrap">
        <button class="hb auto-hunt" data-auto-toggle aria-label="Oto avı aç veya kapat" aria-pressed="false" title="Oto avı aç/kapat (H)">
          ${icon('sword')}<kbd>H</kbd><span class="auto-word">OTO</span>
        </button>
        <button class="auto-hunt-config" data-auto-settings title="Oto av ayarları" aria-label="Oto av ayarları">⚙</button>
      </div>`;
    this.skillEls = [...hb.querySelectorAll<HTMLElement>('[data-skill]')].map((root) => ({
      root, cd: $('.cd', root), cdText: $('.cdt', root),
    }));
    this.el['pot-hp'] = $('#pot-hp');
    this.el['pot-mp'] = $('#pot-mp');
    this.syncAutoHuntButton();
    this.showTutorial();
  }

  private showTutorial() {
    try {
      if (localStorage.getItem('gokdemir-tutorial-v1') === 'done') return;
    } catch { /* Depolama kapalıysa bu oturumda rehberi göster. */ }
    this.tutorialStep = 0;
    this.renderTutorial();
  }

  private renderTutorial() {
    const panel = $('#tutorial');
    const step = this.tutorialSteps[this.tutorialStep];
    panel.innerHTML = `<div class="tutorial-count">BAŞLANGIÇ REHBERİ · ${this.tutorialStep + 1} / ${this.tutorialSteps.length}</div>
      <h3>${step.title}</h3><p>${step.text}</p><div class="tutorial-actions">
      <button data-tutorial="skip">Rehberi atla</button><button class="primary" data-tutorial="next">${this.tutorialStep + 1 === this.tutorialSteps.length ? 'Bitir' : 'Devam'}</button></div>`;
    panel.classList.remove('hidden');
  }

  private finishTutorial() {
    $('#tutorial').classList.add('hidden');
    try { localStorage.setItem('gokdemir-tutorial-v1', 'done'); } catch { /* Bu oturumda kapalı kalır. */ }
  }

  private syncAutoHuntButton() {
    const button = $('#hotbar [data-auto-toggle]') as HTMLButtonElement | null;
    if (!button) return;
    const auto = this.game.autoHunt;
    button.classList.toggle('active', auto.enabled);
    button.setAttribute('aria-pressed', String(auto.enabled));
    button.title = `Oto av: ${auto.enabled ? auto.status : 'kapalı'} (H)`;
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

  private banner(text: string) {
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
    if (inp.hit('KeyH')) g.autoHunt.toggle(p);
    if (inp.hit('Escape') && !this.windows.closeTop()) { if (g.questNav.active) g.questNav.stop(); else this.windows.toggle('settings'); }
    if (inp.hit('KeyM')) g.audio.setMuted(!g.audio.muted);

    setText(this.el['p-level'], String(p.level));
    setWidth(this.el['p-hp'], p.hp / p.maxHp);
    setText(this.el['p-hp-t'], `${Math.ceil(p.hp)} / ${p.maxHp}`);
    setWidth(this.el['p-mp'], p.mp / p.maxMp);
    setText(this.el['p-mp-t'], `${Math.floor(p.mp)} / ${p.maxMp}`);
    setWidth(this.el['p-exp'], p.exp / p.expNeed);
    setText(this.el['p-exp-t'], `Tecrübe %${((p.exp / p.expNeed) * 100).toFixed(1)}`);

    const t = p.target;
    this.el.target.classList.toggle('hidden', !t);
    if (t) {
      setText(this.el['t-name'], `Sv.${t.def.level} ${t.def.name}`);
      setWidth(this.el['t-hp'], t.hp / t.maxHp);
      setText(this.el['t-hp-t'], `${Math.ceil(t.hp).toLocaleString('tr-TR')} / ${t.maxHp.toLocaleString('tr-TR')}`);
    }

    p.skills.forEach((sk, i) => {
      const s = this.skillEls[i];
      const cd = p.cooldowns[i];
      s.root.classList.toggle('locked', p.level < sk.level);
      s.root.classList.toggle('nomp', p.mp < sk.mp);
      const h = `${((cd / sk.cd) * 100).toFixed(0)}%`;
      if ((s.cd as any)._h !== h) { (s.cd as any)._h = h; s.cd.style.height = h; }
      setText(s.cdText, p.level < sk.level ? `Sv.${sk.level}` : cd > 0 ? cd.toFixed(cd < 3 ? 1 : 0) : '');
    });

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
      setText(this.el['pot-hp'], String(p.potionCount('hp')));
      setText(this.el['pot-mp'], String(p.potionCount('mp')));
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
    this.overlay.update(dt);
    this.windows.update();
  }
}
