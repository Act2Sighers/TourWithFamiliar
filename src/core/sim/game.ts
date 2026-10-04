// C#: GameSession(モード管理。ワールドとオーバーレイ・ダイアログの切替をここに集約)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { isDown } from "./body";
import { World } from "./world";

/**
 * world=進行中 / overlay=メニュー表示中 / dialog=確認ダイアログ表示中 / ended=観測者が倒れてワールドが止まった。
 * overlay・dialog・ended の間は、ワールドの時間は完全に停止する(急かさない方針)。
 */
export type GameMode = "world" | "overlay" | "dialog" | "ended";

/** hire=雇用の確認 / full=人数上限で雇えない(OKのみ) */
export type DialogState = { kind: "hire"; neutralId: number } | { kind: "full" };

const NO_INPUT: MoveInput = { moveX: 0, moveY: 0, interact: false };

export class Game {
  mode: GameMode = "world";
  world: World;
  dialog: DialogState | null = null;
  /**
   * 観測者が倒れてからの経過時間(秒)。倒れていなければ null。
   * この間(ウェイト)、ワールドは動き続けるが、プレイヤーは何もできない。
   */
  defeatTimer: number | null = null;
  /** 前ステップのインタラクトボタンの状態(押した瞬間を検出するため) */
  private prevInteract = false;

  constructor(
    public seed: number,
    private params: Params,
  ) {
    this.world = this.createWorld(seed);
  }

  /** 最初の側近を1人連れ、周囲に敵と中立個体がいる状態で始める(側近の選択UIや敵の出現の仕組みは後で作る)。 */
  private createWorld(seed: number): World {
    const world = new World(seed, this.params);
    world.spawnFamiliar("aide");
    world.spawnInitialEnemies();
    world.spawnInitialNeutrals();
    return world;
  }

  /** ワールド時間を進める。オーバーレイ・ダイアログ中は完全に停止する。 */
  step(dt: number, input: MoveInput): void {
    if (this.mode !== "world") return;
    const defeated = this.defeatTimer !== null;
    const inp = defeated ? NO_INPUT : input;

    // インタラクトボタンを押した瞬間に、対象が雇用なら確認ダイアログを出す(助け起こしは押し続ける操作なので対象外)
    const pressed = !!inp.interact && !this.prevInteract;
    this.prevInteract = !!inp.interact;
    if (pressed && this.tryOpenHireDialog()) return;

    this.world.step(dt, inp);
    if (!defeated) {
      if (isDown(this.world.watcher)) this.defeatTimer = 0;
      return;
    }
    this.defeatTimer! += dt;
    if (this.defeatTimer! >= this.params.run.defeatWait) this.mode = "ended";
  }

  private tryOpenHireDialog(): boolean {
    const t = this.world.interactionTarget();
    if (!t || t.kind !== "hire") return false;
    this.dialog = this.world.canAddFamiliar("companion") ? { kind: "hire", neutralId: t.neutral.id } : { kind: "full" };
    this.mode = "dialog";
    return true;
  }

  /** ダイアログの「はい」(人数上限の通知では「OK」)。 */
  confirmDialog(): void {
    if (this.mode !== "dialog" || !this.dialog) return;
    if (this.dialog.kind === "hire") this.world.hireNeutral(this.dialog.neutralId);
    this.closeDialog();
  }

  /** ダイアログの「いいえ」。中立個体は中立個体のまま。 */
  cancelDialog(): void {
    if (this.mode !== "dialog") return;
    this.closeDialog();
  }

  private closeDialog(): void {
    this.dialog = null;
    this.mode = "world";
  }

  /** メニューボタン(Esc / P / Start / ☰)。ダイアログ表示中は「いいえ」になる。 */
  handleMenuButton(): void {
    if (this.mode === "dialog") this.cancelDialog();
    else this.toggleOverlay();
  }

  toggleOverlay(): void {
    if (this.defeatTimer !== null) return; // 倒れたあとは何もできない
    if (this.mode === "ended" || this.mode === "dialog") return;
    this.mode = this.mode === "world" ? "overlay" : "world";
  }

  reset(seed: number): void {
    this.seed = seed;
    this.world = this.createWorld(seed);
    this.mode = "world";
    this.dialog = null;
    this.defeatTimer = null;
    this.prevInteract = false;
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
    if (/^(familiar|enemy|neutral)\.(toughness|attack|agility)$/.test(path)) this.world.applyTemplateAbilities();
  }
}
