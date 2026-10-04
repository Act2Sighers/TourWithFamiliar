// C#: World / Watcher(純粋ロジック。描画・DOMには依存しない)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { ChunkMap } from "./chunks";

export interface Watcher {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 直前ステップの位置(描画補間用) */
  prevX: number;
  prevY: number;
  /** 向き(ラジアン)。入力がある間だけ更新する */
  facing: number;
}

export class World {
  tick = 0;
  time = 0;
  readonly watcher: Watcher = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prevX: 0,
    prevY: 0,
    facing: Math.PI / 2,
  };
  readonly chunks: ChunkMap;

  constructor(
    readonly seed: number,
    private params: Params,
  ) {
    this.chunks = new ChunkMap(seed, params);
  }

  /** 固定刻み dt(秒)で1ステップ進める。 */
  step(dt: number, input: MoveInput): void {
    const w = this.watcher;
    const p = this.params.watcher;
    w.prevX = w.x;
    w.prevY = w.y;

    const len = Math.hypot(input.moveX, input.moveY);
    const hasInput = len > 0;
    const norm = len > 1 ? 1 / len : 1; // 斜めが速くならないように
    const targetVx = input.moveX * norm * p.maxSpeed;
    const targetVy = input.moveY * norm * p.maxSpeed;

    const rate = (hasInput ? p.accel : p.friction) * dt;
    const dvx = targetVx - w.vx;
    const dvy = targetVy - w.vy;
    const dvLen = Math.hypot(dvx, dvy);
    if (dvLen <= rate) {
      w.vx = targetVx;
      w.vy = targetVy;
    } else {
      w.vx += (dvx / dvLen) * rate;
      w.vy += (dvy / dvLen) * rate;
    }

    w.x += w.vx * dt;
    w.y += w.vy * dt;
    if (hasInput) w.facing = Math.atan2(input.moveY, input.moveX);

    this.chunks.prune(this.chunks.coordOf(w.x), this.chunks.coordOf(w.y));

    this.tick++;
    this.time += dt;
  }
}
