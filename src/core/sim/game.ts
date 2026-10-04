// C#: GameSession(モード管理。ワールドとオーバーレイの切替をここに集約)
import type { MoveInput } from "../input";
import { isDown } from "./body";
import type { Params } from "../params";
import { World } from "./world";

/** world=進行中 / overlay=メニュー表示中(ワールド停止) / ended=観測者が倒れてワールドが止まった */
export type GameMode = "world" | "overlay" | "ended";

const NO_INPUT: MoveInput = { moveX: 0, moveY: 0, interact: false };

export class Game {
  mode: GameMode = "world";
  world: World;
  /**
   * 観測者が倒れてからの経過時間(秒)。倒れていなければ null。
   * この間(ウェイト)、ワールドは動き続けるが、プレイヤーは何もできない。
   */
  defeatTimer: number | null = null;

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
    const defeated = this.defeatTimer !== null;
    this.world.step(dt, defeated ? NO_INPUT : input);
    if (!defeated) {
      if (isDown(this.world.watcher)) this.defeatTimer = 0;
      return;
    }
    this.defeatTimer! += dt;
    if (this.defeatTimer! >= this.params.run.defeatWait) this.mode = "ended";
  }

  toggleOverlay(): void {
    if (this.defeatTimer !== null) return; // 倒れたあとは何もできない
    if (this.mode === "ended") return;
    this.mode = this.mode === "world" ? "overlay" : "world";
  }

  reset(seed: number): void {
    this.seed = seed;
    this.world = this.createWorld(seed);
    this.mode = "world";
    this.defeatTimer = null;
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
    if (/^(familiar|enemy)\.(toughness|attack|agility)$/.test(path)) this.world.applyTemplateAbilities();
  }
}
