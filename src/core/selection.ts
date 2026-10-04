// C#: CandidateSelection(最初の側近の選択画面の、カーソルと選択の状態。表示や入力デバイスには依存しない)

/**
 * 候補の選択。操作は2段階: 候補を選ぶ → 開始する。
 * 左右の移動は、動いた先をそのまま選択する。決定ボタンは、未選択なら焦点の候補を選び、選択済みなら開始を知らせる。
 */
export class CandidateSelection {
  /** カーソルのある候補 */
  focus = 0;
  /** 選ばれている候補。未選択は null */
  selected: number | null = null;

  constructor(public count: number) {}

  reset(): void {
    this.focus = 0;
    this.selected = null;
  }

  move(dir: -1 | 1): void {
    if (this.count === 0) return;
    this.focus = (this.focus + dir + this.count) % this.count;
    this.selected = this.focus;
  }

  select(index: number): void {
    if (index < 0 || index >= this.count) return;
    this.focus = index;
    this.selected = index;
  }

  /** 決定(Enter / A)。開始してよければ true を返す。 */
  confirm(): boolean {
    if (this.selected === null) {
      if (this.count > 0) this.selected = this.focus;
      return false;
    }
    return true;
  }

  get canStart(): boolean {
    return this.selected !== null;
  }
}
