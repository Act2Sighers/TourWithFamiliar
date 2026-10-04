// C#: GameSession(モード管理。ワールドとオーバーレイ・ダイアログの切替をここに集約)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { isDown } from "./body";
import { DEFAULT_KIND_ID, kindById } from "./kinds";
import { World } from "./world";

/**
 * select=最初の側近を選んでいる(ランの開始前) / world=進行中 / overlay=メニュー表示中 / dialog=確認ダイアログ表示中 / ended=観測者が倒れてワールドが止まった。
 * overlay・dialog・ended の間は、ワールドの時間は完全に停止する(急かさない方針)。
 */
export type GameMode = "select" | "world" | "overlay" | "dialog" | "ended";

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

  /**
   * @param options.autoStart true(既定)なら、最初の側近を選ぶ画面を飛ばして、標準のファミリアを連れた状態で始める(テストや自動実行用)。
   *   false なら、最初の側近の選択画面(mode=select)から始まり、startRun で開始する。
   */
  constructor(
    public seed: number,
    private params: Params,
    options: { autoStart?: boolean } = {},
  ) {
    const autoStart = options.autoStart ?? true;
    this.world = this.createWorld(seed, autoStart);
    this.mode = autoStart ? "world" : "select";
  }

  /** 周囲に敵と中立個体がいる状態のワールドを作る(敵の出現の仕組みは後で作る)。最初の側近は、選択のあとで加わる。 */
  private createWorld(seed: number, withAide: boolean): World {
    const world = new World(seed, this.params);
    world.spawnInitialEnemies();
    world.spawnInitialNeutrals();
    if (withAide) world.spawnFamiliar("aide", DEFAULT_KIND_ID);
    return world;
  }

  /** 最初の側近を決めてランを始める。選択画面(mode=select)のときだけ有効。 */
  startRun(kindId: string): boolean {
    if (this.mode !== "select" || !kindById(kindId)) return false;
    this.world.spawnFamiliar("aide", kindId);
    this.mode = "world";
    this.prevInteract = false;
    return true;
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
    if (this.mode === "ended" || this.mode === "dialog" || this.mode === "select") return;
    this.mode = this.mode === "world" ? "overlay" : "world";
  }

  /** ワールドを作り直す。toSelect が true なら、最初の側近の選択画面へ戻る。 */
  reset(seed: number, toSelect = false): void {
    this.seed = seed;
    this.world = this.createWorld(seed, !toSelect);
    this.mode = toSelect ? "select" : "world";
    this.dialog = null;
    this.defeatTimer = null;
    this.prevInteract = false;
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
    if (/^(familiar|enemy|neutral)\.(toughness|attack|agility)$/.test(path)) this.world.applyTemplateAbilities();
  }
}
