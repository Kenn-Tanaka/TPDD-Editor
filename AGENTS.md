# Thinking Process Development Diagram Editor (TPDD Editor) - AGENTS.md

## 1. Project Overview (プロジェクト概要)
本プロジェクトは、要求・機能・機構・構造・制約・メモをノードとして配置し、ノード間の関係と詳細化の階層を編集するフロントエンド完結型の「思考展開図エディタ」（英語名: Thinking Process Development Diagram Editor、短縮名: TPDD Editor）である。
作成したプロジェクトをJSON（`.tpdd.json` / `.thought.json`）で保存し、現在の図を標準SVGで出力する。
また、ローカルのLightweight LLM Gateway経由でLLMと連携し、選択したノードの展開案・代替案の生成や図のレビュー支援を行う。LLMの出力は候補として提示し、ユーザーが明示的に選択採用した内容のみを同じ検証・履歴処理を通して図へ反映する。

## 2. Technology Stack & Vibe (技術スタックと開発思想)
- **Frontend**: React, TypeScript (strict mode), Vite
- **State Management**: `useReducer` + `Context`（編集操作の集約、永続モデルと一時UI状態の分離、純粋関数による履歴管理）
- **Diagram UI**: Reactによる標準SVG直接描画（サードパーティの図フレームワークには依存せず、矩形ノード・接続線・抽象度列を自前で高精度描画）
- **Data Validation**: `Zod`（保存JSON、LLM出力、将来のRAG応答の実行時厳格検証）
- **Auto Layout**: 抽象度列・順序に基づく簡易自動レイアウト
- **Persistence**: File System / Blob Download (`.tpdd.json`), IndexedDB（自動保存とクラッシュ復旧）
- **Styling & UI**: Tailwind CSS, Lucide Icons
- **Vibe**:
  - ブラウザ上で完結するセキュアなSPA（Single Page Application）。
  - 専用の推論バックエンドは持たず、ブラウザから直接ローカル「Lightweight LLM Gateway」（既定 `http://127.0.0.1:8765/v1`）へ接続する。
  - Gatewayが停止している状態でも、図編集・保存・読込・SVG出力を完全に利用できること。

## 3. Directory Structure (ディレクトリ構成規則)
```
src/
├── app/                  # アプリ初期化、Context/Provider、全体レイアウト
├── domain/               # 現行Projectスキーマ(Zod)、整合性検証、編集コマンド、Undo/Redo(reducer)
├── features/
│   ├── editor/           # SVGキャンバス、ノード・エッジ描画、詳細パネル、図ツリー、抽象度列
│   ├── ai/               # タスクUI、送信プレビュー、提案・レビュー表示、採用操作
│   └── settings/         # Gateway設定、モデル選択、カスタムIDダイアログ、詳細選択モーダル、お気に入り、modelCatalog
├── services/
│   ├── llm/              # Gatewayクライアント、応答検証、SSE、プロンプト定義
│   ├── rag/              # 将来のRAG共通型定義、RagServiceインターフェース
│   └── persistence/      # JSON入出力、IndexedDB自動保存、端末設定ストレージ
├── rendering/            # 座標変換(CTM逆行列)、矩形接続点計算、日本語折り返し、共通描画、SVGエクスポート
├── shared/               # 共通UI部品(ボタン/モーダル/タブ等)、エラー型、日時/ID/ファイル名処理
scripts/                  # 配布用静的HTTPサーバー、起動スクリプト
tests/                    # 単体・結合テスト(Vitest)、ブラウザテスト(Playwright)、異常応答fixture
docs/                     # 仕様書、操作手順、Gateway接続手順、テスト記録
```

## 4. LLM Gateway Integration & Async Rules (LLM連携・非同期制御ルール)
- **APIキーのハードコード禁止**: フロントエンドコードおよびビルド成果物にAPIキーやTokenを絶対に含めない。
- **エンドポイント**: クライアントからのリクエスト先は設定されたGateway URL（既定 `http://127.0.0.1:8765/v1`）とする。
- **Tokenのメモリ限定保持**: Gateway Client Tokenはメモリ内（React状態）にのみ保持し、`localStorage`, `sessionStorage`, `IndexedDB`, Projectファイル, `.env`, ログへ絶対に保存しない。
- **認証ヘッダー制御**: 認証有効時のみ `Authorization: Bearer <Gateway Token>` を付与し、無効時はヘッダー自体を付与しない。
- **タイムアウト設定**: UI上でタイムアウト時間（デフォルト600秒、範囲30〜1800秒）を設定可能とし、応答完了までタイマーを維持する。
- **中断（AbortController）の実装**: 長時間かかる推論や不要になったリクエストは、ユーザー操作（取消ボタン）で即座にキャンセル可能とし、UIやストア状態を安全にリセットする。
- **推論同時実行制限**: 初版の推論同時実行は1件に限定し、二重送信を防ぐ。
- **Revision検証**: 生成開始時のプロジェクトRevisionと現在のRevisionが一致しない場合、遅延応答の自動適用を拒否し、図変更による不整合を防ぐ。

## 5. UI/UX & Canvas Design Rules (UI設計・重なり防止)
- **操作ボタンの保護**: ツールバーや重要ボタンの上に固定カードを重ねて配置しない。
- **モーダル管理**: ダイアログ・モーダルは `createPortal` でルートに描画し、Escapeキーやオーバーレイクリックで閉じられるようにする。
- **IMEセーフな入力**: ラベル編集は日本語IMEのcomposition（変換中）イベントを妨げない。入力中のDeleteやUndoが図全体の操作に波及しないようイベント伝播を分離する。
- **座標変換の厳密性**: ポインタ座標はSVGの `getScreenCTM().inverse()` を用いて図座標系に変換し、ブラウザのズームやCSS変形による二重補正誤差を防ぐ。

## 6. Vector (SVG) Export Rules (SVG出力の互換性)
- **標準SVG要素の厳守**: WordやPowerPoint、外部SVGビューア等での表示崩れ・欠落を防ぐため、`<foreignObject>`、外部CSS、JavaScript、対話用属性は使用しない。
- **テキスト折り返し**: 標準の `<text>` および `<tspan>` を使用し、文字幅測定に基づく正確な文字境界折り返しを行う。
- **XMLエスケープ**: `&`, `<`, `>`, `"`, `'` 等の制御文字を適切にエスケープ処理し、文字列を安全にXMLへ出力する。
- **共通描画ロジック**: 画面上のSVG描画とエクスポートSVGの幾何計算・スタイル計算ロジックを共通化する。

## 7. Testing & Execution (検証とビルド)
- **開発サーバー起動**: `npm run dev`（127.0.0.1:5173, strictPort）
- **配布サーバー起動**: `npm run serve:dist`（127.0.0.1:3000）
- **品質検査**: コード変更後は必ず `npm run typecheck` および `npm run build`（TypeScript型検査 + Viteビルド）を実行し、型エラーや未インポートが存在しないことを検証すること。
- **テスト自動化**: `npm run test`（Vitestによるドメイン・バリデーション・幾何計算の単体テスト）を実行し、全テストパスを確認する。
