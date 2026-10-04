import { describe, expect, it } from "vitest";
import { createDefaultParams } from "../src/core/params";
import { createBody, damage, distance } from "../src/core/sim/body";
import { resolveCollisions } from "../src/core/sim/collision";
import { World } from "../src/core/sim/world";

const p = createDefaultParams();

describe("押し合い", () => {
  it("重なっていなければ動かさない", () => {
    const a = createBody(1, 0, 0, 10, 1);
    const b = createBody(2, 30, 0, 10, 1);
    resolveCollisions([a, b], p);
    expect([a.x, b.x]).toEqual([0, 30]);
  });
  it("同じ大きさなら、同じだけ押し離される", () => {
    const a = createBody(1, 0, 0, 10, 1);
    const b = createBody(2, 10, 0, 10, 1);
    resolveCollisions([a, b], p);
    expect(distance(a, b)).toBeCloseTo(20);
    expect(a.x).toBeCloseTo(-5);
    expect(b.x).toBeCloseTo(15);
  });
  it("大きいほど動かされにくい", () => {
    const big = createBody(1, 0, 0, 20, 1);
    const small = createBody(2, 15, 0, 10, 1);
    resolveCollisions([big, small], p);
    expect(distance(big, small)).toBeCloseTo(30);
    expect(Math.abs(big.x)).toBeLessThan(Math.abs(small.x - 15));
    // 質量は半径の2乗: 比は 1 : 4
    expect(Math.abs(small.x - 15) / Math.abs(big.x)).toBeCloseTo(4);
  });
  it("完全に重なっていても、決まった方向へ離れる", () => {
    const a = createBody(1, 5, 5, 10, 1);
    const b = createBody(2, 5, 5, 10, 1);
    resolveCollisions([a, b], p);
    expect(distance(a, b)).toBeGreaterThanOrEqual(19.99);
  });
  it("動かない側の規則: 動かない側は動かず、相手が重なりを全部解消する", () => {
    const a = createBody(1, 0, 0, 10, 1);
    const b = createBody(2, 10, 0, 10, 1);
    resolveCollisions([a, b], p, (x) => x === a);
    expect(a.x).toBe(0);
    expect(b.x).toBeCloseTo(20);
  });
  it("両方が動かない組は、押し合わない", () => {
    const a = createBody(1, 0, 0, 10, 1);
    const b = createBody(2, 10, 0, 10, 1);
    resolveCollisions([a, b], p, () => true);
    expect([a.x, b.x]).toEqual([0, 10]);
  });
  it("無効にできる", () => {
    const q = createDefaultParams();
    q.collision.enabled = 0;
    const a = createBody(1, 0, 0, 10, 1);
    const b = createBody(2, 5, 0, 10, 1);
    resolveCollisions([a, b], q);
    expect(distance(a, b)).toBe(5);
  });
  it("3体以上が重なっても、ほぼ解消する", () => {
    const bodies = [createBody(1, 0, 0, 10, 1), createBody(2, 4, 0, 10, 1), createBody(3, 8, 3, 10, 1)];
    resolveCollisions(bodies, p);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(distance(bodies[i]!, bodies[j]!)).toBeGreaterThan(18);
  });
});

describe("ワールドでの押し合い", () => {
  const dt = 1 / 60;
  it("観測者は、ファミリアに押されない(ファミリアが全部よける)。歩いても速さは変わらない", () => {
    const q = createDefaultParams();
    const free = new World(1, q);
    const w = new World(1, q);
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = 30;
    f.y = f.prevY = 0;
    f.wander.timer = 999; // 立ち止まったまま
    for (let i = 0; i < 60; i++) {
      free.step(dt, { moveX: 1, moveY: 0 });
      w.step(dt, { moveX: 1, moveY: 0 });
    }
    expect(f.x).toBeGreaterThan(30); // ファミリアは押された
    expect(w.watcher.x).toBeCloseTo(free.watcher.x, 6); // 観測者はファミリアがいない場合と同じ
  });
  it("立ち止まっている観測者に、待機中のファミリアが重なっても、観測者は動かない", () => {
    const w = new World(1, createDefaultParams());
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = 5;
    f.y = f.prevY = 0;
    f.wander.timer = 999;
    for (let i = 0; i < 120; i++) w.step(dt, { moveX: 0, moveY: 0 });
    expect(w.watcher.x).toBe(0);
    expect(w.watcher.y).toBe(0);
    expect(distance(f, w.watcher)).toBeGreaterThanOrEqual(f.radius + w.watcher.radius - 0.01);
  });
  it("立ち止まっている観測者は、ファミリアが5分間うろついても、まったく動かない", () => {
    const q = createDefaultParams();
    q.familiar.standbyRange = 30; // 待機範囲を狭くして、観測者に重なりやすくする
    const w = new World(3, q);
    w.spawnFamiliar("aide");
    w.spawnFamiliar("companion");
    for (let i = 0; i < 60 * 300; i++) w.step(dt, { moveX: 0, moveY: 0 });
    expect(w.watcher.x).toBe(0);
    expect(w.watcher.y).toBe(0);
  });
  it("観測者と他の存在(敵・中立個体)の押し合いは、これまでどおり大きさで決まる", () => {
    const w = new World(1, createDefaultParams());
    const n = w.spawnNeutral(10, 0);
    n.wander.timer = 999;
    w.step(dt, { moveX: 0, moveY: 0 });
    expect(w.watcher.x).toBeLessThan(0); // 観測者も少し押される
    expect(n.x).toBeGreaterThan(10);
  });
  it("戦闘不能のキャラクターは押し合いに参加しない", () => {
    const w = new World(1, createDefaultParams());
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = 5;
    f.y = f.prevY = 0;
    damage(f, 9999);
    w.step(dt, { moveX: 0, moveY: 0 });
    expect(f.x).toBeCloseTo(5);
    expect(w.watcher.x).toBeCloseTo(0);
  });
});
