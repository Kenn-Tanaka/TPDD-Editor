# 思考展開図エディタ (Thinking Process Development Diagram Editor - TPDD)

要求、機能、機構、構造、制約、メモをノードとして配置し、ノード間の関係と詳細化の階層を編集するフロントエンド完結型の「思考展開図エディタ（Thinking Process Development Diagram Editor - TPDD）」です。

作成したプロジェクトをJSON（`.tpdd.json` / `.thought.json`）で保存し、現在の図を外部アプリケーション（Word、PowerPoint等）でも崩れず貼り付け可能な標準SVGとして出力できます。
また、ローカルのLightweight LLM Gateway経由でLLMと連携し、選択したノードの展開案・代替案の生成や図全体のレビュー支援を行います。LLMの出力は候補として提示され、ユーザーが明示的に選択採用した内容のみが同じ検証・履歴処理を通して図へ反映されます。

---

## 1. 主な特徴

- **完全フロントエンド完結 (Pure SPA)**:
  - 専用の推論バックエンドやサーバー側DBを必要とせず、ブラウザだけで安全に完結動作。
  - Gatewayが停止しているオフライン状態でも、図編集・保存・読込・SVGエクスポートが100%機能。
- **高精度な自前SVG描画**:
  - React Flow等の外部図フレームワークに依存せず、標準SVG要素を直接描画。
  - `<foreignObject>` を一切使用しない純粋ベクター出力（テキスト折り返しは自前測定 `<text>` / `<tspan>`）により、Microsoft Officeや外部ベクターツールでの確実な描画再現性を保証。
- **階層化サブ図 & 抽象度列**:
  - 親ノードをダブルクリックしてサブ図へ詳細化・掘り下げ展開。パンくずリストで直感的に階層移動。
  - 1〜12列の抽象度列（既定: 要求、機能、機構、構造）の追加・編集・並替、および列削除時のノード再割り当て。
- **安心のデータ保全 & 自動レイアウト**:
  - 1秒debounceによるIndexedDBへの自動保存と、起動時の復元候補案内。
  - 抽象度列・順序に基づく簡易自動レイアウト（重なり防止）と、50件の純粋関数型Undo/Redo履歴スタック。
- **LLM Gateway連携 & セキュアなAI提案採用**:
  - ローカル LLM Gateway（`http://127.0.0.1:8765/v1` 等）への直接接続。
  - Gateway Client Tokenはメモリ内（React状態）にのみ保持し、ストレージやファイル、ログへ一切永続化しません。
  - SSEストリーミング対応（文字数プログレス表示）、AbortControllerによる即時中断。
  - Revision不整合ガード（生成中の図編集による不整合防止）と、未選択ノードに繋がるエッジの安全な自動除外。

---

## 2. マニュアル・利用ガイド

- [**クイックスタートガイド (docs/QUICKSTART.md)**](file:///c:/Users/kenta/Documents/Antigravity_Projects/TPDD-Editor/docs/QUICKSTART.md): 10分で基本操作からAI展開、保存・SVG出力までを体験できるステップバイステップ手引き
- [**リファレンスマニュアル (docs/REFERENCE_MANUAL.md)**](file:///c:/Users/kenta/Documents/Antigravity_Projects/TPDD-Editor/docs/REFERENCE_MANUAL.md): 全機能の詳細仕様、データモデル、UI操作、ショートカット、設定項目、FAQの完全解説書
- [**先行文献との差異分析書 (docs/DIFFERENCE_ANALYSIS.md)**](file:///c:/Users/kenta/Documents/Antigravity_Projects/TPDD-Editor/docs/DIFFERENCE_ANALYSIS.md): 畑村・中尾・間瀬らによる「機械設計支援システム(2002)」との設計思想の継承点および現代的進化・差異の比較報告書

---

## 3. 動作要件

- **OS**: Windows 10 / 11（Chrome, Edge, Firefox）
- **ランタイム**: Node.js v18.0.0 以上（開発・ビルド・配布用HTTPサーバーの実行）
- **推奨画面解像度**: 1280×800 以上

---

## 3. セットアップ & 起動方法

### 3.1 依存パッケージの導入
```bash
npm ci
```

### 3.2 開発モードでの起動 (ポート 5173)
```bash
npm run dev
```
ブラウザで [http://127.0.0.1:5173](http://127.0.0.1:5173) を開きます。

### 3.3 配布用サーバーでの起動 (ポート 3000)
プロダクション用静的配信サーバーを起動します。

**Windowsの場合**:
`scripts/start-dist.bat` をダブルクリックするだけで、自動的にビルドとサーバー起動が行われます。

**コマンドラインの場合**:
```bash
# ビルド
npm run build

# 配布サーバー起動 (127.0.0.1:3000 にバインド)
npm run serve:dist
```
ブラウザで [http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。

---

## 4. LLM Gateway との接続手順

1. ローカルPC上で Lightweight LLM Gateway（例: ポート 8765）を起動します。
   - Gateway側の `allowed_origins` に `http://127.0.0.1:5173` および `http://127.0.0.1:3000` を追加してください。
2. エディタ画面の左ペイン下部にある「LLM設定」歯車アイコンをクリックします。
3. Gateway URL（既定 `http://127.0.0.1:8765/v1`）および認証Token（設定されている場合）を入力し、「接続テスト」を実行します。
4. 左ペインの「モデル詳細探索」またはクイック切替から、利用するモデルを選択します。
5. 図上のノードを選択し、右ペインの「AI支援」タブから「展開案」「代替案」の生成、または図全体の「図レビュー」を実行できます。

---

## 5. テストと品質検証

```bash
# 単体・結合テストの実行 (Vitest)
npm run test

# TypeScript 型検査
npm run typecheck

# プロダクションビルド検証
npm run build
```

---

## 6. ビルドキットと配布パッケージ生成

本プロジェクトには、WebアプリとLLM Gatewayを一括ビルドし、配布・インストール用ZIPアーカイブ（`release/TPDD_Release_v1.0.0.zip`）を自動生成する**「ビルドキット」**が付属しています。

MinGW（`g++`）がインストールされていない環境であっても、ポータブルツールチェーンを自動調達・一時利用してビルドを完遂します（ビルド完了後に自動クリーンアップ）。

### 実行方法:
- **Windows エクスプローラー**: [`build-kit\build.bat`](file:///c:/Users/kenta/Documents/Antigravity_Projects/TPDD-Editor/build-kit/build.bat) をダブルクリック
- **コマンドライン**:
  ```bash
  npm run build:kit
  ```
- **生成されるパッケージ (`release/`)**:
  - **`TPDD_Release_v1.0.0.zip`**: エンドユーザー向け完成バイナリパッケージ（解凍して `start-all.bat` で即起動）
  - **`TPDD_BuildKit_v1.0.0.zip`**: 他環境配布用ビルドキット一式（解凍した環境単体でビルド可能、自給自足ライブラリ内包、`npm run package:kit` または `build-kit\make-kit.bat` で再生成可能）

---

## 7. ディレクトリ構成

```
src/
├── app/                  # アプリ初期化、AppContext/Provider、全体レイアウト
├── domain/               # Projectスキーマ(Zod)、整合性検証、不変更新コマンド、Undo/Redo履歴
├── features/
│   ├── editor/           # SVGキャンバス、ノード・エッジ描画、詳細パネル、図ツリー、抽象度列
│   ├── ai/               # AI支援パネル、送信プレビュー、提案採用トランザクション
│   └── settings/         # Gateway設定モーダル、モデルカタログ、モデル探索・カスタムIDモーダル
├── services/
│   ├── llm/              # Gatewayクライアント、SSEパーサー、プロンプト定義、応答Zod検証
│   ├── rag/              # 将来のRAG共通型・境界インターフェース定義
│   └── persistence/      # .thought.json入出力、IndexedDB自動保存、端末設定
├── rendering/            # CTM逆行列座標変換、接続点計算、日本語折り返し、SVGエクスポート、自動レイアウト
scripts/                  # 配布用静的HTTPサーバー (serve-dist.mjs)、Windows起動スクリプト (start-dist.bat)
tests/                    # 単体・結合テスト、大規模フィクスチャ(200ノード/400エッジ)
```
