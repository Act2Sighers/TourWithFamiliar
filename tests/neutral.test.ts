import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage, distance } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { engageRangeOf, existenceRangeOf, reactionRangeOf } from "../src/core/sim/ranges";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const run = (w: { step(dt: number, i: typeof idle): void }, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) w.step(dt, idle);
};
const quiet = (p: Params = createDefaultParams()) => ({ w: new World(1, p), p });

describe("中立個体のスポーンと徘徊", () => {
  it("初期配置は、敵より少ない数の中立個体が固定で出る", () => {
    const p = createDefaultParams();
    const g = new Game(1, p);
    expect(g.world.neutrals).toHaveLength(p.neutral.initialCount);
    expect(g.world.neutrals.length).toBeLessThan(g.world.enemies.length);
    for (const n of g.world.neutrals) {
      const d = Math.hypot(n.x, n.y);
      expect(d).toBeGreaterThanOrEqual(p.neutral.spawnMin - 1);
      expect(d).toBeLessThanOrEqual(p.neutral.spawnMax + 1);
    }
  });
  it("敵がいなければ、立ち止まったり歩いたりを繰り返す(その場に固まらない)", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(800, 0);
    let moved = 0;
    let moves = 0;
    let prev = false;
    for (let i = 0; i < 60 * 30; i++) {
      w.step(dt, idle);
      moved += Math.hypot(n.x - n.prevX, n.y - n.prevY);
      const moving = Math.hypot(n.vx, n.vy) > 1;
      if (moving && !prev) moves++;
      prev = moving;
    }
    expect(moved).toBeGreaterThan(50);
    expect(moves).toBeGreaterThan(2);
    expect(n.state).toBe("wander");
  });
  it("観測者や敵がいても、ファミリアには雇われるまで反応しない(臨戦にならない)", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(60, 0);
    w.spawnFamiliar("aide");
    run(w, 3);
    expect(n.state).toBe("wander");
  });
});

describe("敵と中立個体の反応", () => {
  it("敵は、反応範囲の内側にいる中立個体に対して臨戦になる", () => {
    const { w, p } = quiet();
    w.watcher.x = w.watcher.prevX = -5000; // 観測者は遠く
    const n = w.spawnNeutral(0, 0);
    const e = w.spawnEnemy(reactionRangeOf(p) - 10, 0);
    w.step(dt, idle);
    expect(e.state).toBe("engaged");
    expect(e.targetId).toBe(n.id);
  });
  it("反応範囲の外(索敵範囲の内側)にいる中立個体には、反応しない", () => {
    const { w, p } = quiet();
    w.watcher.x = w.watcher.prevX = -5000;
    w.spawnNeutral(0, 0);
    const e = w.spawnEnemy(reactionRangeOf(p) + 40, 0); // 索敵範囲(2倍)の内側だが反応範囲の外
    w.step(dt, idle);
    expect(e.state).toBe("wander");
  });
  it("観測者のほうは索敵範囲(2倍)で認識される。中立個体と比べて近いほうを狙う", () => {
    const { w, p } = quiet();
    w.watcher.x = w.watcher.prevX = 0;
    w.watcher.y = w.watcher.prevY = 0;
    const e = w.spawnEnemy(reactionRangeOf(p) + 60, 0);
    const n = w.spawnNeutral(e.x + 50, 0); // 敵から50離れた中立個体は、観測者(180)より近い
    w.step(dt, idle);
    expect(e.state).toBe("engaged");
    expect(e.targetId).toBe(n.id);
  });
  it("敵は、自身を中心とした応戦範囲の外へ中立個体が出たら見失う", () => {
    const { w, p } = quiet();
    w.watcher.x = w.watcher.prevX = -5000;
    const n = w.spawnNeutral(0, 0);
    const e = w.spawnEnemy(80, 0);
    w.step(dt, idle);
    expect(e.state).toBe("engaged");
    n.x = n.prevX = engageRangeOf(p) + 200;
    w.step(dt, idle);
    expect(e.state).toBe("wander");
  });
  it("中立個体は、自分に臨戦した敵に対して臨戦になり、反撃する", () => {
    const { w } = quiet();
    w.watcher.x = w.watcher.prevX = -5000;
    const n = w.spawnNeutral(0, 0);
    const e = w.spawnEnemy(80, 0);
    w.step(dt, idle); // 敵が臨戦になる
    w.step(dt, idle); // 中立個体が反応する
    expect(n.state).toBe("engaged");
    expect(n.targetId).toBe(e.id);
    run(w, 10);
    // どちらかが倒れるまで戦う。中立個体も敵に損害を与えている
    expect(e.hp < e.maxHp || w.enemies.length === 0).toBe(true);
  });
  it("敵が自分以外(観測者)を狙っているだけでは、中立個体は臨戦にならない", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(500, 500);
    w.spawnEnemy(120, 0); // 観測者を狙う
    run(w, 1);
    expect(n.state).toBe("wander");
  });
  it("中立個体は、敵が応戦範囲の外へ出たら見失う", () => {
    const { w, p } = quiet();
    w.watcher.x = w.watcher.prevX = -5000;
    const n = w.spawnNeutral(0, 0);
    const e = w.spawnEnemy(80, 0);
    w.step(dt, idle);
    w.step(dt, idle);
    expect(n.state).toBe("engaged");
    e.x = e.prevX = engageRangeOf(p) + 200;
    w.step(dt, idle);
    expect(n.state).toBe("wander");
  });
});

describe("ファミリアの迎撃との関係", () => {
  it("中立個体を狙っている敵には、ファミリアは迎撃しない", () => {
    const { w } = quiet();
    const f = w.spawnFamiliar("aide");
    w.spawnNeutral(200, 0);
    w.spawnEnemy(260, 0); // 観測者までは遠く、中立個体の反応範囲内
    w.watcher.x = w.watcher.prevX = 0;
    run(w, 1);
    expect(w.enemies[0]!.targetId).not.toBeNull();
    expect(w.isPlayerSide(w.enemies[0]!.targetId!)).toBe(false);
    expect(f.state).toBe("standby");
  });
  it("観測者側を狙う敵には、これまでどおり迎撃する", () => {
    const { w } = quiet();
    const f = w.spawnFamiliar("aide");
    w.spawnEnemy(150, 0);
    run(w, 0.2);
    expect(f.state).toBe("intercept");
  });
});

describe("戦闘不能の中立個体", () => {
  it("その場に残り、敵に狙われず、雇用の対象にもならない(動かない)", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(100, 0);
    damage(n, 9999);
    const e = w.spawnEnemy(160, 0);
    run(w, 3);
    expect(w.neutrals).toContain(n);
    expect(Math.hypot(n.vx, n.vy)).toBe(0);
    expect(e.targetId).not.toBe(n.id);
  });
  it("押し合いに参加しない", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(5, 0);
    damage(n, 9999);
    w.step(dt, idle);
    expect(n.x).toBeCloseTo(5);
  });
  it("観測者を中心とした存在範囲の外に出たら、消える。範囲の内側なら残る", () => {
    const { w, p } = quiet();
    const near = w.spawnNeutral(300, 0);
    const far = w.spawnNeutral(existenceRangeOf(p) + 500, 0);
    damage(near, 9999);
    damage(far, 9999);
    w.step(dt, idle);
    expect(w.neutrals).toContain(near);
    expect(w.neutrals).not.toContain(far);
  });
  it("生きている中立個体は、存在範囲の外でも消えない", () => {
    const { w, p } = quiet();
    const far = w.spawnNeutral(existenceRangeOf(p) + 500, 0);
    run(w, 1);
    expect(w.neutrals).toContain(far);
  });
});

describe("押し合いと決定性", () => {
  it("中立個体も他の存在と押し合う(生きている間)", () => {
    const { w } = quiet();
    const n = w.spawnNeutral(10, 0);
    n.wander.timer = 999;
    w.step(dt, idle);
    expect(distance(n, w.watcher)).toBeGreaterThanOrEqual(n.radius + w.watcher.radius - 0.01);
  });
  it("中立個体がいても、同じシードと入力なら結果が完全に一致する", () => {
    const sim = () => {
      const g = new Game(5, createDefaultParams());
      for (let i = 0; i < 60 * 40; i++) g.step(dt, { moveX: Math.sin(i / 120), moveY: Math.cos(i / 200) });
      return JSON.stringify([g.world.neutrals.map((n) => [n.x, n.hp, n.state]), g.world.enemies.map((e) => [e.x, e.hp])]);
    };
    expect(sim()).toBe(sim());
  });
});
