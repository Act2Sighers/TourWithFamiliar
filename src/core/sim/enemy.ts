// C#: Enemy / EnemyBrain(徘徊 ⇄ 臨戦)
import { Rng, hash2 } from "../rng";
import type { Params } from "../params";
import { createBody, distance, halt, isDown, setMaxHp, steerToward } from "./body";
import {
  createCombat,
  isBusy,
  startAttackDistance,
  stepCombat,
  tryStartAttack,
  weaponOf,
  type Fighter,
} from "./combat";
import { detectRangeOf, engageRangeOf } from "./ranges";
import { maxHpOf, moveSpeedOf, type Abilities } from "./stats";
import type { World } from "./world";

/** wander=徘徊 / engaged=臨戦 */
export type EnemyState = "wander" | "engaged";

export interface Enemy extends Fighter {
  state: EnemyState;
  /** 臨戦中の攻撃対象(観測者またはファミリア) */
  targetId: number | null;
  wander: { mode: "idle" | "walk"; timer: number; tx: number; ty: number };
  rng: Rng;
}

const ARRIVE = 6;

export function enemyAbilities(p: Params): Abilities {
  return { toughness: p.enemy.toughness, attack: p.enemy.attack, agility: p.enemy.agility };
}

export function createEnemy(id: number, x: number, y: number, seed: number, p: Params): Enemy {
  const abilities = enemyAbilities(p);
  return {
    ...createBody(id, x, y, p.enemy.radius, maxHpOf(abilities, p)),
    abilities,
    weaponId: "unarmed",
    combat: createCombat(),
    state: "wander",
    targetId: null,
    wander: { mode: "idle", timer: 0, tx: x, ty: y },
    rng: new Rng(hash2(seed, 0xe0, id)),
  };
}

export function stepEnemy(e: Enemy, world: World, dt: number): void {
  const p = world.params;
  const weapon = weaponOf(e.weaponId, p);
  e.radius = p.enemy.radius;
  setMaxHp(e, maxHpOf(e.abilities, p));
  const busy = isBusy(e.combat);
  const speed = moveSpeedOf(e.abilities, p);

  // 状態遷移
  if (e.state === "engaged") {
    const t = e.targetId === null ? undefined : world.enemyTargetById(e.targetId);
    if (!t || distance(e, t) > engageRangeOf(p)) {
      e.state = "wander";
      e.targetId = null;
    }
  }
  if (e.state === "wander") {
    let best: { id: number; d: number } | null = null;
    for (const t of world.enemyTargets()) {
      const d = distance(e, t);
      if (d <= detectRangeOf(p) && (!best || d < best.d)) best = { id: t.id, d };
    }
    if (best) {
      e.state = "engaged";
      e.targetId = best.id;
    }
  }

  // 行動
  if (busy) {
    halt(e, p.enemy.friction, dt);
  } else if (e.state === "engaged") {
    const t = world.enemyTargetById(e.targetId!)!;
    if (distance(e, t) <= startAttackDistance(weapon, t.radius)) {
      e.facing = Math.atan2(t.y - e.y, t.x - e.x);
      halt(e, p.enemy.friction, dt);
      tryStartAttack(e.combat, weapon, e.facing);
    } else {
      steerToward(e, t.x, t.y, speed, p.enemy.accel, p.enemy.friction, dt);
    }
  } else {
    wander(e, p, speed, dt);
  }
  stepCombat(e.combat, weapon, dt);
}

/** 徘徊: ファミリアの待機と同じく立ち止まる/歩くを繰り返す。範囲の制約は無い。 */
function wander(e: Enemy, p: Params, speed: number, dt: number): void {
  const w = e.wander;
  if (w.mode === "idle") {
    w.timer -= dt;
    if (w.timer <= 0) {
      const dist = e.rng.range(p.enemy.wanderDistMin, Math.max(p.enemy.wanderDistMin, p.enemy.wanderDistMax));
      const a = e.rng.range(0, Math.PI * 2);
      w.mode = "walk";
      w.tx = e.x + Math.cos(a) * dist;
      w.ty = e.y + Math.sin(a) * dist;
    }
  }
  if (w.mode === "walk") {
    if (Math.hypot(w.tx - e.x, w.ty - e.y) <= ARRIVE) {
      w.mode = "idle";
      w.timer = e.rng.range(p.enemy.idleMin, Math.max(p.enemy.idleMin, p.enemy.idleMax));
    } else {
      steerToward(e, w.tx, w.ty, speed * p.enemy.wanderSpeedRatio, p.enemy.accel, p.enemy.friction, dt);
      return;
    }
  }
  halt(e, p.enemy.friction, dt);
}

export function isAlive(e: Enemy): boolean {
  return !isDown(e);
}
