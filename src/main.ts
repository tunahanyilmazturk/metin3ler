import './ui/styles.css';
import { Game } from './game';
import pkg from '../package.json';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

const TIPS = [
  'WASD ile yürü, Shift ile hızlan. Zemine tıklayarak da gidebilirsin.',
  'Boşluk saldırır; Tab yakındaki düşmanlar arasında geçiş yapar.',
  '1–4 ve F1–F4 kısayol çubuğunu kullanır; eşyaları sürükleyip diz.',
  'H oto avı açar; can ve mana eşiklerini ayarlardan değiştirebilirsin.',
  'Köydeki Bilge Aksakal ilk görevini verir.',
  'İlerlemen tarayıcına otomatik kaydedilir.',
];

ui.insertAdjacentHTML('beforeend', `
  <div id="loading">
    <div class="ld-embers" aria-hidden="true"></div>
    <div class="ld-sigil" aria-hidden="true"><i class="ticks"></i><i class="arc"></i></div>
    <div class="ld-inner">
      <div class="ld-kicker">Kadim Taşların Gölgesinde</div>
      <h1>GÖKDEMİR<br><em>EFSANESİ</em></h1>
      <div class="track"><i></i></div>
      <div class="ld-meta"><p>Dünya hazırlanıyor…</p><span class="ld-pct">0%</span></div>
      <p class="ld-tip"></p>
    </div>
    <div class="ld-foot">v${pkg.version}</div>
  </div>`);
const loading = document.getElementById('loading')!;
const fill = loading.querySelector('.track i') as HTMLElement;
const label = loading.querySelector('.ld-meta p') as HTMLElement;
const pct = loading.querySelector('.ld-pct') as HTMLElement;
const tip = loading.querySelector('.ld-tip') as HTMLElement;

// Yüzen köz zerreleri
const embers = loading.querySelector('.ld-embers')!;
for (let i = 0; i < 16; i++) {
  const e = document.createElement('i');
  e.style.left = `${Math.random() * 100}%`;
  e.style.animationDuration = `${7 + Math.random() * 9}s`;
  e.style.animationDelay = `${-Math.random() * 15}s`;
  e.style.setProperty('--s', `${2.5 + Math.random() * 4}px`);
  embers.appendChild(e);
}

// Yükleme sürerken ipuçları sırayla döner
let tipIdx = Math.floor(Math.random() * TIPS.length);
tip.textContent = `İpucu — ${TIPS[tipIdx]}`;
const tipTimer = setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length;
  tip.textContent = `İpucu — ${TIPS[tipIdx]}`;
}, 3400);

async function boot() {
  try {
    const game = new Game(canvas);
    await game.build((p, text) => {
      const pc = Math.round(p * 100);
      fill.style.width = `${pc}%`;
      pct.textContent = `${pc}%`;
      label.textContent = text;
    });
    loading.remove();
    clearInterval(tipTimer);
    game.ui.showStart();
    // Hata ayıklama için konsoldan erişim
    (window as any).__game = game;
  } catch (err) {
    console.error(err);
    label.textContent = 'Oyun başlatılamadı. Tarayıcının WebGL 2 desteklediğinden emin ol.';
    label.style.color = '#ff8f7a';
  }
}

boot();
