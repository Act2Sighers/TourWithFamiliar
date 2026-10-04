import { describe, expect, it } from "vitest";
import { createDefaultParams } from "../src/core/params";
import { createBody, damage, setMaxHp, shouldShowHpBar, stepMotion } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { maxHpOf, moveSpeedOf } from "../src/core/sim/stats";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const still = { moveX: 0, moveY: 0 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("能力値 → 実効数値", () => {
  it("丈夫さから最大HP、素早さから移動速度が決まる", () => {
    const p = createDefaultParams();
    expect(maxHpOf({ toughness: 10, attack: 1, agility: 1 }, p)).toBe(10 * p.stats.hpPerToughness);
    expect(moveSpeedOf({ toughness: 1, attack: 1, agility: 10 }, p)).toBe(10 * p.stats.speedPerAgility);
    expect(moveSpeedOf({ toughness: 1, attack: 1, agility: 20 }, p)).toBeGreaterThan(moveSpeedOf({ toughness: 1, attack: 1, agility: 10 }, p));
  });
  it("初期のファミリアは観測者と同じか、わずかに遅い", () => {
    const p = createDefaultParams();
    const fam = moveSpeedOf({ toughness: p.familiar.toughness, attack: p.familiar.attack, agility: p.familiar.agility }, p);
    expect(fam).toBeLessThanOrEqual(p.watcher.maxSpeed);
    expect(fam).toBeGreaterThanOrEqual(p.watcher.maxSpeed * 0.8);
  });
});

describe("HPゲージの表示規則", () => {
  it("全快のときとHP0のときは表示しない", () => {
    expect(shouldShowHpBar(100, 100)).toBe(false);
    expect(shouldShowHpBar(0, 100)).toBe(false);
    expect(shouldShowHpBar(50, 100)).toBe(true);
    expect(shouldShowHpBar(1, 100)).toBe(true);
  });
  it("ダメージはHPを0未満にしない", () => {
    const b = createBody(1, 0, 0, 10, 30);
    damage(b, 100);
    expect(b.hp).toBe(0);
  });
  it("最大HPの変更: 全快なら全快のまま追従し、そうでなければ上限に収める", () => {
    const full = createBody(1, 0, 0, 10, 100);
    setMaxHp(full, 150);
    expect(full.hp).toBe(150);
    const hurt = createBody(1, 0, 0, 10, 100);
    damage(hurt, 20);
    setMaxHp(hurt, 150);
    expect(hurt.hp).toBe(80);
    setMaxHp(hurt, 50);
    expect(hurt.hp).toBe(50);
  });
});

describe("慣性", () => {
  it("目標速度に瞬時には達せず、加速度に従って近づく", () => {
    const b = createBody(1, 0, 0, 10, 10);
    stepMotion(b, 100, 0, true, 600, 600, dt);
    expect(b.vx).toBeCloseTo(10);
    for (let i = 0; i < 60; i++) stepMotion(b, 100, 0, true, 600, 600, dt);
    expect(b.vx).toBe(100);
  });
});

describe("ファミリアの待機AI", () => {
  it("観測者が止まっていても、待機範囲内で気まぐれに動き回る(動かないままではない)", () => {
    const p = createDefaultParams();
    const w = new World(1, p);
    const f = w.spawnFamiliar("aide");
    let travelled = 0;
    let moves = 0;
    let stops = 0;
    let prevMoving = false;
    for (let i = 0; i < 60 * 120; i++) {
      w.step(dt, still);
      travelled += Math.hypot(f.x - f.prevX, f.y - f.prevY);
      const moving = Math.hypot(f.vx, f.vy) > 1;
      if (moving && !prevMoving) moves++;
      if (!moving && prevMoving) stops++;
      prevMoving = moving;
      expect(dist(f, w.watcher)).toBeLessThanOrEqual(p.familiar.standbyRange + 1);
    }
    expect(travelled).toBeGreaterThan(p.familiar.standbyRange);
    expect(moves).toBeGreaterThan(5);
    expect(stops).toBeGreaterThan(5);
  });
  it("観測者が離れて待機範囲を出たら、戻ってきて範囲内に収まる", () => {
    const p = createDefaultParams();
    const w = new World(2, p);
    const f = w.spawnFamiliar("aide");
    for (let i = 0; i < 60 * 15; i++) w.step(dt, { moveX: 1, moveY: 0 });
    expect(dist(f, w.watcher)).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 10; i++) w.step(dt, still);
    expect(dist(f, w.watcher)).toBeLessThanOrEqual(p.familiar.standbyRange + 1);
  });
  it("同じシードなら同じ動きになる", () => {
    const run = () => {
      const g = new Game(9, createDefaultParams());
      for (let i = 0; i < 1800; i++) g.step(dt, { moveX: Math.sin(i / 90), moveY: 0 });
      const f = g.world.familiars[0]!;
      return [f.x, f.y, f.wander.mode];
    };
    expect(run()).toEqual(run());
  });
  it("Gameは最初の側近を1人連れて始まる", () => {
    const g = new Game(1, createDefaultParams());
    expect(g.world.familiars).toHaveLength(1);
    expect(g.world.familiars[0]!.role).toBe("aide");
    g.reset(2);
    expect(g.world.familiars).toHaveLength(1);
  });
});
