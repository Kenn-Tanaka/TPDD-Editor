# 思考展開図エディタ（TPDD Editor）ビルドキット

本フォルダは、「思考展開図エディタ」（Thinking Process Development Diagram Editor / TPDD Editor）および「Lightweight LLM Gateway」をビルドし、配布・インストール用ZIPパッケージを自動生成するためのビルドキットです。

---

## 1. 概要と特徴

- **ワンクリック完全自動ビルド**:
  - Webフロントエンド（TypeScript / React / Vite）の型検査と本番バンドル
  - LLM Gateway（C++20 / cpp-httplib / OpenSSL / Zlib）のスタティック最適化コンパイル
  - 展開済み配布物とZIPアーカイブ（`release/TPDD_v1.1.0` / `.zip`）の生成
- **MinGW環境の自動検出と一時調達**:
  - システム上に MinGW-w64 (`g++` / `c++`) が未導入の環境であっても、ポータブル版ツールチェーンを一時的に自動取得・展開してビルドを実行します。
  - ビルド完了後は一時ディレクトリを自動消去するため、**ホストPCのシステム環境変数やレジストリを一切汚しません**。

---

## 2. 実行手順

### Windows エクスプローラーから
- **`build.bat`** をダブルクリックして実行します。

### PowerShell コマンドラインから
```powershell
cd packaging
.\build-release.ps1
```

出力名はプロジェクト直下の `package.json` の `version` から自動決定します。`1.1.0` なら `release/TPDD_v1.1.0/` と `release/TPDD_v1.1.0.zip` を生成します。ビルドキットZIPも同じ値を使用します。カレントディレクトリには依存しません。

バージョン変更時は先に `package.json` と `package-lock.json` を更新してください。任意の `-Version` は一致確認用で、内部バージョンと異なる値はビルド開始前に拒否します。

一致確認を明示する場合:
```powershell
.\build-release.ps1 -Version "1.1.0"
```

---

## 3. 出力成果物

ビルドが完了すると、プロジェクトの `release/` フォルダに以下のZIPファイルが出力されます：

```
release/
├── TPDD_v1.1.0/              ★ 展開済み配布用パッケージ
└── TPDD_v1.1.0.zip           ★ ZIP配布用パッケージ
```

このZIPを解凍すると、そのまま動作するスタンドアロンパッケージ（Webサーバー、Gateway、サンプル、マニュアル、起動バッチ、デスクトップショートカットインストーラー）が展開されます。

---

## 4. ビルドキット自体のパッケージング (開発者向け)

他環境にビルド環境ごと配布・移送するための「ビルドキット配布用ZIP」を作成する場合:

- **Windows エクスプローラー**: `packaging\make-build-kit.bat` をダブルクリック
- **コマンドライン**: `npm run package:kit`
- **出力先**: `release/TPDD_BuildKit_v1.1.0.zip` (ソースコード、自給自足deps、ビルドスクリプト一式)

---

## 5. ワンクリック起動EXE

MinGW-w64の`g++`がPATHにある環境で次を実行します。

```powershell
.\build-launcher.ps1
```

`npm run build:launcher`では`release\TPDD-Launcher.exe`が生成されます。通常は`npm run build:release`を使用し、ランチャーを`release\TPDD_v<version>`のルートへ配置してください。

