# 運用設定

## 設定ファイルと反映順

開発時の既定値の正本は `config/defaults.json` です。開発・ビルド時は `config/runtime.json` の `overrides` を重ね、`npm run prepare:config` が `public/tpdd-config.json` を生成します。Viteビルド後は `dist/tpdd-config.json` となり、配布パッケージでは `app/dist/tpdd-config.json` を直接編集できます。再ビルドは不要で、ブラウザ再読込およびランチャー／配布サーバー再起動後に反映されます。

ブラウザは起動時に配信JSONを `cache: no-store` で取得し、未知項目、型、整数条件、範囲、相互条件をZodで検証してからアプリを初期化します。上書きファイルがない開発環境では組込みの既定値を使います。不正な配信設定がある場合は項目名付きのエラー画面を表示し、不正値や代替値では起動しません。ランチャーは実行ファイルを基準に `app/dist/tpdd-config.json` を探すため、カレントディレクトリには依存しません。

優先順位は次のとおりです。

1. コードで固定した必須整合性・安全規則（列順一意、包含／除外の矛盾禁止、Gatewayのloopback限定、絶対安全上限）
2. 配布済み `tpdd-config.json`
3. Project内の利用者設定（モデル、温度、ストリーム、AIタイムアウト）。AIタイムアウトは運用設定の最小／最大範囲内だけ有効
4. ブラウザ保存済み端末設定（Gateway URL、認証使用、モデルお気に入り）。Gateway URLは保存時・読込時・通信直前のすべてで検証

AIタスクは開始時点の設定と絶対締切を保持します。実行中にJSONを変更しても、そのタスクの初回推論と形式修復には開始時の値が一貫して使われます。

## 項目一覧

すべての数値は整数です。`Chars` はUnicodeコードポイント数、`Bytes` はUTF-8バイト数、`Ms` はミリ秒、`Px` は出力画素を表します。

| 項目 | 既定値 | 許容範囲・用途 |
|---|---:|---|
| `configVersion` | 1 | 1のみ |
| `descriptionMaxChars` | 2,000 | 1〜100,000。Project、ノード、列の説明 |
| `nameMaxChars` | 200 | 1〜100,000。名称・ラベル |
| `tagMaxChars` / `tagMaxCount` | 100 / 20 | 各1〜100,000 |
| `sourceLinkMaxChars` / `sourceLinkMaxCount` | 2,048 / 20 | 各1〜100,000。URLはhttp/httpsのみ |
| `placementCriterionMaxChars` / `placementCriterionMaxCount` | 300 / 10 | 列の「含める／含めない」各項目・各件数 |
| `levelMaxCount` / `diagramMaxCount` | 12 / 100 | 1〜1,000 / 1〜10,000 |
| `nodesPerDiagramMaxCount` / `edgesPerDiagramMaxCount` | 500 / 1,000 | 各1〜100,000 |
| `projectNodeMaxCount` / `projectEdgeMaxCount` | 5,000 / 10,000 | 各1〜100,000。図単位上限以上 |
| `maxProjectFileBytes` | 10,485,760 (10 MiB) | 1〜104,857,600。保存と読込で共通 |
| `maxModelListResponseBytes` | 2,097,152 (2 MiB) | 1〜67,108,864 |
| `maxLlmResponseBytes` | 4,194,304 (4 MiB) | 1〜67,108,864 |
| `aiTaskTimeoutMs` | 600,000 | 1,000〜3,600,000、1,000単位。新規Projectの既定値 |
| `aiTaskTimeoutMinMs` / `aiTaskTimeoutMaxMs` | 30,000 / 1,800,000 | 各1,000〜3,600,000、1,000単位、最小≤既定≤最大 |
| `modelListTimeoutMs` | 30,000 | 1〜3,600,000 |
| `launcherStartupTimeoutMs` | 30,000 | 1,000〜3,600,000 |
| `undoHistoryMaxEntries` | 50 | 1〜10,000 |
| `autosaveIntervalMs` / `autosaveSnapshotMaxCount` | 1,000 / 10 | 1〜3,600,000 / 1〜10,000 |
| `aiPreviewMaxNodes` / `aiPreviewMaxEdges` / `aiPreviewMaxChars` | 200 / 400 / 1,000,000 | AI送信プレビューの警告閾値 |
| `aiRepairInputMaxChars` | 50,000 | 1〜1,000,000。修復プロンプトへ渡す初回応答 |
| `aiProposalMaxNodes` / `aiProposalMaxEdges` | 10 / 20 | 1〜1,000 / 1〜10,000 |
| `aiReviewMaxIssues` | 30 | 1〜10,000 |
| `pngMaxSidePx` / `pngMaxTotalPixels` | 16,384 / 67,108,864 | 1〜32,768 / 1〜268,435,456 |
| `aiAutoRepairEnabled` | true | `false` なら形式修復を実行しない |
| `defaultGatewayUrl` | `http://127.0.0.1:8765/v1` | loopbackのhttp/https、認証情報・query・fragment禁止 |
| `gatewayPort` / `editorPort` | 8,765 / 3,000 | 1〜65,535。Gateway側設定と整合させる |

例: 配布後に自動修復を無効化し、応答上限を2 MiBへ変更する場合は、`app/dist/tpdd-config.json` の該当箇所を次のように変更して再起動します（配布JSONは省略せず全項目を保持します）。

```json
{
  "maxLlmResponseBytes": 2097152,
  "aiAutoRepairEnabled": false
}
```

開発時に同じ変更をする場合は `config/runtime.json` を次のようにし、`npm run build` を実行します。

```json
{
  "configVersion": 1,
  "overrides": {
    "maxLlmResponseBytes": 2097152,
    "aiAutoRepairEnabled": false
  }
}
```

## 文字数とファイルサイズ

文字数はJavaScriptのUTF-16コード単位ではなく、`Array.from(text).length` によるUnicodeコードポイント数です。一般的な日本語1文字と単一絵文字（例: `😀`）は各1文字です。結合文字やZWJで構成された見た目上1つの絵文字は複数コードポイントとして数える場合があります。UI、Projectスキーマ、AI応答スキーマは同じ関数を使います。

Project、ノード、列の自由記述説明は2,000文字までです。2,000文字は受理し、2,001文字は理由を表示して拒否します。切り詰めは行いません。タグ、参考リンク、列の配置基準は用途が異なるため個別上限を維持します。

項目上限とファイル全体の10 MiB上限は別の制約です。多数のノードがそれぞれ2,000文字の説明を持つ場合、項目上限内でもファイル全体上限を超えます。保存はProject検証後、実際にダウンロードするJSONと同一の文字列のUTF-8バイト数を検査します。読込も同じ上限とZod解析済みデータを使用します。

## 上限値の根拠と固定安全上限

10 MiBのProject上限は従来値を維持しています。モデル一覧2 MiBは通常の数十〜数百モデルのJSONに十分な余裕があり、LLM応答4 MiBは通常100 KiB未満の提案／レビューに対して大きな余裕を持たせつつ、異常応答によるメモリ消費を抑えます。PNGは最大辺16,384 pxに加えて総画素67,108,864（8,192角相当）を課し、Canvas実装の辺上限とメモリ消費の両方を保護します。検査はCanvas生成前です。

`src/config/runtimeConfig.ts` の `CONFIG_SAFETY_LIMITS` と、HTTPエラー本文64 KiB上限は運用設定自身による資源枯渇を防ぐ最終防壁です。これらは設定で無効化できません。列順一意、参照整合性、包含／除外の矛盾禁止、Gateway URLのloopback限定も同様です。

旧 `thought-expansion-project` 形式や新しい制限に違反するProjectは移行・切り詰めせず拒否します。
