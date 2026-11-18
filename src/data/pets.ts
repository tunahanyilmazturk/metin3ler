/**
 * Evcil hayvanlar. İki tür vardır:
 * - Destek: pasif bonus verir, kendi çantası vardır, yakındaki ganimeti otomatik toplar.
 * - Saldırı: hedefe saldırır; çantası ve pasif bonusu yoktur.
 * Aynı anda iki pet kuşanılabilir (tür fark etmez).
 */
export type PetKind = 'support' | 'attack';

/** Destek petlerinin pasif bonusları (yüzdeler 0–1 aralığında). */
export interface PetBonus {
  atkPct?: number;
  defPct?: number;
  hp?: number;
  crit?: number;
  speedPct?: number;
  expPct?: number;
}

/** Pet görünümü: yerde yürüyen ya da uçan, renkleri ve ölçeği. */
export interface PetLook {
  form: 'ground' | 'flyer';
  body: number;
  accent: number;
  /** Kaplumbağa kabuğu rengi */
  shell?: number;
  /** Ejderha boynuzları */
  horns?: boolean;
  scale: number;
}

export interface PetDef {
  id: string;
  name: string;
  desc: string;
  kind: PetKind;
  level: number;
  cost: number;
  /** Yalnızca destek: pasif bonus */
  bonus?: PetBonus;
  /** Yalnızca destek: çanta göz sayısı */
  bag?: number;
  /** Yalnızca destek: ganimet toplama yarıçapı (oyuncuya göre, metre) */
  pickupRadius?: number;
  /** Yalnızca saldırı: oyuncu saldırı gücünün çarpanı, bekleme ve menzil */
  attack?: { mult: number; cd: number; range: number };
  look: PetLook;
}

export const PET_SLOTS = 2;

export const PETS: Record<string, PetDef> = {
  tilki: {
    id: 'tilki', name: 'Tilki Yavrusu', kind: 'support', level: 1, cost: 3000,
    desc: 'Kurnaz ve hızlı; parlayan her şeyi kapar.',
    bonus: { crit: 3 }, bag: 12, pickupRadius: 10,
    look: { form: 'ground', body: 0xd06a28, accent: 0xf2e6d6, scale: 1 },
  },
  baykus: {
    id: 'baykus', name: 'Bilge Baykuş', kind: 'support', level: 10, cost: 9000,
    desc: 'Gece gündüz izler; savaşlardan ders çıkarmana yardım eder.',
    bonus: { expPct: 0.1 }, bag: 18, pickupRadius: 12,
    look: { form: 'flyer', body: 0x8a6a48, accent: 0xe8c46c, scale: 1 },
  },
  kaplumbaga: {
    id: 'kaplumbaga', name: 'Kaya Kaplumbağası', kind: 'support', level: 18, cost: 16000,
    desc: 'Yavaş ama sağlam; sırtında taşıdığı yük de, verdiği güven de büyük.',
    bonus: { defPct: 0.1, hp: 150 }, bag: 24, pickupRadius: 10,
    look: { form: 'ground', body: 0x6a7a4a, accent: 0xd8c890, shell: 0x5a4a32, scale: 1.1 },
  },
  kurt: {
    id: 'kurt', name: 'Kurt Yavrusu', kind: 'attack', level: 5, cost: 5000,
    desc: 'Sadık ve cesur; hedefine dişlerini geçirir.',
    attack: { mult: 0.25, cd: 1.4, range: 2.2 },
    look: { form: 'ground', body: 0x8a8a8c, accent: 0xdedede, scale: 1.05 },
  },
  kartal: {
    id: 'kartal', name: 'Bozkır Kartalı', kind: 'attack', level: 15, cost: 14000,
    desc: 'Gökten pike yapar, pençeleriyle parçalar.',
    attack: { mult: 0.35, cd: 1.1, range: 3 },
    look: { form: 'flyer', body: 0x5a3a20, accent: 0xf0e0c0, scale: 1.15 },
  },
  ejder: {
    id: 'ejder', name: 'Ateş Ejderi Yavrusu', kind: 'attack', level: 28, cost: 45000,
    desc: 'Kadim ejderlerin soyundan; küçük ama alevi büyük.',
    attack: { mult: 0.5, cd: 1.2, range: 3.5 },
    look: { form: 'flyer', body: 0xb8321e, accent: 0xffb040, horns: true, scale: 1.25 },
  },
};

/** Gösterim sırası: önce destek, sonra saldırı; seviyeye göre. */
export const PET_ORDER = ['tilki', 'baykus', 'kaplumbaga', 'kurt', 'kartal', 'ejder'];

/** Bir petin etkisinin kısa açıklaması (arayüz için). */
export function petEffectText(d: PetDef): string {
  if (d.kind === 'attack' && d.attack) {
    return `Saldırı gücünün %${Math.round(d.attack.mult * 100)}'i kadar vurur · ${d.attack.cd} sn`;
  }
  const b = d.bonus ?? {};
  const parts = [
    b.crit ? `+%${b.crit} kritik` : '',
    b.atkPct ? `+%${Math.round(b.atkPct * 100)} saldırı` : '',
    b.defPct ? `+%${Math.round(b.defPct * 100)} savunma` : '',
    b.hp ? `+${b.hp} can` : '',
    b.speedPct ? `+%${Math.round(b.speedPct * 100)} hız` : '',
    b.expPct ? `+%${Math.round(b.expPct * 100)} tecrübe` : '',
  ].filter(Boolean);
  return `${parts.join(' · ')} · ${d.bag} gözlü çanta`;
}
