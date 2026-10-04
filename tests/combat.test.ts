import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { createCombat, hitCircle, stepCombat, tryStartAttack } from "../src/core/sim/combat";
import { Game } from "../src/core/sim/game";
import { detectRangeOf, engageRangeOf, existenceRangeOf } from "../src/core/sim/ranges";
import { attackPowerOf } from "../src/core/sim/stats";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const still = { moveX: 0, moveY: 0 };
const run = (w: World, seconds: number, input = still) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) w.step(dt, input);
};
/** 敵の出現を使わない、静かなワールド */
const quiet = (p: Params = createDefaultParams()) => {
  const w = new World(1, p);
  return { w, p };
};

describe("範囲の倍率", () => {
  it("存在範囲=待機範囲の15倍、応戦範囲=3倍、索敵範囲=2倍(初期値)", () => {
    const p = createDefaultParams();
    expect(existenceRangeOf(p)).toBe(p.familiar.standbyRange * 15);
    expect(engageRangeOf(p)).toBe(p.familiar.standbyRange * 3);
    expect(detectRangeOf(p)).toBe(p.familiar.standbyRange * 2);
  });
});

describe("攻撃の流れ(前隙 → 持続 → 後隙)", () => {
  const p = createDefaultParams();
  const w = p.unarmed;
  it("ヒット判定は持続の間だけ出る。攻撃間隔が過ぎるまで次は始められない", () => {
    const c = createCombat();
    const body = { id: 1, x: 0, y: 0, vx: 0, vy: 0, prevX: 0, prevY: 0, facing: 0, radius: 10, hp: 1, maxHp: 1, name: "" };
    expect(tryStartAttack(c, w, 0)).toBe(true);
    expect(tryStartAttack(c, w, 0)).toBe(false);
    const seen: string[] = [];
    let activeTime = 0;
    for (let t = 0; t < w.interval + 0.2; t += dt) {
      stepCombat(c, w, dt);
      if (seen[seen.length - 1] !== c.phase) seen.push(c.phase);
      if (hitCircle(body, c, w)) activeTime += dt;
    }
    expect(seen).toEqual(["windup", "active", "recovery", "ready"]);
    expect(activeTime).toBeCloseTo(w.active, 1);
    expect(tryStartAttack(c, w, 0)).toBe(true);
  });
  it("ヒット判定はキャラクターの前方(開始時の向き)に出る", () => {
    const c = createCombat();
    const body = { id: 1, x: 100, y: 50, vx: 0, vy: 0, prevX: 0, prevY: 0, facing: 0, radius: 10, hp: 1, maxHp: 1, name: "" };
    tryStartAttack(c, w, Math.PI / 2); // 下向き
    c.phase = "active";
    const h = hitCircle(body, c, w)!;
    expect(h.x).toBeCloseTo(100);
    expect(h.y).toBeCloseTo(50 + w.offset);
    expect(h.r).toBe(w.hitRadius);
  });
});

describe("ダメージ", () => {
  it("攻撃威力 = 武器の基礎値 × 攻撃力の係数。防御による軽減は無い", () => {
    const p = createDefaultParams();
    expect(attackPowerOf({ toughness: 1, attack: 10, agility: 1 }, p.unarmed, p)).toBe(10);
    expect(attackPowerOf({ toughness: 1, attack: 20, agility: 1 }, p.unarmed, p)).toBe(20);
  });
  it("1回の攻撃で、同じ相手には1回だけ当たる", () => {
    const { w, p } = quiet();
    p.familiar.standbyRange = 120;
    const e = w.spawnEnemy(60, 0);
    e.state = "engaged";
    e.targetId = w.watcher.id;
    // 観測者の真横で敵に攻撃させ、1回の攻撃での被ダメージを測る
    w.watcher.x = w.watcher.prevX = 40;
    let hits = 0;
    let last = w.watcher.hp;
    for (let i = 0; i < 60 * 1.4; i++) {
      w.step(dt, still);
      if (w.watcher.hp < last) hits++;
      last = w.watcher.hp;
    }
    expect(hits).toBeLessThanOrEqual(1);
  });
});

describe("敵: 徘徊と臨戦", () => {
  it("索敵範囲の外では徘徊を続け、その場でじっとしていない", () => {
    const { w, p } = quiet();
    const e = w.spawnEnemy(detectRangeOf(p) + 300, 0);
    let moved = 0;
    for (let i = 0; i < 60 * 30; i++) {
      w.step(dt, still);
      moved += Math.hypot(e.x - e.prevX, e.y - e.prevY);
    }
    expect(moved).toBeGreaterThan(50);
  });
  it("索敵範囲に入ったら臨戦になり、最も近い相手を狙う", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = 1000;
    f.y = f.prevY = 0;
    f.lost = true;
    const e = w.spawnEnemy(detectRangeOf(p) - 10, 0);
    w.step(dt, still);
    expect(e.state).toBe("engaged");
    expect(e.targetId).toBe(w.watcher.id);
  });
  it("索敵範囲より少し外なら臨戦にならない", () => {
    const { w, p } = quiet();
    const e = w.spawnEnemy(detectRangeOf(p) + 30, 0);
    w.step(dt, still);
    expect(e.state).toBe("wander");
  });
  it("攻撃対象が応戦範囲の外に出たら見失って徘徊に戻る", () => {
    const { w, p } = quiet();
    const e = w.spawnEnemy(100, 0);
    w.step(dt, still);
    expect(e.state).toBe("engaged");
    w.watcher.x = w.watcher.prevX = -(engageRangeOf(p) + 50);
    w.step(dt, still);
    expect(e.state).toBe("wander");
    expect(e.targetId).toBeNull();
  });
  it("敵は戦闘不能のキャラクターを攻撃対象にしない", () => {
    const { w } = quiet();
    damage(w.watcher, 9999);
    const e = w.spawnEnemy(80, 0);
    w.step(dt, still);
    expect(e.state).toBe("wander");
  });
});

describe("存在範囲", () => {
  it("存在範囲の外のファミリアは、敵に狙われず、迎撃にもならない", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = existenceRangeOf(p) + 100;
    f.y = f.prevY = 0;
    const e = w.spawnEnemy(f.x + 80, 0);
    e.state = "engaged";
    e.targetId = w.watcher.id;
    w.step(dt, still);
    expect(f.lost).toBe(true);
    expect(e.state).toBe("wander"); // 対象のファミリアは見えず、観測者は応戦範囲の外
    expect(f.state).toBe("standby");
    // 臨戦中の別の敵がいても迎撃にならない
    const e2 = w.spawnEnemy(w.watcher.x + 50, 0);
    w.step(dt, still);
    expect(e2.state).toBe("engaged");
    expect(f.state).toBe("standby");
  });
  it("存在範囲の外では、観測者の最高速度の1.5倍(迷子速度)で戻ってくる。観測者が止まっていても同じ", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    f.abilities = { toughness: 10, attack: 10, agility: 1 }; // 本来の速度は遅い
    f.x = f.prevX = existenceRangeOf(p) + 3000; // 数秒では範囲内に戻れない距離
    f.y = f.prevY = 0;
    const lost = p.watcher.maxSpeed * p.familiar.lostSpeedRatio;
    run(w, 2); // 観測者は止まっている
    expect(f.lost).toBe(true);
    expect(Math.hypot(f.vx, f.vy)).toBeCloseTo(lost, 0);
    run(w, 2, { moveX: 0, moveY: 1 }); // 観測者が動いていても、見るのは最高速度
    expect(f.lost).toBe(true);
    expect(Math.hypot(f.vx, f.vy)).toBeCloseTo(lost, 0);
  });
  it("存在範囲の中では本来の速度に戻る", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    f.x = f.prevX = existenceRangeOf(p) - 300;
    f.y = f.prevY = 0;
    run(w, 3);
    expect(f.lost).toBe(false);
    expect(Math.hypot(f.vx, f.vy)).toBeLessThanOrEqual(p.familiar.agility * p.stats.speedPerAgility + 0.5);
  });
});

describe("ファミリアの迎撃", () => {
  it("敵が臨戦になったら迎撃になり、待機範囲を無視して向かい、倒したら待機に戻る", () => {
    const { w, p } = quiet();
    p.enemy.agility = 1; // 敵がゆっくり近づくので、ファミリアは待機範囲の外で迎え撃つことになる
    const f = w.spawnFamiliar("aide");
    w.spawnEnemy(230, 0);
    let intercepted = false;
    let wentBeyondStandby = false;
    for (let i = 0; i < 60 * 60 && w.enemies.length > 0; i++) {
      w.step(dt, still);
      if (f.state === "intercept") intercepted = true;
      if (Math.hypot(f.x - w.watcher.x, f.y - w.watcher.y) > p.familiar.standbyRange) wentBeyondStandby = true;
    }
    expect(intercepted).toBe(true);
    expect(wentBeyondStandby).toBe(true);
    expect(w.enemies).toHaveLength(0);
    w.step(dt, still);
    expect(f.state).toBe("standby");
    expect(f.targetId).toBeNull();
  });
  it("迎撃中は、狙っている敵に集中する(別の敵が近くにいても標的を替えない)", () => {
    const { w } = quiet();
    const f = w.spawnFamiliar("aide");
    const a = w.spawnEnemy(150, 0);
    w.step(dt, still); // 敵が臨戦になる
    w.step(dt, still); // ファミリアが反応する
    expect(f.targetId).toBe(a.id);
    const b = w.spawnEnemy(f.x + 20, f.y + 20); // ファミリアのすぐ近く
    b.state = "engaged";
    b.targetId = w.watcher.id;
    for (let i = 0; i < 30; i++) w.step(dt, still);
    expect(f.targetId).toBe(a.id);
  });
  it("敵が臨戦でなくなり、かつ応戦範囲(観測者中心)の外へ出たら迎撃を解除する", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    const e = w.spawnEnemy(150, 0);
    w.step(dt, still);
    w.step(dt, still);
    expect(f.state).toBe("intercept");
    // 敵を応戦範囲の外へ移し、臨戦を解く
    e.x = e.prevX = engageRangeOf(p) + 100;
    e.y = e.prevY = 0;
    e.state = "wander";
    e.targetId = null;
    w.watcher.x = w.watcher.prevX = 0;
    w.step(dt, still);
    expect(f.state).toBe("standby");
  });
  it("敵が臨戦でなくても、応戦範囲の内側にいる間は迎撃を続ける", () => {
    const { w, p } = quiet();
    const f = w.spawnFamiliar("aide");
    const e = w.spawnEnemy(150, 0);
    w.step(dt, still);
    w.step(dt, still);
    e.x = e.prevX = engageRangeOf(p) - 50;
    e.y = e.prevY = 0;
    e.state = "wander";
    e.targetId = null;
    w.step(dt, still);
    expect(f.state).toBe("intercept");
  });
  it("HP0のファミリアは行動せず、迎撃もしない", () => {
    const { w } = quiet();
    const f = w.spawnFamiliar("aide");
    damage(f, 9999);
    w.spawnEnemy(100, 0);
    run(w, 1);
    expect(f.state).toBe("standby");
    expect(Math.hypot(f.vx, f.vy)).toBe(0);
  });
});

describe("全体", () => {
  it("Gameは最初の側近1人と、周囲の敵数体で始まる", () => {
    const p = createDefaultParams();
    const g = new Game(1, p);
    expect(g.world.familiars).toHaveLength(1);
    expect(g.world.enemies).toHaveLength(p.enemy.initialCount);
    for (const e of g.world.enemies) {
      const d = Math.hypot(e.x, e.y);
      expect(d).toBeGreaterThanOrEqual(p.enemy.spawnMin - 1);
      expect(d).toBeLessThanOrEqual(p.enemy.spawnMax + 1);
    }
  });
  it("敵がいても、同じシードと入力なら結果が完全に一致する", () => {
    const sim = () => {
      const g = new Game(5, createDefaultParams());
      for (let i = 0; i < 60 * 40; i++) g.step(dt, { moveX: Math.sin(i / 120), moveY: Math.cos(i / 200) });
      const w = g.world;
      return JSON.stringify([w.watcher.x, w.watcher.hp, w.familiars.map((f) => [f.x, f.hp, f.state]), w.enemies.map((e) => [e.x, e.hp, e.state])]);
    };
    expect(sim()).toBe(sim());
  });
});
