// C#: GameSession(遠征と拠点の流れ、ワールドとオーバーレイ・ダイアログの切替をここに集約)
import type { MoveInput } from "../input";
import { hash2 } from "../rng";
import type { Params } from "../params";
import { Base } from "./base";
import { isDown } from "./body";
import { DEFAULT_KIND_ID, kindById } from "./kinds";
import { checkParty } from "./party";
import { World } from "./world";

/**
 * select=最初の側近を選んでいる(そのセーブデータで最初の遠征の前だけ)
 * base=拠点(メニューだけの画面。いずれ、観測者が歩ける有限な空間にする)
 * party=遠征に連れ出すファミリアを選んでいる
 * world=遠征中 / overlay=メニュー表示中 / dialog=確認ダイアログ表示中
 * ended=観測者が倒れて、遠征のワールドが止まった
 * select・base・party・overlay・dialog・ended の間は、ワールドの時間は完全に停止する(急かさない方針)。
 */
export type GameMode = "select" | "base" | "party" | "world" | "overlay" | "dialog" | "ended";

/**
 * hire=雇用の確認 / full=雇えない通知(OKのみ。理由: party=同行の人数の上限 / base=拠点の容量) /
 * abort=遠征の中断の確認
 */
export type DialogState =
  | { kind: "hire"; neutralId: number }
  | { kind: "full"; reason: "party" | "base" }
  | { kind: "abort" };

const NO_INPUT: MoveInput = { moveX: 0, moveY: 0, interact: false };

export class Game {
  mode: GameMode = "world";
  world: World;
  /** 拠点。遠征をまたいで持ち越す(ファミリアは、遠征中以外は、すべてここにいる) */
  base = new Base();
  /** これまでに出た遠征の回数。最初の遠征で 1 になる */
  expeditionCount = 0;
  dialog: DialogState | null = null;
  /**
   * 観測者が倒れてからの経過時間(秒)。倒れていなければ null。
   * この間(ウェイト)、ワールドは動き続けるが、プレイヤーは何もできない。
   */
  defeatTimer: number | null = null;
  /** 前ステップのインタラクトボタンの状態(押した瞬間を検出するため) */
  private prevInteract = false;
  /** ダイアログを閉じたあとに戻るモード(雇用なら遠征、遠征の中断ならメニュー) */
  private dialogReturn: GameMode = "world";

  /**
   * @param options.autoStart true(既定)なら、最初の側近を選ぶ画面を飛ばして、標準のファミリアを連れた状態で
   *   最初の遠征を始める(テストや自動実行用)。false なら、最初の側近の選択画面(mode=select)から始まる。
   */
  constructor(
    public seed: number,
    private params: Params,
    options: { autoStart?: boolean } = {},
  ) {
    const autoStart = options.autoStart ?? true;
    this.world = this.createWorld(seed);
    if (autoStart) {
      this.world.spawnFamiliar("aide", DEFAULT_KIND_ID);
      this.expeditionCount = 1;
      this.mode = "world";
    } else {
      this.mode = "select";
    }
  }

  /** 周囲に敵と中立個体がいる遠征のワールドを作る(敵の出現の仕組みは後で作る)。ファミリアは、あとで加わる。 */
  private createWorld(seed: number): World {
    const world = new World(seed, this.params, this.base);
    world.spawnInitialEnemies();
    world.spawnInitialNeutrals();
    return world;
  }

  /** 遠征ごとのシード。最初の遠征はゲームのシードのまま、以降は遠征の回数から決まる。 */
  private expeditionSeed(index: number): number {
    return index <= 1 ? this.seed : hash2(this.seed, index, 0x3d) | 0;
  }

  // ---- 最初の遠征の前: 最初の側近の選択 ----

  /** 最初の側近を決めて、最初の遠征を始める。選択画面(mode=select)のときだけ有効。 */
  startRun(kindId: string): boolean {
    if (this.mode !== "select" || !kindById(kindId)) return false;
    this.world.spawnFamiliar("aide", kindId);
    this.expeditionCount = 1;
    this.beginExpeditionState();
    return true;
  }

  // ---- 拠点 → 遠征 ----

  /** 拠点から、遠征に連れ出すファミリアを選ぶ画面へ進む。 */
  openParty(): boolean {
    if (this.mode !== "base") return false;
    this.mode = "party";
    return true;
  }

  /** 連れ出す選択をやめて、拠点へ戻る。 */
  cancelParty(): void {
    if (this.mode === "party") this.mode = "base";
  }

  /** 選んだファミリアを連れて、新しい遠征に出る。条件を満たさない選択は、受け付けない。 */
  departExpedition(ids: number[]): boolean {
    if (this.mode !== "party") return false;
    const members = ids.map((id) => this.base.find(id));
    if (members.some((m) => m === undefined) || new Set(ids).size !== ids.length) return false;
    const fams = members as NonNullable<(typeof members)[number]>[];
    if (!checkParty(fams, this.params).ok) return false;
    this.expeditionCount++;
    this.world = this.createWorld(this.expeditionSeed(this.expeditionCount));
    fams.forEach((f, i) => {
      this.base.take(f);
      this.world.deployFamiliar(f, i);
    });
    this.beginExpeditionState();
    return true;
  }

  private beginExpeditionState(): void {
    this.mode = "world";
    this.dialog = null;
    this.defeatTimer = null;
    this.prevInteract = false;
    this.dialogReturn = "world";
  }

  // ---- 遠征 → 拠点 ----

  /** 遠征の終わり: 同行していたファミリアは、全員、HPをそのままに、拠点へ戻る。 */
  private endExpedition(): void {
    for (const f of this.world.familiars) this.base.receive(f, this.params);
    this.world.familiars = [];
    this.mode = "base";
    this.dialog = null;
    this.defeatTimer = null;
    this.prevInteract = false;
    this.dialogReturn = "world";
  }

  /** メニューの「拠点に戻る」。確認ダイアログを出す(了承すると、現在の遠征は中断される)。 */
  requestAbort(): boolean {
    if (this.mode !== "overlay") return false;
    this.dialog = { kind: "abort" };
    this.dialogReturn = "overlay";
    this.mode = "dialog";
    return true;
  }

  /** 観測者が倒れて遠征が止まったあと、拠点へ戻る。(遠征の終了画面を作るまでの仮の入口) */
  returnToBase(): boolean {
    if (this.mode !== "ended") return false;
    this.endExpedition();
    return true;
  }

  // ---- 遠征中の進行 ----

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
    const block = this.world.familiarAddBlock("companion");
    this.dialog = block === null ? { kind: "hire", neutralId: t.neutral.id } : { kind: "full", reason: block };
    this.dialogReturn = "world";
    this.mode = "dialog";
    return true;
  }

  /** ダイアログの「はい」(通知では「OK」)。 */
  confirmDialog(): void {
    if (this.mode !== "dialog" || !this.dialog) return;
    const d = this.dialog;
    if (d.kind === "abort") {
      this.endExpedition();
      return;
    }
    if (d.kind === "hire") this.world.hireNeutral(d.neutralId);
    this.closeDialog();
  }

  /** ダイアログの「いいえ」。雇用は中立個体のまま、遠征の中断は取りやめ(メニューに戻る)。 */
  cancelDialog(): void {
    if (this.mode !== "dialog") return;
    this.closeDialog();
  }

  private closeDialog(): void {
    this.dialog = null;
    this.mode = this.dialogReturn;
    this.dialogReturn = "world";
  }

  /** メニューボタン(Esc / P / Start / ☰)。ダイアログ表示中は「いいえ」、連れ出す選択中は「戻る」になる。 */
  handleMenuButton(): void {
    if (this.mode === "dialog") this.cancelDialog();
    else if (this.mode === "party") this.cancelParty();
    else this.toggleOverlay();
  }

  toggleOverlay(): void {
    if (this.defeatTimer !== null) return; // 倒れたあとは何もできない
    if (this.mode !== "world" && this.mode !== "overlay") return;
    this.mode = this.mode === "world" ? "overlay" : "world";
  }

  /**
   * 最初から作り直す(拠点も空になる)。toSelect が true なら、最初の側近の選択画面へ戻る。
   * false なら、標準のファミリアを連れた最初の遠征から始める(テスト・自動実行用)。
   */
  reset(seed: number, toSelect = false): void {
    this.seed = seed;
    this.base = new Base();
    this.world = this.createWorld(seed);
    this.expeditionCount = 0;
    this.dialog = null;
    this.defeatTimer = null;
    this.prevInteract = false;
    this.dialogReturn = "world";
    if (toSelect) {
      this.mode = "select";
    } else {
      this.world.spawnFamiliar("aide", DEFAULT_KIND_ID);
      this.expeditionCount = 1;
      this.mode = "world";
    }
  }

  onParamChanged(path: string): void {
    if (path.startsWith("world.")) this.world.chunks.clear();
    if (/^(familiar|enemy|neutral)\.(toughness|attack|agility)$/.test(path)) this.world.applyTemplateAbilities();
  }
}
