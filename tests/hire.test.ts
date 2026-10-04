import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const press = { moveX: 0, moveY: 0, interact: true };

/** 敵も中立個体もいない、観測者と側近だけのゲーム */
function quietGame(p: Params = createDefaultParams()) {
  const g = new Game(1, p);
  g.world.enemies.length = 0;
  g.world.neutrals.length = 0;
  return { g, w: g.world, p };
}
const stepN = (g: Game, n: number, input = idle) => {
  for (let i = 0; i < n; i++) g.step(dt, input);
};
/** 観測者のすぐそばに、動かない中立個体を1体置く */
function nearNeutral(w: World, dist = 50) {
  const n = w.spawnNeutral(dist, 0);
  n.wander.timer = 9999;
  return n;
}

describe("雇用の対象", () => {
  it("雇用ボタンの距離は、助け起こしより大きい", () => {
    const p = createDefaultParams();
    expect(p.party.hireRange).toBeGreaterThan(p.down.reviveRange);
  });
  it("距離内の生きている中立個体が対象になり、距離の外なら対象にならない", () => {
    const { w, p } = quietGame();
    const n = nearNeutral(w, p.party.hireRange - 5);
    expect(w.interactionTarget()).toEqual({ kind: "hire", neutral: n });
    n.x = n.prevX = p.party.hireRange + 40;
    expect(w.interactionTarget()).toBeNull();
  });
  it("最も近い中立個体が対象になる", () => {
    const { w } = quietGame();
    nearNeutral(w, 60);
    const near = nearNeutral(w, 40);
    expect(w.interactionTarget()).toEqual({ kind: "hire", neutral: near });
  });
  it("戦闘不能の中立個体は雇用できない", () => {
    const { w } = quietGame();
    const n = nearNeutral(w, 40);
    damage(n, 9999);
    expect(w.interactionTarget()).toBeNull();
  });
  it("優先順位は 助け起こし > 雇用", () => {
    const { w } = quietGame();
    const f = w.familiars[0]!;
    f.x = f.prevX = 30;
    f.y = f.prevY = 0;
    damage(f, 9999);
    w.step(dt, idle);
    nearNeutral(w, 20);
    expect(w.interactionTarget()).toEqual({ kind: "revive", familiar: f });
  });
  it("観測者が倒れているときは対象にならない", () => {
    const { w } = quietGame();
    nearNeutral(w, 30);
    damage(w.watcher, 9999);
    expect(w.interactionTarget()).toBeNull();
  });
});

describe("確認ダイアログ", () => {
  it("ボタンを押した瞬間にダイアログが出て、ワールドが止まる(待ち時間は無い)", () => {
    const { g, w } = quietGame();
    const n = nearNeutral(w);
    g.step(dt, press);
    expect(g.mode).toBe("dialog");
    expect(g.dialog).toEqual({ kind: "hire", neutralId: n.id });
    const tick = w.tick;
    stepN(g, 120);
    expect(w.tick).toBe(tick);
  });
  it("押し続けているだけでは、ダイアログは繰り返し出ない(押した瞬間だけ)", () => {
    const { g, w } = quietGame();
    nearNeutral(w);
    g.step(dt, press);
    g.cancelDialog();
    stepN(g, 30, press); // 押しっぱなし
    expect(g.mode).toBe("world");
    stepN(g, 2, idle);
    g.step(dt, press); // 離してから押し直す
    expect(g.mode).toBe("dialog");
  });
  it("了承すると、その中立個体は同行者(ファミリア)になる。同じIDのまま、HPなども引き継ぐ", () => {
    const { g, w } = quietGame();
    const n = nearNeutral(w);
    n.hp = 40;
    g.step(dt, press);
    g.confirmDialog();
    expect(g.mode).toBe("world");
    expect(g.dialog).toBeNull();
    expect(w.neutrals).not.toContain(n);
    const f = w.familiars.find((x) => x.id === n.id)!;
    expect(f).toBeDefined();
    expect(f.role).toBe("companion");
    expect(f.hp).toBe(40);
    expect(w.familiars).toHaveLength(2); // 最初の側近 + 同行者
  });
  it("キャンセルすると、中立個体のままで、ワールドが再開する", () => {
    const { g, w } = quietGame();
    const n = nearNeutral(w);
    g.step(dt, press);
    g.cancelDialog();
    expect(g.mode).toBe("world");
    expect(w.neutrals).toContain(n);
    expect(w.familiars).toHaveLength(1);
    const tick = w.tick;
    stepN(g, 10);
    expect(w.tick).toBe(tick + 10);
  });
  it("メニューボタンはダイアログ中は「いいえ」になる。メニューも開かない", () => {
    const { g, w } = quietGame();
    nearNeutral(w);
    g.step(dt, press);
    g.toggleOverlay();
    expect(g.mode).toBe("dialog");
    g.handleMenuButton();
    expect(g.mode).toBe("world");
    expect(w.familiars).toHaveLength(1);
  });
  it("助け起こしの最中にボタンを押しっぱなしにしても、完了後に雇用ダイアログは出ない", () => {
    const { g, w } = quietGame();
    const f = w.familiars[0]!;
    f.x = f.prevX = 30;
    f.y = f.prevY = 0;
    damage(f, 9999);
    g.step(dt, idle);
    nearNeutral(w, 20);
    stepN(g, 60 * 3.5, press); // 助け起こしが完了しても、押しっぱなしのまま
    expect(f.down).toBe(false);
    expect(g.mode).toBe("world");
  });
  it("リセットするとダイアログは消える", () => {
    const { g, w } = quietGame();
    nearNeutral(w);
    g.step(dt, press);
    g.reset(2);
    expect(g.mode).toBe("world");
    expect(g.dialog).toBeNull();
  });
});

describe("人数上限", () => {
  it("上限は 側近2人・ファミリア5人(初期値)", () => {
    const p = createDefaultParams();
    expect(p.party.maxAides).toBe(2);
    expect(p.party.maxFamiliars).toBe(5);
  });
  it("ファミリアが上限に達していたら、雇用の代わりに「これ以上同行できません」の通知が出る", () => {
    const { g, w, p } = quietGame();
    while (w.familiars.length < p.party.maxFamiliars) w.spawnFamiliar("companion");
    const n = nearNeutral(w, 30);
    g.step(dt, press);
    expect(g.mode).toBe("dialog");
    expect(g.dialog).toEqual({ kind: "full", reason: "party" });
    g.confirmDialog(); // OK
    expect(g.mode).toBe("world");
    expect(w.neutrals).toContain(n);
    expect(w.familiars).toHaveLength(p.party.maxFamiliars);
  });
  it("拠点にいるファミリアは、人数に数えない", () => {
    const { g, w, p } = quietGame();
    while (w.familiars.length < p.party.maxFamiliars) w.spawnFamiliar("companion");
    w.base.receive(w.familiars.pop()!, p); // 1人を拠点へ
    nearNeutral(w, 30);
    g.step(dt, press);
    expect(g.dialog?.kind).toBe("hire");
  });
  it("側近の上限は、側近だけに適用される", () => {
    const { w } = quietGame();
    expect(w.canAddFamiliar("aide")).toBe(true); // 側近1人 → もう1人まで
    w.spawnFamiliar("aide");
    expect(w.canAddFamiliar("aide")).toBe(false);
    expect(w.canAddFamiliar("companion")).toBe(true);
  });
  it("上限に達していたら、直接 hireNeutral しても雇用されない", () => {
    const { w, p } = quietGame();
    while (w.familiars.length < p.party.maxFamiliars) w.spawnFamiliar("companion");
    const n = nearNeutral(w);
    expect(w.hireNeutral(n.id)).toBeNull();
    expect(w.neutrals).toContain(n);
  });
});

describe("雇用と敵", () => {
  it("雇用した個体を狙っていた敵は、そのまま狙い続け、観測者側への臨戦として扱われる(ファミリアが迎撃する)", () => {
    const { g, w } = quietGame();
    const n = nearNeutral(w, 40);
    n.wander.timer = 9999;
    const e = w.spawnEnemy(110, 0);
    stepN(g, 3);
    expect(e.targetId).toBe(n.id);
    expect(w.isPlayerSide(n.id)).toBe(false);
    g.step(dt, { moveX: 0, moveY: 0, interact: false });
    g.step(dt, press);
    expect(g.mode).toBe("dialog");
    g.confirmDialog();
    expect(w.isPlayerSide(n.id)).toBe(true);
    expect(w.engagedOnPlayerSide(e)).toBe(true);
    stepN(g, 5);
    const aide = w.familiars.find((f) => f.role === "aide")!;
    expect(aide.state).toBe("intercept");
  });
});

describe("中立個体のスポーン上限", () => {
  it("ワールド全体で10体が上限。上限を超えるスポーンは行われない", () => {
    const { w, p } = quietGame();
    expect(p.neutral.maxCount).toBe(10);
    for (let i = 0; i < 15; i++) w.trySpawnNeutral(1000 + i * 10, 0);
    expect(w.neutrals).toHaveLength(10);
    expect(w.canSpawnNeutral()).toBe(false);
    expect(w.trySpawnNeutral(0, 500)).toBeNull();
  });
  it("雇用などで減ると、また出せる", () => {
    const { g, w } = quietGame();
    for (let i = 0; i < 10; i++) w.trySpawnNeutral(2000 + i * 30, 0);
    const n = nearNeutral(w, 30); // 低レベル生成なので上限を超えて置ける(テスト用)
    g.step(dt, press);
    g.confirmDialog();
    expect(w.neutrals).toHaveLength(10);
    w.neutrals.pop();
    expect(w.canSpawnNeutral()).toBe(true);
    expect(n.id).toBeGreaterThan(0);
  });
  it("初期配置とデバッグのスポーンは、上限を守る", () => {
    const p = createDefaultParams();
    p.neutral.initialCount = 50;
    const g = new Game(1, p);
    expect(g.world.neutrals).toHaveLength(10);
    g.world.debugSpawnNeutral();
    expect(g.world.neutrals).toHaveLength(10);
  });
});
