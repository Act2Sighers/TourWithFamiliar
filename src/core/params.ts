// C#: GameParams (ScriptableObject / JSON)
import defaults from "../data/params.json";

export interface Params {
  sim: { hz: number };
  world: { chunkSize: number; decorPerChunk: number; keepRadius: number };
  watcher: { radius: number; maxHp: number; maxSpeed: number; accel: number; friction: number };
  stats: { hpPerToughness: number; speedPerAgility: number };
  familiar: {
    toughness: number;
    agility: number;
    radius: number;
    accel: number;
    friction: number;
    standbyRange: number;
    wanderSpeedRatio: number;
    idleMin: number;
    idleMax: number;
  };
  view: { zoom: number; showChunkBorders: number; decorOpacity: number; showStandbyRange: number };
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
  { path: "familiar.toughness", label: "ファミリア 丈夫さ", min: 1, max: 100, step: 1 },
  { path: "familiar.agility", label: "ファミリア 素早さ", min: 1, max: 100, step: 1 },
  { path: "familiar.radius", label: "ファミリア 半径", min: 6, max: 40, step: 1 },
  { path: "familiar.accel", label: "ファミリア 加速度", min: 100, max: 6000, step: 50 },
  { path: "familiar.friction", label: "ファミリア 減速度", min: 100, max: 6000, step: 50 },
  { path: "familiar.standbyRange", label: "待機範囲(半径)", min: 30, max: 400, step: 5 },
  { path: "familiar.wanderSpeedRatio", label: "待機中の歩く速さ(割合)", min: 0.1, max: 1, step: 0.05 },
  { path: "familiar.idleMin", label: "立ち止まる時間 最小(秒)", min: 0, max: 10, step: 0.1 },
  { path: "familiar.idleMax", label: "立ち止まる時間 最大(秒)", min: 0, max: 10, step: 0.1 },
  { path: "input.deadzone", label: "スティック遊び", min: 0, max: 0.6, step: 0.01 },
  { path: "view.zoom", label: "ズーム", min: 0.4, max: 2.5, step: 0.05 },
  { path: "view.showChunkBorders", label: "チャンク境界表示(0/1)", min: 0, max: 1, step: 1 },
  { path: "view.showStandbyRange", label: "待機範囲表示(0/1)", min: 0, max: 1, step: 1 },
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
