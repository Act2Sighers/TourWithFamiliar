// C#: BehaviorUtil(敵・ファミリア・中立個体で共有する振る舞いの部品)
import type { Rng } from "../rng";
import { distance, halt, steerToward, type Body } from "./body";
import { startAttackDistance, tryStartAttack, weaponOf, type Fighter } from "./combat";
import type { Params } from "../params";

/** 攻撃を始められる距離まで近づく。近づいたら止まって、相手のほうを向いて攻撃を始める。(攻撃中でないときに呼ぶ) */
export function chaseAndAttack(
  b: Fighter,
  target: Body,
  speed: number,
  accel: number,
  friction: number,
  p: Params,
  dt: number,
): void {
  const weapon = weaponOf(b.weaponId, p);
  if (distance(b, target) <= startAttackDistance(weapon, target.radius)) {
    b.facing = Math.atan2(target.y - b.y, target.x - b.x);
    halt(b, friction, dt);
    tryStartAttack(b.combat, weapon, b.facing);
  } else {
    steerToward(b, target.x, target.y, speed, accel, friction, dt);
  }
}

export interface FreeWander {
  mode: "idle" | "walk";
  timer: number;
  tx: number;
  ty: number;
}

export interface FreeWanderConfig {
  idleMin: number;
  idleMax: number;
  wanderDistMin: number;
  wanderDistMax: number;
  wanderSpeedRatio: number;
  accel: number;
  friction: number;
}

const ARRIVE = 6;

/** 範囲の制約が無い徘徊: 立ち止まる → 気まぐれな向きと距離へ歩く、を繰り返す。 */
export function stepFreeWander(
  b: Body,
  w: FreeWander,
  rng: Rng,
  cfg: FreeWanderConfig,
  speed: number,
  dt: number,
): void {
  if (w.mode === "idle") {
    w.timer -= dt;
    if (w.timer <= 0) {
      const dist = rng.range(cfg.wanderDistMin, Math.max(cfg.wanderDistMin, cfg.wanderDistMax));
      const a = rng.range(0, Math.PI * 2);
      w.mode = "walk";
      w.tx = b.x + Math.cos(a) * dist;
      w.ty = b.y + Math.sin(a) * dist;
    }
  }
  if (w.mode === "walk") {
    if (Math.hypot(w.tx - b.x, w.ty - b.y) <= ARRIVE) {
      w.mode = "idle";
      w.timer = rng.range(cfg.idleMin, Math.max(cfg.idleMin, cfg.idleMax));
    } else {
      steerToward(b, w.tx, w.ty, speed * cfg.wanderSpeedRatio, cfg.accel, cfg.friction, dt);
      return;
    }
  }
  halt(b, cfg.friction, dt);
}
