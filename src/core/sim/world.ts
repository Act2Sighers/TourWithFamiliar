// C#: World / Watcher(純粋ロジック。描画・DOMには依存しない)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";
import { ChunkMap } from "./chunks";
import { WATCHER_NAME, createBody, damage, distance, halt, isDown, setMaxHp, stepMotion, type Body } from "./body";
import { resolveCollisions } from "./collision";
import { hitCircle, weaponOf, type Fighter } from "./combat";
import { createEnemy, enemyAbilities, stepEnemy, type Enemy } from "./enemy";
import { createNeutral, neutralAbilities, stepNeutral, type Neutral } from "./neutral";
import {
  createFamiliar,
  familiarAbilities,
  familiarFromNeutral,
  reviveFamiliar,
  stepFamiliar,
  type Familiar,
  type FamiliarRole,
} from "./familiar";
import { existenceRangeOf } from "./ranges";
import { attackPowerOf } from "./stats";

export type Watcher = Body;

/**
 * インタラクトボタンの対象。優先順位は 助け起こし > 雇用。
 * 助け起こしはボタンを押し続ける操作、雇用は押した瞬間に確認ダイアログが出る操作。
 */
export type InteractionTarget =
  | { kind: "revive"; familiar: Familiar }
  | { kind: "hire"; neutral: Neutral };

const WATCHER_ID = 0;

export class World {
  tick = 0;
  time = 0;
  readonly watcher: Watcher;
  familiars: Familiar[] = [];
  /** 拠点へ送還されたファミリア(M1cでは保管するだけ。回復も召喚もまだ無い) */
  readonly base: Familiar[] = [];
  enemies: Enemy[] = [];
  neutrals: Neutral[] = [];
  readonly chunks: ChunkMap;
  private nextId = 1;

  constructor(
    readonly seed: number,
    readonly params: Params,
  ) {
    this.chunks = new ChunkMap(seed, params);
    this.watcher = createBody(WATCHER_ID, 0, 0, params.watcher.radius, params.watcher.maxHp, WATCHER_NAME);
  }

  // ---- 生成 ----

  /** 観測者の近くにファミリアを1体出す。M1では能力値は調整パネルの値(全員同じ)。 */
  spawnFamiliar(role: FamiliarRole, kindId?: string): Familiar {
    const f = createFamiliar(this.nextId++, role, this.watcher.x + 40, this.watcher.y + 30, this.seed, this.params, kindId);
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

  /** 中立個体をスポーンできるか(ワールド全体の上限)。 */
  canSpawnNeutral(): boolean {
    return this.neutrals.length < this.params.neutral.maxCount;
  }

  /** 上限を守って中立個体をスポーンする。ゲームとしてのスポーンは、必ずこちらを使う。 */
  trySpawnNeutral(x: number, y: number): Neutral | null {
    return this.canSpawnNeutral() ? this.spawnNeutral(x, y) : null;
  }

  /** 上限を守らない低レベルの生成(テストや内部用)。 */
  spawnNeutral(x: number, y: number): Neutral {
    const n = createNeutral(this.nextId++, x, y, this.seed, this.params);
    this.neutrals.push(n);
    return n;
  }

  /** 仮実装: 敵より少ない数の中立個体を、観測者の周囲のリング状の範囲へ、シードから決まる位置に固定で出す。 */
  spawnInitialNeutrals(): void {
    const n = this.params.neutral;
    const rng = new Rng(hash2(this.seed, 0xa5, 0));
    for (let i = 0; i < n.initialCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(n.spawnMin, Math.max(n.spawnMin, n.spawnMax));
      this.trySpawnNeutral(this.watcher.x + Math.cos(a) * r, this.watcher.y + Math.sin(a) * r);
    }
  }

  /** 調整パネルで変えた能力値を、既存のファミリア・敵に反映する(M1のみの暫定処理)。 */
  applyTemplateAbilities(): void {
    for (const f of this.familiars) f.abilities = familiarAbilities(this.params, f.kindId);
    for (const e of this.enemies) e.abilities = enemyAbilities(this.params);
    for (const n of this.neutrals) n.abilities = neutralAbilities(this.params);
  }

  // ---- 参照 ----

  enemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  neutralById(id: number): Neutral | undefined {
    return this.neutrals.find((n) => n.id === id);
  }

  isNeutral(b: Body): boolean {
    return this.neutrals.some((n) => n === b);
  }

  /** 観測者側(観測者またはファミリア)か。 */
  isPlayerSide(id: number): boolean {
    return id === this.watcher.id || this.familiars.some((f) => f.id === id);
  }

  /**
   * 敵の攻撃対象になれる者: 生きている観測者と、存在範囲の中にいる生きているファミリア、
   * そして生きている中立個体。戦闘不能の者は対象にならない。
   */
  enemyTargets(): Body[] {
    const out: Body[] = [];
    if (!isDown(this.watcher)) out.push(this.watcher);
    for (const f of this.familiars) if (!isDown(f) && !f.lost) out.push(f);
    for (const n of this.neutrals) if (!isDown(n)) out.push(n);
    return out;
  }

  enemyTargetById(id: number): Body | undefined {
    return this.enemyTargets().find((b) => b.id === id);
  }

  /** 敵が、観測者またはファミリアを攻撃対象にして臨戦になっているか。(中立個体を狙う敵は含まない) */
  engagedOnPlayerSide(e: Enemy): boolean {
    return e.state === "engaged" && e.targetId !== null && this.isPlayerSide(e.targetId);
  }

  /** 観測者側に臨戦している敵のうち、指定位置に最も近いもの。ファミリアの迎撃の対象を選ぶのに使う。 */
  nearestEngagedEnemy(x: number, y: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!this.engagedOnPlayerSide(e) || isDown(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** ファミリアを1人増やせるか。人数上限は同行中のファミリア(拠点にいる者は含めない)と、そのうちの側近について。 */
  canAddFamiliar(role: FamiliarRole): boolean {
    const p = this.params.party;
    if (this.familiars.length >= p.maxFamiliars) return false;
    if (role === "aide" && this.familiars.filter((f) => f.role === "aide").length >= p.maxAides) return false;
    return true;
  }

  /**
   * いまインタラクトボタンで何ができるか。複数あるときは優先順位(助け起こし > 雇用)で決める。
   * 助け起こしは、戦闘不能で残っている(送還が決まっていない)側近のうち、最も近いもの。
   * 雇用は、生きている中立個体のうち、最も近いもの(ボタンの出る距離は助け起こしより大きい)。
   */
  interactionTarget(): InteractionTarget | null {
    const w = this.watcher;
    if (isDown(w)) return null;
    let revive: Familiar | null = null;
    let reviveD = this.params.down.reviveRange;
    for (const f of this.familiars) {
      if (!f.down || f.vanishing) continue;
      const d = distance(f, w);
      if (d <= reviveD) {
        reviveD = d;
        revive = f;
      }
    }
    if (revive) return { kind: "revive", familiar: revive };
    let hire: Neutral | null = null;
    let hireD = this.params.party.hireRange;
    for (const n of this.neutrals) {
      if (isDown(n)) continue; // 戦闘不能の中立個体は雇用できない
      const d = distance(n, w);
      if (d <= hireD) {
        hireD = d;
        hire = n;
      }
    }
    return hire ? { kind: "hire", neutral: hire } : null;
  }

  /** 雇用する: 中立個体を同行者(ファミリア)にする。人数上限や状態の条件を満たさなければ何もしない。 */
  hireNeutral(id: number): Familiar | null {
    const n = this.neutralById(id);
    if (!n || isDown(n) || !this.canAddFamiliar("companion")) return null;
    this.neutrals = this.neutrals.filter((o) => o !== n);
    const f = familiarFromNeutral(n, "companion", this.seed, this.params);
    this.familiars.push(f);
    return f;
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

  debugSpawnCompanion(): void {
    this.spawnFamiliar("companion");
  }

  /** 観測者の少し離れた位置に中立個体を1体出す。 */
  debugSpawnNeutral(): void {
    const a = 1 + this.neutrals.length * 2.4;
    this.trySpawnNeutral(this.watcher.x + Math.cos(a) * 200, this.watcher.y + Math.sin(a) * 200);
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

    // 観測者(HP0なら動けない。倒れたあとの流れはGameが管理する)
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
    this.stepRevive(dt, input.interact ?? false);
    this.sendVanishedToBase();
    for (const e of this.enemies) stepEnemy(e, this, dt);
    for (const n of this.neutrals) stepNeutral(n, this, dt);

    // 観測者とファミリアの押し合いだけは例外で、観測者は一切押されない(ファミリアが全部よける)
    const fams = new Set<Body>(this.familiars);
    resolveCollisions(this.collidableBodies(), p, (a, b) => a === w && fams.has(b));

    this.resolveHits();
    this.enemies = this.enemies.filter((e) => !isDown(e));
    // 戦闘不能の中立個体は残るが、観測者を中心とした存在範囲の外に出たら消える
    if (this.neutrals.some((n) => isDown(n) && distance(n, w) > existence)) {
      this.neutrals = this.neutrals.filter((n) => !(isDown(n) && distance(n, w) > existence));
    }

    this.chunks.prune(this.chunks.coordOf(w.x), this.chunks.coordOf(w.y));

    this.tick++;
    this.time += dt;
  }

  /** 助け起こし: ボタンを押し続けている間だけ進む。 */
  private stepRevive(dt: number, held: boolean): void {
    const p = this.params;
    const t = held ? this.interactionTarget() : null;
    const target = t && t.kind === "revive" ? t : null;
    for (const f of this.familiars) {
      if (!f.down) continue;
      if (target && target.familiar === f) f.reviveProgress += dt / p.down.reviveTime;
      else if (p.down.reviveKeepProgress < 0.5) f.reviveProgress = 0;
      if (f.reviveProgress >= 1) reviveFamiliar(f, p);
    }
  }

  /** 送還が決まったファミリアを、一定時間後にフィールドから拠点へ移す。 */
  private sendVanishedToBase(): void {
    const delay = this.params.down.vanishDelay;
    if (!this.familiars.some((f) => f.vanishing && f.downTimer >= delay)) return;
    const keep: Familiar[] = [];
    for (const f of this.familiars) {
      if (f.vanishing && f.downTimer >= delay) this.base.push(f);
      else keep.push(f);
    }
    this.familiars = keep;
  }

  /** 押し合いの対象。戦闘不能(HP0)のキャラクターは押し合いに参加しない。 */
  private collidableBodies(): Body[] {
    const out: Body[] = [];
    if (!isDown(this.watcher)) out.push(this.watcher);
    for (const f of this.familiars) if (!isDown(f)) out.push(f);
    for (const e of this.enemies) if (!isDown(e)) out.push(e);
    for (const n of this.neutrals) if (!isDown(n)) out.push(n);
    return out;
  }

  /** 持続中のヒット判定を、相手側の全員と照合する。1回の攻撃につき1体1回だけ当たる。 */
  private resolveHits(): void {
    for (const f of this.familiars) this.resolveAttack(f, this.enemies);
    for (const n of this.neutrals) this.resolveAttack(n, this.enemies);
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
