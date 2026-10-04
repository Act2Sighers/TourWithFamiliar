// C#: Familiar / FamiliarBrain(待機 ⇄ 迎撃。存在範囲の外では迷子速度で観測者へ戻る)
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";
import { createBody, distance, halt, isDown, setMaxHp, steerToward } from "./body";
import {
  createCombat,
  isBusy,
  resetCombat,
  startAttackDistance,
  stepCombat,
  tryStartAttack,
  weaponOf,
  type Fighter,
} from "./combat";
import { engageRangeOf } from "./ranges";
import { maxHpOf, moveSpeedOf, type Abilities } from "./stats";
import type { World } from "./world";

/** aide=側近 / companion=同行者 */
export type FamiliarRole = "aide" | "companion";
/** standby=待機 / intercept=迎撃 */
export type FamiliarState = "standby" | "intercept";
/** 待機中の細かい動作。return=待機範囲へ戻る途中 / idle=立ち止まる / walk=待機範囲内を歩く */
export type WanderMode = "return" | "idle" | "walk";

export interface Familiar extends Fighter {
  role: FamiliarRole;
  state: FamiliarState;
  /** 迎撃中の相手(敵)。待機中は null */
  targetId: number | null;
  /** 存在範囲の外にいる。ワールドが毎ステップ更新する */
  lost: boolean;
  wander: { mode: WanderMode; timer: number; tx: number; ty: number };
  rng: Rng;
}

/** 待機範囲を出たあと、この割合(待機範囲に対する半径)まで戻ったら通常の待機に戻る。出入り口でのばたつき防止。 */
const RETURN_RESUME = 0.6;
/** 気まぐれに歩く目的地は、待機範囲のこの割合の内側から選ぶ。 */
const WALK_REACH = 0.9;
/** 目的地に着いたとみなす距離。 */
const ARRIVE = 6;

export function familiarAbilities(p: Params): Abilities {
  return { toughness: p.familiar.toughness, attack: p.familiar.attack, agility: p.familiar.agility };
}

export function createFamiliar(id: number, role: FamiliarRole, x: number, y: number, seed: number, p: Params): Familiar {
  const abilities = familiarAbilities(p);
  return {
    ...createBody(id, x, y, p.familiar.radius, maxHpOf(abilities, p)),
    abilities,
    weaponId: "unarmed",
    combat: createCombat(),
    role,
    state: "standby",
    targetId: null,
    lost: false,
    wander: { mode: "idle", timer: 0, tx: x, ty: y },
    rng: new Rng(hash2(seed, 0xfa, id)),
  };
}

export function stepFamiliar(f: Familiar, world: World, dt: number): void {
  const p = world.params;
  const w = world.watcher;
  const weapon = weaponOf(f.weaponId, p);
  f.radius = p.familiar.radius;
  setMaxHp(f, maxHpOf(f.abilities, p));

  // HP0: 行動せず、攻撃対象にもならない(戦闘不能の詳細はM1c)
  if (isDown(f)) {
    f.state = "standby";
    f.targetId = null;
    resetCombat(f.combat);
    halt(f, p.familiar.friction, dt);
    return;
  }

  const busy = isBusy(f.combat);

  // 状態遷移
  if (f.lost) {
    f.state = "standby";
    f.targetId = null;
  } else if (f.state === "standby") {
    const e = world.nearestEngagedEnemy(f.x, f.y);
    if (e) {
      f.state = "intercept";
      f.targetId = e.id;
    }
  }
  if (f.state === "intercept") {
    const e = f.targetId === null ? undefined : world.enemyById(f.targetId);
    if (!e || isDown(e) || (e.state !== "engaged" && distance(e, w) > engageRangeOf(p))) {
      f.state = "standby";
      f.targetId = null;
    }
  }

  // 行動
  if (busy) {
    halt(f, p.familiar.friction, dt);
  } else if (f.state === "intercept") {
    const e = world.enemyById(f.targetId!)!;
    if (distance(f, e) <= startAttackDistance(weapon, e.radius)) {
      f.facing = Math.atan2(e.y - f.y, e.x - f.x);
      halt(f, p.familiar.friction, dt);
      tryStartAttack(f.combat, weapon, f.facing);
    } else {
      steerToward(f, e.x, e.y, moveSpeedOf(f.abilities, p), p.familiar.accel, p.familiar.friction, dt);
    }
  } else {
    stepStandby(f, world, dt);
  }
  stepCombat(f.combat, weapon, dt);
}

function stepStandby(f: Familiar, world: World, dt: number): void {
  const p = world.params;
  const watcher = world.watcher;
  const range = p.familiar.standbyRange;
  const w = f.wander;
  const dist = distance(f, watcher);
  const normalSpeed = moveSpeedOf(f.abilities, p);

  if (w.mode !== "return" && dist > range) w.mode = "return";

  let target: { x: number; y: number } | null = null;
  let speed = normalSpeed;

  if (w.mode === "return") {
    if (dist <= range * RETURN_RESUME) {
      startIdle(f, p);
    } else {
      target = watcher;
      // 存在範囲の外では強制的に迷子速度。観測者が止まっていても戻れるよう、本来の速度を下限にする(暫定)
      if (f.lost) speed = Math.max(p.familiar.lostSpeedRatio * Math.hypot(watcher.vx, watcher.vy), normalSpeed);
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
      target = { x: w.tx, y: w.ty };
      speed = normalSpeed * p.familiar.wanderSpeedRatio;
    }
  }

  if (target) steerToward(f, target.x, target.y, speed, p.familiar.accel, p.familiar.friction, dt);
  else halt(f, p.familiar.friction, dt);
}

function startIdle(f: Familiar, p: Params): void {
  f.wander.mode = "idle";
  f.wander.timer = f.rng.range(p.familiar.idleMin, Math.max(p.familiar.idleMin, p.familiar.idleMax));
}

function startWalk(f: Familiar, watcher: { x: number; y: number }, p: Params): void {
  const r = p.familiar.standbyRange * WALK_REACH * Math.sqrt(f.rng.next());
  const a = f.rng.range(0, Math.PI * 2);
  f.wander.mode = "walk";
  f.wander.tx = watcher.x + Math.cos(a) * r;
  f.wander.ty = watcher.y + Math.sin(a) * r;
}
