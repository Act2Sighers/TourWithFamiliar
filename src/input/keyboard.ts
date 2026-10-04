import type { InputSource } from "../core/input";

const BLOCKED = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  /** 次のpollまで保持する(フレーム間に押して離された短いタップも取りこぼさない) */
  private menuQueued = false;

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      if (isTypingTarget(e.target)) return;
      if (BLOCKED.has(e.code)) e.preventDefault();
      this.down.add(e.code);
      if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) this.menuQueued = true;
    });
    target.addEventListener("keyup", (e) => this.down.delete(e.code));
    target.addEventListener("blur", () => this.down.clear());
  }

  poll() {
    const d = this.down;
    const left = d.has("KeyA") || d.has("ArrowLeft");
    const right = d.has("KeyD") || d.has("ArrowRight");
    const up = d.has("KeyW") || d.has("ArrowUp");
    const down = d.has("KeyS") || d.has("ArrowDown");
    const menu = this.menuQueued;
    this.menuQueued = false;
    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      menu,
      interact: d.has("KeyE"),
    };
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
