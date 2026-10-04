import type { InputSource } from "../core/input";

/**
 * フローティング仮想スティック。画面のどこを触っても、触った位置が原点になる。
 * テスト用にマウスのドラッグでも動く。
 */
export class TouchInput implements InputSource {
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private x = 0;
  private y = 0;
  private menuQueued = false;
  private interactHeld = false;
  private readonly interactButton: HTMLElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  /** スティックの最大傾き(CSSピクセル) */
  static readonly RADIUS = 56;

  constructor(surface: HTMLElement, menuButton: HTMLElement, interactButton: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "stick-base";
    this.knob = document.createElement("div");
    this.knob.className = "stick-knob";
    this.base.append(this.knob);
    document.body.append(this.base);

    surface.addEventListener("pointerdown", (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.x = this.y = 0;
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.base.style.display = "block";
      this.knob.style.transform = "translate(-50%, -50%)";
    });
    surface.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointerId) return;
      const R = TouchInput.RADIUS;
      let dx = e.clientX - this.ox;
      let dy = e.clientY - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.x = dx / R;
      this.y = dy / R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.x = this.y = 0;
      this.base.style.display = "none";
    };
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", end);

    menuButton.addEventListener("click", () => {
      this.menuQueued = true;
    });

    this.interactButton = interactButton;
    // インタラクトは押している間だけ有効(助け起こしなどの押し続ける操作のため)
    interactButton.addEventListener("pointerdown", (e) => {
      interactButton.setPointerCapture(e.pointerId);
      this.interactHeld = true;
    });
    const release = () => {
      this.interactHeld = false;
    };
    interactButton.addEventListener("pointerup", release);
    interactButton.addEventListener("pointercancel", release);
    interactButton.addEventListener("lostpointercapture", release);
  }

  poll() {
    const menu = this.menuQueued;
    this.menuQueued = false;
    // 押したままボタンが消えた(対象がいなくなった)場合に、押下状態が残らないようにする
    if (this.interactButton.hidden) this.interactHeld = false;
    return { moveX: this.x, moveY: this.y, menu, interact: this.interactHeld };
  }
}
