import { Project } from '../../domain/schema';
import { validateProject } from '../../domain/validation';

export interface AutoSaveSnapshot {
  id: string; // セッションIDまたは復旧スロットID
  projectId: string;
  projectTitle: string;
  savedAt: string; // ISO 8601
  project: Project;
}

const DB_NAME = 'TPDDEditorDB';
const DB_VERSION = 1;
const STORE_NAME = 'autosave_snapshots';
const MAX_SNAPSHOTS = 10;

/**
 * IndexedDB オープンヘルパー
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 自動保存スナップショットを保存 (直近10件に自動整理)
 */
export async function saveAutoSaveSnapshot(
  sessionId: string,
  project: Project
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const snapshot: AutoSaveSnapshot = {
    id: sessionId,
    projectId: project.id,
    projectTitle: project.title,
    savedAt: new Date().toISOString(),
    project,
  };

  const transactionCompleted = waitForTransaction(tx);
  store.put(snapshot);
  await transactionCompleted;

  // 10件超過時の古いスナップショット削除
  const allSnapshots = await getAllAutoSaveSnapshots();
  if (allSnapshots.length > MAX_SNAPSHOTS) {
    // 日時が古い順にソートして超過分を削除
    allSnapshots.sort(
      (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
    );
    const toDeleteCount = allSnapshots.length - MAX_SNAPSHOTS;
    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
    const deleteCompleted = waitForTransaction(deleteTx);
    const delStore = deleteTx.objectStore(STORE_NAME);
    for (let i = 0; i < toDeleteCount; i++) {
      delStore.delete(allSnapshots[i].id);
    }
    await deleteCompleted;
  }
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted'));
  });
}

/**
 * 全復旧候補を取得 (現行スキーマで検証済みのみ)
 */
export async function getAllAutoSaveSnapshots(): Promise<AutoSaveSnapshot[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const snapshots: AutoSaveSnapshot[] = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as AutoSaveSnapshot[]);
      req.onerror = () => reject(req.error);
    });

    // 仕様書 7.2: 適合しない復旧データは復元対象にしない
    const validSnapshots = snapshots.filter((s) => {
      if (!s.project || typeof s.project !== 'object') return false;
      const v = validateProject(s.project);
      return v.valid;
    });

    // 新しい順にソート
    return validSnapshots.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * 指定の復旧スナップショットを削除
 */
export async function deleteAutoSaveSnapshot(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch {
    // no-op
  }
}

/**
 * 全復旧スナップショットをクリア
 */
export async function clearAllAutoSaveSnapshots(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch {
    // no-op
  }
}

