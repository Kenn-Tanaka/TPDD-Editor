export interface LlmConnection {
  apiBaseUrl: string; // 末尾の /v1 を含む基点
  authEnabled: boolean;
  token?: string; // メモリ専用。シリアライザーや永続ストレージへ絶対に渡さない
}

export interface LlmModelOption {
  id: string; // prefix付き完全GatewayモデルID (例: openrouter/anthropic/claude-3.5-sonnet)
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  modelId: string;
  messages: LlmChatMessage[];
  temperature: number | null; // nullは送信しない
  /** 呼出し単位の残り時間。AIタスク全体の締切から計算する。 */
  timeoutMs?: number;
  /** @deprecated 既存呼出し互換。新規コードはtimeoutMsを使用する。 */
  timeoutSeconds?: number;
  stream: boolean;
  signal?: AbortSignal;
}

export interface LlmTextResult {
  content: string;
  finishReason: string;
}

export interface LlmService {
  listModels(connection: LlmConnection, signal?: AbortSignal): Promise<LlmModelOption[]>;
  complete(
    connection: LlmConnection,
    options: LlmCallOptions,
    onTextChunk?: (chunk: string) => void
  ): Promise<LlmTextResult>;
}
