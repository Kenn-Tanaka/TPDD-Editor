export interface TaskDeadline {
  readonly expiresAtMs: number;
  remainingMs(): number;
}

/** 初回推論と形式修復が共有する単一の絶対締切。 */
export function createTaskDeadline(timeoutMs: number, now: () => number = Date.now): TaskDeadline {
  const expiresAtMs = now() + timeoutMs;
  return {
    expiresAtMs,
    remainingMs: () => Math.max(0, expiresAtMs - now()),
  };
}
