// C#: TalkAction(「話しかける」で選べる、ファミリアに関する行動。今後「会話する」「離脱させる」などが足される)
import type { Familiar } from "./familiar";
import type { World } from "./world";

/** dispatch=送還する / promote=側近にする / demote=同行者にする */
export type TalkActionId = "dispatch" | "promote" | "demote";

/** 選べない理由。last_familiar=最後のファミリア / last_aide=最後の側近 / aide_limit=側近の人数の上限 */
export type TalkBlock = "last_familiar" | "last_aide" | "aide_limit";

export interface TalkAction {
  id: TalkActionId;
  enabled: boolean;
  /** 選べない理由(選べるなら null) */
  block: TalkBlock | null;
}

/** そのファミリアに対して、いま選べる行動の一覧(選べないものも、理由つきで含める)。 */
export function talkActionsOf(world: World, f: Familiar): TalkAction[] {
  const out: TalkAction[] = [];

  let dispatchBlock: TalkBlock | null = null;
  if (world.familiars.length <= 1) dispatchBlock = "last_familiar";
  else if (!world.canDispatch(f)) dispatchBlock = "last_aide";
  out.push({ id: "dispatch", enabled: dispatchBlock === null, block: dispatchBlock });

  if (f.role === "companion") {
    const b = world.roleChangeBlock(f, "aide");
    out.push({ id: "promote", enabled: b === null, block: b === "aide_limit" ? "aide_limit" : null });
  } else {
    const b = world.roleChangeBlock(f, "companion");
    out.push({ id: "demote", enabled: b === null, block: b === "last_aide" ? "last_aide" : null });
  }
  return out;
}

/** 行動を実行する。選べない行動は何もせず false を返す。 */
export function performTalkAction(world: World, f: Familiar, id: TalkActionId): boolean {
  const action = talkActionsOf(world, f).find((a) => a.id === id);
  if (!action || !action.enabled) return false;
  switch (id) {
    case "dispatch":
      return world.dispatchToBase(f.id);
    case "promote":
      return world.setRole(f.id, "aide");
    case "demote":
      return world.setRole(f.id, "companion");
  }
}
