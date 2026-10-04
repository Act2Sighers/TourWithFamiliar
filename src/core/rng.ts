// C#: DeterministicRng / HashUtil(同じ結果になることをテストで保証する)

/** 整数座標とシードからの32bitハッシュ。チャンク生成など「座標から決定的に」使う。 */
export function hash2(seed: number, x: number, y: number): number {
  let h = mix((seed | 0) ^ 0x9e3779b9);
  h = mix(h ^ (x | 0));
  h = mix(h ^ (y | 0));
  return h >>> 0;
}

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return h ^ (h >>> 16);
}

/** mulberry32。状態は32bit整数1つだけなのでセーブ/復元・C#移植が容易。 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [0, n) の整数 */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}
