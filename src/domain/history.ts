import { Project } from './schema';
import { getRuntimeConfig } from '../config/runtimeConfig';
import { validateProject } from './validation';

export interface HistoryState {
  past: Project[];
  present: Project;
  future: Project[];
  revision: number; // 単調増加カウンター (Undo/Redo時もインクリメント)
  rejectedUpdateCount: number;
  lastValidationError: string | null;
}

/**
 * 履歴初期状態生成
 */
export function createHistoryState(initialProject: Project): HistoryState {
  return {
    past: [],
    present: initialProject,
    future: [],
    revision: 1,
    rejectedUpdateCount: 0,
    lastValidationError: null,
  };
}

/**
 * 新しい確定操作をプッシュする純粋関数
 */
export function pushHistory(
  state: HistoryState,
  newProject: Project
): HistoryState {
  // 変更がない場合は何もしない
  if (state.present === newProject) {
    return state;
  }

  const validation = validateProject(newProject);
  if (!validation.valid) {
    return {
      ...state,
      rejectedUpdateCount: state.rejectedUpdateCount + 1,
      lastValidationError: validation.errors.slice(0, 3).map((error) => `${error.path}: ${error.message}`).join(' / '),
    };
  }

  const past = [...state.past, state.present];
  if (past.length > getRuntimeConfig().undoHistoryMaxEntries) {
    past.shift();
  }

  return {
    past,
    present: newProject,
    future: [], // 新しい操作によりRedo履歴は破棄
    revision: state.revision + 1,
    rejectedUpdateCount: state.rejectedUpdateCount,
    lastValidationError: null,
  };
}

/**
 * Undo処理
 */
export function undoHistory(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state;

  const previous = state.past[state.past.length - 1];
  const newPast = state.past.slice(0, state.past.length - 1);

  return {
    past: newPast,
    present: previous,
    future: [state.present, ...state.future],
    revision: state.revision + 1, // 仕様書 4.3: Undoでもrevisionを増やし、古い値へ戻さない
    rejectedUpdateCount: state.rejectedUpdateCount,
    lastValidationError: null,
  };
}

/**
 * Redo処理
 */
export function redoHistory(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state;

  const next = state.future[0];
  const newFuture = state.future.slice(1);

  return {
    past: [...state.past, state.present],
    present: next,
    future: newFuture,
    revision: state.revision + 1, // 仕様書 4.3: Redoでもrevisionを増やす
    rejectedUpdateCount: state.rejectedUpdateCount,
    lastValidationError: null,
  };
}
