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

  // Han yemekleri — sınıf yeteneği değildir, yalnızca güçlendirme adı/etkisi için kayıtlı.
  { id: 'innstew', name: 'Köy Güveci', type: 'buff', icon: 'buff', level: 1, mp: 0, cd: 0, color: 0xd09850,
    buff: { dur: 300, atk: 0.1, def: 0.15 }, desc: '5 dk boyunca saldırı +%10, savunma +%15.' },
  { id: 'innroast', name: 'Odun Ateşi Kebabı', type: 'buff', icon: 'buff', level: 1, mp: 0, cd: 0, color: 0xe07840,
    buff: { dur: 240, atk: 0.2 }, desc: '4 dk boyunca saldırı +%20.' },
  { id: 'inntea', name: 'Dağ Otu Şerbeti', type: 'buff', icon: 'buff', level: 1, mp: 0, cd: 0, color: 0x70c8a0,
    buff: { dur: 240, speed: 0.15, crit: 8 }, desc: '4 dk boyunca hız +%15, kritik +%8.' },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
