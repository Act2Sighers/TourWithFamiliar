import { PARAM_META, createDefaultParams, getParam, mergeParams, setParam, type Params } from "../core/params";

const STORAGE_KEY = "twf.params.v2";

export interface DebugControls {
  paused: boolean;
  /** 1=等速。0.1〜1 */
  timeScale: number;
  /** 一時停止中に1ステップ進める要求(消費されたら false に戻す) */
  stepRequested: boolean;
}

export interface PanelHooks {
  onParamChanged(path: string): void;
  onResetWorld(seed: number): void;
  onDebugDamage(target: "watcher" | "familiar", amount: number): void;
  onDebugHealAll(): void;
  onDebugSpawnEnemy(): void;
  onDebugSendFamiliarAway(): void;
  getStats(): Record<string, string>;
}

export class DebugPanel {
  readonly controls: DebugControls = { paused: false, timeScale: 1, stepRequested: false };
  private stats: HTMLElement;
  private sliders = new Map<string, { input: HTMLInputElement; value: HTMLElement }>();
  private lastStats = 0;

  constructor(
    host: HTMLElement,
    private params: Params,
    private hooks: PanelHooks,
    initialSeed: number,
  ) {
    host.innerHTML = "";

    const body = el("div", "dbg-body");
    this.stats = el("pre", "dbg-stats");
    body.append(this.stats);

    // 時間操作
    const timeRow = el("div", "dbg-row");
    const pause = button("一時停止", () => {
      this.controls.paused = !this.controls.paused;
      pause.textContent = this.controls.paused ? "再開" : "一時停止";
    });
    const step = button("1コマ", () => {
      this.controls.paused = true;
      pause.textContent = "再開";
      this.controls.stepRequested = true;
    });
    timeRow.append(pause, step);
    body.append(timeRow);

    const slow = this.makeSlider("速度倍率", 0.1, 1, 0.05, 1, (v) => {
      this.controls.timeScale = v;
    });
    body.append(slow);

    // HP確認用(HPゲージの動作確認)
    const hpRow = el("div", "dbg-row");
    hpRow.append(
      button("観測者 -10HP", () => this.hooks.onDebugDamage("watcher", 10)),
      button("ファミリア -10HP", () => this.hooks.onDebugDamage("familiar", 10)),
      button("全員回復", () => this.hooks.onDebugHealAll()),
      button("敵を1体出す", () => this.hooks.onDebugSpawnEnemy()),
      button("ファミリアを存在範囲の外へ", () => this.hooks.onDebugSendFamiliarAway()),
    );
    body.append(hpRow);

    // シード
    const seedRow = el("div", "dbg-row");
    const seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.value = String(initialSeed);
    seedInput.className = "dbg-seed";
    seedRow.append(
      seedInput,
      button("シード再生成", () => this.hooks.onResetWorld(Number(seedInput.value) | 0)),
      button("ランダム", () => {
        seedInput.value = String((Math.random() * 0x7fffffff) | 0);
        this.hooks.onResetWorld(Number(seedInput.value) | 0);
      }),
    );
    body.append(seedRow);

    // パラメータ
    for (const m of PARAM_META) {
      const row = this.makeSlider(m.label, m.min, m.max, m.step, getParam(params, m.path), (v) => {
        setParam(this.params, m.path, v);
        this.hooks.onParamChanged(m.path);
        this.save();
      }, m.path);
      body.append(row);
    }

    // 保存・書き出し
    const ioRow = el("div", "dbg-row");
    ioRow.append(
      button("初期値に戻す", () => {
        mergeParams(this.params, createDefaultParams());
        this.syncSliders();
        for (const m of PARAM_META) this.hooks.onParamChanged(m.path);
        this.save();
      }),
      button("JSON書き出し", () => {
        const text = JSON.stringify(this.params, null, 2);
        navigator.clipboard?.writeText(text).catch(() => {});
        prompt("パラメータJSON(クリップボードにもコピー済み)", text);
      }),
      button("JSON読み込み", () => {
        const text = prompt("パラメータJSONを貼り付け");
        if (!text) return;
        try {
          mergeParams(this.params, JSON.parse(text));
          this.syncSliders();
          for (const m of PARAM_META) this.hooks.onParamChanged(m.path);
          this.save();
        } catch {
          alert("JSONを読み込めませんでした");
        }
      }),
    );
    body.append(ioRow);

    host.append(body);
  }

  /** 保存済みパラメータを読み込む(コンストラクタ前に呼ぶ想定の静的ヘルパー)。 */
  static loadSaved(params: Params): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) mergeParams(params, JSON.parse(raw));
    } catch {
      /* 保存データが壊れていても起動は継続する */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params));
    } catch {
      /* プライベートモード等 */
    }
  }

  private syncSliders(): void {
    for (const [path, s] of this.sliders) {
      const v = getParam(this.params, path);
      s.input.value = String(v);
      s.value.textContent = fmt(v);
    }
  }

  private makeSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (v: number) => void,
    path?: string,
  ): HTMLElement {
    const row = el("label", "dbg-slider");
    const name = el("span", "dbg-name");
    name.textContent = label;
    const val = el("span", "dbg-val");
    val.textContent = fmt(value);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      onInput(v);
    });
    row.append(name, val, input);
    if (path) this.sliders.set(path, { input, value: val });
    return row;
  }

  /** 毎フレーム呼ぶ。表示更新は約10Hzに間引く。 */
  updateStats(nowMs: number): void {
    if (nowMs - this.lastStats < 100) return;
    this.lastStats = nowMs;
    this.stats.textContent = Object.entries(this.hooks.getStats())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
