import "./style.css";
import { createDefaultParams } from "./core/params";
import { CandidateSelection } from "./core/selection";
import { Game } from "./core/sim/game";
import type { Familiar } from "./core/sim/familiar";
import { FAMILIAR_KINDS } from "./core/sim/kinds";
import { PARTY_REASON_TEXT, PartySelection, checkParty } from "./core/sim/party";
import { FixedStepper } from "./core/stepper";
import { DebugPanel } from "./debug/panel";
import { GamepadInput } from "./input/gamepad";
import { KeyboardInput } from "./input/keyboard";
import { InputManager } from "./input/manager";
import { TouchInput } from "./input/touch";
import { Renderer } from "./view/renderer";

const params = createDefaultParams();
DebugPanel.loadSaved(params);

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlayEl = document.getElementById("overlay") as HTMLElement;
const debugEl = document.getElementById("debug") as HTMLElement;
const menuBtn = document.getElementById("btn-menu") as HTMLElement;
const debugBtn = document.getElementById("btn-debug") as HTMLElement;
const resumeBtn = document.getElementById("btn-resume") as HTMLElement;
const interactBtn = document.getElementById("btn-interact") as HTMLElement;
const defeatEl = document.getElementById("defeat") as HTMLElement;
const dialogEl = document.getElementById("dialog") as HTMLElement;
const dialogMessage = document.getElementById("dialog-message") as HTMLElement;
const dialogHint = document.getElementById("dialog-hint") as HTMLElement;
const dialogYes = document.getElementById("dialog-yes") as HTMLElement;
const dialogNo = document.getElementById("dialog-no") as HTMLElement;
const selectEl = document.getElementById("select") as HTMLElement;
const selectList = document.getElementById("select-list") as HTMLElement;
const selectStart = document.getElementById("select-start") as HTMLButtonElement;
const abortBtn = document.getElementById("btn-abort") as HTMLElement;
const baseEl = document.getElementById("base-screen") as HTMLElement;
const baseList = document.getElementById("base-list") as HTMLElement;
const baseDepart = document.getElementById("base-depart") as HTMLElement;
const partyEl = document.getElementById("party-screen") as HTMLElement;
const partyList = document.getElementById("party-list") as HTMLElement;
const partyInfo = document.getElementById("party-info") as HTMLElement;
const partyGo = document.getElementById("party-go") as HTMLButtonElement;
const partyBack = document.getElementById("party-back") as HTMLElement;
const toBaseBtn = document.getElementById("btn-to-base") as HTMLElement;

const initialSeed = 12345;
const game = new Game(initialSeed, params, { autoStart: false });
const selection = new CandidateSelection(FAMILIAR_KINDS.length);
const renderer = new Renderer(canvas, params);
const stepper = new FixedStepper(params.sim.hz);
const inputs = new InputManager([new KeyboardInput(), new GamepadInput(), new TouchInput(canvas, menuBtn, interactBtn)]);

let fps = 60;

const panel = new DebugPanel(
  debugEl,
  params,
  {
    onParamChanged: (path) => game.onParamChanged(path),
    onDebugDamage: (target, amount) => game.world.debugDamage(target, amount),
    onDebugHealAll: () => game.world.debugHealAll(),
    onDebugSpawnCompanion: () => game.world.debugSpawnCompanion(),
    onDebugDispatch: () => game.world.debugDispatch(),
    onDebugSummon: () => game.world.debugSummon(),
    onDebugSpawnNeutral: () => game.world.debugSpawnNeutral(),
    onDebugSpawnEnemy: () => game.world.debugSpawnEnemy(),
    onDebugSendFamiliarAway: () => game.world.debugSendFamiliarAway(),
    onResetWorld: (seed) => {
      game.reset(seed, true); // 最初の側近の選択画面へ戻る
      selection.reset();
      partySel = null;
      stepper.reset();
      syncOverlay();
      syncScreens();
    },
    getStats: () => {
      const w = game.world;
      return {
        mode: game.mode,
        expedition: String(game.expeditionCount),
        seed: String(game.seed),
        tick: String(w.tick),
        time: `${w.time.toFixed(1)}s`,
        pos: `${w.watcher.x.toFixed(0)}, ${w.watcher.y.toFixed(0)}`,
        speed: Math.hypot(w.watcher.vx, w.watcher.vy).toFixed(0),
        hp: `${w.watcher.hp}/${w.watcher.maxHp}`,
        ...familiarStats(),
        enemies: enemySummary(),
        neutrals: neutralSummary(),
        chunks: String(w.chunks.count),
        fps: fps.toFixed(0),
      };
    },
  },
  initialSeed,
);

function familiarStats(): Record<string, string> {
  const out: Record<string, string> = {};
  const w = game.world;
  for (const f of w.familiars) {
    const d = Math.hypot(f.x - w.watcher.x, f.y - w.watcher.y);
    const status = f.down
      ? `DOWN${f.vanishing ? "(送還)" : ` 助け${(f.reviveProgress * 100).toFixed(0)}%`}`
      : `${f.state}${f.lost ? "/lost" : ""}/${f.wander.mode}`;
    out[`fam${f.id}`] = `${f.role} ${status} hp ${f.hp}/${f.maxHp} dist ${d.toFixed(0)} spd ${Math.hypot(f.vx, f.vy).toFixed(0)}`;
  }
  if (w.base.size > 0) {
    const cap = params.base.capacity;
    out.base = `${w.base.size}体 (総数 ${w.totalFamiliars()}/${cap}) ` + w.base.members.map((b) => `${b.role === "aide" ? "側" : "同"}${Math.round((b.hp / b.maxHp) * 100)}%`).join(" ");
  }
  return out;
}

function enemySummary(): string {
  const es = game.world.enemies;
  const engaged = es.filter((e) => e.state === "engaged").length;
  return `${es.length} (臨戦 ${engaged})`;
}

function neutralSummary(): string {
  const ns = game.world.neutrals;
  const down = ns.filter((n) => n.hp <= 0).length;
  const engaged = ns.filter((n) => n.state === "engaged").length;
  return `${ns.length} (臨戦 ${engaged}, 戦闘不能 ${down})`;
}

function syncOverlay(): void {
  overlayEl.hidden = game.mode !== "overlay";
  defeatEl.hidden = game.defeatTimer === null;
}

function handleMenuButton(): void {
  game.handleMenuButton();
  stepper.reset();
  syncOverlay();
}

function confirmDialog(): void {
  game.confirmDialog();
  stepper.reset();
}

function cancelDialog(): void {
  game.cancelDialog();
  stepper.reset();
}

/** 最初の側近の選択画面。候補のカードを作り直し、選択状態を表示に反映する。 */
function renderSelect(): void {
  selectEl.hidden = game.mode !== "select";
  if (game.mode !== "select") return;
  selectList.innerHTML = "";
  FAMILIAR_KINDS.forEach((kind, i) => {
    const a = kind.abilities(params);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "candidate" + (selection.focus === i ? " focus" : "") + (selection.selected === i ? " selected" : "");
    card.innerHTML =
      `<div class="candidate-icon">${kind.name}</div>` +
      `<div class="candidate-stats">丈夫さ ${a.toughness}<br />攻撃力 ${a.attack}<br />素早さ ${a.agility}</div>`;
    card.addEventListener("click", () => {
      selection.select(i);
      renderSelect();
    });
    selectList.append(card);
  });
  selectStart.disabled = !selection.canStart;
}

/** 拠点・連れ出す選択の画面に並べる、ファミリアのカード。 */
function memberCard(f: Familiar, tag: "div" | "button"): HTMLElement {
  const card = document.createElement(tag);
  if (card instanceof HTMLButtonElement) card.type = "button";
  card.className = "candidate";
  const ratio = Math.max(0, Math.min(1, f.hp / f.maxHp));
  card.innerHTML =
    `<div class="candidate-icon ${f.role}">${f.name}</div>` +
    `<div class="member-role">${f.role === "aide" ? "側近" : "同行者"}</div>` +
    `<div class="member-hp"><i style="width:${(ratio * 100).toFixed(0)}%"></i></div>` +
    `<div class="member-hp-text">HP ${f.hp}/${f.maxHp}</div>`;
  return card;
}

/** 拠点の画面: 預かっているファミリアの一覧と「遠征に出る」。 */
function renderBase(): void {
  baseEl.hidden = game.mode !== "base";
  if (game.mode !== "base") return;
  baseList.innerHTML = "";
  const members = game.base.members;
  if (members.length === 0) {
    const empty = document.createElement("p");
    empty.className = "member-empty";
    empty.textContent = "ファミリアはいません";
    baseList.append(empty);
  }
  for (const f of members) baseList.append(memberCard(f, "div"));
}

let partySel: PartySelection | null = null;

/** 連れ出す選択の画面: カードの選択状態と、条件の確認、「出発」ボタン。 */
function renderParty(): void {
  partyEl.hidden = game.mode !== "party";
  if (game.mode !== "party" || !partySel) return;
  const sel = partySel;
  partyList.innerHTML = "";
  const roster = game.base.members;
  roster.forEach((f, i) => {
    const card = memberCard(f, "button");
    if (sel.chosen.has(f.id)) card.classList.add("selected");
    if (sel.focus === i) card.classList.add("focus");
    card.addEventListener("click", () => {
      sel.focusOn(i);
      sel.toggle(f.id);
      renderParty();
    });
    partyList.append(card);
  });
  const chosen = roster.filter((f) => sel.chosen.has(f.id));
  const check = checkParty(chosen, params);
  const aides = chosen.filter((f) => f.role === "aide").length;
  partyInfo.textContent =
    `選択 ${chosen.length}/${params.party.maxFamiliars}　側近 ${aides}/${params.party.maxAides}` +
    (check.ok ? "" : `　${PARTY_REASON_TEXT[check.reason]}`);
  partyInfo.classList.toggle("warn", !check.ok);
  partyGo.disabled = !check.ok;
  partyGo.classList.toggle("focus", sel.onDepartSlot);
}

function enterParty(): void {
  if (!game.openParty()) return;
  partySel = new PartySelection(game.base.members.map((f) => f.id));
  renderParty();
  renderBase();
}

function leaveParty(): void {
  game.cancelParty();
  partySel = null;
  renderParty();
  renderBase();
}

function departExpedition(): void {
  if (!partySel) return;
  if (game.departExpedition(partySel.chosenIds())) {
    partySel = null;
    stepper.reset();
    renderParty();
  }
}

function returnToBase(): void {
  if (game.returnToBase()) {
    stepper.reset();
    renderBase();
  }
}

baseDepart.addEventListener("click", enterParty);
partyGo.addEventListener("click", departExpedition);
partyBack.addEventListener("click", leaveParty);
toBaseBtn.addEventListener("click", returnToBase);
abortBtn.addEventListener("click", () => {
  if (game.requestAbort()) {
    stepper.reset();
    syncOverlay();
  }
});

function startRun(): void {
  const i = selection.selected;
  if (i === null) return;
  if (game.startRun(FAMILIAR_KINDS[i]!.id)) {
    stepper.reset();
    renderSelect();
  }
}
selectStart.addEventListener("click", startRun);
let prevNav = 0;

/** 確認ダイアログの表示を、ゲームの状態に合わせる。 */
let shownDialog: string | null = null;
function syncDialog(): void {
  const d = game.dialog;
  const key = d ? (d.kind === "full" ? `full:${d.reason}` : d.kind) : null;
  if (key === shownDialog) return;
  shownDialog = key;
  dialogEl.hidden = d === null;
  if (!d) return;
  if (d.kind === "hire") {
    dialogMessage.textContent = "この中立個体を雇用しますか？";
    dialogYes.textContent = "はい";
    dialogNo.hidden = false;
    dialogHint.textContent = "Enter / A: はい　Esc / B: いいえ";
  } else if (d.kind === "abort") {
    dialogMessage.textContent = "現在の遠征は中断されます。よろしいですか？";
    dialogYes.textContent = "はい";
    dialogNo.hidden = false;
    dialogHint.textContent = "Enter / A: はい　Esc / B: いいえ";
  } else {
    dialogMessage.textContent = d.reason === "base" ? "拠点がいっぱいで、雇用できません" : "これ以上同行できません";
    dialogYes.textContent = "OK";
    dialogNo.hidden = true;
    dialogHint.textContent = "Enter / A / Esc / B: 閉じる";
  }
}
dialogYes.addEventListener("click", confirmDialog);
dialogNo.addEventListener("click", cancelDialog);

resumeBtn.addEventListener("click", () => {
  if (game.mode === "overlay") handleMenuButton();
});
debugBtn.addEventListener("click", () => {
  debugEl.hidden = !debugEl.hidden;
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Backquote") debugEl.hidden = !debugEl.hidden;
});

/** 画面(選択・拠点・連れ出す選択)の表示を、ゲームの状態に合わせる。画面の外から状態が変わっても追従する。 */
let shownMode: string | null = null;
function syncScreens(): void {
  if (game.mode === shownMode) return;
  shownMode = game.mode;
  if (game.mode === "party" && !partySel) partySel = new PartySelection(game.base.members.map((f) => f.id));
  renderSelect();
  renderBase();
  renderParty();
}

let last = performance.now();
let alpha = 1;

function frame(now: number): void {
  const frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > 0) fps += (1 / frameDt - fps) * 0.1;

  const input = inputs.poll(params.input.deadzone);
  if (game.mode === "select") {
    // 最初の側近の選択: ← → / 十字キーで選ぶ、Enter / A で決定(未選択なら選び、選択済みなら開始)
    const nav = input.moveX > 0.6 ? 1 : input.moveX < -0.6 ? -1 : 0;
    if (nav !== 0 && nav !== prevNav) {
      selection.move(nav);
      renderSelect();
    }
    prevNav = nav;
    if (input.confirmPressed) {
      if (selection.confirm()) startRun();
      else renderSelect();
    }
  } else if (game.mode === "base") {
    if (input.confirmPressed) enterParty(); // Enter / A: 遠征の準備へ
  } else if (game.mode === "party" && partySel) {
    // 連れ出す選択: ← → で移動、Enter / A で選ぶ(「出発」の上なら出発)、Esc / Start / B で戻る
    const nav = input.moveX > 0.6 ? 1 : input.moveX < -0.6 ? -1 : 0;
    if (nav !== 0 && nav !== prevNav) {
      partySel.move(nav);
      renderParty();
    }
    prevNav = nav;
    if (input.confirmPressed) {
      if (partySel.confirm() === "depart") departExpedition();
      else renderParty();
    } else if (input.menuPressed || input.cancelPressed) {
      leaveParty();
    }
  } else if (game.mode === "ended") {
    if (input.confirmPressed) returnToBase(); // Enter / A: 拠点へ
  } else if (game.mode === "dialog") {
    // ダイアログ表示中: Enter/A = はい(OK)、Esc/Start/B = いいえ(閉じる)
    if (input.confirmPressed) confirmDialog();
    else if (input.menuPressed || input.cancelPressed) cancelDialog();
  } else if (input.menuPressed) {
    handleMenuButton();
  }

  const ctl = panel.controls;
  if (game.mode === "world") {
    if (ctl.stepRequested) {
      ctl.stepRequested = false;
      game.step(stepper.dt, input);
      alpha = 1;
    } else if (!ctl.paused) {
      const r = stepper.advance(frameDt * ctl.timeScale);
      for (let i = 0; i < r.steps; i++) game.step(stepper.dt, input);
      alpha = r.alpha;
    } else {
      alpha = 1;
    }
  }

  // インタラクトボタンは、対象が近くにいる間だけ出す(助け起こしと雇用で表示を変える)
  const target = game.mode === "world" && game.defeatTimer === null ? game.world.interactionTarget() : null;
  const showInteract = target !== null;
  if (interactBtn.hidden === showInteract) interactBtn.hidden = !showInteract;
  if (target) {
    const label = target.kind === "revive" ? "助ける" : "雇用";
    if (interactBtn.dataset.kind !== target.kind) {
      interactBtn.dataset.kind = target.kind;
      interactBtn.innerHTML = `${label}<small>E / A</small>`;
    }
  }
  syncDialog();
  syncScreens();
  toBaseBtn.hidden = game.mode !== "ended";
  if (overlayEl.hidden !== (game.mode !== "overlay")) overlayEl.hidden = game.mode !== "overlay";
  const defeated = game.defeatTimer !== null;
  if (defeatEl.hidden === defeated) defeatEl.hidden = !defeated;

  renderer.draw(game.world, alpha);
  panel.updateStats(now);
  requestAnimationFrame(frame);
}

syncScreens();
requestAnimationFrame(frame);

// 動作確認・自動テスト用
(window as unknown as { __twf: unknown }).__twf = { game, params };
