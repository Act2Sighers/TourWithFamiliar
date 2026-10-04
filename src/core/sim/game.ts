// C#: GameSession(モード管理。ワールドとオーバーレイの切替をここに集約)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { World } from "./world";

export type GameMode = "world" | "overlay";

export class Game {
  mode: GameMode = "world";
  world: World;

  constructor(
    public seed: number,
    private params: Params,
  ) {
    this.world = new World(seed, params);
  }

  /** ワールド時間を進める。オーバーレイ中は完全に停止する(急かさない方針)。 */
  step(dt: number, input: MoveInput): void {
    if (this.mode !== "world") return;
    this.world.step(dt, input);
  }

  toggleOverlay(): void {
    this.mode = this.mode === "world" ? "overlay" : "world";
  }

  reset(seed: number): void {
    this.seed = seed;
    this.world = new World(seed, this.params);
    this.mode = "world";
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
  }
}
