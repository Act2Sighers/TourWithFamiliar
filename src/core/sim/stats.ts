// C#: Abilities / StatFormulas(能力値 → 実効数値の変換。式はここに集約する)
import type { Params } from "../params";

/** 能力値。個体差を生む固定パラメータ(自然数)。M1aでは使うものだけ定義している。 */
export interface Abilities {
  /** 丈夫さ → 最大HP */
  toughness: number;
  /** 素早さ → 移動速度 */
  agility: number;
}

export function maxHpOf(a: Abilities, p: Params): number {
  return Math.max(1, Math.round(a.toughness * p.stats.hpPerToughness));
}

export function moveSpeedOf(a: Abilities, p: Params): number {
  return a.agility * p.stats.speedPerAgility;
}
