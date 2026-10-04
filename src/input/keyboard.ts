import type { InputSource } from "../core/input";

const MOVE_KEYS = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const BLOCKED = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  /** 次のpollまで保持する(フレーム間に押して離された短いタップも取りこぼさない) */
  private menuQueued = false;
  private confirmQueued = false;
  /** 短いタップでも、少なくとも1回のpollでは「押されている」と報告する */
  private interactQueued = false;
  /** 移動キーの短いタップも同様に、次のpollまで保持する(メニューの左右移動などで取りこぼさないため) */
  private moveQueued = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      if (isTypingTarget(e.target)) return;
      if (BLOCKED.has(e.code)) e.preventDefault();
      this.down.add(e.code);
      if (MOVE_KEYS.has(e.code)) this.moveQueued.add(e.code);
      if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) this.menuQueued = true;
      if (e.code === "KeyE") this.interactQueued = true;
      if ((e.code === "Enter" || e.code === "NumpadEnter") && !e.repeat) this.confirmQueued = true;
    });
    target.addEventListener("keyup", (e) => this.down.delete(e.code));
    target.addEventListener("blur", () => this.down.clear());
  }

  poll() {
    const held = (code: string) => this.down.has(code) || this.moveQueued.has(code);
    const left = held("KeyA") || held("ArrowLeft");
    const right = held("KeyD") || held("ArrowRight");
    const up = held("KeyW") || held("ArrowUp");
    const down = held("KeyS") || held("ArrowDown");
    this.moveQueued.clear();
    const d = this.down;
    const menu = this.menuQueued;
    this.menuQueued = false;
    const confirm = this.confirmQueued;
    this.confirmQueued = false;
    const interact = d.has("KeyE") || this.interactQueued;
    this.interactQueued = false;
    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      menu,
      interact,
      confirm,
      cancel: false, // いいえ は Esc(メニューと同じボタン)で行う
    };
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
