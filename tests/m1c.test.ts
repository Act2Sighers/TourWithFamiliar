import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { existenceRangeOf } from "../src/core/sim/ranges";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const hold = { moveX: 0, moveY: 0, interact: true };
const run = (w: { step(dt: number, i: typeof idle): void }, sec: number, input = idle) => {
  for (let i = 0; i < Math.round(sec * 60); i++) w.step(dt, input);
};

/** 観測者のすぐそばで戦闘不能になっている側近を1人用意する */
function downedAide(p: Params = createDefaultParams()) {
  const w = new World(1, p);
  const f = w.spawnFamiliar("aide");
  f.x = f.prevX = 30;
  f.y = f.prevY = 0;
  damage(f, 9999);
  w.step(dt, idle);
  return { w, f, p };
}

describe("助け起こし", () => {
  it("戦闘不能の側近は、その場に残る(消えない)", () => {
    const { w, f } = downedAide();
    run(w, 5);
    expect(w.familiars).toContain(f);
    expect(f.down).toBe(true);
    expect(f.vanishing).toBe(false);
  });
  it("近くでボタンを押し続けて3秒で、最大HPの15%で復活する", () => {
    const { w, f, p } = downedAide();
    run(w, 2.9, hold);
    expect(f.down).toBe(true);
    expect(f.reviveProgress).toBeGreaterThan(0.9);
    run(w, 0.2, hold);
    expect(f.down).toBe(false);
    expect(f.hp).toBe(Math.round(f.maxHp * p.down.reviveHpRatio));
    expect(f.hp).toBe(15);
    w.step(dt, idle);
    expect(f.state).toBe("standby");
  });
  it("ボタンを押していなければ進まない", () => {
    const { w, f } = downedAide();
    run(w, 5);
    expect(f.reviveProgress).toBe(0);
  });
  it("途中で離すと最初からになる", () => {
    const { w, f } = downedAide();
    run(w, 2, hold);
    expect(f.reviveProgress).toBeGreaterThan(0.5);
    w.step(dt, idle);
    expect(f.reviveProgress).toBe(0);
  });
  it("途中で離しても進捗を保持する設定にできる", () => {
    const p = createDefaultParams();
    p.down.reviveKeepProgress = 1;
    const { w, f } = downedAide(p);
    run(w, 2, hold);
    const progress = f.reviveProgress;
    run(w, 1, idle);
    expect(f.reviveProgress).toBeCloseTo(progress);
    run(w, 1.1, hold);
    expect(f.down).toBe(false);
  });
  it("距離が離れていると進まない", () => {
    const { w, f, p } = downedAide();
    f.x = f.prevX = p.down.reviveRange + 40;
    run(w, 4, hold);
    expect(f.down).toBe(true);
    expect(f.reviveProgress).toBe(0);
  });
  it("対象が近くにいるときだけ、ボタンの対象が出る。最も近い者が対象になる", () => {
    const { w, f } = downedAide();
    expect(w.interactionTarget()?.familiar).toBe(f);
    const g = w.spawnFamiliar("aide");
    g.x = g.prevX = 15;
    g.y = g.prevY = 0;
    damage(g, 9999);
    w.step(dt, idle);
    expect(w.interactionTarget()?.familiar).toBe(g);
    f.x = f.prevX = 500;
    g.x = g.prevX = 500;
    expect(w.interactionTarget()).toBeNull();
  });
  it("元気なファミリアは対象にならない", () => {
    const w = new World(1, createDefaultParams());
    w.spawnFamiliar("aide");
    expect(w.interactionTarget()).toBeNull();
  });
  it("観測者が倒れているときは、助け起こしできない", () => {
    const { w, f } = downedAide();
    damage(w.watcher, 9999);
    run(w, 4, hold);
    expect(f.down).toBe(true);
  });
  it("復活したファミリアは、また戦える(攻撃を受け、再び倒れうる)", () => {
    const { w, f } = downedAide();
    run(w, 3.2, hold);
    expect(f.hp).toBeGreaterThan(0);
    damage(f, 9999);
    w.step(dt, idle);
    expect(f.down).toBe(true);
  });
});

describe("送還", () => {
  it("同行者は、戦闘不能から1.5秒後に画面から消えて拠点へ送られる", () => {
    const p = createDefaultParams();
    const w = new World(1, p);
    const c = w.spawnFamiliar("companion");
    w.spawnFamiliar("aide");
    damage(c, 9999);
    run(w, 1.3);
    expect(w.familiars).toContain(c);
    expect(c.vanishing).toBe(true);
    run(w, 0.4);
    expect(w.familiars).not.toContain(c);
    expect(w.base).toContain(c);
  });
  it("同行者は、助け起こしの対象にならない", () => {
    const w = new World(1, createDefaultParams());
    const c = w.spawnFamiliar("companion");
    c.x = c.prevX = 20;
    c.y = c.prevY = 0;
    damage(c, 9999);
    w.step(dt, idle);
    expect(w.interactionTarget()).toBeNull();
  });
  it("存在範囲の外で倒れた側近は、他に側近がいれば送還される", () => {
    const p = createDefaultParams();
    const w = new World(1, p);
    const a = w.spawnFamiliar("aide");
    w.spawnFamiliar("aide");
    a.x = a.prevX = existenceRangeOf(p) + 3000;
    a.y = a.prevY = 0;
    w.step(dt, idle);
    damage(a, 9999);
    run(w, 2);
    expect(w.base).toContain(a);
    expect(w.familiars).not.toContain(a);
  });
  it("存在範囲の外で倒れた側近でも、最後の1人なら送還されず残る", () => {
    const p = createDefaultParams();
    const w = new World(1, p);
    const a = w.spawnFamiliar("aide");
    a.x = a.prevX = existenceRangeOf(p) + 3000;
    a.y = a.prevY = 0;
    w.step(dt, idle);
    damage(a, 9999);
    run(w, 5);
    expect(w.familiars).toContain(a);
    expect(a.down).toBe(true);
    expect(a.vanishing).toBe(false);
  });
  it("存在範囲の内側で倒れた側近は、他に側近がいても送還されない", () => {
    const w = new World(1, createDefaultParams());
    const a = w.spawnFamiliar("aide");
    w.spawnFamiliar("aide");
    damage(a, 9999);
    run(w, 5);
    expect(w.familiars).toContain(a);
  });
});

describe("観測者が倒れたとき", () => {
  it("倒れてから2秒の間、ワールドは動くがプレイヤーは何もできず、その後ワールドが止まる", () => {
    const p = createDefaultParams();
    const g = new Game(1, p);
    run(g, 1);
    damage(g.world.watcher, 9999);
    g.step(dt, idle);
    expect(g.defeatTimer).not.toBeNull();
    expect(g.mode).toBe("world");
    const x = g.world.watcher.x;
    const tick = g.world.tick;
    run(g, 1.8, { moveX: 1, moveY: 0, interact: true }); // 入力は無視される
    expect(g.world.watcher.x).toBeCloseTo(x, 0);
    expect(g.world.tick).toBeGreaterThan(tick); // ワールドは動いている
    expect(g.mode).toBe("world");
    run(g, 0.4);
    expect(g.mode).toBe("ended");
    const t = g.world.tick;
    run(g, 1);
    expect(g.world.tick).toBe(t); // 止まった
  });
  it("倒れたあとは、メニューも開けない", () => {
    const g = new Game(1, createDefaultParams());
    damage(g.world.watcher, 9999);
    g.step(dt, idle);
    g.toggleOverlay();
    expect(g.mode).toBe("world");
  });
  it("やり直す(リセット)と元に戻る", () => {
    const g = new Game(1, createDefaultParams());
    damage(g.world.watcher, 9999);
    run(g, 3);
    expect(g.mode).toBe("ended");
    g.reset(2);
    expect(g.mode).toBe("world");
    expect(g.defeatTimer).toBeNull();
    expect(g.world.watcher.hp).toBe(g.world.watcher.maxHp);
  });
  it("ウェイトの長さは調整できる", () => {
    const p = createDefaultParams();
    p.run.defeatWait = 5;
    const g = new Game(1, p);
    damage(g.world.watcher, 9999);
    run(g, 4);
    expect(g.mode).toBe("world");
    run(g, 1.2);
    expect(g.mode).toBe("ended");
  });
});
