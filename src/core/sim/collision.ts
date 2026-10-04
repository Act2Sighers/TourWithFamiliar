// C#: Collision(キャラクター同士の押し合い。位置の補正だけを行い、大きいほど動かされにくい)
import type { Params } from "../params";
import type { Body } from "./body";

/**
 * 例外の規則: a が b に押されて動かないなら true。
 * 動かない側は質量が無限大として扱い、相手がその分だけ余計に動く。両方が動かない組は、押し合わない。
 */
export type ImmovableRule = (a: Body, b: Body) => boolean;

/** 1ステップあたりの補正の繰り返し回数。3体以上が重なったときの収まりをよくする。 */
const ITERATIONS = 4;

/**
 * 重なっている2体を、重なりが解消するまで押し離す。
 * 動く量は質量(半径 ^ massExponent)に反比例する。観測者・ファミリア・敵などを区別しない。
 * 体数が増えたら、空間分割(グリッド)に差し替える。
 */
export function resolveCollisions(bodies: Body[], p: Params, immovable?: ImmovableRule): void {
  if (p.collision.enabled < 0.5) return;
  const k = p.collision.massExponent;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        const min = a.radius + b.radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        let nx: number;
        let ny: number;
        if (d < 1e-6) {
          // 完全に重なっている場合は、IDから決まる方向へ離す(乱数を使わず再現性を保つ)
          const ang = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
          nx = Math.cos(ang);
          ny = Math.sin(ang);
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const overlap = min - d;
        const aFixed = immovable?.(a, b) ?? false;
        const bFixed = immovable?.(b, a) ?? false;
        if (aFixed && bFixed) continue;
        // a が動く割合(= b の質量 / 合計)。動かない側は0、相手が全部動く
        let aShare: number;
        if (aFixed) aShare = 0;
        else if (bFixed) aShare = 1;
        else {
          const ma = Math.pow(a.radius, k);
          const mb = Math.pow(b.radius, k);
          aShare = mb / (ma + mb);
        }
        a.x -= nx * overlap * aShare;
        a.y -= ny * overlap * aShare;
        b.x += nx * overlap * (1 - aShare);
        b.y += ny * overlap * (1 - aShare);
        moved = true;
      }
    }
    if (!moved) break;
  }
}
