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

/** 側近1人 + 同行者n人。敵も中立個体もいない */
function party(companions: number, p: Params = createDefaultParams()) {
  const w = new World(1, p);
  const aide = w.spawnFamiliar("aide");
  const cs = Array.from({ length: companions }, () => w.spawnFamiliar("companion"));
  return { w, p, aide, cs };
}

describe("拠点の容量", () => {
  it("容量は20人(初期値)で、同行中のファミリアも含めた総数で数える", () => {
    const { w, p } = party(2);
    expect(p.base.capacity).toBe(20);
    expect(w.totalFamiliars()).toBe(3);
    w.dispatchToBase(w.familiars[1]!.id);
    expect(w.familiars).toHaveLength(2);
    expect(w.base.size).toBe(1);
    expect(w.totalFamiliars()).toBe(3); // 送還しても総数は変わらない
  });
  it("総数が容量に達すると、同行に空きがあっても、新しい雇用はできない", () => {
    const { w, p } = party(1);
    // 総数を20にする(同行は2人のまま、残りは拠点へ)
    while (w.totalFamiliars() < p.base.capacity) {
      const extra = w.spawnFamiliar("companion");
      w.familiars = w.familiars.filter((f) => f !== extra);
      w.base.receive(extra, p);
    }
    expect(w.familiars).toHaveLength(2);
    expect(w.partyHasRoom("companion")).toBe(true);
    expect(w.baseHasRoom()).toBe(false);
    expect(w.familiarAddBlock("companion")).toBe("base");
    const n = w.spawnNeutral(30, 0);
    expect(w.hireNeutral(n.id)).toBeNull();
    expect(w.neutrals).toContain(n);
  });
  it("同行の人数が先に上限なら、理由は party", () => {
    const { w, p } = party(4);
    expect(w.familiars).toHaveLength(p.party.maxFamiliars);
    expect(w.familiarAddBlock("companion")).toBe("party");
  });
  it("雇用の通知は、理由によって出し分ける", () => {
    const p = createDefaultParams();
    const g = new Game(1, p);
    g.world.enemies.length = 0;
    g.world.neutrals.length = 0;
    while (g.world.totalFamiliars() < p.base.capacity) {
      const extra = g.world.spawnFamiliar("companion");
      g.world.familiars = g.world.familiars.filter((f) => f !== extra);
      g.world.base.receive(extra, p);
    }
    const n = g.world.spawnNeutral(40, 0);
    n.wander.timer = 9999;
    g.step(dt, press);
    expect(g.dialog).toEqual({ kind: "full", reason: "base" });
  });
  it("強制送還は、容量に引っかからない(総数が変わらないため)", () => {
    const { w, p, cs } = party(4);
    while (w.totalFamiliars() < p.base.capacity) {
      const extra = w.spawnFamiliar("companion");
      w.familiars = w.familiars.filter((f) => f !== extra);
      w.base.receive(extra, p);
    }
    expect(w.totalFamiliars()).toBe(20);
    damage(cs[0]!, 9999);
    run(w, 2);
    expect(w.familiars).not.toContain(cs[0]);
    expect(w.base.members).toContain(cs[0]);
    expect(w.totalFamiliars()).toBe(20);
  });
});

describe("拠点での回復", () => {
  it("遠征中は、10秒ごとに最大HPの1%ずつ回復する(離散的)", () => {
    const { w, p, cs } = party(1);
    const c = cs[0]!;
    c.hp = 0;
    w.dispatchToBase(c.id);
    run(w, 9.9);
    expect(c.hp).toBe(0);
    run(w, 0.2);
    expect(c.hp).toBe(Math.round(c.maxHp * p.base.regenRatio)); // 1%
    run(w, 10);
    expect(c.hp).toBe(2 * Math.round(c.maxHp * p.base.regenRatio));
  });
  it("50%以上に回復するには、8分以上かかる", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    c.hp = 0;
    w.dispatchToBase(c.id);
    run(w, 60 * 8 - 5);
    expect(c.hp).toBeLessThan(c.maxHp / 2);
    run(w, 60);
    expect(c.hp).toBeGreaterThanOrEqual(c.maxHp / 2);
  });
  it("観測者が拠点にいる間は、自動回復しない", () => {
    const { w, p, cs } = party(1);
    const c = cs[0]!;
    c.hp = 0;
    w.dispatchToBase(c.id);
    for (let i = 0; i < 60 * 60; i++) w.base.step(dt, p, true);
    expect(c.hp).toBe(0);
  });
  it("全快したら、それ以上は増えない。最大HPを超えない", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    c.hp = c.maxHp - 1;
    w.dispatchToBase(c.id);
    run(w, 40);
    expect(c.hp).toBe(c.maxHp);
  });
  it("回復の間隔は、個体ごとに、拠点に来た時点から数える", () => {
    const { w, cs } = party(2);
    const a = cs[0]!;
    const b = cs[1]!;
    a.hp = 0;
    b.hp = 0;
    w.dispatchToBase(a.id);
    run(w, 6);
    w.dispatchToBase(b.id);
    run(w, 5); // a は11秒、b は5秒
    expect(a.hp).toBeGreaterThan(0);
    expect(b.hp).toBe(0);
    run(w, 5); // b は10秒
    expect(b.hp).toBeGreaterThan(0);
  });
  it("遠征が一時停止している間(ワールドが進まない間)は、回復しない", () => {
    const g = new Game(1, createDefaultParams());
    g.world.enemies.length = 0;
    g.world.neutrals.length = 0;
    const c = g.world.spawnFamiliar("companion");
    c.hp = 0;
    g.world.dispatchToBase(c.id);
    g.toggleOverlay();
    for (let i = 0; i < 60 * 60; i++) g.step(dt, idle);
    expect(c.hp).toBe(0);
  });
});

describe("召喚", () => {
  it("HPが最大HPの50%未満の間は、召喚を拒否する。50%以上なら召喚できる", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    c.hp = Math.round(c.maxHp * 0.5) - 1;
    w.dispatchToBase(c.id);
    expect(w.summonFromBase(c.id)).toBe("low_hp");
    expect(w.base.members).toContain(c);
    c.hp = Math.round(c.maxHp * 0.5);
    expect(w.summonFromBase(c.id)).toBe("ok");
    expect(w.base.members).not.toContain(c);
    expect(w.familiars).toContain(c);
  });
  it("召喚されたファミリアは、拠点にいたときのHPを引き継ぎ、待機範囲の内側に現れる", () => {
    const { w, p, cs } = party(1);
    const c = cs[0]!;
    c.hp = Math.round(c.maxHp * 0.7);
    const hp = c.hp;
    w.dispatchToBase(c.id);
    w.watcher.x = w.watcher.prevX = 5000;
    w.watcher.y = w.watcher.prevY = -3000;
    expect(w.summonFromBase(c.id)).toBe("ok");
    expect(c.hp).toBe(hp);
    expect(Math.hypot(c.x - w.watcher.x, c.y - w.watcher.y)).toBeLessThanOrEqual(p.familiar.standbyRange);
    expect(c.state).toBe("standby");
    expect(c.down).toBe(false);
  });
  it("出現位置は、シードと状況が同じなら同じ(決定的)", () => {
    const pos = () => {
      const { w, cs } = party(1);
      const c = cs[0]!;
      w.dispatchToBase(c.id);
      run(w, 3);
      w.summonFromBase(c.id);
      return [c.x, c.y];
    };
    expect(pos()).toEqual(pos());
  });
  it("役割は変わらない(側近は側近のまま戻る)", () => {
    const { w, aide } = party(1);
    w.spawnFamiliar("aide"); // 側近をもう1人。これで、最初の側近を送還できる
    expect(w.dispatchToBase(aide.id)).toBe(true);
    expect(w.summonFromBase(aide.id)).toBe("ok");
    expect(aide.role).toBe("aide");
    expect(w.familiars.filter((f) => f.role === "aide")).toHaveLength(2);
  });
  it("側近の上限(2人)に達していたら、側近は召喚できない(同行者の召喚には影響しない)", () => {
    const { w, aide } = party(1);
    const a2 = w.spawnFamiliar("aide");
    w.dispatchToBase(aide.id);
    w.spawnFamiliar("aide"); // 側近が2人に戻る(a2 + 新しい1人)
    expect(w.partyHasRoom("aide")).toBe(false);
    expect(w.summonFromBase(aide.id)).toBe("party_full");
    expect(w.base.members).toContain(aide);
    void a2;
  });
  it("拠点にいない者は召喚できない", () => {
    const { w } = party(1);
    expect(w.summonFromBase(999)).toBe("not_found");
  });
  it("同行の人数が上限なら、召喚できず、拠点に残る", () => {
    const { w, p, cs } = party(1);
    const c = cs[0]!;
    w.dispatchToBase(c.id);
    while (w.familiars.length < p.party.maxFamiliars) w.spawnFamiliar("companion");
    expect(w.summonFromBase(c.id)).toBe("party_full");
    expect(w.base.members).toContain(c);
  });
  it("召喚されると、戦闘不能などの状態は残らない", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    damage(c, 9999);
    run(w, 2); // 戦闘不能 → 同行者なので拠点へ
    expect(w.base.members).toContain(c);
    c.hp = Math.round(c.maxHp * 0.6);
    w.summonFromBase(c.id);
    run(w, 0.5);
    expect(c.down).toBe(false);
    expect(c.vanishing).toBe(false);
    expect(w.familiars).toContain(c);
  });
});

describe("自分の意思による送還", () => {
  it("同行者は送還できる。HPなど個体のデータは変わらない", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    c.hp = 33;
    expect(w.dispatchToBase(c.id)).toBe(true);
    expect(c.hp).toBe(33);
    expect(w.familiars).not.toContain(c);
  });
  it("最後の側近は送還できない。別の側近がいれば送還できる", () => {
    const { w, aide } = party(1);
    expect(w.canDispatch(aide)).toBe(false);
    expect(w.dispatchToBase(aide.id)).toBe(false);
    const a2 = w.spawnFamiliar("aide");
    expect(w.canDispatch(aide)).toBe(true);
    expect(w.dispatchToBase(a2.id)).toBe(true);
  });
  it("最後のファミリアは送還できない", () => {
    const { w, aide } = party(0);
    expect(w.dispatchToBase(aide.id)).toBe(false);
  });
  it("同行していない者(拠点にいる者)は送還できない", () => {
    const { w, cs } = party(2);
    const c = cs[0]!;
    w.dispatchToBase(c.id);
    expect(w.dispatchToBase(c.id)).toBe(false);
  });
  it("送還されたファミリアは、戦闘不能や迎撃などの状態を持ち越さない", () => {
    const { w, cs } = party(1);
    const c = cs[0]!;
    c.state = "intercept";
    c.targetId = 99;
    w.dispatchToBase(c.id);
    expect(c.state).toBe("standby");
    expect(c.targetId).toBeNull();
  });
});
