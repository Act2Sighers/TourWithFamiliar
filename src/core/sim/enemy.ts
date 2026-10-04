// C#: Enemy / EnemyBrain(徘徊 ⇄ 臨戦)
import { Rng, hash2 } from "../rng";
import type { Params } from "../params";
import { chaseAndAttack, stepFreeWander, type FreeWander } from "./behavior";
import { createBody, distance, halt, isDown, setMaxHp } from "./body";
import { createCombat, isBusy, stepCombat, weaponOf, type Fighter } from "./combat";
import { detectRangeOf, engageRangeOf, reactionRangeOf } from "./ranges";
import { maxHpOf, moveSpeedOf, type Abilities } from "./stats";
import type { World } from "./world";

/** wander=徘徊 / engaged=臨戦 */
export type EnemyState = "wander" | "engaged";

export interface Enemy extends Fighter {
  state: EnemyState;
  /** 臨戦中の攻撃対象(観測者・ファミリア・中立個体のいずれか) */
  targetId: number | null;
  wander: FreeWander;
  rng: Rng;
}

export function enemyAbilities(p: Params): Abilities {
  return { toughness: p.enemy.toughness, attack: p.enemy.attack, agility: p.enemy.agility };
}

export function createEnemy(id: number, x: number, y: number, seed: number, p: Params): Enemy {
  const abilities = enemyAbilities(p);
  return {
    ...createBody(id, x, y, p.enemy.radius, maxHpOf(abilities, p), "EN"),
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
    // 観測者・ファミリアは索敵範囲(待機範囲の2倍)、中立個体は反応範囲(待機範囲と同じ)の内側で認識する。最も近い相手を狙う
    let best: { id: number; d: number } | null = null;
    for (const t of world.enemyTargets()) {
      const d = distance(e, t);
      const range = world.isNeutral(t) ? reactionRangeOf(p) : detectRangeOf(p);
      if (d <= range && (!best || d < best.d)) best = { id: t.id, d };
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
    chaseAndAttack(e, world.enemyTargetById(e.targetId!)!, speed, p.enemy.accel, p.enemy.friction, p, dt);
  } else {
    stepFreeWander(
      e,
      e.wander,
      e.rng,
      {
        idleMin: p.enemy.idleMin,
        idleMax: p.enemy.idleMax,
        wanderDistMin: p.enemy.wanderDistMin,
        wanderDistMax: p.enemy.wanderDistMax,
        wanderSpeedRatio: p.enemy.wanderSpeedRatio,
        accel: p.enemy.accel,
        friction: p.enemy.friction,
      },
      speed,
      dt,
    );
  }
  stepCombat(e.combat, weapon, dt);
}

export function isAlive(e: Enemy): boolean {
  return !isDown(e);
}
