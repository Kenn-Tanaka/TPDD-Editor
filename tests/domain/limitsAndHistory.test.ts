import { afterEach, describe, expect, it } from 'vitest';
import defaults from '../../config/defaults.json';
import { resetRuntimeConfigForTests, setRuntimeConfigForTests } from '../../src/config/runtimeConfig';
import { createNewProject, reorderLevels, updateLevel, updateProjectMeta } from '../../src/domain/commands';
import { createHistoryState, pushHistory, redoHistory, undoHistory } from '../../src/domain/history';
import { prepareProjectJson, parseAndValidateProjectJson } from '../../src/services/persistence/fileIo';

describe('limits and transactional history', () => {
  afterEach(() => resetRuntimeConfigForTests());

  it('不正な更新をProjectにもUndo履歴にも反映しない', () => {
    const initial = createNewProject('境界');
    const invalid = updateProjectMeta(initial, { description: 'x'.repeat(2001) });
    const result = pushHistory(createHistoryState(initial), invalid);
    expect(result.present).toBe(initial);
    expect(result.past).toHaveLength(0);
    expect(result.rejectedUpdateCount).toBe(1);
    expect(result.lastValidationError).toContain('2,000');
  });

  it('列移動は1履歴でUndo/Redoしてもorderが一意', () => {
    const initial = createNewProject('列順');
    const ids = [...initial.levels].sort((a, b) => a.order - b.order).map((level) => level.id);
    const moved = reorderLevels(initial, [ids[1], ids[0], ...ids.slice(2)]);
    let history = pushHistory(createHistoryState(initial), moved);
    expect(history.past).toHaveLength(1);
    expect(new Set(history.present.levels.map((level) => level.order)).size).toBe(initial.levels.length);
    history = undoHistory(history);
    expect(history.present.levels.find((level) => level.id === ids[0])?.order).toBe(0);
    history = redoHistory(history);
    expect(history.present.levels.find((level) => level.id === ids[1])?.order).toBe(0);
  });

  it('列編集の実質的な変更がなければ履歴を追加しない', () => {
    const initial = createNewProject('列編集');
    const level = initial.levels[0];
    const unchanged = updateLevel(initial, level.id, {
      label: level.label,
      description: level.description,
      includes: level.includes,
      excludes: level.excludes,
    });
    const history = pushHistory(createHistoryState(initial), unchanged);
    expect(unchanged).toBe(initial);
    expect(history.past).toHaveLength(0);
  });

  it('保存バイト境界を検査し、同じ設定で再読込できる', async () => {
    const project = createNewProject('往復');
    const baseline = prepareProjectJson(project);
    expect(baseline.success).toBe(true);
    if (!baseline.success) return;
    setRuntimeConfigForTests({ ...defaults, maxProjectFileBytes: baseline.byteLength });
    const atLimit = prepareProjectJson(project);
    expect(atLimit.success).toBe(true);
    const loaded = await parseAndValidateProjectJson(new File([baseline.json], 'roundtrip.tpdd.json'));
    expect(loaded.success).toBe(true);
    expect(loaded.project).toEqual(project);
    setRuntimeConfigForTests({ ...defaults, maxProjectFileBytes: baseline.byteLength - 1 });
    expect(prepareProjectJson(project).success).toBe(false);
  });
});
