# LLM Gateway Credential Manager

wxWidgets 3.2を使用したCredential登録アプリです。Service NameとCredential Identifierを指定し、Windows Credential ManagerまたはLinux Secret ServiceへSecretを登録・更新・削除します。Secretの読み戻し表示、export、ログ出力、平文fallbackは行いません。

```text
Service: CloudLLM
Username: llm_gateway|default
Username: openrouter|default
```

WindowsではPython `keyring.set_password(service, username, password)`が使用するWinVault形式と互換です。
