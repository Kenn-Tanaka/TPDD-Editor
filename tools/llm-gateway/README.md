# Lightweight LLM Gateway 1.3.2

C++20ベースの軽量・セキュアなローカルLLMリバースプロキシです。

## 主な機能
- **APIキーのセキュア保管**: OS資格情報マネージャー（Windows DPAPI / Linux Secret Service）から直接キーをオンメモリ解決。
- **OpenAI REST API互換**: `POST /v1/chat/completions`, `GET /v1/models` を提供。
- **プロバイダ動的ルーティング**: `<provider_id>/<upstream_model_id>` 形式で複数プロバイダを自動振り分け。
- **モデル利用制限 (Allowlist / Default Deny)**: 許可されたモデルのみを実行。
- **CORS制御**: WebブラウザSPAからの直接アクセスに対応。
- **v1.3.2 強化点**: `Accept-Encoding` 透過制御による zlib アサーション不具合の恒久解消、SSEストリーミングの堅牢性向上。

## 詳しいドキュメント
- **完全リファレンス ＆ 各言語サンプルコード**: `docs/LLM_GATEWAY_MANUAL.md` を参照してください。
- **クイックスタート**: `QUICKSTART.md` を参照してください。
- **設定ファイル仕様**: `REFERENCE.md` を参照してください。
