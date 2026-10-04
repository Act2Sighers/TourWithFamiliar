import type { InputSource } from "../core/input";

/** 標準マッピングのゲームパッド(左スティック/十字キー、Startでメニュー、Aでインタラクト/はい、Bでいいえ)。 */
export class GamepadInput implements InputSource {
  poll() {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      let x = pad.axes[0] ?? 0;
      let y = pad.axes[1] ?? 0;
      const b = pad.buttons;
      const dx = (b[15]?.pressed ? 1 : 0) - (b[14]?.pressed ? 1 : 0);
      const dy = (b[13]?.pressed ? 1 : 0) - (b[12]?.pressed ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        x = dx;
        y = dy;
      }
      return { moveX: x, moveY: y, menu: !!b[9]?.pressed, interact: !!b[0]?.pressed, confirm: !!b[0]?.pressed, cancel: !!b[1]?.pressed };
    }
    return { moveX: 0, moveY: 0, menu: false, interact: false, confirm: false, cancel: false };
  }
}
