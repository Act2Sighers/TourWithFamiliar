# TourWithFamiliar

プレイヤーが「ファミリア」を世話し、ファミリアがプレイヤーに代わって戦う、リアルタイム・ローグライト・シミュレーションゲームのプロトタイプ。

- 設計: [docs/PROTOTYPE_DESIGN.md](docs/PROTOTYPE_DESIGN.md)
- ファミリア・戦闘の仕様: [docs/SPEC_FAMILIAR_COMBAT.md](docs/SPEC_FAMILIAR_COMBAT.md)
- 技術: TypeScript + Vite + Canvas 2D(最終的にUnity C#へ移植する前提)

## 動かし方

```bash
npm install
npm run dev        # 開発サーバー(LAN公開)
npm test           # ロジック層のテスト
npm run build      # dist/ に静的ファイルを出力
```

### 携帯端末でテストする
- 同じWi-Fi上: `npm run dev` のログに出る `Network:` のURLを端末で開く。
- 静的ホスティング: `npm run build` の `dist/` をそのまま置けば動く(相対パスでビルドしている)。

## 操作

| 入力 | 操作 |
|---|---|
| キーボード | WASD / 矢印キーで移動、E でインタラクト(押し続ける)、Esc / P でメニュー、` で調整パネル |
| ゲームパッド | 左スティック / 十字キーで移動、A でインタラクト(押し続ける)、Startでメニュー |
| タッチ | 画面のどこかを触ってドラッグ(仮想スティック)、☰ でメニュー、⚙ で調整パネル、対象が近いときだけ出る右下のボタンでインタラクト(押し続ける) |

メニュー(オーバーレイ)表示中、ワールドの時間は完全に停止する。

## 調整パネル
画面左の⚙から開く。パラメータのスライダー、一時停止/1コマ/速度倍率、シード再生成、パラメータのJSON書き出し/読み込み。変更はブラウザに保存される。

## ディレクトリ
```
src/core/    純粋ロジック(DOM非依存。C#移植の対象)
src/input/   キーボード / ゲームパッド / タッチ
src/view/    Canvas描画
src/debug/   調整パネル
src/data/    パラメータJSON
tests/       ロジック層のテスト
```
