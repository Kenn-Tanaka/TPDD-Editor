# Lightweight LLM Gateway 1.3.1 リファレンスマニュアル

## Credential Convention

資格情報は`service / username / password`で識別します。

```text
service  = credentials.service_name（既定: CloudLLM）
username = <normalized_vendor>|<slot>
password = Provider API Key
```

Gateway Client Tokenの既定usernameは`llm_gateway|default`です。vendorはtrim・ASCII lowercase化し、`google`は`gemini`へ正規化します。slotはtrim後に空なら`default`、文字は`[A-Za-z0-9_-]+`です。

WindowsではPython keyring WinVault backendと同じserviceまたは`username@service` Targetを検索し、UserName一致を確認します。UTF-16 blobを優先decodeし、旧UTF-8 blobも読めます。LinuxではSecret Serviceの`service`と`username`属性を検索します。

Provider CredentialはRequestごとに取得し、長期cacheしません。`environment_fallback=true`の場合だけ、Credential未発見時に標準環境変数を探索します。Gateway Client Tokenには環境変数fallbackを適用しません。

## 設定

```json
{
  "listen": {"address":"127.0.0.1","port":8765},
  "security": {"client_auth":true,"credential_name":"llm_gateway|default"},
  "credentials": {"service_name":"CloudLLM","environment_fallback":false},
  "proxy": {"max_request_body_mb":64,"connect_timeout_sec":10,"read_timeout_sec":600,"write_timeout_sec":600},
  "model_cache": {"enabled":true,"ttl_sec":3600},
  "cors": {
    "enabled":false,
    "allowed_origins":["http://127.0.0.1:3000","http://localhost:3000"],
    "allowed_methods":["GET","POST","DELETE","PUT","PATCH","OPTIONS"],
    "allowed_headers":["Authorization","Content-Type"],
    "max_age_sec":600
  },
  "providers": {
    "openrouter": {
      "base_url":"https://openrouter.ai/api/v1",
      "authentication":"bearer",
      "key_vendor":"openrouter",
      "key_slot":"default",
      "model_discovery":true,
      "allowlist":[{"type":"glob","pattern":"openrouter/anthropic/*"}]
    }
  },
  "logging":{"level":"info","file":"llm-gateway.log"}
}
```

Validation:

- listen addressは`127.0.0.1`または`::1`のみ
- service_nameはtrim後1～128 bytes、制御文字禁止
- authenticationは`bearer`または`none`
- bearerではkey_vendor必須、key_slotは既定`default`
- allowlist ruleは`exact`または`glob`
- allowlist未指定・空配列はDefault Deny
- CORS有効時は`allowed_origins`が必須。Originは完全一致し、`*`は拒否
- CORS methodはGatewayが対応する`GET`、`POST`、`DELETE`、`PUT`、`PATCH`、`OPTIONS`から指定
- `max_age_sec`は0以上

Environment mapping:

| vendor | 変数 |
|---|---|
| gemini | `GEMINI_API_KEY` |
| openai | `OPENAI_API_KEY` |
| openrouter | `OPENROUTER_API_KEY` |
| anthropic | `ANTHROPIC_API_KEY` |

## HTTP

Client認証は`Authorization: Bearer <Gateway Token>`です。Client Authorization、Proxy-Authorization、Host、Content-Length、Connection、Transfer-Encoding等は上流へそのまま転送しません。bearer ProviderではGatewayがProvider CredentialからAuthorizationを生成します。redirect追従は無効です。

CORSは既定で無効です。有効時は許可Originからの通常応答にCORSヘッダーを付与し、`OPTIONS`プリフライトで要求methodとheaderを設定allowlistに照合します。不許可のプリフライトは403です。Originはscheme、host、portを含む完全一致で、末尾`/`は付けません。

Inference JSONのtop-level modelを最初の`/`で分割し、Provider prefixのみ除去します。未知JSON fieldは保持します。非JSON bodyは解析せず、別経路でProviderを決定できないためVersion 1.0では400です。

## Allowlist

評価対象はprefix付きGateway Model IDです。`exact`は完全一致、`glob`の`*`は任意長、`?`は任意1 byte。ruleがないProviderもdenyです。全許可には`provider/*`を明示してください。

## `/v1/models`

`model_discovery=true`のProviderだけを取得し、Provider prefixを付加してallowlistを適用します。Provider単位の失敗は無視して成功分を返し、全対象Providerが失敗した場合だけ502です。結果だけTTL cacheし、Credentialはcacheしません。

## Streaming

SSEは上流受信workerと最大16チャンクqueueで逐次中継し、遅いClientへbackpressureをかけます。Request bodyは設定上限までメモリ保持します。

## Credential Manager

wxWidgets GUIはService NameとCredential Identifierの一覧、登録・更新・削除を提供します。Secretの読み戻し表示、export、ログ、平文fallbackはありません。WindowsではPython keyringのcollision配置を再現し、LinuxではSecret Serviceへ保存します。

## テスト

- Model routing、glob、Default Deny
- vendor/slot正規化
- Client認証とAuthorization分離
- service_name名前空間分離
- model discovery partial failure
- SSE arrival timing
- Base64相当1 MiB JSON
- 非JSON routing拒否
- Secret非ログ化
- Windows Python-keyring互換Credential読取

実Provider、OpenCode、HAIA、Linux実機の試験は各環境で別途実施してください。
