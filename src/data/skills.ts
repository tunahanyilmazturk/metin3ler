export type SkillType = 'aoe' | 'strike' | 'dash' | 'buff' | 'projectile' | 'targetAoe';

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  icon: string;
  desc: string;
  /** Açıldığı seviye */
  level: number;
  mp: number;
  cd: number;
  /** Saldırı gücü çarpanı */
  mult?: number;
  radius?: number;
  color: number;
  stun?: number;
  slow?: number;
  buff?: { dur: number; atk?: number; def?: number; speed?: number; crit?: number };
}

const defs: SkillDef[] = [
  { id: 'whirl', name: 'Kasırga Darbesi', type: 'aoe', icon: 'aoe', level: 1, mp: 12, cd: 5, mult: 1.9, radius: 4.2, color: 0xffb060,
    desc: 'Kendi etrafında dönerek çevredeki tüm düşmanlara hasar verir.' },
  { id: 'charge', name: 'Hücum', type: 'dash', icon: 'dash', level: 3, mp: 14, cd: 8, mult: 1.6, stun: 1.5, color: 0xffe0a0,
    desc: 'İleri atılır; yolundaki düşmanlara hasar verip sersemletir.' },
  { id: 'warcry', name: 'Savaş Narası', type: 'buff', icon: 'buff', level: 6, mp: 20, cd: 30, color: 0xff5a3a,
    buff: { dur: 15, atk: 0.3, def: 0.15 }, desc: '15 sn boyunca saldırı gücünü %30, savunmayı %15 artırır.' },
  { id: 'quake', name: 'Yer Sarsıntısı', type: 'aoe', icon: 'quake', level: 10, mp: 32, cd: 16, mult: 3.2, radius: 7, stun: 2, color: 0xffd070,
    desc: 'Yeri yararak geniş alanda ağır hasar verir ve sersemletir.' },

  { id: 'venom', name: 'Zehirli Kesik', type: 'strike', icon: 'strike', level: 1, mp: 10, cd: 4, mult: 2.8, radius: 3.4, color: 0x7dff6a,
    desc: 'Önündeki düşmana ölümcül bir çift darbe indirir.' },
  { id: 'shadowstep', name: 'Gölge Adımı', type: 'dash', icon: 'dash', level: 3, mp: 12, cd: 6, mult: 1.8, color: 0xa080ff,
    desc: 'Gölgelerin içinden ileri sıçrar; geçtiği düşmanları biçer.' },
  { id: 'agility', name: 'Çeviklik', type: 'buff', icon: 'buff', level: 6, mp: 18, cd: 28, color: 0x60e0ff,
    buff: { dur: 14, speed: 0.3, crit: 20 }, desc: '14 sn boyunca hareket hızını %30, kritik şansını %20 artırır.' },
  { id: 'bladestorm', name: 'Bıçak Fırtınası', type: 'aoe', icon: 'aoe', level: 10, mp: 30, cd: 14, mult: 3.0, radius: 5.5, color: 0xc0a0ff,
    desc: 'Çevresine bıçak yağdırarak tüm düşmanlara ağır hasar verir.' },

  { id: 'fireball', name: 'Ateş Topu', type: 'projectile', icon: 'fire', level: 1, mp: 14, cd: 3.5, mult: 2.4, radius: 3.2, color: 0xff7a20,
    desc: 'Çarptığı yerde patlayan bir alev küresi fırlatır.' },
  { id: 'frostnova', name: 'Buz Halkası', type: 'aoe', icon: 'frost', level: 3, mp: 18, cd: 9, mult: 1.7, radius: 6, slow: 4, color: 0x80d8ff,
    desc: 'Çevredeki düşmanları dondurarak yavaşlatır.' },
  { id: 'manashield', name: 'Mana Kalkanı', type: 'buff', icon: 'buff', level: 6, mp: 26, cd: 30, color: 0x70a0ff,
    buff: { dur: 16, def: 0.6 }, desc: '16 sn boyunca savunmayı %60 artırır.' },
  { id: 'thunder', name: 'Yıldırım Fırtınası', type: 'targetAoe', icon: 'bolt', level: 10, mp: 40, cd: 15, mult: 3.6, radius: 6, stun: 1, color: 0xb0c8ff,
    desc: 'Hedef bölgeye gökten yıldırımlar yağdırır.' },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
