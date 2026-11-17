import './ui/styles.css';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

ui.insertAdjacentHTML('beforeend', `
  <div id="loading">
    <div>
      <h1>GÖKDEMİR EFSANESİ</h1>
      <div class="track"><i></i></div>
      <p>Dünya hazırlanıyor…</p>
    </div>
  </div>`);
const loading = document.getElementById('loading')!;
const fill = loading.querySelector('i') as HTMLElement;
const label = loading.querySelector('p') as HTMLElement;

async function boot() {
  try {
    const game = new Game(canvas);
    await game.build((p, text) => {
      fill.style.width = `${Math.round(p * 100)}%`;
      label.textContent = text;
    });
    loading.remove();
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
