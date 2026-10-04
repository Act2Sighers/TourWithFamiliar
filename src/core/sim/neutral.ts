// C#: Neutral / NeutralBrain(中立個体。徘徊 ⇄ 臨戦。雇用されるとファミリアになる)
import { Rng, hash2 } from "../rng";
import type { Params } from "../params";
import { chaseAndAttack, stepFreeWander, type FreeWander } from "./behavior";
import { createBody, distance, halt, isDown, setMaxHp } from "./body";
import { createCombat, isBusy, resetCombat, stepCombat, weaponOf, type Fighter } from "./combat";
import { engageRangeOf } from "./ranges";
import { maxHpOf, moveSpeedOf, type Abilities } from "./stats";
import type { World } from "./world";

/** wander=徘徊 / engaged=臨戦(自分に臨戦した敵と戦っている) */
export type NeutralState = "wander" | "engaged";

export interface Neutral extends Fighter {
  state: NeutralState;
  /** 臨戦中の相手(敵) */
  targetId: number | null;
  wander: FreeWander;
  rng: Rng;
}

export function neutralAbilities(p: Params): Abilities {
  return { toughness: p.neutral.toughness, attack: p.neutral.attack, agility: p.neutral.agility };
}

export function createNeutral(id: number, x: number, y: number, seed: number, p: Params): Neutral {
  const abilities = neutralAbilities(p);
  return {
    ...createBody(id, x, y, p.neutral.radius, maxHpOf(abilities, p), "NU"),
    abilities,
    weaponId: "unarmed",
    combat: createCombat(),
    state: "wander",
    targetId: null,
    wander: { mode: "idle", timer: 0, tx: x, ty: y },
    rng: new Rng(hash2(seed, 0xa7, id)),
  };
}

export function stepNeutral(n: Neutral, world: World, dt: number): void {
  const p = world.params;
  const weapon = weaponOf(n.weaponId, p);
  n.radius = p.neutral.radius;
  setMaxHp(n, maxHpOf(n.abilities, p));

  // HP0: 行動せず、攻撃対象にもならず、押し合いにも参加しない。雇用もできない
  if (isDown(n)) {
    n.state = "wander";
    n.targetId = null;
    resetCombat(n.combat);
    halt(n, p.neutral.friction, dt);
    return;
  }

  const busy = isBusy(n.combat);
  const speed = moveSpeedOf(n.abilities, p);

  // 状態遷移: 相手が戦闘不能になった、または自身を中心とした応戦範囲の外へ出たら見失う
  if (n.state === "engaged") {
    const e = n.targetId === null ? undefined : world.enemyById(n.targetId);
    if (!e || isDown(e) || distance(n, e) > engageRangeOf(p)) {
      n.state = "wander";
      n.targetId = null;
    }
  }
  // いずれかの敵が自身に対して臨戦になったら、臨戦になる(複数なら最も近い敵)
  if (n.state === "wander") {
    let best: { id: number; d: number } | null = null;
    for (const e of world.enemies) {
      if (e.state !== "engaged" || e.targetId !== n.id || isDown(e)) continue;
      const d = distance(n, e);
      if (!best || d < best.d) best = { id: e.id, d };
    }
    if (best) {
      n.state = "engaged";
      n.targetId = best.id;
    }
  }

  // 行動
  if (busy) {
    halt(n, p.neutral.friction, dt);
  } else if (n.state === "engaged") {
    chaseAndAttack(n, world.enemyById(n.targetId!)!, speed, p.neutral.accel, p.neutral.friction, p, dt);
  } else {
    stepFreeWander(
      n,
      n.wander,
      n.rng,
      {
        idleMin: p.neutral.idleMin,
        idleMax: p.neutral.idleMax,
        wanderDistMin: p.neutral.wanderDistMin,
        wanderDistMax: p.neutral.wanderDistMax,
        wanderSpeedRatio: p.neutral.wanderSpeedRatio,
        accel: p.neutral.accel,
        friction: p.neutral.friction,
      },
      speed,
      dt,
    );
  }
  stepCombat(n.combat, weapon, dt);
}
