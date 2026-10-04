// C#: WeaponDef / CombatState(近接の範囲攻撃。前隙 → 持続 → 後隙)
import type { Params } from "../params";
import type { Body } from "./body";
import type { Abilities } from "./stats";

export type WeaponId = "unarmed";

/** 武器ごとに固定の値。攻撃間隔は将来、実効数値になる。 */
export interface WeaponDef {
  baseDamage: number;
  /** 前隙(秒) */
  windup: number;
  /** 持続(秒)。この間だけヒット判定が出る */
  active: number;
  /** 後隙(秒) */
  recovery: number;
  /** 攻撃を始めてから、次の攻撃を始められるまでの時間(秒) */
  interval: number;
  /** ヒット判定の中心までの前方距離 */
  offset: number;
  /** ヒット判定(円)の半径 */
  hitRadius: number;
}

export function weaponOf(id: WeaponId, p: Params): WeaponDef {
  switch (id) {
    case "unarmed":
      return p.unarmed;
  }
}

export type AttackPhase = "ready" | "windup" | "active" | "recovery";

export interface CombatState {
  phase: AttackPhase;
  /** 現在のフェーズの残り時間 */
  timer: number;
  /** 次の攻撃を始められるまでの残り時間 */
  cooldown: number;
  /** 攻撃開始時に固定した向き */
  dirX: number;
  dirY: number;
  /** この攻撃で既にダメージを与えた相手(1回の攻撃につき1体1回) */
  hit: Set<number>;
}

/** 戦う個体(ファミリア・敵)に共通の要素。 */
export interface Fighter extends Body {
  abilities: Abilities;
  weaponId: WeaponId;
  combat: CombatState;
}

export function createCombat(): CombatState {
  return { phase: "ready", timer: 0, cooldown: 0, dirX: 1, dirY: 0, hit: new Set() };
}

export function resetCombat(c: CombatState): void {
  c.phase = "ready";
  c.timer = 0;
  c.cooldown = 0;
  c.hit.clear();
}

/** 攻撃中(前隙・持続・後隙)は動けない。 */
export function isBusy(c: CombatState): boolean {
  return c.phase !== "ready";
}

export function tryStartAttack(c: CombatState, w: WeaponDef, facing: number): boolean {
  if (c.phase !== "ready" || c.cooldown > 0) return false;
  c.phase = "windup";
  c.timer = w.windup;
  c.cooldown = w.interval;
  c.dirX = Math.cos(facing);
  c.dirY = Math.sin(facing);
  c.hit.clear();
  return true;
}

const NEXT: Record<Exclude<AttackPhase, "ready">, AttackPhase> = {
  windup: "active",
  active: "recovery",
  recovery: "ready",
};

function durationOf(phase: AttackPhase, w: WeaponDef): number {
  return phase === "windup" ? w.windup : phase === "active" ? w.active : phase === "recovery" ? w.recovery : 0;
}

/** 固定刻みdtでフェーズと攻撃間隔を進める。 */
export function stepCombat(c: CombatState, w: WeaponDef, dt: number): void {
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (c.phase === "ready") return;
  c.timer -= dt;
  while (c.phase !== "ready" && c.timer <= 0) {
    c.phase = NEXT[c.phase];
    c.timer += durationOf(c.phase, w);
    if (c.phase === "ready") c.timer = 0;
  }
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** 攻撃範囲(前隙・持続・後隙の間はずっと存在する想定の位置)。表示用にも使う。 */
export function attackArea(b: Body, c: CombatState, w: WeaponDef): Circle {
  return { x: b.x + c.dirX * w.offset, y: b.y + c.dirY * w.offset, r: w.hitRadius };
}

/** ヒット判定。持続の間だけ存在する。 */
export function hitCircle(b: Body, c: CombatState, w: WeaponDef): Circle | null {
  return c.phase === "active" ? attackArea(b, c, w) : null;
}

/** 相手が範囲内に入りそうな距離まで近づいたら攻撃を始める。 */
export function startAttackDistance(w: WeaponDef, targetRadius: number): number {
  return w.offset + (w.hitRadius + targetRadius) * 0.6;
}
