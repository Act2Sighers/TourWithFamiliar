// C#: Body(位置・速度・HPを持つ全キャラクター共通の基底。観測者/ファミリア/敵が使う)

export interface Body {
  /** ワールド内で一意。観測者は0 */
  id: number;
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

export function createBody(id: number, x: number, y: number, radius: number, maxHp: number): Body {
  return { id, x, y, vx: 0, vy: 0, prevX: x, prevY: y, facing: Math.PI / 2, radius, hp: maxHp, maxHp };
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

/** 目標地点へ向かって speed で進む(向きも変える)。すでに目標上なら止まる。 */
export function steerToward(
  b: Body,
  tx: number,
  ty: number,
  speed: number,
  accel: number,
  friction: number,
  dt: number,
): void {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    stepMotion(b, 0, 0, false, accel, friction, dt);
    return;
  }
  b.facing = Math.atan2(dy, dx);
  stepMotion(b, (dx / len) * speed, (dy / len) * speed, true, accel, friction, dt);
}

/** その場で減速して止まる。 */
export function halt(b: Body, friction: number, dt: number): void {
  stepMotion(b, 0, 0, false, 0, friction, dt);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

export function isDown(b: Body): boolean {
  return b.hp <= 0;
}
