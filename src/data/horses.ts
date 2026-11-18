/** At görünümü: post, yele, toynak renkleri, eyer örtüsü ve isteğe bağlı zırh. */
export interface HorseLook {
  coat: number;
  dark: number;
  mane: number;
  hoof: number;
  /** Alında beyaz sakar */
  blaze?: boolean;
  /** Bacaklarda beyaz çorap */
  socks?: boolean;
  /** Eyer örtüsü ve kenar süsü */
  cloth: number;
  trim: number;
  /** Savaş zırhı (göğüslük, boyunluk, alınlık) rengi */
  barding?: number;
  scale: number;
}

export interface HorseDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Satın almak için gereken oyuncu seviyesi */
  level: number;
  /** Binekteyken hareket hızı çarpanı */
  speed: number;
  /** Dörtnala (Shift) ek hız çarpanı */
  gallop: number;
  /** En yüksek dayanıklılık */
  stamina: number;
  /** Saniyede dayanıklılık yenilenmesi */
  regen: number;
  look: HorseLook;
}

/** Seyis'in sattığı binekler; seviye ve fiyat arttıkça hız ve dayanıklılık büyür. */
export const HORSES: Record<string, HorseDef> = {
  tazi: {
    id: 'tazi', name: 'Tazı Tay', desc: 'Genç ve çevik; uzun koşulara henüz alışık değil.',
    cost: 2400, level: 1, speed: 1.3, gallop: 1.45, stamina: 80, regen: 14,
    look: { coat: 0x8a6a48, dark: 0x3a2a1a, mane: 0x2a1c10, hoof: 0x1e1610, blaze: true, cloth: 0x7a3a28, trim: 0xc9a35a, scale: 1.12 },
  },
  bozkir: {
    id: 'bozkir', name: 'Bozkır Atı', desc: 'Bozkırın dayanıklı kır atı; uzun süre dörtnala koşar.',
    cost: 6500, level: 10, speed: 1.4, gallop: 1.5, stamina: 130, regen: 16,
    look: { coat: 0xb8a684, dark: 0x6a5a40, mane: 0xe8e0d0, hoof: 0x2a2018, socks: true, cloth: 0x2f5a6a, trim: 0xd8c08a, scale: 1.2 },
  },
  savas: {
    id: 'savas', name: 'Savaş Atı', desc: 'Zırhlı, eğitimli aygır; savaşın ortasında bile ürkmez.',
    cost: 15000, level: 20, speed: 1.5, gallop: 1.55, stamina: 160, regen: 18,
    look: { coat: 0x4a3a2c, dark: 0x1e160e, mane: 0x120c08, hoof: 0x141010, cloth: 0x6a1e1a, trim: 0xd4a84a, barding: 0x8a8f96, scale: 1.28 },
  },
  simsek: {
    id: 'simsek', name: 'Şimşek', desc: 'Efsanevi kara aygır; rüzgâr gibi koşar, yorulmak bilmez.',
    cost: 40000, level: 30, speed: 1.65, gallop: 1.6, stamina: 200, regen: 22,
    look: { coat: 0x1c181e, dark: 0x0a080c, mane: 0x2a2440, hoof: 0x0a0a0a, blaze: true, cloth: 0x23304e, trim: 0xb8c8f0, barding: 0x3a4a68, scale: 1.34 },
  },
};

/** Ahırda gösterim sırası (ucuzdan pahalıya). */
export const HORSE_ORDER = ['tazi', 'bozkir', 'savas', 'simsek'];
