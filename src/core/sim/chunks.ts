// C#: ChunkMap / Chunk(座標+シードから決定的に生成。生成物の差分だけをセーブする想定)
import type { Params } from "../params";
import { Rng, hash2 } from "../rng";

export interface Decor {
  x: number;
  y: number;
  /** 0:丸 1:四角 2:ひし形 3:三角(プレースホルダー形状) */
  kind: number;
  size: number;
  /** 0..1 の色相 */
  hue: number;
}

export interface Chunk {
  cx: number;
  cy: number;
  decor: Decor[];
}

export class ChunkMap {
  private chunks = new Map<string, Chunk>();

  constructor(
    public seed: number,
    private params: Params,
  ) {}

  get count(): number {
    return this.chunks.size;
  }

  clear(): void {
    this.chunks.clear();
  }

  coordOf(worldPos: number): number {
    return Math.floor(worldPos / this.params.world.chunkSize);
  }

  get(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generate(cx, cy);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** 中心チャンクから keepRadius を超えて離れたチャンクを破棄する。 */
  prune(centerCx: number, centerCy: number): void {
    const r = this.params.world.keepRadius;
    for (const [key, c] of this.chunks) {
      if (Math.abs(c.cx - centerCx) > r || Math.abs(c.cy - centerCy) > r) {
        this.chunks.delete(key);
      }
    }
  }

  private generate(cx: number, cy: number): Chunk {
    const size = this.params.world.chunkSize;
    const rng = new Rng(hash2(this.seed, cx, cy));
    const decor: Decor[] = [];
    for (let i = 0; i < this.params.world.decorPerChunk; i++) {
      decor.push({
        x: (cx + rng.next()) * size,
        y: (cy + rng.next()) * size,
        kind: rng.int(4),
        size: rng.range(6, 18),
        hue: rng.next(),
      });
    }
    return { cx, cy, decor };
  }
}
