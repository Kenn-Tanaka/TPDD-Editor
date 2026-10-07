import { afterEach, describe, expect, it, vi } from 'vitest';
import defaults from '../../config/defaults.json';
import { resetRuntimeConfigForTests, setRuntimeConfigForTests } from '../../src/config/runtimeConfig';
import { gatewayClient, readResponseTextLimited } from '../../src/services/llm/gatewayClient';
import { createTaskDeadline } from '../../src/services/llm/deadline';
import { parseSseStream, ResponseTooLargeError } from '../../src/services/llm/sseParser';
import { validatePngDimensions } from '../../src/rendering/svgExport';

describe('network/deadline/png resource limits', () => {
  afterEach(() => { resetRuntimeConfigForTests(); vi.restoreAllMocks(); });

  it('非ストリーミング応答を受信中にUTF-8バイト上限で停止する', async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('1234'));
        controller.enqueue(new TextEncoder().encode('5678'));
        controller.close();
      },
    }));
    await expect(readResponseTextLimited(response, 7)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('SSE応答も受信中の生バイト数で停止する', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[] }\n\n'));
        controller.close();
      },
    });
    const consume = async () => {
      for await (const _chunk of parseSseStream(stream.getReader(), undefined, 5)) { /* consume */ }
    };
    await expect(consume()).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('Abort済みSignalならfetchを開始しない', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    await expect(gatewayClient.listModels({ apiBaseUrl: 'http://127.0.0.1:8765/v1', authEnabled: false }, controller.signal)).rejects.toThrow('開始前');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(gatewayClient.complete(
      { apiBaseUrl: 'http://127.0.0.1:8765/v1', authEnabled: false },
      { modelId: 'test/model', messages: [], temperature: null, stream: false, signal: controller.signal, timeoutMs: 1000 },
    )).rejects.toThrow('開始前');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('初回推論と修復が同じ絶対締切の残り時間を使う', () => {
    let now = 1000;
    const deadline = createTaskDeadline(600, () => now);
    expect(deadline.remainingMs()).toBe(600);
    now = 1450;
    expect(deadline.remainingMs()).toBe(150);
    now = 1700;
    expect(deadline.remainingMs()).toBe(0);
  });

  it('PNG上限超過をCanvas確保前に判定できる', () => {
    setRuntimeConfigForTests({ ...defaults, pngMaxSidePx: 1000, pngMaxTotalPixels: 500_000 });
    expect(() => validatePngDimensions(600, 600, 2)).toThrow('上限');
    expect(validatePngDimensions(250, 250, 2)).toEqual({ width: 500, height: 500 });
  });
});
