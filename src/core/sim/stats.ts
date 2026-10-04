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

/**
 * 観測者が到達し得る移動速度の最高速度。
 * 移動速度に当たるものは、その瞬間の速さではなく、この「到達し得る最高速度」を基準にする(将来はレリックなどの補正が入る)。
 */
export function watcherMaxSpeedOf(p: Params): number {
  return p.watcher.maxSpeed;
}

/** 迷子速度: 存在範囲の外にいるファミリアの移動速度。 */
export function lostSpeedOf(p: Params): number {
  return watcherMaxSpeedOf(p) * p.familiar.lostSpeedRatio;
}
