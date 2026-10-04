import type { Params } from "../core/params";
import type { Decor } from "../core/sim/chunks";
import { shouldShowHpBar, type Body } from "../core/sim/body";
import { attackArea, weaponOf, type Fighter } from "../core/sim/combat";
import type { Enemy } from "../core/sim/enemy";
import type { Familiar } from "../core/sim/familiar";
import type { World } from "../core/sim/world";

/** 画面の短辺がこの長さ(ワールド単位)に見える状態を zoom=1 とする。端末が違っても見える範囲を揃えるため。 */
const BASE_VIEW = 600;
const GRID = 64;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private params: Params,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(world: World, alpha: number): void {
    const { ctx, w, h } = this;
    const scale = (Math.min(w, h) / BASE_VIEW) * this.params.view.zoom;
    const wt = world.watcher;
    const camX = wt.prevX + (wt.x - wt.prevX) * alpha;
    const camY = wt.prevY + (wt.y - wt.prevY) * alpha;

    ctx.fillStyle = "#fff4e8";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    const halfW = w / 2 / scale;
    const halfH = h / 2 / scale;
    const left = camX - halfW;
    const right = camX + halfW;
    const top = camY - halfH;
    const bottom = camY + halfH;

    this.drawGrid(left, right, top, bottom, scale);
    this.drawChunks(world, left, right, top, bottom);
    if (this.params.view.showStandbyRange >= 0.5) this.drawStandbyRange(camX, camY);
    if (this.params.view.showAttackAreas >= 0.5) {
      for (const f of world.familiars) this.drawAttackArea(f);
      for (const e of world.enemies) this.drawAttackArea(e);
    }
    for (const e of world.enemies) this.drawEnemy(e, alpha);
    const reviveTarget = world.interactionTarget()?.familiar ?? null;
    for (const f of world.familiars) {
      // 送還が決まったファミリアは、消えるまでの間に薄くなる
      this.ctx.globalAlpha = f.vanishing ? Math.max(0, 1 - f.downTimer / this.params.down.vanishDelay) : 1;
      this.drawCharacter(f, alpha, this.familiarColor(f), f.state === "intercept");
      this.ctx.globalAlpha = 1;
      if (f.down && !f.vanishing) this.drawReviveGauge(f, alpha, f === reviveTarget);
    }
    this.drawCharacter(wt, alpha, wt.hp <= 0 ? "#b9b0d9" : "#6a4cff", false);
    for (const e of world.enemies) this.drawHpBar(e, alpha);
    for (const f of world.familiars) this.drawHpBar(f, alpha);
    this.drawHpBar(wt, alpha);

    ctx.restore();
  }

  private drawGrid(l: number, r: number, t: number, b: number, scale: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(200, 160, 140, 0.28)";
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let x = Math.floor(l / GRID) * GRID; x <= r; x += GRID) {
      ctx.moveTo(x, t);
      ctx.lineTo(x, b);
    }
    for (let y = Math.floor(t / GRID) * GRID; y <= b; y += GRID) {
      ctx.moveTo(l, y);
      ctx.lineTo(r, y);
    }
    ctx.stroke();
  }

  private drawChunks(world: World, l: number, r: number, t: number, b: number): void {
    const ctx = this.ctx;
    const size = this.params.world.chunkSize;
    const showBorders = this.params.view.showChunkBorders >= 0.5;
    const c0x = world.chunks.coordOf(l);
    const c1x = world.chunks.coordOf(r);
    const c0y = world.chunks.coordOf(t);
    const c1y = world.chunks.coordOf(b);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const chunk = world.chunks.get(cx, cy);
        for (const d of chunk.decor) this.drawDecor(d);
        if (showBorders) {
          ctx.strokeStyle = "rgba(220, 90, 120, 0.6)";
          ctx.lineWidth = 2;
          ctx.strokeRect(cx * size, cy * size, size, size);
        }
      }
    }
  }

  private drawDecor(d: Decor): void {
    const ctx = this.ctx;
    ctx.fillStyle = `hsl(${Math.round(d.hue * 360)} 70% 78% / ${this.params.view.decorOpacity})`;
    ctx.beginPath();
    const s = d.size;
    switch (d.kind) {
      case 0:
        ctx.arc(d.x, d.y, s, 0, Math.PI * 2);
        break;
      case 1:
        ctx.rect(d.x - s, d.y - s, s * 2, s * 2);
        break;
      case 2:
        ctx.moveTo(d.x, d.y - s);
        ctx.lineTo(d.x + s, d.y);
        ctx.lineTo(d.x, d.y + s);
        ctx.lineTo(d.x - s, d.y);
        ctx.closePath();
        break;
      default:
        ctx.moveTo(d.x, d.y - s);
        ctx.lineTo(d.x + s, d.y + s);
        ctx.lineTo(d.x - s, d.y + s);
        ctx.closePath();
    }
    ctx.fill();
  }

  private familiarColor(f: Familiar): string {
    if (f.down) return "#c9b6bf";
    if (f.role === "companion") return f.lost ? "#f2c9a0" : "#f5a25d";
    return f.lost ? "#e6a3bd" : "#ff7aa8";
  }

  /** 助け起こしのゲージ。対象にできる間は点線の輪、進んだ分は扇形で塗る。 */
  private drawReviveGauge(f: Familiar, alpha: number, ready: boolean): void {
    const ctx = this.ctx;
    const x = f.prevX + (f.x - f.prevX) * alpha;
    const y = f.prevY + (f.y - f.prevY) * alpha;
    const r = f.radius * 1.9;
    if (ready) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(192, 16, 96, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (f.reviveProgress > 0) {
      const start = -Math.PI / 2;
      ctx.fillStyle = "rgba(192, 16, 96, 0.6)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, start, start + Math.min(1, f.reviveProgress) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 待機範囲(観測者を中心とした円)。調整用の表示。 */
  private drawStandbyRange(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "rgba(255, 122, 168, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, this.params.familiar.standbyRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawCharacter(b: Body, alpha: number, color: string, ring: boolean): void {
    const ctx = this.ctx;
    const x = b.prevX + (b.x - b.prevX) * alpha;
    const y = b.prevY + (b.y - b.prevY) * alpha;
    const r = b.radius;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
      // 迎撃中の目印
      ctx.strokeStyle = "#c01060";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    this.drawFacingMarker(x, y, r, b.facing);
  }

  /**
   * 向きの表示。底辺:高さ = 2:1 の二等辺三角形(頂点が直角)で、頂点が向いている方向に来る。
   */
  private drawFacingMarker(x: number, y: number, r: number, facing: number): void {
    const ctx = this.ctx;
    const h = r * 0.6; // 高さ。底辺の長さは 2h
    const apex = r * 0.7; // 頂点までの距離
    const baseDist = apex - h;
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x + c * apex, y + s * apex);
    ctx.lineTo(x + c * baseDist - s * h, y + s * baseDist + c * h);
    ctx.lineTo(x + c * baseDist + s * h, y + s * baseDist - c * h);
    ctx.closePath();
    ctx.fill();
  }

  /** 敵: 正三角形。向いている方向に角の1つが来る。徘徊は淡い色、臨戦は濃い色。 */
  private drawEnemy(e: Enemy, alpha: number): void {
    const ctx = this.ctx;
    const x = e.prevX + (e.x - e.prevX) * alpha;
    const y = e.prevY + (e.y - e.prevY) * alpha;
    ctx.fillStyle = e.state === "engaged" ? "#e0303c" : "#d98a8f";
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = e.facing + (i * Math.PI * 2) / 3;
      const px = x + Math.cos(a) * e.radius;
      const py = y + Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** 攻撃範囲。前隙の間は輪郭だけ、持続の間は塗りつぶす。 */
  private drawAttackArea(f: Fighter): void {
    const c = f.combat;
    if (c.phase === "ready" || f.hp <= 0) return;
    const a = attackArea(f, c, weaponOf(f.weaponId, this.params));
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    if (c.phase === "active") {
      ctx.fillStyle = "rgba(255, 60, 60, 0.45)";
      ctx.fill();
    } else {
      ctx.setLineDash(c.phase === "windup" ? [4, 4] : [2, 6]);
      ctx.strokeStyle = c.phase === "windup" ? "rgba(255, 60, 60, 0.8)" : "rgba(120, 120, 120, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** HPゲージ。全快のときとHP0のときは描かない(共通規則)。 */
  private drawHpBar(b: Body, alpha: number): void {
    if (!shouldShowHpBar(b.hp, b.maxHp)) return;
    const ctx = this.ctx;
    const x = b.prevX + (b.x - b.prevX) * alpha;
    const y = b.prevY + (b.y - b.prevY) * alpha;
    const w = Math.max(24, b.radius * 2.4);
    const h = 5;
    const left = x - w / 2;
    const top = y - b.radius - 12;
    const ratio = b.hp / b.maxHp;
    ctx.fillStyle = "rgba(60, 30, 50, 0.65)";
    ctx.fillRect(left - 1, top - 1, w + 2, h + 2);
    ctx.fillStyle = `hsl(${Math.round(ratio * 120)} 75% 48%)`;
    ctx.fillRect(left, top, w * ratio, h);
  }
}
