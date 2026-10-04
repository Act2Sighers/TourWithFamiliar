// C#: Base(拠点。ファミリアを預かるインベントリ。ワールド上には存在しない、別の有限な空間)
import type { Params } from "../params";
import { resetFieldState, type Familiar } from "./familiar";
import { maxHpOf } from "./stats";

interface Entry {
  familiar: Familiar;
  /** 次の回復までの経過時間(秒)。個体ごとに、拠点に来た時点から数える */
  timer: number;
}

/**
 * 拠点。
 * - 送還されたファミリアを預かる。個体のデータ(HP・能力値など)は失われない。
 * - 預かっている間、遠征中に限り、HPが時間でゆっくり回復する。観測者が拠点にいる間は自動回復しない。
 * - HPが最大HPの一定割合(初期値50%)に達するまで、召喚できない。
 * - 容量は、同行中のファミリアも含めた総数で数える(容量の判定は World が行う)。
 */
export class Base {
  private entries: Entry[] = [];

  get members(): Familiar[] {
    return this.entries.map((e) => e.familiar);
  }

  get size(): number {
    return this.entries.length;
  }

  has(f: Familiar): boolean {
    return this.entries.some((e) => e.familiar === f);
  }

  find(id: number): Familiar | undefined {
    return this.entries.find((e) => e.familiar.id === id)?.familiar;
  }

  /**
   * ファミリアを預かる。フィールドでの状態(戦闘不能・迎撃など)は消える。
   * HPが最大HPの一定割合(初期値5%)以下(0を含む)なら、その割合まで、直後に回復する。それ以外は変わらない。
   */
  receive(f: Familiar, p: Params): void {
    resetFieldState(f, p);
    f.maxHp = maxHpOf(f.abilities, p);
    const floor = Math.max(1, Math.round(f.maxHp * p.base.arrivalMinHpRatio));
    if (f.hp <= floor) f.hp = floor;
    this.entries.push({ familiar: f, timer: 0 });
  }

  /** 預かっているファミリアを取り出す(召喚で使う)。 */
  take(f: Familiar): boolean {
    const i = this.entries.findIndex((e) => e.familiar === f);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }

  /** 召喚できるか: HPが最大HPの一定割合以上に回復している。 */
  canSummon(f: Familiar, p: Params): boolean {
    return f.hp >= maxHpOf(f.abilities, p) * p.base.summonMinHpRatio;
  }

  /**
   * 時間を進める。遠征中(観測者が拠点にいない)だけ、一定間隔ごとに最大HPの一定割合ずつ回復する。
   * 観測者が拠点にいる間は、自動回復しない。
   */
  step(dt: number, p: Params, watcherAtBase: boolean): void {
    if (watcherAtBase) return;
    for (const e of this.entries) {
      const f = e.familiar;
      f.maxHp = maxHpOf(f.abilities, p);
      if (f.hp >= f.maxHp) {
        e.timer = 0;
        continue;
      }
      e.timer += dt;
      while (e.timer >= p.base.regenInterval && f.hp < f.maxHp) {
        e.timer -= p.base.regenInterval;
        f.hp = Math.min(f.maxHp, f.hp + Math.max(1, Math.round(f.maxHp * p.base.regenRatio)));
      }
    }
  }
}
