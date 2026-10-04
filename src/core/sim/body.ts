// C#: Body(位置・速度・HPを持つ全キャラクター共通の基底。観測者/ファミリア/敵が使う)

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 直前ステップの位置(描画補間用) */
  prevX: number;
  prevY: number;
  /** 向き(ラジアン)。旋回は即時なので、向きたい方向をそのまま代入してよい */
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
}

export function createBody(x: number, y: number, radius: number, maxHp: number): Body {
  return { x, y, vx: 0, vy: 0, prevX: x, prevY: y, facing: Math.PI / 2, radius, hp: maxHp, maxHp };
}

/**
 * 慣性つきの移動。目標速度へ向けて、入力中は accel、無入力中は friction の大きさで速度を変化させる。
 * 位置の更新までここで行う。
 */
export function stepMotion(
  b: Body,
  targetVx: number,
  targetVy: number,
  hasInput: boolean,
  accel: number,
  friction: number,
  dt: number,
): void {
  b.prevX = b.x;
  b.prevY = b.y;
  const rate = (hasInput ? accel : friction) * dt;
  const dvx = targetVx - b.vx;
  const dvy = targetVy - b.vy;
  const dvLen = Math.hypot(dvx, dvy);
  if (dvLen <= rate) {
    b.vx = targetVx;
    b.vy = targetVy;
  } else {
    b.vx += (dvx / dvLen) * rate;
    b.vy += (dvy / dvLen) * rate;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

/**
 * 最大HPを更新する。全快だったなら全快のまま追従し、そうでなければ現在HPを上限に収める。
 * (調整パネルで最大HPを変えても「全快ならゲージ非表示」の規則が崩れないようにするため)
 */
export function setMaxHp(b: Body, maxHp: number): void {
  const wasFull = b.hp >= b.maxHp;
  b.maxHp = maxHp;
  b.hp = wasFull ? maxHp : Math.min(b.hp, maxHp);
}

/** HPゲージを表示するか。全快のときと、HPが0のときは表示しない。 */
export function shouldShowHpBar(hp: number, maxHp: number): boolean {
  return hp > 0 && hp < maxHp;
}

export function damage(b: Body, amount: number): void {
  b.hp = Math.max(0, b.hp - amount);
}
