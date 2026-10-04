// C#: GameParams (ScriptableObject / JSON)
import defaults from "../data/params.json";

export interface Params {
  sim: { hz: number };
  world: { chunkSize: number; decorPerChunk: number; keepRadius: number };
  watcher: { radius: number; maxSpeed: number; accel: number; friction: number };
  view: { zoom: number; showChunkBorders: number; decorOpacity: number };
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
  { path: "input.deadzone", label: "スティック遊び", min: 0, max: 0.6, step: 0.01 },
  { path: "view.zoom", label: "ズーム", min: 0.4, max: 2.5, step: 0.05 },
  { path: "view.showChunkBorders", label: "チャンク境界表示(0/1)", min: 0, max: 1, step: 1 },
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
