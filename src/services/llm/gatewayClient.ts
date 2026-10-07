import { LlmCallOptions, LlmConnection, LlmModelOption, LlmService, LlmTextResult } from './types';
import { parseSseStream, ResponseTooLargeError } from './sseParser';
import { getRuntimeConfig } from '../../config/runtimeConfig';
import { isValidLoopbackUrl } from '../persistence/appStorage';

// エラー本文は画面表示の診断用途だけなので、固定の安全上限でメモリ消費を抑える。
const ERROR_RESPONSE_MAX_BYTES = 64 * 1024;

export class GatewayError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorType?: string,
    public detail?: string
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Lightweight LLM Gateway クライアント実装
 * 仕様書 第8章および第11章に準拠
 */
export const gatewayClient: LlmService = {
  /**
   * GET /v1/models による利用可能モデル一覧取得
   */
  async listModels(connection: LlmConnection, externalSignal?: AbortSignal): Promise<LlmModelOption[]> {
    const config = getRuntimeConfig();
    assertGatewayUrl(connection.apiBaseUrl);
    if (externalSignal?.aborted) throw new GatewayError('モデル一覧取得は開始前にキャンセルされました。', 408);
    const base = connection.apiBaseUrl.replace(/\/+$/, '');
    const url = `${base}/models`;

    // 認証チェック
    if (connection.authEnabled && (!connection.token || connection.token.trim().length === 0)) {
      throw new GatewayError('Gateway認証が有効ですが、Gateway Client Tokenが設定されていません。', 401);
    }

    const headers: Record<string, string> = {};
    if (connection.authEnabled && connection.token) {
      headers.Authorization = `Bearer ${connection.token.trim()}`;
    }

    const timeoutMs = config.modelListTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort);
      if (externalSignal.aborted) controller.abort();
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        await handleHttpError(response, controller.signal);
      }

      const text = await readResponseTextLimited(response, config.maxModelListResponseBytes, controller.signal);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GatewayError('Gatewayからの応答が正しいJSON形式ではありません。');
      }

      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { data: unknown }).data)) {
        throw new GatewayError('Gatewayモデル一覧の応答形式が不正です（data配列がありません）。');
      }

      const rawData = (parsed as { data: unknown[] }).data;
      const seenIds = new Set<string>();
      const result: LlmModelOption[] = [];

      for (const item of rawData) {
        if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'string') {
          const id = (item as { id: string }).id;
          // 仕様書 8.4.1 / G03: 2個目以降の/や大文字小文字を保持し、重複を除外
          if (id.trim().length > 0 && !seenIds.has(id)) {
            seenIds.add(id);
            result.push({ id });
          }
        }
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof GatewayError) throw err;
      if (err instanceof ResponseTooLargeError) throw new GatewayError(`モデル一覧の${err.message}`);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new GatewayError(`モデル一覧取得がタイムアウト（${timeoutMs}ms）またはキャンセルされました。`, 408);
      }

      // ネットワーク・CORS・Gateway停止エラー
      throw new GatewayError(
        'LLM-Gatewayに接続できませんでした。Gatewayが起動しているか、URL・ポート設定、CORS設定（allowed_originsに現在のOriginが含まれているか）を確認してください。',
        0
      );
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  },

  /**
   * POST /v1/chat/completions による推論実行
   */
  async complete(
    connection: LlmConnection,
    options: LlmCallOptions,
    _onTextChunk?: (chunk: string) => void
  ): Promise<LlmTextResult> {
    const config = getRuntimeConfig();
    assertGatewayUrl(connection.apiBaseUrl);
    if (options.signal?.aborted) throw new GatewayError('推論は開始前にキャンセルされました。', 408);
    const base = connection.apiBaseUrl.replace(/\/+$/, '');
    const url = `${base}/chat/completions`;

    // 認証チェック
    if (connection.authEnabled && (!connection.token || connection.token.trim().length === 0)) {
      throw new GatewayError('Gateway認証が有効ですが、Gateway Client Tokenが設定されていません。', 401);
    }

    const isStream = Boolean(options.stream);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (connection.authEnabled && connection.token) {
      headers.Authorization = `Bearer ${connection.token.trim()}`;
    }

    // タイムアウト
    const timeoutMs = options.timeoutMs ?? (options.timeoutSeconds !== undefined ? options.timeoutSeconds * 1000 : config.aiTaskTimeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new GatewayError('推論の残り時間がありません。', 408);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', onExternalAbort);
      if (options.signal.aborted) controller.abort();
    }

    const body: Record<string, unknown> = {
      model: options.modelId,
      messages: options.messages,
      stream: isStream,
    };
    if (options.temperature !== null && options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        await handleHttpError(response, controller.signal);
      }

      if (isStream) {
        if (!response.body) {
          throw new GatewayError('ストリーミング応答のレスポンスボディが存在しません。');
        }

        const reader = response.body.getReader();
        let accumulatedContent = '';
        let lastFinishReason: string | null = null;

        const sseStream = parseSseStream(reader, controller.signal, config.maxLlmResponseBytes);
        for await (const chunk of sseStream) {
          if (chunk.content) {
            accumulatedContent += chunk.content;
            if (_onTextChunk) {
              _onTextChunk(chunk.content);
            }
          }
          if (chunk.finishReason) {
            lastFinishReason = chunk.finishReason;
          }
        }

        if (accumulatedContent.trim().length === 0) {
          throw new GatewayError('ストリーミング応答の本文が空でした。');
        }

        // 仕様書 8.5: 正常終了判定
        const effectiveFinishReason = lastFinishReason || 'stop';
        if (effectiveFinishReason !== 'stop') {
          throw new GatewayError(
            `推論が正常に完了しませんでした (finish_reason: ${effectiveFinishReason})。`,
            undefined,
            effectiveFinishReason
          );
        }

        return {
          content: accumulatedContent.trim(),
          finishReason: effectiveFinishReason,
        };
      }

      // 非ストリーミング応答処理
      const text = await readResponseTextLimited(response, config.maxLlmResponseBytes, controller.signal);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GatewayError('Gatewayからの応答が正しいJSON形式ではありません。');
      }

      // 応答構造の検証
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = parsed as any;
      if (!obj || !Array.isArray(obj.choices) || obj.choices.length === 0) {
        throw new GatewayError('LLM応答にchoices配列が含まれていません。');
      }

      const firstChoice = obj.choices[0];
      const content = firstChoice.message?.content;
      const finishReason = firstChoice.finish_reason;

      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new GatewayError('LLMの応答本文(content)が空か文字列ではありません。');
      }

      // 仕様書 8.5: 初版の正常終了理由は stop とする
      if (finishReason !== 'stop') {
        throw new GatewayError(
          `推論が正常に完了しませんでした (finish_reason: ${finishReason})。出力が制限長を超えたかフィルタリングされた可能性があります。`,
          undefined,
          finishReason
        );
      }

      return {
        content: content.trim(),
        finishReason,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayError) throw err;
      if (err instanceof ResponseTooLargeError) throw new GatewayError(`LLMの${err.message}`);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new GatewayError(`推論がタイムアウト（${Math.ceil(timeoutMs)}ms）またはユーザーにより中止されました。`, 408);
      }

      throw new GatewayError(
        'LLM-Gatewayとの通信に失敗しました。Gateway起動、URL設定、CORS許可、ローカルネットワーク権限を確認してください。',
        0
      );
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  },
};

/**
 * 仕様書 8.6節: HTTPステータス・エラー詳細の丁寧な解析
 */
async function handleHttpError(response: Response, signal?: AbortSignal): Promise<never> {
  let errorType: string | undefined;
  let detailMessage: string | undefined;

  try {
    const errorText = await readResponseTextLimited(response, ERROR_RESPONSE_MAX_BYTES, signal);
    const parsed = JSON.parse(errorText);
    if (parsed && typeof parsed === 'object') {
      // Gateway標準 error オブジェクト
      const errObj = (parsed as { error?: { message?: string; type?: string } }).error;
      if (errObj) {
        errorType = errObj.type;
        detailMessage = errObj.message;
      }
    }
  } catch (error) {
    if (error instanceof ResponseTooLargeError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    // text/plain等の場合
  }

  const status = response.status;
  let msg = `Gatewayエラー (${status}): `;

  switch (status) {
    case 400:
      msg += `リクエスト形式、未対応パラメーター、またはモデルID (${detailMessage || ''}) を確認してください。`;
      break;
    case 401:
      msg += `Gateway認証エラーです。Gateway Client Tokenが正しく入力されているか確認してください。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 403:
      msg += `アクセスが拒否されました。Gatewayの allowlist 設定、または上流プロバイダーの利用制限を確認してください。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 404:
      msg += `指定されたプロバイダーまたはエンドポイントが見つかりません。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 413:
      msg += '送信量がGatewayまたは上流の上限を超えました。対象ノードや説明文の範囲を減らしてください。';
      break;
    case 429:
      msg += `上流LLMの利用上限（レート制限）に達しました。しばらく時間をおいて再試行してください。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 502:
      msg += `Gatewayから上流LLMへの接続に失敗しました。上流サービスの稼働状況やネットワークを確認してください。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 503:
      msg += `Gatewayの資格情報不足、またはサービス利用不可です。Gateway側のAPI Key登録を確認してください。${detailMessage ? ' (' + detailMessage + ')' : ''}`;
      break;
    case 504:
      msg += 'Gatewayまたは上流LLMで処理がタイムアウトしました。';
      break;
    default:
      msg += detailMessage || response.statusText || '予期せぬエラーが発生しました。';
      break;
  }

  throw new GatewayError(msg, status, errorType, detailMessage);
}

function assertGatewayUrl(value: string): void {
  const validation = isValidLoopbackUrl(value);
  if (!validation.valid) throw new GatewayError(`Gateway URLが不正です: ${validation.message}`, 0);
}

/** bodyを受信しながらUTF-8バイト上限を検査し、超過時は直ちにreaderを取消す。 */
export async function readResponseTextLimited(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maximumBytes) {
      await response.body?.cancel();
      throw new ResponseTooLargeError(maximumBytes);
    }
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  let received = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError(maximumBytes);
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    try { reader.releaseLock(); } catch { /* reader取消済み */ }
  }
}
