// C#: World / Watcher(純粋ロジック。描画・DOMには依存しない)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { ChunkMap } from "./chunks";
import { createBody, damage, setMaxHp, stepMotion, type Body } from "./body";
import { createFamiliar, stepFamiliar, type Familiar, type FamiliarRole } from "./familiar";
import { maxHpOf } from "./stats";

export type Watcher = Body;

export class World {
  tick = 0;
  time = 0;
  readonly watcher: Watcher;
  readonly familiars: Familiar[] = [];
  readonly chunks: ChunkMap;
  private nextId = 1;

  constructor(
    readonly seed: number,
    private params: Params,
  ) {
    this.chunks = new ChunkMap(seed, params);
    this.watcher = createBody(0, 0, params.watcher.radius, params.watcher.maxHp);
  }

  /** 観測者の近くにファミリアを1体出す。M1aでは能力値は調整パネルの値(全員同じ)。 */
  spawnFamiliar(role: FamiliarRole): Familiar {
    const p = this.params;
    const f = createFamiliar(
      this.nextId++,
      role,
      this.watcher.x + 40,
      this.watcher.y + 30,
      this.seed,
      { toughness: p.familiar.toughness, agility: p.familiar.agility },
      p,
    );
    this.familiars.push(f);
    return f;
  }

  /** 調整パネルで変えた能力値を、既存のファミリアに反映する(M1aのみの暫定処理)。 */
  applyTemplateAbilities(): void {
    for (const f of this.familiars) {
      f.abilities = { toughness: this.params.familiar.toughness, agility: this.params.familiar.agility };
    }
  }

  /** デバッグ用。 */
  debugDamage(target: "watcher" | "familiar", amount: number): void {
    if (target === "watcher") damage(this.watcher, amount);
    else for (const f of this.familiars) damage(f, amount);
  }

  debugHealAll(): void {
    this.watcher.hp = this.watcher.maxHp;
    for (const f of this.familiars) f.hp = f.maxHp;
  }

  /** 固定刻み dt(秒)で1ステップ進める。 */
  step(dt: number, input: MoveInput): void {
    const w = this.watcher;
    const p = this.params;

    w.radius = p.watcher.radius;
    setMaxHp(w, p.watcher.maxHp);

    const len = Math.hypot(input.moveX, input.moveY);
    const hasInput = len > 0;
    const norm = len > 1 ? 1 / len : 1; // 斜めが速くならないように
    stepMotion(
      w,
      input.moveX * norm * p.watcher.maxSpeed,
      input.moveY * norm * p.watcher.maxSpeed,
      hasInput,
      p.watcher.accel,
      p.watcher.friction,
      dt,
    );
    if (hasInput) w.facing = Math.atan2(input.moveY, input.moveX);

    for (const f of this.familiars) {
      f.radius = p.familiar.radius;
      setMaxHp(f, maxHpOf(f.abilities, p));
      stepFamiliar(f, w, p, dt);
    }

    this.chunks.prune(this.chunks.coordOf(w.x), this.chunks.coordOf(w.y));

    this.tick++;
    this.time += dt;
  }
}
