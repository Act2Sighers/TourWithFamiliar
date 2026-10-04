import { describe, expect, it } from "vitest";
import { createDefaultParams } from "../src/core/params";
import { CandidateSelection } from "../src/core/selection";
import { Game } from "../src/core/sim/game";
import { DEFAULT_KIND_ID, FAMILIAR_KINDS, kindById } from "../src/core/sim/kinds";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };

describe("ファミリアの種類", () => {
  it("今は1種類だけで、名前は「FM」", () => {
    expect(FAMILIAR_KINDS).toHaveLength(1);
    expect(kindById(DEFAULT_KIND_ID)?.name).toBe("FM");
    expect(kindById("unknown")).toBeUndefined();
  });
  it("初期の能力値は、調整パネルのファミリアの値", () => {
    const p = createDefaultParams();
    p.familiar.toughness = 33;
    expect(kindById(DEFAULT_KIND_ID)!.abilities(p).toughness).toBe(33);
  });
});

describe("選択の状態(CandidateSelection)", () => {
  it("最初は何も選ばれておらず、開始できない", () => {
    const s = new CandidateSelection(3);
    expect(s.selected).toBeNull();
    expect(s.canStart).toBe(false);
  });
  it("左右の移動で、動いた先が選ばれる。端では反対側へ回る", () => {
    const s = new CandidateSelection(3);
    s.move(1);
    expect([s.focus, s.selected]).toEqual([1, 1]);
    s.move(-1);
    s.move(-1);
    expect([s.focus, s.selected]).toEqual([2, 2]);
    s.move(1);
    expect(s.focus).toBe(0);
  });
  it("決定ボタン: 未選択なら選ぶだけ。選択済みなら開始を知らせる", () => {
    const s = new CandidateSelection(1);
    expect(s.confirm()).toBe(false);
    expect(s.selected).toBe(0);
    expect(s.canStart).toBe(true);
    expect(s.confirm()).toBe(true);
  });
  it("タップで直接選べる。範囲外は無視する", () => {
    const s = new CandidateSelection(2);
    s.select(1);
    expect(s.selected).toBe(1);
    s.select(5);
    expect(s.selected).toBe(1);
  });
  it("リセットすると、未選択に戻る", () => {
    const s = new CandidateSelection(2);
    s.select(1);
    s.reset();
    expect([s.focus, s.selected]).toEqual([0, null]);
  });
  it("候補が0件でも壊れない", () => {
    const s = new CandidateSelection(0);
    s.move(1);
    expect(s.confirm()).toBe(false);
    expect(s.selected).toBeNull();
  });
});

describe("最初の側近の選択とラン開始", () => {
  it("選択画面から始まり、まだファミリアはいない。ワールドは動かない", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    expect(g.mode).toBe("select");
    expect(g.world.familiars).toHaveLength(0);
    const tick = g.world.tick;
    for (let i = 0; i < 120; i++) g.step(dt, idle);
    expect(g.world.tick).toBe(tick);
  });
  it("周囲の敵と中立個体は、選択画面の時点で配置されている", () => {
    const p = createDefaultParams();
    const g = new Game(1, p, { autoStart: false });
    expect(g.world.enemies).toHaveLength(p.enemy.initialCount);
    expect(g.world.neutrals).toHaveLength(p.neutral.initialCount);
  });
  it("開始すると、選んだ種類の側近を1人連れてランが始まる", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    expect(g.startRun(DEFAULT_KIND_ID)).toBe(true);
    expect(g.mode).toBe("world");
    expect(g.world.familiars).toHaveLength(1);
    const f = g.world.familiars[0]!;
    expect(f.role).toBe("aide");
    expect(f.kindId).toBe(DEFAULT_KIND_ID);
    expect(f.name).toBe("FM");
    g.step(dt, idle);
    expect(g.world.tick).toBe(1);
  });
  it("存在しない種類では開始しない", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    expect(g.startRun("nope")).toBe(false);
    expect(g.mode).toBe("select");
  });
  it("ラン中に startRun しても、側近は増えない", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    g.startRun(DEFAULT_KIND_ID);
    expect(g.startRun(DEFAULT_KIND_ID)).toBe(false);
    expect(g.world.familiars).toHaveLength(1);
  });
  it("選択画面では、メニューも開かない", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    g.handleMenuButton();
    g.toggleOverlay();
    expect(g.mode).toBe("select");
  });
  it("リセット(選択画面へ戻る)で、ランが破棄されて選択画面に戻る", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    g.startRun(DEFAULT_KIND_ID);
    for (let i = 0; i < 60; i++) g.step(dt, idle);
    g.reset(7, true);
    expect(g.mode).toBe("select");
    expect(g.world.familiars).toHaveLength(0);
    expect(g.world.tick).toBe(0);
    expect(g.startRun(DEFAULT_KIND_ID)).toBe(true);
  });
  it("通常のリセットは、これまでどおり側近を連れて始まる(テスト・自動実行用)", () => {
    const g = new Game(1, createDefaultParams(), { autoStart: false });
    g.reset(2);
    expect(g.mode).toBe("world");
    expect(g.world.familiars).toHaveLength(1);
  });
  it("自動開始(既定)なら、選択画面を飛ばして側近を連れて始まる", () => {
    const g = new Game(1, createDefaultParams());
    expect(g.mode).toBe("world");
    expect(g.world.familiars).toHaveLength(1);
  });
  it("選んだ側近で始めたランは、自動開始と同じ結果になる(決定的)", () => {
    const sim = (g: Game) => {
      for (let i = 0; i < 60 * 20; i++) g.step(dt, { moveX: Math.sin(i / 100), moveY: 0 });
      return JSON.stringify([g.world.watcher.x, g.world.familiars.map((f) => [f.x, f.hp]), g.world.enemies.map((e) => [e.x, e.hp])]);
    };
    const a = new Game(5, createDefaultParams());
    const b = new Game(5, createDefaultParams(), { autoStart: false });
    b.startRun(DEFAULT_KIND_ID);
    expect(sim(b)).toBe(sim(a));
  });
});
