import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const press = { moveX: 0, moveY: 0, interact: true };
const run = (w: World, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) w.step(dt, idle);
};

/** 側近 + 同行者の遠征(敵・中立個体なし) */
function party(p: Params = createDefaultParams()) {
  const w = new World(1, p);
  const aide = w.spawnFamiliar("aide");
  const c = w.spawnFamiliar("companion");
  return { w, p, aide, c };
}

describe("戦闘中は、話しかけるが出ない", () => {
  function nearFamiliar() {
    const g = new Game(1, createDefaultParams());
    g.world.neutrals.length = 0;
    g.world.enemies.length = 0;
    const aide = g.world.familiars[0]!;
    aide.wander.timer = 9999;
    aide.x = aide.prevX = 30;
    aide.y = aide.prevY = 0;
    return { g, w: g.world, aide };
  }
  it("敵がいなければ、話しかけるが出る", () => {
    const { w } = nearFamiliar();
    expect(w.interactionTarget()?.kind).toBe("talk");
    expect(w.inCombat()).toBe(false);
  });
  it("観測者が敵の攻撃対象になっている間は、出ない", () => {
    const { w } = nearFamiliar();
    const e = w.spawnEnemy(150, 0);
    w.step(dt, idle);
    expect(w.isPlayerSide(e.targetId!)).toBe(true); // 最も近い、観測者側の誰か(観測者かファミリア)
    expect(w.inCombat()).toBe(true);
    expect(w.interactionTarget()).toBeNull();
  });
  it("ファミリアが敵の攻撃対象になっている間も、出ない", () => {
    const { w, aide } = nearFamiliar();
    w.watcher.x = w.watcher.prevX = -2000; // 観測者は遠く
    aide.x = aide.prevX = -2000 + 30;
    const e = w.spawnEnemy(aide.x + 100, 0);
    w.step(dt, idle);
    expect(w.isPlayerSide(e.targetId!)).toBe(true);
    expect(w.interactionTarget()).toBeNull();
  });
  it("敵を倒したり、見失われたりして、攻撃対象でなくなれば、また出る", () => {
    const { w, aide } = nearFamiliar();
    aide.state = "standby";
    const e = w.spawnEnemy(150, 0);
    w.step(dt, idle);
    expect(w.interactionTarget()).toBeNull();
    damage(e, 9999);
    w.step(dt, idle);
    expect(w.enemies).toHaveLength(0);
    expect(w.interactionTarget()?.kind).toBe("talk");
  });
  it("中立個体を狙っている敵は、戦闘中には数えない", () => {
    const { w } = nearFamiliar();
    w.watcher.x = w.watcher.prevX = 0;
    const n = w.spawnNeutral(2000, 2000);
    n.wander.timer = 9999;
    const e = w.spawnEnemy(2050, 2000);
    w.step(dt, idle);
    expect(w.isPlayerSide(e.targetId ?? -1)).toBe(false);
    expect(w.inCombat()).toBe(false);
    expect(w.interactionTarget()?.kind).toBe("talk");
  });
  it("戦闘中でも、雇用と助け起こしのボタンは、これまでどおり出る", () => {
    const { w, aide } = nearFamiliar();
    aide.x = aide.prevX = 300; // 話しかける範囲の外
    const n = w.spawnNeutral(40, 0);
    n.wander.timer = 9999;
    w.spawnEnemy(0, 200); // 観測者を狙う(中立個体の反応範囲の外)
    w.step(dt, idle);
    expect(w.inCombat()).toBe(true);
    expect(w.interactionTarget()?.kind).toBe("hire");
  });
  it("戦闘中に押しても、話しかけるダイアログは開かない", () => {
    const { g, w } = nearFamiliar();
    w.spawnEnemy(150, 0);
    g.step(dt, idle);
    g.step(dt, press);
    expect(g.mode).toBe("world");
  });
});

describe("召喚・送還の演出", () => {
  it("送還すると、消える場所に「消える」演出が出る", () => {
    const { w, c } = party();
    c.x = c.prevX = 50;
    c.y = c.prevY = -20;
    expect(w.dispatchToBase(c.id)).toBe(true);
    expect(w.effects).toHaveLength(1);
    const e = w.effects[0]!;
    expect(e.kind).toBe("vanish");
    expect([e.x, e.y]).toEqual([50, -20]);
    expect(e.role).toBe("companion");
    expect(e.age).toBe(0);
  });
  it("召喚すると、現れる位置に「現れる」演出が出る", () => {
    const { w, aide, c } = party();
    w.spawnFamiliar("aide");
    w.dispatchToBase(aide.id);
    w.effects.length = 0;
    aide.hp = aide.maxHp;
    expect(w.summonFromBase(aide.id)).toBe("ok");
    expect(w.effects).toHaveLength(1);
    const e = w.effects[0]!;
    expect(e.kind).toBe("appear");
    expect([e.x, e.y]).toEqual([aide.x, aide.y]);
    expect(e.targetId).toBe(aide.id);
    void c;
  });
  it("強制送還(戦闘不能の同行者が消える瞬間)でも、演出が出る", () => {
    const { w, c } = party();
    damage(c, 9999);
    run(w, 1.4);
    expect(w.effects).toHaveLength(0); // まだ薄くなっている途中
    run(w, 0.4);
    expect(w.base.members).toContain(c);
    expect(w.effects.some((e) => e.kind === "vanish" && e.targetId === c.id)).toBe(true);
  });
  it("拒否された召喚や送還では、演出は出ない", () => {
    const { w, aide } = party();
    w.dispatchToBase(aide.id); // 最後の側近は送還できない
    expect(w.effects).toHaveLength(0);
    expect(w.summonFromBase(9999)).toBe("not_found");
    expect(w.effects).toHaveLength(0);
  });
  it("ほかの理由での出現・消失(雇用、中立個体や敵のスポーン、敵の撃破)では、演出は出ない", () => {
    const { w } = party();
    const n = w.spawnNeutral(30, 0);
    n.wander.timer = 9999;
    w.spawnEnemy(900, 900);
    w.hireNeutral(n.id);
    const e = w.spawnEnemy(60, 0);
    damage(e, 9999);
    run(w, 0.5);
    expect(w.effects).toHaveLength(0);
  });
  it("演出は、設定した長さが経つと消える", () => {
    const { w, c, p } = party();
    w.dispatchToBase(c.id);
    run(w, p.effects.teleportDuration - 0.1);
    expect(w.effects).toHaveLength(1);
    run(w, 0.2);
    expect(w.effects).toHaveLength(0);
  });
  it("演出は、ワールドの時間で進む(ワールドが止まっている間は進まない)", () => {
    const g = new Game(1, createDefaultParams());
    g.world.enemies.length = 0;
    g.world.neutrals.length = 0;
    const c = g.world.spawnFamiliar("companion");
    g.world.dispatchToBase(c.id);
    g.toggleOverlay();
    for (let i = 0; i < 120; i++) g.step(dt, idle);
    expect(g.world.effects[0]!.age).toBe(0);
    g.toggleOverlay();
    for (let i = 0; i < 6; i++) g.step(dt, idle);
    expect(g.world.effects[0]!.age).toBeGreaterThan(0);
  });
  it("召喚された個体は、演出の前半で、徐々に現れる", () => {
    const { w, aide } = party();
    w.spawnFamiliar("aide");
    w.dispatchToBase(aide.id);
    aide.hp = aide.maxHp;
    w.summonFromBase(aide.id);
    expect(w.appearAlpha(aide.id)).toBe(0);
    run(w, w.params.effects.teleportDuration * 0.25);
    expect(w.appearAlpha(aide.id)).toBeGreaterThan(0.3);
    expect(w.appearAlpha(aide.id)).toBeLessThan(0.7);
    run(w, w.params.effects.teleportDuration * 0.3);
    expect(w.appearAlpha(aide.id)).toBe(1);
    expect(w.appearAlpha(12345)).toBe(1); // 演出の無い個体は、常に見える
  });
  it("演出があっても、シミュレーションの結果は変わらない(決定的)", () => {
    const sim = () => {
      const g = new Game(5, createDefaultParams());
      g.world.spawnFamiliar("companion");
      g.world.dispatchToBase(g.world.familiars[1]!.id);
      for (let i = 0; i < 60 * 5; i++) g.step(dt, { moveX: Math.sin(i / 90), moveY: 0 });
      return JSON.stringify([g.world.watcher.x, g.world.familiars.map((f) => [f.x, f.hp]), g.world.effects.length]);
    };
    expect(sim()).toBe(sim());
  });
});
