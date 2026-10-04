// C#: IInputSource / InputSnapshot(UnityではInput SystemのActionへ置き換え)

/** 入力デバイスに依存しない、シミュレーションへ渡す入力。 */
export interface MoveInput {
  /** -1..1 (右が+)。画面座標系で、下が+ */
  moveX: number;
  moveY: number;
  /**
   * インタラクトボタンが押されている間 true(押し続けが必要な操作のため、エッジではなくレベル)。
   * ラン中に移動以外でプレイヤーに要求する操作は、このボタン1つに集約する。
   */
  interact?: boolean;
}

export interface InputSnapshot extends MoveInput {
  /** このフレームでメニュー切替が押された(エッジ) */
  menuPressed: boolean;
  interact: boolean;
}

/** 各入力デバイスが実装する。値は毎フレームpollされる。 */
export interface InputSource {
  poll(): { moveX: number; moveY: number; menu: boolean; interact: boolean };
}

/** 円形のデッドゾーン処理 + 長さ1へのクランプ。 */
export function applyDeadzone(x: number, y: number, deadzone: number): MoveInput {
  const len = Math.hypot(x, y);
  if (len <= deadzone || len === 0) return { moveX: 0, moveY: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { moveX: (x / len) * scaled, moveY: (y / len) * scaled };
}
