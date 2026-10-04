// C#: GameParams (ScriptableObject / JSON)
import defaults from "../data/params.json";

export interface Params {
  sim: { hz: number };
  world: { chunkSize: number; decorPerChunk: number; keepRadius: number };
  watcher: { radius: number; maxHp: number; maxSpeed: number; accel: number; friction: number };
  stats: { hpPerToughness: number; speedPerAgility: number; damageCoefPerAttack: number };
  /** 待機範囲に対する倍率。存在範囲 / 応戦範囲 / 索敵範囲 */
  ranges: { existenceMultiplier: number; engageMultiplier: number; detectMultiplier: number; reactionMultiplier: number };
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
  /** 中立個体(ファミリアになる前の存在)。徘徊は敵と同じ動き */
  neutral: {
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
    /** ワールド全体での中立個体の上限(スポーンするときの上限) */
    maxCount: number;
  };
  /** 拠点。容量は同行中のファミリアも含めた総数。回復は遠征中のみ、一定間隔ごとに最大HPの一定割合 */
  base: {
    capacity: number;
    regenInterval: number;
    regenRatio: number;
    summonMinHpRatio: number;
    /** 拠点に送られたとき、HPがこの割合(最大HPに対して)以下なら、この割合まで回復する */
    arrivalMinHpRatio: number;
    /** 1にすると、召喚できるのは側近だけ(暫定の仕様) */
    summonAideOnly: number;
  };
  /** 同行できる人数の上限(拠点にいる者は含めない)と、雇用ボタンの距離。将来はレリックや親密度の平均で増える */
  party: { maxAides: number; maxFamiliars: number; hireRange: number; talkRange: number };
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
  /** 戦闘不能と助け起こし */
  down: {
    /** 助け起こしにかかる時間(秒) */
    reviveTime: number;
    /** 復活時のHP(最大HPに対する割合) */
    reviveHpRatio: number;
    /** 1にすると、途中で離しても進捗を保持する(0なら最初から) */
    reviveKeepProgress: number;
    /** 助け起こしができる距離(観測者との中心間) */
    reviveRange: number;
    /** 送還が決まったファミリアが、戦闘不能から消えるまでの時間(秒) */
    vanishDelay: number;
  };
  /** ラン全体。観測者が倒れてから、ワールドが止まるまでのウェイト(秒) */
  run: { defeatWait: number };
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
  { path: "ranges.reactionMultiplier", label: "反応範囲(待機範囲の倍)", min: 0.5, max: 5, step: 0.5 },
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
  { path: "neutral.maxCount", label: "中立個体のスポーン上限", min: 0, max: 40, step: 1 },
  { path: "base.capacity", label: "拠点の容量(同行中も含む)", min: 1, max: 60, step: 1 },
  { path: "base.regenInterval", label: "拠点の回復間隔(秒)", min: 1, max: 60, step: 1 },
  { path: "base.regenRatio", label: "拠点の回復量(最大HPの割合)", min: 0.001, max: 0.2, step: 0.001 },
  { path: "base.summonMinHpRatio", label: "召喚できるHP割合", min: 0, max: 1, step: 0.05 },
  { path: "party.maxFamiliars", label: "ファミリアの人数上限", min: 1, max: 20, step: 1 },
  { path: "party.maxAides", label: "側近の人数上限", min: 1, max: 10, step: 1 },
  { path: "base.arrivalMinHpRatio", label: "拠点に着いたときの最低HP割合", min: 0, max: 0.5, step: 0.01 },
  { path: "base.summonAideOnly", label: "召喚できるのは側近のみ(0/1)", min: 0, max: 1, step: 1 },
  { path: "party.talkRange", label: "話しかけるボタンの距離", min: 20, max: 300, step: 2 },
  { path: "party.hireRange", label: "雇用ボタンの距離", min: 20, max: 300, step: 2 },
  { path: "neutral.toughness", label: "中立個体 丈夫さ", min: 1, max: 100, step: 1 },
  { path: "neutral.attack", label: "中立個体 攻撃力", min: 1, max: 100, step: 1 },
  { path: "neutral.agility", label: "中立個体 素早さ", min: 1, max: 100, step: 1 },
  { path: "neutral.radius", label: "中立個体 半径", min: 6, max: 40, step: 1 },
  { path: "neutral.wanderDistMin", label: "中立個体 徘徊の歩く距離 最小", min: 0, max: 400, step: 5 },
  { path: "neutral.wanderDistMax", label: "中立個体 徘徊の歩く距離 最大", min: 0, max: 400, step: 5 },
  { path: "unarmed.baseDamage", label: "素手 ダメージ基礎値", min: 1, max: 100, step: 1 },
  { path: "unarmed.windup", label: "素手 前隙(秒)", min: 0, max: 2, step: 0.05 },
  { path: "unarmed.active", label: "素手 持続(秒)", min: 0.02, max: 1, step: 0.02 },
  { path: "unarmed.recovery", label: "素手 後隙(秒)", min: 0, max: 2, step: 0.05 },
  { path: "unarmed.interval", label: "素手 攻撃間隔(秒)", min: 0.2, max: 6, step: 0.1 },
  { path: "unarmed.offset", label: "素手 範囲の前方距離", min: 0, max: 100, step: 1 },
  { path: "unarmed.hitRadius", label: "素手 範囲の半径", min: 2, max: 80, step: 1 },
  { path: "down.reviveTime", label: "助け起こしの所要時間(秒)", min: 0.5, max: 10, step: 0.5 },
  { path: "down.reviveHpRatio", label: "復活時のHP割合", min: 0.01, max: 1, step: 0.01 },
  { path: "down.reviveKeepProgress", label: "助け起こし進捗の保持(0/1)", min: 0, max: 1, step: 1 },
  { path: "down.reviveRange", label: "助け起こしの距離", min: 20, max: 200, step: 2 },
  { path: "down.vanishDelay", label: "送還までの時間(秒)", min: 0.1, max: 5, step: 0.1 },
  { path: "run.defeatWait", label: "観測者が倒れてから止まるまで(秒)", min: 0, max: 10, step: 0.5 },
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
