// C#: PartyRules / PartySelection(遠征に連れ出すファミリアの選択。表示や入力デバイスには依存しない)
import type { Params } from "../params";
import type { Familiar } from "./familiar";

export type PartyCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "no_aide" | "too_many" | "too_many_aides" };

/**
 * 遠征に連れ出す顔ぶれが、条件を満たすか。
 * 観測者と共に、少なくとも1人のファミリアと1人の側近がいなければならない。人数には上限がある(側近2人・ファミリア5人)。
 * HPの条件は設けない(全員のHPが低くても、遠征に出られなくならないように)。
 */
export function checkParty(members: Familiar[], p: Params): PartyCheck {
  if (members.length === 0) return { ok: false, reason: "empty" };
  const aides = members.filter((f) => f.role === "aide").length;
  if (aides < 1) return { ok: false, reason: "no_aide" };
  if (members.length > p.party.maxFamiliars) return { ok: false, reason: "too_many" };
  if (aides > p.party.maxAides) return { ok: false, reason: "too_many_aides" };
  return { ok: true };
}

export const PARTY_REASON_TEXT: Record<Exclude<PartyCheck, { ok: true }>["reason"], string> = {
  empty: "ファミリアを選んでください",
  no_aide: "側近を1人以上選んでください",
  too_many: "同行できる人数の上限です",
  too_many_aides: "側近の人数の上限です",
};

/**
 * 連れ出す者の選択。カーソルは、各ファミリアのカードと、最後の「出発」の位置を巡る。
 * 決定ボタンは、カードの上では選択の切り替え、「出発」の上では出発の要求になる。
 */
export class PartySelection {
  focus = 0;
  readonly chosen = new Set<number>();

  /** ids: 選べるファミリアのID(表示する順) */
  constructor(readonly ids: number[]) {}

  /** カードの数 + 「出発」の1つ */
  get slots(): number {
    return this.ids.length + 1;
  }

  get onDepartSlot(): boolean {
    return this.focus === this.ids.length;
  }

  move(dir: -1 | 1): void {
    this.focus = (this.focus + dir + this.slots) % this.slots;
  }

  focusOn(index: number): void {
    if (index >= 0 && index < this.slots) this.focus = index;
  }

  toggle(id: number): void {
    if (!this.ids.includes(id)) return;
    if (this.chosen.has(id)) this.chosen.delete(id);
    else this.chosen.add(id);
  }

  /** 決定(Enter / A): カードなら選択を切り替える。「出発」なら 'depart' を返す。 */
  confirm(): "toggled" | "depart" {
    if (this.onDepartSlot) return "depart";
    this.toggle(this.ids[this.focus]!);
    return "toggled";
  }

  /** 選ばれているID(表示する順)。 */
  chosenIds(): number[] {
    return this.ids.filter((id) => this.chosen.has(id));
  }
}
