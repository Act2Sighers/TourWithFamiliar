import { describe, expect, it } from "vitest";
import { createDefaultParams, type Params } from "../src/core/params";
import { damage } from "../src/core/sim/body";
import { Game } from "../src/core/sim/game";
import { DEFAULT_KIND_ID } from "../src/core/sim/kinds";
import { PartySelection, checkParty } from "../src/core/sim/party";
import { World } from "../src/core/sim/world";

const dt = 1 / 60;
const idle = { moveX: 0, moveY: 0, interact: false };
const stepN = (g: Game, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) g.step(dt, idle);
};

/** 最初の側近を選んで始めた直後のゲーム(敵と中立個体は取り除く) */
function started(p: Params = createDefaultParams()) {
  const g = new Game(1, p, { autoStart: false });
  g.startRun(DEFAULT_KIND_ID);
  g.world.enemies.length = 0;
  g.world.neutrals.length = 0;
  return g;
}
/** 遠征を中断して拠点に戻る */
function abort(g: Game) {
  g.toggleOverlay();
  g.requestAbort();
  g.confirmDialog();
}

describe("遠征の中断(拠点に戻る)", () => {
  it("メニューの「拠点に戻る」で確認ダイアログが出る。取りやめると、メニューに戻る", () => {
    const g = started();
    g.toggleOverlay();
    expect(g.requestAbort()).toBe(true);
    expect(g.mode).toBe("dialog");
    expect(g.dialog).toEqual({ kind: "abort" });
    g.cancelDialog();
    expect(g.mode).toBe("overlay");
    expect(g.world.familiars).toHaveLength(1); // 中断されていない
  });
  it("了承すると遠征が中断され、拠点の画面になる。同行していたファミリアは、HPそのままで拠点に戻る", () => {
    const g = started();
    const aide = g.world.familiars[0]!;
    const c = g.world.spawnFamiliar("companion");
    aide.hp = 40;
    c.hp = 77;
    abort(g);
    expect(g.mode).toBe("base");
    expect(g.world.familiars).toHaveLength(0);
    expect(g.base.members).toEqual(expect.arrayContaining([aide, c]));
    expect(aide.hp).toBe(40);
    expect(c.hp).toBe(77);
    expect(g.dialog).toBeNull();
  });
  it("遠征中(メニューを開いていないとき)は、拠点に戻れない", () => {
    const g = started();
    expect(g.requestAbort()).toBe(false);
    expect(g.mode).toBe("world");
  });
  it("メニューボタンは、確認ダイアログでは「いいえ」になる", () => {
    const g = started();
    g.toggleOverlay();
    g.requestAbort();
    g.handleMenuButton();
    expect(g.mode).toBe("overlay");
  });
  it("拠点にいる間、ワールドは進まず、HPも自動回復しない", () => {
    const g = started();
    const c = g.world.spawnFamiliar("companion");
    c.hp = 10;
    abort(g);
    const tick = g.world.tick;
    stepN(g, 120);
    expect(g.world.tick).toBe(tick);
    expect(c.hp).toBe(10);
  });
});

describe("観測者が倒れたあと", () => {
  it("遠征が止まったあと、拠点へ戻れる。ファミリアはHPそのままで拠点にいる", () => {
    const g = started();
    const aide = g.world.familiars[0]!;
    aide.hp = 55;
    damage(g.world.watcher, 9999);
    stepN(g, 3);
    expect(g.mode).toBe("ended");
    expect(g.returnToBase()).toBe(true);
    expect(g.mode).toBe("base");
    expect(g.base.members).toContain(aide);
    expect(aide.hp).toBe(55);
    expect(g.defeatTimer).toBeNull();
  });
  it("終了していないときは、returnToBase は何もしない", () => {
    const g = started();
    expect(g.returnToBase()).toBe(false);
  });
});

describe("遠征に連れ出す選択の条件", () => {
  const mk = (p: Params, roles: ("aide" | "companion")[]) => {
    const w = new World(1, p);
    return roles.map((r) => w.spawnFamiliar(r));
  };
  it("少なくとも1人のファミリアと、1人の側近が必要", () => {
    const p = createDefaultParams();
    expect(checkParty([], p)).toEqual({ ok: false, reason: "empty" });
    expect(checkParty(mk(p, ["companion"]), p)).toEqual({ ok: false, reason: "no_aide" });
    expect(checkParty(mk(p, ["aide"]), p)).toEqual({ ok: true });
  });
  it("人数の上限(側近2人・ファミリア5人)を超えられない", () => {
    const p = createDefaultParams();
    expect(checkParty(mk(p, ["aide", "aide"]), p).ok).toBe(true);
    expect(checkParty(mk(p, ["aide", "aide", "aide"]), p)).toEqual({ ok: false, reason: "too_many_aides" });
    expect(checkParty(mk(p, ["aide", "companion", "companion", "companion", "companion"]), p).ok).toBe(true);
    expect(checkParty(mk(p, ["aide", "companion", "companion", "companion", "companion", "companion"]), p)).toEqual({
      ok: false,
      reason: "too_many",
    });
  });
  it("HPは条件にしない(HPが0の側近でも、連れ出せる。遠征に出られなくなるのを防ぐため)", () => {
    const p = createDefaultParams();
    const [a] = mk(p, ["aide"]);
    a!.hp = 0;
    expect(checkParty([a!], p).ok).toBe(true);
  });
});

describe("PartySelection(連れ出す者の選択)", () => {
  it("カードと「出発」の位置を、左右で巡る", () => {
    const s = new PartySelection([10, 11, 12]);
    expect(s.slots).toBe(4);
    s.move(-1);
    expect(s.onDepartSlot).toBe(true);
    s.move(1);
    expect(s.focus).toBe(0);
  });
  it("決定ボタン: カードの上では選択を切り替え、「出発」の上では出発を要求する", () => {
    const s = new PartySelection([10, 11]);
    expect(s.confirm()).toBe("toggled");
    expect(s.chosenIds()).toEqual([10]);
    s.move(1);
    s.confirm();
    expect(s.chosenIds()).toEqual([10, 11]);
    s.confirm();
    expect(s.chosenIds()).toEqual([10]);
    s.move(1);
    expect(s.confirm()).toBe("depart");
  });
  it("選ばれているIDは、並びの順に返る。存在しないIDは無視する", () => {
    const s = new PartySelection([5, 6, 7]);
    s.toggle(7);
    s.toggle(5);
    s.toggle(99);
    expect(s.chosenIds()).toEqual([5, 7]);
  });
});

describe("拠点から遠征に出る", () => {
  /** 側近1人 + 同行者2人を持って、遠征を中断して拠点に戻る */
  function atBase() {
    const g = started();
    g.world.spawnFamiliar("companion");
    g.world.spawnFamiliar("companion");
    abort(g);
    return g;
  }

  it("拠点から、連れ出す選択の画面へ進める。戻ることもできる", () => {
    const g = atBase();
    expect(g.openParty()).toBe(true);
    expect(g.mode).toBe("party");
    g.handleMenuButton();
    expect(g.mode).toBe("base");
  });
  it("選んだファミリアだけを連れて、新しい遠征が始まる。選ばなかった者は、拠点に残る", () => {
    const g = atBase();
    const [aide, c1, c2] = g.base.members as [any, any, any];
    g.openParty();
    expect(g.departExpedition([aide.id, c1.id])).toBe(true);
    expect(g.mode).toBe("world");
    expect(g.expeditionCount).toBe(2);
    expect(g.world.familiars.map((f) => f.id).sort()).toEqual([aide.id, c1.id].sort());
    expect(g.base.members).toEqual([c2]);
    expect(g.world.enemies.length).toBeGreaterThan(0); // 新しい遠征のワールド
  });
  it("連れ出されたファミリアは、HPなどを引き継ぎ、観測者の近くに並ぶ", () => {
    const g = atBase();
    const [aide] = g.base.members as [any];
    aide.hp = 31;
    g.openParty();
    g.departExpedition([aide.id]);
    expect(aide.hp).toBe(31);
    expect(Math.hypot(aide.x - g.world.watcher.x, aide.y - g.world.watcher.y)).toBeLessThan(60);
    expect(aide.state).toBe("standby");
  });
  it("条件を満たさない選択(側近がいない・人数超過・拠点にいない者)では、出発できない", () => {
    const g = atBase();
    const [aide, c1, c2] = g.base.members as [any, any, any];
    g.openParty();
    expect(g.departExpedition([c1.id, c2.id])).toBe(false); // 側近がいない
    expect(g.departExpedition([])).toBe(false);
    expect(g.departExpedition([aide.id, 9999])).toBe(false); // 拠点にいない
    expect(g.departExpedition([aide.id, aide.id])).toBe(false); // 重複
    expect(g.mode).toBe("party");
  });
  it("遠征の回ごとに、ワールドのシードが変わる", () => {
    const g = atBase();
    const seed1 = g.seed;
    const [aide] = g.base.members as [any];
    g.openParty();
    g.departExpedition([aide.id]);
    expect(g.world.seed).not.toBe(seed1);
  });
  it("遠征中、拠点に残した者は、10秒に1回、最大HPの1%ずつ回復する", () => {
    const g = atBase();
    const [aide, c1] = g.base.members as [any, any];
    c1.hp = 0;
    g.openParty();
    g.departExpedition([aide.id]);
    g.world.enemies.length = 0;
    g.world.neutrals.length = 0;
    stepN(g, 10.2);
    expect(c1.hp).toBe(1);
  });
  it("拠点の容量(20人)は、遠征をまたいで、同行中のファミリアも含めた総数で数える", () => {
    const g = atBase();
    const p = createDefaultParams();
    while (g.base.size < p.base.capacity) {
      // 拠点を満員にする(いまは同行中が0人なので、拠点の人数がそのまま総数)
      const extra = new World(1, p).spawnFamiliar("companion");
      g.base.receive(extra, p);
    }
    expect(g.base.size).toBe(p.base.capacity);
    const [aide] = g.base.members as [any];
    g.openParty();
    g.departExpedition([aide.id]);
    expect(g.world.totalFamiliars()).toBe(p.base.capacity); // 同行中 + 拠点
    expect(g.world.baseHasRoom()).toBe(false);
  });
  it("最初の側近の選択画面は、最初の遠征の前だけ。拠点からは出ない", () => {
    const g = atBase();
    expect(g.startRun(DEFAULT_KIND_ID)).toBe(false);
    expect(g.mode).toBe("base");
  });
  it("連れ出す選択の画面は、拠点からしか開けない", () => {
    const g = started();
    expect(g.openParty()).toBe(false);
  });
  it("2回目以降の遠征でも、中断 → 拠点 → 遠征 を繰り返せる", () => {
    const g = atBase();
    for (let i = 0; i < 3; i++) {
      const aide = g.base.members.find((f) => f.role === "aide")!;
      g.openParty();
      expect(g.departExpedition([aide.id])).toBe(true);
      g.world.enemies.length = 0;
      g.world.neutrals.length = 0;
      abort(g);
      expect(g.mode).toBe("base");
    }
    expect(g.expeditionCount).toBe(4);
    expect(g.base.size).toBe(3);
  });
  it("やり直す(最初の側近の選択へ戻る)と、拠点も空になる", () => {
    const g = atBase();
    g.reset(5, true);
    expect(g.mode).toBe("select");
    expect(g.base.size).toBe(0);
    expect(g.expeditionCount).toBe(0);
  });
});
