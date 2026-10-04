// C#: FixedStepper(Unityでは FixedUpdate に置き換わる想定。ロジック側は dt 固定で書く)

export interface StepResult {
  /** このフレームで実行すべきシミュレーションステップ数 */
  steps: number;
  /** 描画補間用 [0,1) */
  alpha: number;
}

/** 実時間の経過を固定刻みのステップ数へ変換する。 */
export class FixedStepper {
  private acc = 0;

  constructor(
    public hz: number,
    /** 処理落ち時に「死のスパイラル」へ入らないための1フレーム最大ステップ数 */
    private maxSteps = 5,
  ) {}

  get dt(): number {
    return 1 / this.hz;
  }

  advance(frameDt: number): StepResult {
    const dt = this.dt;
    this.acc += Math.min(Math.max(frameDt, 0), dt * this.maxSteps);
    let steps = 0;
    while (this.acc >= dt - 1e-9 && steps < this.maxSteps) {
      this.acc -= dt;
      steps++;
    }
    if (this.acc < 0) this.acc = 0;
    return { steps, alpha: this.acc / dt };
  }

  reset(): void {
    this.acc = 0;
  }
}
