import { describe, expect, it } from "vitest";
import { applyDeadzone } from "../src/core/input";
import { createDefaultParams, mergeParams } from "../src/core/params";
import { Rng, hash2 } from "../src/core/rng";
import { Game } from "../src/core/sim/game";
import { World } from "../src/core/sim/world";
import { FixedStepper } from "../src/core/stepper";

describe("rng", () => {
  it("同じシードで同じ列になる", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("値が [0,1) に収まる", () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("hash2 は決定的で座標ごとに異なる", () => {
    expect(hash2(1, 3, 4)).toBe(hash2(1, 3, 4));
    expect(hash2(1, 3, 4)).not.toBe(hash2(1, 4, 3));
    expect(hash2(1, -1, -1)).not.toBe(hash2(1, 1, 1));
  });
});

describe("FixedStepper", () => {
  it("経過時間に応じたステップ数を返す", () => {
    const s = new FixedStepper(60);
    let total = 0;
    for (let i = 0; i < 60; i++) total += s.advance(1 / 60).steps;
    expect(total).toBe(60);
  });
  it("処理落ちでも1フレームの最大ステップ数を超えない", () => {
    const s = new FixedStepper(60, 5);
    expect(s.advance(10).steps).toBe(5);
  });
  it("端数は alpha として持ち越す", () => {
    const s = new FixedStepper(60);
    const r = s.advance(1 / 60 / 2);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.5);
  });
});

describe("applyDeadzone", () => {
  it("遊びの内側は0になる", () => {
    expect(applyDeadzone(0.1, 0, 0.15)).toEqual({ moveX: 0, moveY: 0 });
  });
  it("最大まで倒すと長さ1になる", () => {
    const r = applyDeadzone(1, 1, 0.15);
    expect(Math.hypot(r.moveX, r.moveY)).toBeCloseTo(1);
  });
});

describe("World", () => {
  const dt = 1 / 60;
  it("斜め移動が最高速度を超えない", () => {
    const p = createDefaultParams();
    const w = new World(1, p);
    for (let i = 0; i < 120; i++) w.step(dt, { moveX: 1, moveY: 1 });
    const speed = Math.hypot(w.watcher.vx, w.watcher.vy);
    expect(speed).toBeCloseTo(p.watcher.maxSpeed);
  });
  it("入力を離すと停止する", () => {
    const w = new World(1, createDefaultParams());
    for (let i = 0; i < 60; i++) w.step(dt, { moveX: 1, moveY: 0 });
    for (let i = 0; i < 120; i++) w.step(dt, { moveX: 0, moveY: 0 });
    expect(w.watcher.vx).toBe(0);
  });
  it("同じシードと入力列で結果が完全に一致する", () => {
    const run = () => {
      const w = new World(7, createDefaultParams());
      for (let i = 0; i < 600; i++) w.step(dt, { moveX: Math.sin(i / 30), moveY: Math.cos(i / 50) });
      return [w.watcher.x, w.watcher.y];
    };
    expect(run()).toEqual(run());
  });
  it("チャンクは座標とシードから決定的に生成され、遠方は破棄される", () => {
    const p = createDefaultParams();
    const w = new World(5, p);
    const first = JSON.stringify(w.chunks.get(3, -2).decor);
    w.chunks.prune(100, 100);
    expect(w.chunks.count).toBe(0);
    expect(JSON.stringify(w.chunks.get(3, -2).decor)).toBe(first);
    expect(w.chunks.get(3, -2).decor).toHaveLength(p.world.decorPerChunk);
  });
});

describe("Game", () => {
  it("オーバーレイ中はワールドが完全に停止する", () => {
    const g = new Game(1, createDefaultParams());
    g.step(1 / 60, { moveX: 1, moveY: 0 });
    const tick = g.world.tick;
    g.toggleOverlay();
    for (let i = 0; i < 100; i++) g.step(1 / 60, { moveX: 1, moveY: 0 });
    expect(g.world.tick).toBe(tick);
    g.toggleOverlay();
    g.step(1 / 60, { moveX: 1, moveY: 0 });
    expect(g.world.tick).toBe(tick + 1);
  });
});

describe("mergeParams", () => {
  it("既知の数値だけを取り込み、未知キーや不正値は無視する", () => {
    const p = createDefaultParams();
    mergeParams(p, { watcher: { maxSpeed: 99, bogus: 1, radius: "x" }, nope: { a: 1 } });
    expect(p.watcher.maxSpeed).toBe(99);
    expect(p.watcher.radius).toBe(createDefaultParams().watcher.radius);
    expect((p.watcher as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });
});
