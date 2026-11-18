/**
 * Köy NPC'lerinin dünyada söylediği kısa replikler. Oyuncu yakına gelince balonda döner.
 * Her NPC'nin rolüne uygun, köy hayatını ve oyun ipuçlarını yansıtan birkaç satırı vardır.
 */
export const NPC_LINES: Record<string, string[]> = {
  elder: [
    'Gökdemir taşları yine uyanıyor; dikkatli ol, yolcu.',
    'Kehanet bir savaşçıyı arıyor. Belki de sensin.',
    'Görevlerimi tamamla; her adım seni güçlendirir.',
  ],
  merchant: [
    'Kırmızı iksirlerim taze! Bir bakar mısın?',
    'Bozkurt postu getirirsen akçeni öderim.',
    'Çantan doluysa sağ tıkla eşya satabilirsin.',
  ],
  weaponsmith: [
    'Çelik kokusu... hoş, değil mi?',
    'Çift el silah istersen mızrak bana kalmış.',
    'Kılıcın körelmişse bana getir, bileyeyim.',
  ],
  armorer: [
    'Zırh hayat kurtarır; ağırlığı değil güvenliği sev.',
    'Kalkanı unutma, tek elli silahla iyi gider.',
    'Yırtık zırhla savaşa çıkma, dikişlerine bak.',
  ],
  smith: [
    'Ateş sönmez, çekiç durmaz!',
    'Artı yükseltmek için Ruh Kristali lazım.',
    'Riske girmek istemiyorsan düşük kademeden başla.',
  ],
  jeweler: [
    'Parıltıya bak, değerli taşlar burada.',
    'Malzemelerini Ruh Kristaline çevirebilirim.',
    'Takılarda gizli bir güç var, dikkatli seç.',
  ],
  keeper: [
    'Eşyaların burada güvende.',
    'Kasa, oyun kapansa da seni bekler.',
    'Kasadaki eşyalar kayıtla birlikte saklanır.',
  ],
  innkeeper: [
    'Hoş geldin, yorgun yolcu!',
    'Bir çorba iç, dışarısı soğuk.',
    'Dinlenmeden savaşa çıkma; canın kıymetli.',
  ],
  guide: [
    'Nereye gitmek istersin?',
    'Yollar uzun ama ben kısaltırım.',
    'Dağa çıkmadan iksirlerini hazırla.',
  ],
  stablemaster: [
    'Atlar seni bekliyor!',
    'At sırtında yol iki kat hızlı geçer.',
    'Binmek için R tuşuna bas.',
  ],
};
