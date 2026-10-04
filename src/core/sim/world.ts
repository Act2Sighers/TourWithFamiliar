// C#: World / Watcher(純粋ロジック。描画・DOMには依存しない)
import type { MoveInput } from "../input";
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";
import { Base } from "./base";
import { ChunkMap } from "./chunks";
import { WATCHER_NAME, createBody, damage, distance, halt, isDown, setMaxHp, stepMotion, type Body } from "./body";
import { resolveCollisions } from "./collision";
import { APPEAR_FADE_RATIO, type TeleportEffect, type TeleportKind } from "./effects";
import { hitCircle, weaponOf, type Fighter } from "./combat";
import { createEnemy, enemyAbilities, stepEnemy, type Enemy } from "./enemy";
import { createNeutral, neutralAbilities, stepNeutral, type Neutral } from "./neutral";
import {
  createFamiliar,
  resetFieldState,
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
 * インタラクトボタンの対象。優先順位は 助け起こし > 雇用 > 話しかける。(話しかけるが最も低い)
 * 助け起こしはボタンを押し続ける操作、雇用と話しかけるは、押した瞬間にダイアログが出る操作。
 */
export type InteractionTarget =
  | { kind: "revive"; familiar: Familiar }
  | { kind: "hire"; neutral: Neutral }
  | { kind: "talk"; familiar: Familiar };

const WATCHER_ID = 0;
/** 召喚されたファミリアの出現位置は、待機範囲のこの割合の内側(待機中の目的地と同じ)。 */
const SUMMON_REACH = 0.9;

export class World {
  tick = 0;
  time = 0;
  readonly watcher: Watcher;
  familiars: Familiar[] = [];
  enemies: Enemy[] = [];
  neutrals: Neutral[] = [];
  /** 召喚・送還の演出(見た目だけ。ワールドの時間で進み、終わったら消える) */
  effects: TeleportEffect[] = [];
  readonly chunks: ChunkMap;

  constructor(
    readonly seed: number,
    readonly params: Params,
    /** 拠点。遠征をまたいで持ち越すので、ゲームから渡す。渡さなければ、このワールドだけの拠点になる */
    readonly base: Base = new Base(),
  ) {
    this.chunks = new ChunkMap(seed, params);
    this.watcher = createBody(WATCHER_ID, 0, 0, params.watcher.radius, params.watcher.maxHp, WATCHER_NAME);
  }

  // ---- 生成 ----

  /** 観測者の近くにファミリアを1体出す。M1では能力値は調整パネルの値(全員同じ)。 */
  spawnFamiliar(role: FamiliarRole, kindId?: string): Familiar {
    const f = createFamiliar(this.base.allocateId(), role, this.watcher.x + 40, this.watcher.y + 30, this.seed, this.params, kindId);
    this.familiars.push(f);
    return f;
  }

  spawnEnemy(x: number, y: number): Enemy {
    const e = createEnemy(this.base.allocateId(), x, y, this.seed, this.params);
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

  /**
   * 拠点から連れ出したファミリアを、遠征の開始時に、観測者の周りへ並べる(index 番目)。
   * 個体のデータ(HP・役割・能力値)は変わらない。
   */
  deployFamiliar(f: Familiar, index: number): void {
    const a = (index * Math.PI * 2) / this.params.party.maxFamiliars + Math.PI / 6;
    f.x = f.prevX = this.watcher.x + Math.cos(a) * 45;
    f.y = f.prevY = this.watcher.y + Math.sin(a) * 45;
    resetFieldState(f, this.params);
    this.familiars.push(f);
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
    const n = createNeutral(this.base.allocateId(), x, y, this.seed, this.params);
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

  /** 戦闘中か: 観測者またはファミリアが、いずれかの敵の攻撃対象になっている。(中立個体を狙う敵は含まない) */
  inCombat(): boolean {
    return this.enemies.some((e) => !isDown(e) && this.engagedOnPlayerSide(e));
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

  /** 召喚・送還の演出を出す。 */
  private emitTeleport(kind: TeleportKind, f: Familiar): void {
    this.effects.push({
      kind,
      x: f.x,
      y: f.y,
      radius: f.radius,
      role: f.role,
      targetId: f.id,
      age: 0,
      duration: Math.max(0.01, this.params.effects.teleportDuration),
    });
  }

  /** 召喚の演出の間、その個体をどのくらい見せるか(0=見えない … 1=完全に見える)。演出が無ければ 1。 */
  appearAlpha(id: number): number {
    const e = this.effects.find((o) => o.kind === "appear" && o.targetId === id);
    return e ? Math.min(1, e.age / (e.duration * APPEAR_FADE_RATIO)) : 1;
  }

  /** 持っているファミリアの総数(同行中 + 拠点)。 */
  totalFamiliars(): number {
    return this.familiars.length + this.base.size;
  }

  /** 同行の人数に空きがあるか。上限は、同行中のファミリア(拠点にいる者は含めない)と、そのうちの側近について。 */
  partyHasRoom(role: FamiliarRole): boolean {
    const p = this.params.party;
    if (this.familiars.length >= p.maxFamiliars) return false;
    if (role === "aide" && this.familiars.filter((f) => f.role === "aide").length >= p.maxAides) return false;
    return true;
  }

  /** 拠点の容量に空きがあるか。容量は、同行中のファミリアも含めた総数で数える。 */
  baseHasRoom(): boolean {
    return this.totalFamiliars() < this.params.base.capacity;
  }

  /**
   * ファミリアを新しく1人増やせない理由(雇用など)。増やせるなら null。
   * party=同行の人数の上限 / base=拠点の容量(同行中も含む)。
   * 送還は総数が変わらないので、拠点の容量には引っかからない。
   */
  familiarAddBlock(role: FamiliarRole): "party" | "base" | null {
    if (!this.partyHasRoom(role)) return "party";
    if (!this.baseHasRoom()) return "base";
    return null;
  }

  canAddFamiliar(role: FamiliarRole): boolean {
    return this.familiarAddBlock(role) === null;
  }

  /**
   * 拠点のファミリアを召喚できない理由。召喚できるなら null。
   * not_aide=側近ではない(※暫定: 召喚できるのは側近だけ) / low_hp=HPが足りない / party_full=同行の人数の上限
   */
  summonBlock(f: Familiar): "not_aide" | "low_hp" | "party_full" | null {
    if (this.params.base.summonAideOnly >= 0.5 && f.role !== "aide") return "not_aide";
    if (!this.base.canSummon(f, this.params)) return "low_hp";
    if (!this.partyHasRoom(f.role)) return "party_full";
    return null;
  }

  /**
   * 拠点から召喚する。HPなど個体のデータは、拠点にいたときのまま引き継ぐ。
   * 出現位置は、観測者の待機範囲の内側。
   */
  summonFromBase(id: number): "ok" | "not_found" | "not_aide" | "low_hp" | "party_full" {
    const f = this.base.find(id);
    if (!f) return "not_found";
    const block = this.summonBlock(f);
    if (block) return block;
    this.base.take(f);
    const rng = new Rng(hash2(this.seed, 0x5c, (id * 31 + this.tick) | 0));
    const r = this.params.familiar.standbyRange * SUMMON_REACH * Math.sqrt(rng.next());
    const a = rng.range(0, Math.PI * 2);
    f.x = f.prevX = this.watcher.x + Math.cos(a) * r;
    f.y = f.prevY = this.watcher.y + Math.sin(a) * r;
    resetFieldState(f, this.params);
    this.familiars.push(f);
    this.emitTeleport("appear", f);
    return "ok";
  }

  /**
   * 同行中のファミリアを、自分の意思で拠点へ送還できるか。
   * 観測者と共に、少なくとも1人のファミリアと、少なくとも1人の側近が、いなければならない。
   */
  canDispatch(f: Familiar): boolean {
    if (!this.familiars.includes(f)) return false;
    if (this.familiars.length <= 1) return false;
    if (f.role === "aide" && this.familiars.filter((o) => o.role === "aide").length <= 1) return false;
    return true;
  }

  /**
   * 同行中のファミリアの役割(側近 ⇄ 同行者)を変えられない理由。変えられるなら null。
   * 側近の人数の上限を超えられない。観測者と共に、少なくとも1人の側近がいなければならない。
   */
  roleChangeBlock(f: Familiar, role: FamiliarRole): "same" | "aide_limit" | "last_aide" | "not_with_party" | null {
    if (!this.familiars.includes(f)) return "not_with_party";
    if (f.role === role) return "same";
    const aides = this.familiars.filter((o) => o.role === "aide").length;
    if (role === "aide" && aides >= this.params.party.maxAides) return "aide_limit";
    if (role === "companion" && aides <= 1) return "last_aide";
    return null;
  }

  /** 同行中のファミリアを、側近にする/同行者にする。条件を満たさなければ何もしない。 */
  setRole(id: number, role: FamiliarRole): boolean {
    const f = this.familiars.find((o) => o.id === id);
    if (!f || this.roleChangeBlock(f, role) !== null) return false;
    f.role = role;
    return true;
  }

  /** 同行中のファミリアを拠点へ送還する。総数が変わらないので、容量には引っかからない。 */
  dispatchToBase(id: number): boolean {
    const f = this.familiars.find((o) => o.id === id);
    if (!f || !this.canDispatch(f)) return false;
    this.emitTeleport("vanish", f); // 消える場所に出す(拠点へ送る前の位置)
    this.familiars = this.familiars.filter((o) => o !== f);
    this.base.receive(f, this.params);
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
    if (hire) return { kind: "hire", neutral: hire };
    // 話しかける: 戦闘中(観測者かファミリアが、いずれかの敵の攻撃対象になっている間)は出さない。
    // それ以外は、戦闘不能でない同行中のファミリアのうち、最も近い者
    if (this.inCombat()) return null;
    let talk: Familiar | null = null;
    let talkD = this.params.party.talkRange;
    for (const f of this.familiars) {
      if (f.down || isDown(f)) continue;
      const d = distance(f, w);
      if (d <= talkD) {
        talkD = d;
        talk = f;
      }
    }
    return talk ? { kind: "talk", familiar: talk } : null;
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

  /** 同行中のファミリアのうち、送還できる最初の1人を拠点へ送る。 */
  debugDispatch(): void {
    const f = this.familiars.find((o) => this.canDispatch(o));
    if (f) this.dispatchToBase(f.id);
  }

  /** 拠点にいるファミリアのうち、召喚できる最初の1人を召喚する。 */
  debugSummon(): void {
    const f = this.base.members.find((o) => this.base.canSummon(o, this.params));
    if (f) this.summonFromBase(f.id);
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
    this.base.step(dt, p, false); // 遠征中: 拠点のファミリアが、ゆっくり回復する
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

    for (const e of this.effects) e.age += dt;
    if (this.effects.some((e) => e.age >= e.duration)) this.effects = this.effects.filter((e) => e.age < e.duration);

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
      if (f.vanishing && f.downTimer >= delay) {
        this.emitTeleport("vanish", f);
        this.base.receive(f, this.params);
      }
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
