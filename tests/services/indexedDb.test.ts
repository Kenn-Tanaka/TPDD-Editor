import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewProject } from '../../src/domain/commands';
import { saveAutoSaveSnapshot } from '../../src/services/persistence/indexedDb';

describe('IndexedDB autosave error reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('IndexedDBを利用できない場合は呼び出し元へ失敗を通知する', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(
      saveAutoSaveSnapshot('test-session', createNewProject('自動保存検証'))
    ).rejects.toThrow('IndexedDB is not supported');
  });
});
