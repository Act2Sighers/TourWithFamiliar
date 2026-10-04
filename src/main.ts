import "./style.css";
import { createDefaultParams } from "./core/params";
import { Game } from "./core/sim/game";
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

const initialSeed = 12345;
const game = new Game(initialSeed, params);
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
    onDebugSpawnNeutral: () => game.world.debugSpawnNeutral(),
    onDebugSpawnEnemy: () => game.world.debugSpawnEnemy(),
    onDebugSendFamiliarAway: () => game.world.debugSendFamiliarAway(),
    onResetWorld: (seed) => {
      game.reset(seed);
      stepper.reset();
      syncOverlay();
    },
    getStats: () => {
      const w = game.world;
      return {
        mode: game.mode,
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
  if (w.base.length > 0) out.base = `${w.base.length}体`;
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

/** 確認ダイアログの表示を、ゲームの状態に合わせる。 */
let shownDialog: string | null = null;
function syncDialog(): void {
  const d = game.dialog;
  const key = d ? d.kind : null;
  if (key === shownDialog) return;
  shownDialog = key;
  dialogEl.hidden = d === null;
  if (!d) return;
  if (d.kind === "hire") {
    dialogMessage.textContent = "この中立個体を雇用しますか？";
    dialogYes.textContent = "はい";
    dialogNo.hidden = false;
    dialogHint.textContent = "Enter / A: はい　Esc / B: いいえ";
  } else {
    dialogMessage.textContent = "これ以上同行できません";
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

let last = performance.now();
let alpha = 1;

function frame(now: number): void {
  const frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > 0) fps += (1 / frameDt - fps) * 0.1;

  const input = inputs.poll(params.input.deadzone);
  if (game.mode === "dialog") {
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
  const defeated = game.defeatTimer !== null;
  if (defeatEl.hidden === defeated) defeatEl.hidden = !defeated;

  renderer.draw(game.world, alpha);
  panel.updateStats(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// 動作確認・自動テスト用
(window as unknown as { __twf: unknown }).__twf = { game, params };
