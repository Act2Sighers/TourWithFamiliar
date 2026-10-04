// C#: Ranges(待機範囲を基準にした各種範囲。倍率はパラメータ)
import type { Params } from "../params";

/** 待機範囲: 観測者を中心に、ファミリアが待機中に留まる範囲の半径。 */
export function standbyRangeOf(p: Params): number {
  return p.familiar.standbyRange;
}

/** 存在範囲: 観測者を中心とした範囲。この外のファミリアは、敵に狙われず、迎撃もせず、迷子速度で戻ってくる。 */
export function existenceRangeOf(p: Params): number {
  return p.familiar.standbyRange * p.ranges.existenceMultiplier;
}

/** 応戦範囲: 攻撃対象を見失う/迎撃を解除する距離。 */
export function engageRangeOf(p: Params): number {
  return p.familiar.standbyRange * p.ranges.engageMultiplier;
}

/** 索敵範囲: 敵が自身を中心に攻撃対象を探す範囲。 */
export function detectRangeOf(p: Params): number {
  return p.familiar.standbyRange * p.ranges.detectMultiplier;
}

/** 反応範囲: 敵が、自身を中心に中立個体へ反応する範囲(待機範囲と同じ大きさ)。 */
export function reactionRangeOf(p: Params): number {
  return p.familiar.standbyRange * p.ranges.reactionMultiplier;
}
