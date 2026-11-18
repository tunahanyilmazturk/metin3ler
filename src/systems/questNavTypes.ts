import type { Enemy } from '../entities/enemy';
import { WORLD_HALF } from '../data/world';

export const LIM = WORLD_HALF - 22;
export const MARK_COUNT = 30;
export const MARK_SPACING = 2.75;

export interface Objective {
  x: number;
  z: number;
  stop: number;
  label: string;
  key: string;
  /** Canlı düşman hedefinin örneği (takılma-atlama ve boss beklemesi için). */
  enemy?: Enemy;
  /** Canlı hedeflerde geçerlilik (düşman öldü, ganimet toplandı vb.) */
  valid?: () => boolean;
}
