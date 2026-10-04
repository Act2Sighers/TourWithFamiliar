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
    this.world = this.createWorld(seed);
  }

  /** 最初の側近を1人連れ、周囲に敵が数体いる状態で始める(側近の選択UIや敵の出現の仕組みは後で作る)。 */
  private createWorld(seed: number): World {
    const world = new World(seed, this.params);
    world.spawnFamiliar("aide");
    world.spawnInitialEnemies();
    return world;
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
    this.world = this.createWorld(seed);
    this.mode = "world";
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
    if (/^(familiar|enemy)\.(toughness|attack|agility)$/.test(path)) this.world.applyTemplateAbilities();
  }
}
