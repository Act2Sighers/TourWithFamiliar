import type { Params } from "../core/params";
import type { Decor } from "../core/sim/chunks";
import { shouldShowHpBar, type Body } from "../core/sim/body";
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
    for (const f of world.familiars) this.drawCharacter(f, alpha, "#ff7aa8");
    this.drawCharacter(wt, alpha, "#6a4cff");
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

  private drawCharacter(b: Body, alpha: number, color: string): void {
    const ctx = this.ctx;
    const x = b.prevX + (b.x - b.prevX) * alpha;
    const y = b.prevY + (b.y - b.prevY) * alpha;
    const r = b.radius;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + Math.cos(b.facing) * r * 0.55, y + Math.sin(b.facing) * r * 0.55, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
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
