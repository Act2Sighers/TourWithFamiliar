// C#: Abilities / StatFormulas(能力値 → 実効数値の変換。式はここに集約する)
import type { Params } from "../params";
import type { WeaponDef } from "./combat";

/** 能力値。個体差を生む固定パラメータ(自然数)。 */
export interface Abilities {
  /** 丈夫さ → 最大HP */
  toughness: number;
  /** 攻撃力 → ダメージ係数 */
  attack: number;
  /** 素早さ → 移動速度 */
  agility: number;
}

export function maxHpOf(a: Abilities, p: Params): number {
  return Math.max(1, Math.round(a.toughness * p.stats.hpPerToughness));
}

export function moveSpeedOf(a: Abilities, p: Params): number {
  return a.agility * p.stats.speedPerAgility;
}

/** 攻撃威力 = 武器のダメージ基礎値 × 攻撃力によるダメージ係数。 */
export function attackPowerOf(a: Abilities, w: WeaponDef, p: Params): number {
  return Math.max(1, Math.round(w.baseDamage * a.attack * p.stats.damageCoefPerAttack));
}
