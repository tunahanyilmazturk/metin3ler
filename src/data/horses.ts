import type { QuadLook } from '../entities/creatures';

export interface HorseDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Hareket hızı çarpanı */
  speed: number;
  look: QuadLook;
}

const BASE = { len: 1.32, rad: 0.33, leg: 0.85, head: 0.23, snout: 0.4, ears: 0.19, tail: 0.7 };

/** Seyis'in sattığı binekler; fiyat arttıkça hız çarpanı büyür. */
export const HORSES: Record<string, HorseDef> = {
  tazi: {
    id: 'tazi', name: 'Tazı Tay', desc: 'Çevik ve dayanıklı bir binek.', cost: 2400, speed: 1.35,
    look: { ...BASE, color: 0x8a6a48, dark: 0x3a2a1a, scale: 1.3, saddle: true, mane: true },
  },
  savas: {
    id: 'savas', name: 'Savaş Atı', desc: 'Eğitimli, zırhlı bir aygır.', cost: 9500, speed: 1.5,
    look: { ...BASE, color: 0x5a4a3c, dark: 0x241a10, rad: 0.35, leg: 0.88, scale: 1.42, saddle: true, mane: true, barding: 0x6a5a34 },
  },
  simsek: {
    id: 'simsek', name: 'Şimşek', desc: 'Efsanevi kara aygır; rüzgâr gibi koşar.', cost: 28000, speed: 1.65,
    look: { ...BASE, color: 0x241e28, dark: 0x0c0a10, rad: 0.36, leg: 0.9, tail: 0.78, scale: 1.5, saddle: true, mane: true, barding: 0x3a4a68 },
  },
};
