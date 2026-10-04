import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { talkActionsOf } from "../src/core/sim/talk";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const press = { moveX: 0, moveY: 0, interact: true };

/** 側近1人だけの遠征(敵も中立個体もいない)。ファミリアは動かさない */
function expedition(p: Params = createDefaultParams()) {
  const g = new Game(1, p);
  g.world.enemies.length = 0;
  g.world.neutrals.length = 0;
  const aide = g.world.familiars[0]!;
  aide.wander.timer = 9999;
  return { g, w: g.world, p, aide };
}
const still = (f: { wander: { timer: number } }) => {
  f.wander.timer = 9999;
};
const step = (g: Game, n = 1, input = idle) => {
  for (let i = 0; i < n; i++) g.step(dt, input);
};

describe("話しかける(インタラクトの対象)", () => {
  it("距離内にファミリアがいると、話しかける対象になる(範囲は雇用と同程度)", () => {
    const { w, p, aide } = expedition();
    expect(p.party.talkRange).toBe(p.party.hireRange);
    aide.x = aide.prevX = p.party.talkRange - 5;
    aide.y = aide.prevY = 0;
    expect(w.interactionTarget()).toEqual({ kind: "talk", familiar: aide });
    aide.x = aide.prevX = p.party.talkRange + 20;
    expect(w.interactionTarget()).toBeNull();
  });
  it("複数いれば、最も近い1人が対象になる", () => {
    const { w, aide } = expedition();
    const c = w.spawnFamiliar("companion");
    still(c);
    aide.x = aide.prevX = 60;
    aide.y = aide.prevY = 0;
    c.x = c.prevX = 30;
    c.y = c.prevY = 0;
    expect(w.interactionTarget()).toEqual({ kind: "talk", familiar: c });
  });
  it("戦闘不能のファミリアには、話しかけられない(助け起こしの対象になる)", () => {
    const { w, aide } = expedition();
    aide.x = aide.prevX = 30;
    aide.y = aide.prevY = 0;
    damage(aide, 9999);
    w.step(dt, idle);
    expect(w.interactionTarget()?.kind).toBe("revive");
  });
  it("優先順位は 助け起こし > 雇用 > 話しかける。話しかけるが最も低い", () => {
    const { w, aide } = expedition();
    const c = w.spawnFamiliar("companion");
    still(c);
    c.x = c.prevX = 20;
    c.y = c.prevY = 0;
    expect(w.interactionTarget()?.kind).toBe("talk");
    const n = w.spawnNeutral(50, 10);
    n.wander.timer = 9999;
    expect(w.interactionTarget()?.kind).toBe("hire"); // 雇用が優先
    aide.x = aide.prevX = 30;
    aide.y = aide.prevY = -10;
    damage(aide, 9999);
    w.step(dt, idle);
    expect(w.interactionTarget()?.kind).toBe("revive"); // 助け起こしが最優先
  });
  it("押した瞬間に、話しかけるダイアログが出て、ワールドが止まる", () => {
    const { g, w, aide } = expedition();
    aide.x = aide.prevX = 30;
    aide.y = aide.prevY = 0;
    g.step(dt, press);
    expect(g.mode).toBe("dialog");
    expect(g.dialog).toEqual({ kind: "talk", familiarId: aide.id });
    const tick = w.tick;
    step(g, 120);
    expect(w.tick).toBe(tick);
  });
  it("押しっぱなしでは、繰り返し出ない。メニューボタンで閉じられる", () => {
    const { g, aide } = expedition();
    aide.x = aide.prevX = 30;
    aide.y = aide.prevY = 0;
    g.step(dt, press);
    g.handleMenuButton();
    expect(g.mode).toBe("world");
    step(g, 30, press);
    expect(g.mode).toBe("world");
  });
});

describe("話しかけるで選べる行動", () => {
  it("唯一のファミリアであり最後の側近でもあるなら、送還も同行者にすることもできない", () => {
    const { w, aide } = expedition();
    const a = talkActionsOf(w, aide);
    expect(a.find((x) => x.id === "dispatch")).toEqual({ id: "dispatch", enabled: false, block: "last_familiar" });
    expect(a.find((x) => x.id === "demote")).toEqual({ id: "demote", enabled: false, block: "last_aide" });
    expect(a.find((x) => x.id === "promote")).toBeUndefined();
  });
  it("同行者には「側近にする」が出る。側近には「同行者にする」が出る", () => {
    const { w, aide } = expedition();
    const c = w.spawnFamiliar("companion");
    expect(talkActionsOf(w, c).map((x) => x.id)).toEqual(["dispatch", "promote"]);
    expect(talkActionsOf(w, aide).map((x) => x.id)).toEqual(["dispatch", "demote"]);
  });
  it("側近の上限(2人)に達していたら、同行者を側近にできない", () => {
    const { w } = expedition();
    w.spawnFamiliar("aide");
    const c = w.spawnFamiliar("companion");
    expect(talkActionsOf(w, c).find((x) => x.id === "promote")).toEqual({ id: "promote", enabled: false, block: "aide_limit" });
  });
  it("側近が2人いれば、側近を同行者にできる。ただし、最後の1人にはできない", () => {
    const { w, aide } = expedition();
    const a2 = w.spawnFamiliar("aide");
    expect(talkActionsOf(w, aide).find((x) => x.id === "demote")?.enabled).toBe(true);
    w.setRole(a2.id, "companion");
    expect(talkActionsOf(w, aide).find((x) => x.id === "demote")?.enabled).toBe(false);
  });
});

describe("行動の実行", () => {
  /** 側近 + 同行者の遠征で、同行者に話しかけてダイアログを開く */
  function talkToCompanion() {
    const ctx = expedition();
    const c = ctx.w.spawnFamiliar("companion");
    still(c);
    c.x = c.prevX = 25;
    c.y = c.prevY = 0;
    ctx.aide.x = ctx.aide.prevX = 500; // 側近は遠く(対象にならない)
    ctx.g.step(dt, press);
    expect(ctx.g.dialog).toEqual({ kind: "talk", familiarId: c.id });
    return { ...ctx, c };
  }

  it("「送還する」: そのファミリアが拠点へ送られ、ダイアログが閉じて遠征に戻る。HPは(5%より上なら)そのまま", () => {
    const { g, w, c } = talkToCompanion();
    c.hp = 64;
    expect(g.chooseTalkAction("dispatch")).toBe(true);
    expect(g.mode).toBe("world");
    expect(g.dialog).toBeNull();
    expect(w.familiars).not.toContain(c);
    expect(w.base.members).toContain(c);
    expect(c.hp).toBe(64);
  });
  it("「送還する」でHPが5%以下なら、5%に回復して拠点に入る", () => {
    const { g, c } = talkToCompanion();
    c.hp = 2;
    g.chooseTalkAction("dispatch");
    expect(c.hp).toBe(5);
  });
  it("「側近にする」: 同行者が側近になる", () => {
    const { g, c } = talkToCompanion();
    expect(g.chooseTalkAction("promote")).toBe(true);
    expect(c.role).toBe("aide");
    expect(g.mode).toBe("world");
  });
  it("「同行者にする」: 側近が同行者になる(別の側近が残る場合)", () => {
    const { g, w, aide } = expedition();
    const a2 = w.spawnFamiliar("aide");
    still(a2);
    a2.x = a2.prevX = 25;
    a2.y = a2.prevY = 0;
    aide.x = aide.prevX = 500;
    g.step(dt, press);
    expect(g.dialog).toEqual({ kind: "talk", familiarId: a2.id });
    expect(g.chooseTalkAction("demote")).toBe(true);
    expect(a2.role).toBe("companion");
  });
  it("選べない行動は、何も起きず、ダイアログも閉じない", () => {
    const { g, w, aide } = expedition();
    aide.x = aide.prevX = 25;
    aide.y = aide.prevY = 0;
    g.step(dt, press);
    expect(g.chooseTalkAction("dispatch")).toBe(false); // 最後のファミリア
    expect(g.chooseTalkAction("demote")).toBe(false); // 最後の側近
    expect(g.mode).toBe("dialog");
    expect(w.familiars).toContain(aide);
  });
  it("やめる(キャンセル)と、何も変わらずに遠征へ戻る", () => {
    const { g, w, c } = talkToCompanion();
    g.cancelDialog();
    expect(g.mode).toBe("world");
    expect(w.familiars).toContain(c);
    expect(c.role).toBe("companion");
  });
  it("遠征以外のモードでは、行動を選べない", () => {
    const { g } = expedition();
    expect(g.chooseTalkAction("dispatch")).toBe(false);
  });
  it("側近にしてから送還すれば、メニューから召喚できる(召喚は側近だけ)", () => {
    const { g, w, c } = talkToCompanion();
    g.chooseTalkAction("promote");
    // もう一度話しかけて送還する(最初の側近が残るので、送還できる)
    g.step(dt, idle);
    g.step(dt, press);
    expect(g.dialog).toEqual({ kind: "talk", familiarId: c.id });
    expect(g.chooseTalkAction("dispatch")).toBe(true);
    expect(w.base.members).toContain(c);
    c.hp = c.maxHp;
    g.toggleOverlay();
    expect(g.openSummon()).toBe(true);
    expect(g.summonFromMenu(c.id)).toBe("ok");
    expect(g.mode).toBe("world");
    expect(w.familiars).toContain(c);
  });
});

describe("メニューからの召喚", () => {
  /** 側近2人の遠征で、1人を拠点に送った状態 */
  function withAideAtBase() {
    const ctx = expedition();
    const a2 = ctx.w.spawnFamiliar("aide");
    ctx.w.dispatchToBase(ctx.aide.id);
    return { ...ctx, away: ctx.aide, a2 };
  }

  it("召喚の一覧は、メニューを開いているときだけ開ける。閉じるとメニューに戻る", () => {
    const { g } = withAideAtBase();
    expect(g.openSummon()).toBe(false);
    g.toggleOverlay();
    expect(g.openSummon()).toBe(true);
    expect(g.mode).toBe("summon");
    g.handleMenuButton();
    expect(g.mode).toBe("overlay");
  });
  it("召喚の一覧では、ワールドが止まっている", () => {
    const { g, w } = withAideAtBase();
    g.toggleOverlay();
    g.openSummon();
    const tick = w.tick;
    step(g, 60);
    expect(w.tick).toBe(tick);
  });
  it("HPが50%以上の側近を召喚すると、遠征に戻り、その側近が現れる", () => {
    const { g, w, away } = withAideAtBase();
    away.hp = 60;
    g.toggleOverlay();
    g.openSummon();
    expect(g.summonFromMenu(away.id)).toBe("ok");
    expect(g.mode).toBe("world");
    expect(w.familiars).toContain(away);
    expect(away.hp).toBe(60);
  });
  it("HPが足りない・側近でない・人数の上限のときは、召喚されず、一覧に残る", () => {
    const { g, w, away } = withAideAtBase();
    away.hp = 10;
    g.toggleOverlay();
    g.openSummon();
    expect(g.summonFromMenu(away.id)).toBe("low_hp");
    expect(g.mode).toBe("summon");
    const c = w.spawnFamiliar("companion");
    w.dispatchToBase(c.id);
    expect(g.summonFromMenu(c.id)).toBe("not_aide");
    expect(g.summonFromMenu(9999)).toBe("not_found");
    expect(g.mode).toBe("summon");
  });
  it("一覧を開いていないときは、召喚できない", () => {
    const { g, away } = withAideAtBase();
    away.hp = 100;
    expect(g.summonFromMenu(away.id)).toBe("not_found");
  });
});
