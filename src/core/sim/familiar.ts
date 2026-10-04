// C#: Familiar / FamiliarBrain(待機AI。迎撃はM1bで追加する)
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";
import { createBody, stepMotion, type Body } from "./body";
import { maxHpOf, moveSpeedOf, type Abilities } from "./stats";

/** aide=側近 / companion=同行者 */
export type FamiliarRole = "aide" | "companion";
/** standby=待機。迎撃(intercept)はM1bで追加 */
export type FamiliarState = "standby";
/** 待機中の細かい動作。return=待機範囲へ戻る途中 / idle=立ち止まる / walk=待機範囲内を歩く */
export type WanderMode = "return" | "idle" | "walk";

export interface Familiar extends Body {
  id: number;
  role: FamiliarRole;
  abilities: Abilities;
  state: FamiliarState;
  wander: { mode: WanderMode; timer: number; tx: number; ty: number };
  rng: Rng;
}

/** 待機範囲を出たあと、この割合(待機範囲に対する半径)まで戻ったら通常の待機に戻る。出入り口でのばたつき防止。 */
const RETURN_RESUME = 0.6;
/** 気まぐれに歩く目的地は、待機範囲のこの割合の内側から選ぶ。 */
const WALK_REACH = 0.9;
/** 目的地に着いたとみなす距離。 */
const ARRIVE = 6;

export function createFamiliar(
  id: number,
  role: FamiliarRole,
  x: number,
  y: number,
  seed: number,
  abilities: Abilities,
  p: Params,
): Familiar {
  const b = createBody(x, y, p.familiar.radius, maxHpOf(abilities, p));
  return {
    ...b,
    id,
    role,
    abilities,
    state: "standby",
    wander: { mode: "idle", timer: 0, tx: x, ty: y },
    rng: new Rng(hash2(seed, 0xfa, id)),
  };
}

export function stepFamiliar(f: Familiar, watcher: Body, p: Params, dt: number): void {
  const range = p.familiar.standbyRange;
  const w = f.wander;
  const dist = Math.hypot(watcher.x - f.x, watcher.y - f.y);

  if (w.mode !== "return" && dist > range) w.mode = "return";

  let tx = f.x;
  let ty = f.y;
  let moving = false;
  let speedRatio = 1;

  if (w.mode === "return") {
    if (dist <= range * RETURN_RESUME) {
      startIdle(f, p);
    } else {
      tx = watcher.x;
      ty = watcher.y;
      moving = true;
    }
  }

  if (w.mode === "idle") {
    w.timer -= dt;
    if (w.timer <= 0) startWalk(f, watcher, p);
  }

  if (w.mode === "walk") {
    // 観測者が動いて目的地が待機範囲から外れたら選び直す
    if (Math.hypot(w.tx - watcher.x, w.ty - watcher.y) > range * WALK_REACH) startWalk(f, watcher, p);
    if (Math.hypot(w.tx - f.x, w.ty - f.y) <= ARRIVE) {
      startIdle(f, p);
    } else {
      tx = w.tx;
      ty = w.ty;
      moving = true;
      speedRatio = p.familiar.wanderSpeedRatio;
    }
  }

  let tvx = 0;
  let tvy = 0;
  if (moving) {
    const dx = tx - f.x;
    const dy = ty - f.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const speed = moveSpeedOf(f.abilities, p) * speedRatio;
      tvx = (dx / len) * speed;
      tvy = (dy / len) * speed;
      f.facing = Math.atan2(dy, dx);
    }
  }
  stepMotion(f, tvx, tvy, moving, p.familiar.accel, p.familiar.friction, dt);
}

function startIdle(f: Familiar, p: Params): void {
  f.wander.mode = "idle";
  f.wander.timer = f.rng.range(p.familiar.idleMin, Math.max(p.familiar.idleMin, p.familiar.idleMax));
}

function startWalk(f: Familiar, watcher: Body, p: Params): void {
  const r = p.familiar.standbyRange * WALK_REACH * Math.sqrt(f.rng.next());
  const a = f.rng.range(0, Math.PI * 2);
  f.wander.mode = "walk";
  f.wander.tx = watcher.x + Math.cos(a) * r;
  f.wander.ty = watcher.y + Math.sin(a) * r;
}
