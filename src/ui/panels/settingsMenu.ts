import { DAY_NIGHT_MODES, DayNightMode } from '../../data/settings';
import { QUALITY, Quality } from '../../render/pipeline';
import type { SettingsTab, Windows } from '../windows';

/** ESC menüsü: sol tarafta kategoriler, sağ tarafta seçili kategorinin ayarları. */
const TABS: [SettingsTab, string][] = [
  ['graphics', 'Grafik'],
  ['sound', 'Ses'],
  ['game', 'Oyun'],
  ['controls', 'Kontroller'],
  ['system', 'Sistem'],
];

const QUALITY_LEVELS: [Quality, string, string][] = [
  ['low', 'Düşük', 'Akıcı çalışır; gölgeler ve parlama kapalı, görüntü biraz yumuşak.'],
  ['medium', 'Orta', 'Dengeli kalite; parlama ve kenar yumuşatma açık.'],
  ['high', 'Yüksek', 'Keskin gölgeler ve yoğun çimler. Çoğu bilgisayar için önerilir.'],
  ['ultra', 'Ultra', 'En yüksek çözünürlük ve gölge kalitesi. Güçlü ekran kartı gerektirir.'],
];

const DAY_LABELS: Record<DayNightMode, [string, string]> = {
  cycle: ['Döngü', 'Oyun saati akarak gündüz ve geceyi değiştirir.'],
  day: ['Gündüz sabit', 'Dünya sürekli 12:00 gündüzünde kalır.'],
  night: ['Gece sabit', 'Dünya sürekli 00:00 gecesinde kalır.'],
};

const CONTROLS: [string, string][] = [
  ['W A S D / ok tuşları', 'Hareket'],
  ['Shift', 'Koş'],
  ['Boşluk', 'Saldır'],
  ['1–4', 'Alt kısayol çubuğu'],
  ['F1–F4', 'Üst kısayol çubuğu'],
  ['Z', 'Ganimeti topla'],
  ['E', 'Konuş'],
  ['Tab', 'Hedef değiştir'],
  ['R', 'Ata bin / in'],
  ['Shift (binekte)', 'Dörtnala koş'],
  ['H', 'Oto avı aç / kapat'],
  ['I · C · J', 'Envanter, karakter, görevler'],
  ['P', 'Evcil hayvanlar'],
  ['M / B', 'Dünya haritası'],
  ['N', 'Sessiz'],
  ['+ / −', 'Mini haritada yakınlaştır'],
  ['Sol tık', 'Hedef seç / yürü'],
  ['Sürükle', 'Kamerayı döndür'],
  ['Tekerlek', 'Yakınlaştır'],
  ['Esc', 'Menüyü aç / kapat'],
];

function graphicsSection(w: Windows): string {
  const g = w.game;
  const current = g.pipeline.quality;
  const q = QUALITY[current];
  return `
    <h4>Grafik Kalitesi</h4>
    <div class="seg">${QUALITY_LEVELS.map(([k, label]) =>
      `<button data-quality="${k}" class="${current === k ? 'on' : ''}">${label}</button>`).join('')}</div>
    <p class="day-night-help">${QUALITY_LEVELS.find(([k]) => k === current)![2]}</p>
    <h4>Performans</h4>
    <div class="seg"><button data-show-fps="1" class="${g.showFps ? 'on' : ''}">FPS Göster</button><button data-show-fps="0" class="${g.showFps ? '' : 'on'}">Gizli</button></div>
    <h4>Bu Kalitedeki Değerler</h4>
    <table class="settings-table">
      <tr><td>Gölge haritası</td><td>${q.shadow} px</td></tr>
      <tr><td>Parlama (bloom)</td><td>${q.bloom ? 'Açık' : 'Kapalı'}</td></tr>
      <tr><td>Kenar yumuşatma (MSAA)</td><td>${q.msaa > 0 ? `${q.msaa}×` : 'Kapalı'}</td></tr>
      <tr><td>Çözünürlük ölçeği</td><td>${q.ratio}×</td></tr>
      <tr><td>Çim yoğunluğu</td><td>%${Math.round(q.grass * 100)}</td></tr>
    </table>`;
}

function soundSection(w: Windows): string {
  const g = w.game;
  const percent = Math.round(g.audio.volume * 100);
  return `
    <h4>Ses</h4>
    <div class="seg"><button data-mute="0" class="${g.audio.muted ? '' : 'on'}">Açık</button><button data-mute="1" class="${g.audio.muted ? 'on' : ''}">Kapalı</button></div>
    <h4>Ana Ses Seviyesi</h4>
    <div class="settings-range">
      <input type="range" min="0" max="100" step="5" value="${percent}" data-volume aria-label="Ana ses seviyesi" ${g.audio.muted ? 'disabled' : ''} />
      <b>%${percent}</b>
    </div>
    <p class="day-night-help">Kılıç, büyü ve ortam sesleri bu seviyeyi takip eder. Sessiz modda ses tamamen kapanır.</p>`;
}

function gameSection(w: Windows): string {
  const g = w.game;
  const [dayLabel, dayHelp] = DAY_LABELS[g.dayNightMode];
  return `
    <h4>Dünya Zamanı</h4>
    <div class="seg day-night-options">${DAY_NIGHT_MODES.map((mode) =>
      `<button data-day-night="${mode}" class="${g.dayNightMode === mode ? 'on' : ''}">${DAY_LABELS[mode][0]}</button>`).join('')}</div>
    <p class="day-night-help">${dayLabel}: ${dayHelp}</p>
    <h4>Görev İzi</h4>
    <div class="seg"><button data-autotrail="1" class="${g.autoTrail ? 'on' : ''}">Otomatik Açık</button><button data-autotrail="0" class="${g.autoTrail ? '' : 'on'}">Kapalı</button></div>
    <p class="day-night-help">Görev hedefine giden yolu yerde işaretler. Takip alanındaki İz düğmesiyle geçerli görev için kapatabilirsin.</p>
    <h4>Erişilebilirlik</h4>
    <div class="seg"><button data-reduce-shake="1" class="${g.reduceShake ? 'on' : ''}">Sarsıntı Azaltıldı</button><button data-reduce-shake="0" class="${g.reduceShake ? '' : 'on'}">Tam Sarsıntı</button></div>
    <p class="day-night-help">Vuruşlardaki ekran sarsıntısını yaklaşık %70 azaltır. Hareket hassasiyeti olanlar için önerilir.</p>
    <h4>Görüntü Erişilebilirliği</h4>
    <div class="seg"><button data-reduce-flash="1" class="${g.reduceFlash ? 'on' : ''}">Parlama Azaltıldı</button><button data-reduce-flash="0" class="${g.reduceFlash ? '' : 'on'}">Tam Parlama</button></div>
    <p class="day-night-help">Vuruş ışık patlamalarının şiddetini düşürür; yanıp sönmeye hassas oyuncular için.</p>
    <h4>Yazı Boyutu</h4>
    <div class="seg"><button data-large-text="1" class="${g.largeText ? 'on' : ''}">Büyük</button><button data-large-text="0" class="${g.largeText ? '' : 'on'}">Normal</button></div>
    <p class="day-night-help">Arayüz yazılarını ve panelleri yaklaşık %15 büyütür.</p>
    <h4>Kamera Hassasiyeti</h4>
    <div class="settings-range"><input type="range" min="50" max="200" step="10" value="${Math.round(g.sensitivity * 100)}" data-sensitivity aria-label="Kamera hassasiyeti" /><b>%${Math.round(g.sensitivity * 100)}</b></div>
    <p class="day-night-help">Fare ile kamera döndürme hızını ayarlar.</p>
    <h4>Oto Av</h4>
    <button data-open-win="autohunt">Oto av ayarlarını aç</button>
    <p class="day-night-help">Bölge, hedef önceliği, iksir eşikleri ve kullanılacak yetenekler oto av penceresinde.</p>`;
}

function controlsSection(): string {
  return `
    <h4>Tuş Atamaları</h4>
    <table class="settings-table">
      ${CONTROLS.map(([key, label]) => `<tr><td><kbd>${key}</kbd></td><td>${label}</td></tr>`).join('')}
    </table>`;
}

function systemSection(w: Windows): string {
  const g = w.game;
  return `
    <h4>Kayıt</h4>
    <p class="day-night-help">İlerlemen bu tarayıcıda saklanır. Oyun her 20 saniyede ve sekmeyi kapatırken de kaydedilir.</p>
    <div class="btns settings-actions"><button class="primary" data-save>Oyunu Kaydet</button></div>
    <h4>Varsayılanlar</h4>
    <p class="day-night-help">Grafik, ses, kamera, erişilebilirlik ve performans ayarlarını varsayılana döndürür. Karakterin etkilenmez.</p>
    <div class="btns settings-actions"><button data-reset-settings>Ayarları Sıfırla</button></div>
    <h4>Tehlikeli Alan</h4>
    <p class="day-night-help">Karakterin ve kayıtlı ilerlemen kalıcı olarak silinir.</p>
    <div class="btns settings-actions"><button class="danger" data-reset>Karakteri Sil</button></div>
    <p class="day-night-help">Sürüm: ${g.player ? 'oyun devam ediyor' : 'karakter seçilmedi'}</p>`;
}

export function renderSettings(w: Windows, body: HTMLElement) {
  const tab = w.settingsTab;
  const content = {
    graphics: () => graphicsSection(w),
    sound: () => soundSection(w),
    game: () => gameSection(w),
    controls: () => controlsSection(),
    system: () => systemSection(w),
  }[tab]();
  body.innerHTML = `
    <div class="settings-menu">
      <nav class="settings-nav" aria-label="Ayar kategorileri">
        ${TABS.map(([key, label]) =>
          `<button data-settings-tab="${key}" class="${tab === key ? 'on' : ''}" aria-current="${tab === key ? 'page' : 'false'}">${label}</button>`).join('')}
      </nav>
      <section class="settings-content">${content}</section>
    </div>`;
}
