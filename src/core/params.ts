// C#: GameParams (ScriptableObject / JSON)
import defaults from "../data/params.json";

export interface Params {
  sim: { hz: number };
  world: { chunkSize: number; decorPerChunk: number; keepRadius: number };
  watcher: { radius: number; maxHp: number; maxSpeed: number; accel: number; friction: number };
  stats: { hpPerToughness: number; speedPerAgility: number; damageCoefPerAttack: number };
  /** 待機範囲に対する倍率。存在範囲 / 応戦範囲 / 索敵範囲 */
  ranges: { existenceMultiplier: number; engageMultiplier: number; detectMultiplier: number };
  familiar: {
    toughness: number;
    attack: number;
    agility: number;
    radius: number;
    accel: number;
    friction: number;
    standbyRange: number;
    wanderSpeedRatio: number;
    idleMin: number;
    idleMax: number;
    /** 存在範囲の外にいるときの移動速度 = 観測者が到達し得る最高速度 × この値(迷子速度) */
    lostSpeedRatio: number;
  };
  enemy: {
    toughness: number;
    attack: number;
    agility: number;
    radius: number;
    accel: number;
    friction: number;
    wanderSpeedRatio: number;
    idleMin: number;
    idleMax: number;
    wanderDistMin: number;
    wanderDistMax: number;
    initialCount: number;
    spawnMin: number;
    spawnMax: number;
  };
  /** 素手。武器ごとの固定値(攻撃間隔は将来、実効数値になる) */
  unarmed: {
    baseDamage: number;
    windup: number;
    active: number;
    recovery: number;
    interval: number;
    offset: number;
    hitRadius: number;
  };
  /** キャラクター同士の押し合い。質量 = 半径 ^ massExponent */
  collision: { enabled: number; massExponent: number };
  view: { zoom: number; showChunkBorders: number; decorOpacity: number; showStandbyRange: number; showAttackAreas: number };
  input: { deadzone: number };
}

/** チューニングパネルに出す項目。path は "group.key" 形式。 */
export interface ParamMeta {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const PARAM_META: ParamMeta[] = [
  { path: "watcher.maxSpeed", label: "観測者 最高速度", min: 50, max: 600, step: 5 },
  { path: "watcher.accel", label: "観測者 加速度", min: 100, max: 6000, step: 50 },
  { path: "watcher.friction", label: "観測者 減速度", min: 100, max: 6000, step: 50 },
  { path: "watcher.radius", label: "観測者 半径", min: 6, max: 40, step: 1 },
  { path: "watcher.maxHp", label: "観測者 最大HP", min: 10, max: 500, step: 5 },
  { path: "stats.hpPerToughness", label: "丈夫さ1あたりの最大HP", min: 1, max: 50, step: 1 },
  { path: "stats.speedPerAgility", label: "素早さ1あたりの移動速度", min: 1, max: 30, step: 0.5 },
  { path: "stats.damageCoefPerAttack", label: "攻撃力1あたりのダメージ係数", min: 0.01, max: 1, step: 0.01 },
  { path: "ranges.existenceMultiplier", label: "存在範囲(待機範囲の倍)", min: 3, max: 40, step: 1 },
  { path: "ranges.engageMultiplier", label: "応戦範囲(待機範囲の倍)", min: 1, max: 10, step: 0.5 },
  { path: "ranges.detectMultiplier", label: "索敵範囲(待機範囲の倍)", min: 0.5, max: 8, step: 0.5 },
  { path: "familiar.toughness", label: "ファミリア 丈夫さ", min: 1, max: 100, step: 1 },
  { path: "familiar.attack", label: "ファミリア 攻撃力", min: 1, max: 100, step: 1 },
  { path: "familiar.agility", label: "ファミリア 素早さ", min: 1, max: 100, step: 1 },
  { path: "familiar.radius", label: "ファミリア 半径", min: 6, max: 40, step: 1 },
  { path: "familiar.accel", label: "ファミリア 加速度", min: 100, max: 6000, step: 50 },
  { path: "familiar.friction", label: "ファミリア 減速度", min: 100, max: 6000, step: 50 },
  { path: "familiar.standbyRange", label: "待機範囲(半径)", min: 30, max: 400, step: 5 },
  { path: "familiar.wanderSpeedRatio", label: "待機中の歩く速さ(割合)", min: 0.1, max: 1, step: 0.05 },
  { path: "familiar.idleMin", label: "立ち止まる時間 最小(秒)", min: 0, max: 10, step: 0.1 },
  { path: "familiar.idleMax", label: "立ち止まる時間 最大(秒)", min: 0, max: 10, step: 0.1 },
  { path: "familiar.lostSpeedRatio", label: "迷子速度(観測者速度の倍)", min: 0.5, max: 4, step: 0.1 },
  { path: "enemy.toughness", label: "敵 丈夫さ", min: 1, max: 100, step: 1 },
  { path: "enemy.attack", label: "敵 攻撃力", min: 1, max: 100, step: 1 },
  { path: "enemy.agility", label: "敵 素早さ", min: 1, max: 100, step: 1 },
  { path: "enemy.radius", label: "敵 半径", min: 6, max: 40, step: 1 },
  { path: "enemy.wanderDistMin", label: "敵 徘徊の歩く距離 最小", min: 0, max: 400, step: 5 },
  { path: "enemy.wanderDistMax", label: "敵 徘徊の歩く距離 最大", min: 0, max: 400, step: 5 },
  { path: "unarmed.baseDamage", label: "素手 ダメージ基礎値", min: 1, max: 100, step: 1 },
  { path: "unarmed.windup", label: "素手 前隙(秒)", min: 0, max: 2, step: 0.05 },
  { path: "unarmed.active", label: "素手 持続(秒)", min: 0.02, max: 1, step: 0.02 },
  { path: "unarmed.recovery", label: "素手 後隙(秒)", min: 0, max: 2, step: 0.05 },
  { path: "unarmed.interval", label: "素手 攻撃間隔(秒)", min: 0.2, max: 6, step: 0.1 },
  { path: "unarmed.offset", label: "素手 範囲の前方距離", min: 0, max: 100, step: 1 },
  { path: "unarmed.hitRadius", label: "素手 範囲の半径", min: 2, max: 80, step: 1 },
  { path: "collision.enabled", label: "押し合い(0/1)", min: 0, max: 1, step: 1 },
  { path: "collision.massExponent", label: "押し合いの質量(半径のべき乗)", min: 0, max: 4, step: 0.5 },
  { path: "input.deadzone", label: "スティック遊び", min: 0, max: 0.6, step: 0.01 },
  { path: "view.zoom", label: "ズーム", min: 0.4, max: 2.5, step: 0.05 },
  { path: "view.showChunkBorders", label: "チャンク境界表示(0/1)", min: 0, max: 1, step: 1 },
  { path: "view.showStandbyRange", label: "待機範囲表示(0/1)", min: 0, max: 1, step: 1 },
  { path: "view.showAttackAreas", label: "攻撃範囲表示(0/1)", min: 0, max: 1, step: 1 },
  { path: "view.decorOpacity", label: "装飾の不透明度", min: 0, max: 1, step: 0.05 },
  { path: "world.decorPerChunk", label: "チャンク装飾数", min: 0, max: 60, step: 1 },
];

export function createDefaultParams(): Params {
  return structuredClone(defaults) as Params;
}

export function getParam(p: Params, path: string): number {
  const [g, k] = path.split(".") as [string, string];
  return (p as unknown as Record<string, Record<string, number>>)[g]![k]!;
}

export function setParam(p: Params, path: string, value: number): void {
  const [g, k] = path.split(".") as [string, string];
  (p as unknown as Record<string, Record<string, number>>)[g]![k] = value;
}

/** 保存データなどの部分的な値を既存パラメータへ安全にマージする(未知キーは無視)。 */
export function mergeParams(target: Params, source: unknown): void {
  if (typeof source !== "object" || source === null) return;
  for (const [g, group] of Object.entries(target) as [string, Record<string, number>][]) {
    const src = (source as Record<string, unknown>)[g];
    if (typeof src !== "object" || src === null) continue;
    for (const k of Object.keys(group)) {
      const v = (src as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) group[k] = v;
    }
  }
}
