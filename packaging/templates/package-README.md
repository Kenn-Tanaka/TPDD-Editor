# 思考展開図エディタ (TPDD) 成果物パッケージ

本フォルダは、「思考展開図エディタ (Thinking Process Development Diagram Editor - TPDD)」の完成パッケージ一式です。
ビルド済みWebアプリケーション、CORS修正済みLLM Gateway、起動スクリプト、サンプルデータをまとめています。

---

## 1. フォルダ構成

```
TPDD_v<バージョン>/
├── TPDD-Launcher.exe           ★ Gateway、エディタ、ブラウザを一括起動するEXE
├── start-all.bat               # 従来の一括起動バッチ
├── README.md                   ★ 本説明ファイル
│
├── app/                        # 思考展開図エディタ Webアプリケーション
│   ├── dist/                   # 本番ビルド済み静的ファイル (HTML, JS, CSS, SVG)
│   ├── serve.mjs               # Node.js 静的ファイル配信サーバー (127.0.0.1:3000)
│   └── start-app.bat           # Webアプリ単体起動バッチ
│
├── gateway/                    # Lightweight LLM Gateway (ローカル推論中継)
│   ├── llm-gateway.exe         # CORS修正・Accept対応済みバイナリ
│   ├── config/
│   │   └── gateway.json        # Gateway設定ファイル (CORS許可オリジン設定済)
│   └── start-gateway.bat       # LLM Gateway単体起動バッチ
│
├── samples/                    # サンプル思考展開図データ
│   └── sample-project.thought.json  # 「スマートオフィス環境制御システム」展開図例
│
└── docs/                       # 仕様・設計・マニュアル資料
    ├── QUICKSTART.md           ★ 10分でわかるクイックスタートガイド
    ├── REFERENCE_MANUAL.md     ★ 全機能詳細リファレンスマニュアル
    ├── SPECIFICATION.md        # 仕様概要および受入条件マトリクス
    └── AGENTS.md               # プロジェクト設計方針・開発ルール
```

---

## 2. クイックスタート (起動手順)

### 方法 A: 一括起動（推奨）
1. `TPDD-Launcher.exe` をダブルクリックします。
2. LLM Gateway（ポート 8765）と Webサーバー（ポート 3000）がそれぞれ別ウィンドウで自動起動します。
3. 既定のブラウザで [http://127.0.0.1:3000](http://127.0.0.1:3000) が自動的に開きます。

### 方法 B: 個別起動
- **Webアプリのみ利用する場合**（オフライン・LLM不使用時）:  
  `app\start-app.bat` を実行してください。
- **LLM Gatewayのみ起動する場合**:  
  `gateway\start-gateway.bat` を実行してください。

※ 終了する際は、開いたコマンドプロンプトウィンドウを閉じるか、各ウィンドウで `Ctrl+C` を押してください。

---

## 3. サンプル展開図の読み込み

1. エディタ画面（ブラウザ）の左上ツールバーにある **「ファイル読込」** ボタンをクリックします。
2. `samples\sample-project.thought.json` を選択します。
3. 「要求」「機能」「機構」「構造」の4列に展開されたスマートオフィス環境制御システムの図が表示されます。
4. ノード「エリア別最適空調制御」をダブルクリックすると、子階層のサブ図（温湿度フィードバック制御）へ遷移できます。
5. パンくずリスト「ルート展開図」をクリックすると、親の全体図へ戻ります。

---

## 4. LLM Gateway によるAI支援の利用

1. ローカルLLM（LM Studio または Ollama）を起動し、モデルをロードしておきます。
   - 例: LM Studio の場合、ローカルサーバーをポート `1234` で開始。
2. `TPDD-Launcher.exe` で Gateway を起動している場合、自動的に `http://127.0.0.1:8765/v1` で待機しています。
3. TPDDエディタ画面の左ペイン下部「LLM設定」から、接続テストが成功することを確認します。
4. 図上の任意のノードを選択し、右ペインの「AI支援」タブを開きます。
5. **「展開案を生成」** または **「代替案を生成」** をクリックすると、LLMからの候補ノード・エッジが生成されます。
6. 採用したいノードにチェックを入れて「選択した候補を採用」を押すと、図へ安全に反映されます。

---

## 5. 動作環境

- **OS**: Windows 10 / 11（64bit）
- **ブラウザ**: Google Chrome / Microsoft Edge / Mozilla Firefox
- **ランタイム**: Node.js v18 以上（静的ファイル配信サーバーの実行に必要）
