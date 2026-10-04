// C#: TeleportEffect(召喚・送還の演出。見た目だけのデータで、ゲームの進行には影響しない)
import type { FamiliarRole } from "./familiar";

/** vanish=送還(消える) / appear=召喚(現れる) */
export type TeleportKind = "vanish" | "appear";

/**
 * 召喚・送還が起きた場所に出る、波紋のような演出。
 * 「召喚・送還」と、ほかの理由での消失・出現(戦闘不能で倒れて消える敵、新しくスポーンした存在など)を、見分けられるようにする。
 * 時間はワールドの時間で進む(ワールドが止まっている間は、演出も止まる)。
 */
export interface TeleportEffect {
  kind: TeleportKind;
  x: number;
  y: number;
  /** 対象の本体の半径(波紋の大きさの基準) */
  radius: number;
  role: FamiliarRole;
  /** 召喚された個体のID(召喚の演出の間、その個体を徐々に現す) */
  targetId: number;
  /** 経過時間(秒) */
  age: number;
  duration: number;
}

/** 召喚された個体は、演出の前半で、徐々に現れる(その割合)。 */
export const APPEAR_FADE_RATIO = 0.5;
