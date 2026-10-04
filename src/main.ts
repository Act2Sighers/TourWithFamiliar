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

const initialSeed = 12345;
const game = new Game(initialSeed, params);
const renderer = new Renderer(canvas, params);
const stepper = new FixedStepper(params.sim.hz);
const inputs = new InputManager([new KeyboardInput(), new GamepadInput(), new TouchInput(canvas, menuBtn)]);

let fps = 60;

const panel = new DebugPanel(
  debugEl,
  params,
  {
    onParamChanged: (path) => game.onParamChanged(path),
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
        chunks: String(w.chunks.count),
        fps: fps.toFixed(0),
      };
    },
  },
  initialSeed,
);

function syncOverlay(): void {
  overlayEl.hidden = game.mode !== "overlay";
}

function toggleOverlay(): void {
  game.toggleOverlay();
  stepper.reset();
  syncOverlay();
}

resumeBtn.addEventListener("click", () => {
  if (game.mode === "overlay") toggleOverlay();
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
  if (input.menuPressed) toggleOverlay();

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

  renderer.draw(game.world, alpha);
  panel.updateStats(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// 動作確認・自動テスト用
(window as unknown as { __twf: unknown }).__twf = { game, params };
