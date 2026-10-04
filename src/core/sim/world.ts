// C#: World / Watcher(純粋ロジック。描画・DOMには依存しない)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";
import { ChunkMap } from "./chunks";
import { createBody, damage, distance, halt, isDown, setMaxHp, stepMotion, type Body } from "./body";
import { hitCircle, weaponOf, type Fighter } from "./combat";
import { createEnemy, enemyAbilities, stepEnemy, type Enemy } from "./enemy";
import { createFamiliar, familiarAbilities, stepFamiliar, type Familiar, type FamiliarRole } from "./familiar";
import { existenceRangeOf } from "./ranges";
import { attackPowerOf } from "./stats";

export type Watcher = Body;

const WATCHER_ID = 0;

export class World {
  tick = 0;
  time = 0;
  readonly watcher: Watcher;
  readonly familiars: Familiar[] = [];
  enemies: Enemy[] = [];
  readonly chunks: ChunkMap;
  private nextId = 1;

  constructor(
    readonly seed: number,
    readonly params: Params,
  ) {
    this.chunks = new ChunkMap(seed, params);
    this.watcher = createBody(WATCHER_ID, 0, 0, params.watcher.radius, params.watcher.maxHp);
  }

  // ---- 生成 ----

  /** 観測者の近くにファミリアを1体出す。M1では能力値は調整パネルの値(全員同じ)。 */
  spawnFamiliar(role: FamiliarRole): Familiar {
    const f = createFamiliar(this.nextId++, role, this.watcher.x + 40, this.watcher.y + 30, this.seed, this.params);
    this.familiars.push(f);
    return f;
  }

  spawnEnemy(x: number, y: number): Enemy {
    const e = createEnemy(this.nextId++, x, y, this.seed, this.params);
    this.enemies.push(e);
    return e;
  }

  /** 仮実装: 観測者の周囲のリング状の範囲に、シードから決まる位置へ数体を固定で出す。 */
  spawnInitialEnemies(): void {
    const e = this.params.enemy;
    const rng = new Rng(hash2(this.seed, 0xe5, 0));
    for (let i = 0; i < e.initialCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(e.spawnMin, Math.max(e.spawnMin, e.spawnMax));
      this.spawnEnemy(this.watcher.x + Math.cos(a) * r, this.watcher.y + Math.sin(a) * r);
    }
  }

  /** 調整パネルで変えた能力値を、既存のファミリア・敵に反映する(M1のみの暫定処理)。 */
  applyTemplateAbilities(): void {
    for (const f of this.familiars) f.abilities = familiarAbilities(this.params);
    for (const e of this.enemies) e.abilities = enemyAbilities(this.params);
  }

  // ---- 参照 ----

  enemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  /** 敵の攻撃対象になれる者: 生きている観測者と、存在範囲の中にいる生きているファミリア。 */
  enemyTargets(): Body[] {
    const out: Body[] = [];
    if (!isDown(this.watcher)) out.push(this.watcher);
    for (const f of this.familiars) if (!isDown(f) && !f.lost) out.push(f);
    return out;
  }

  enemyTargetById(id: number): Body | undefined {
    return this.enemyTargets().find((b) => b.id === id);
  }

  /** 臨戦中の敵のうち、指定位置に最も近いもの。 */
  nearestEngagedEnemy(x: number, y: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.state !== "engaged" || isDown(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ---- デバッグ ----

  debugDamage(target: "watcher" | "familiar", amount: number): void {
    if (target === "watcher") damage(this.watcher, amount);
    else for (const f of this.familiars) damage(f, amount);
  }

  debugHealAll(): void {
    this.watcher.hp = this.watcher.maxHp;
    for (const f of this.familiars) f.hp = f.maxHp;
  }

  /** 観測者の少し離れた位置に敵を1体出す。 */
  debugSpawnEnemy(): void {
    const a = this.enemies.length * 2.4; // 呼ぶたびに違う方向になる(乱数は使わない)
    this.spawnEnemy(this.watcher.x + Math.cos(a) * 300, this.watcher.y + Math.sin(a) * 300);
  }

  /** ファミリアを存在範囲の少し外へ飛ばす。 */
  debugSendFamiliarAway(): void {
    const d = existenceRangeOf(this.params) + 200;
    for (const f of this.familiars) {
      f.x = f.prevX = this.watcher.x + d;
      f.y = f.prevY = this.watcher.y;
      f.vx = f.vy = 0;
    }
  }

  // ---- 進行 ----

  /** 固定刻み dt(秒)で1ステップ進める。 */
  step(dt: number, input: MoveInput): void {
    const w = this.watcher;
    const p = this.params;

    w.radius = p.watcher.radius;
    setMaxHp(w, p.watcher.maxHp);

    // 観測者(HP0なら動けない。倒れたときの扱いはM1c)
    if (isDown(w)) {
      halt(w, p.watcher.friction, dt);
    } else {
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
    }

    const existence = existenceRangeOf(p);
    for (const f of this.familiars) f.lost = distance(f, w) > existence;

    for (const f of this.familiars) stepFamiliar(f, this, dt);
    for (const e of this.enemies) stepEnemy(e, this, dt);

    this.resolveHits();
    this.enemies = this.enemies.filter((e) => !isDown(e));

    this.chunks.prune(this.chunks.coordOf(w.x), this.chunks.coordOf(w.y));

    this.tick++;
    this.time += dt;
  }

  /** 持続中のヒット判定を、相手側の全員と照合する。1回の攻撃につき1体1回だけ当たる。 */
  private resolveHits(): void {
    for (const f of this.familiars) this.resolveAttack(f, this.enemies);
    const targets = this.enemyTargets();
    for (const e of this.enemies) this.resolveAttack(e, targets);
  }

  private resolveAttack(attacker: Fighter, targets: Body[]): void {
    const weapon = weaponOf(attacker.weaponId, this.params);
    const circle = hitCircle(attacker, attacker.combat, weapon);
    if (!circle || isDown(attacker)) return;
    for (const t of targets) {
      if (isDown(t) || attacker.combat.hit.has(t.id)) continue;
      if (Math.hypot(t.x - circle.x, t.y - circle.y) > circle.r + t.radius) continue;
      attacker.combat.hit.add(t.id);
      damage(t, attackPowerOf(attacker.abilities, weapon, this.params));
    }
  }
}
