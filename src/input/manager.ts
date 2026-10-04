import { applyDeadzone, type InputSnapshot, type InputSource } from "../core/input";

/** 複数デバイスの入力を1つにまとめる(最も大きく倒されたものを採用)。 */
export class InputManager {
  private prevMenu = false;

  constructor(private sources: InputSource[]) {}

  poll(deadzone: number): InputSnapshot {
    let bx = 0;
    let by = 0;
    let best = 0;
    let menu = false;
    let interact = false;
    for (const s of this.sources) {
      const r = s.poll();
      const mag = Math.hypot(r.moveX, r.moveY);
      if (mag > best) {
        best = mag;
        bx = r.moveX;
        by = r.moveY;
      }
      menu ||= r.menu;
      interact ||= r.interact;
    }
    const menuPressed = menu && !this.prevMenu;
    this.prevMenu = menu;
    const move = applyDeadzone(bx, by, deadzone);
    return { ...move, menuPressed, interact };
  }
}
