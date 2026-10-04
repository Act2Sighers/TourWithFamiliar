// C#: FamiliarKind(ファミリアの種類。今は1種類だけ。種類が増えたら、名前と初期の能力値をここに足す)
import type { Params } from "../params";
import type { Abilities } from "./stats";

export interface FamiliarKind {
  id: string;
  /** 本体に表示する名前(基本はアルファベット2文字のイニシャル) */
  name: string;
  /** 初期の能力値 */
  abilities(p: Params): Abilities;
}

export const DEFAULT_KIND_ID = "fm";

/** 最初の側近の候補にも使う一覧。 */
export const FAMILIAR_KINDS: readonly FamiliarKind[] = [
  {
    id: DEFAULT_KIND_ID,
    name: "FM",
    abilities: (p) => ({ toughness: p.familiar.toughness, attack: p.familiar.attack, agility: p.familiar.agility }),
  },
];

export function kindById(id: string): FamiliarKind | undefined {
  return FAMILIAR_KINDS.find((k) => k.id === id);
}
