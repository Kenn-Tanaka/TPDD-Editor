import { describe, expect, it } from 'vitest';
import { addEdgeToDiagram, addNodeToDiagram, createNewProject } from '../../src/domain/commands';
import { Project } from '../../src/domain/schema';
import { validateProject } from '../../src/domain/validation';
import { parseAndValidateProjectJson } from '../../src/services/persistence/fileIo';

describe('Project JSON Roundtrip & Error Resilience (P01, P02)', () => {
  it.each(['tpdd-project', 'thought-expansion-project'] as const)(
    'P01: %s 形式のプロジェクトファイルを読み込める',
    async (format) => {
      const project = { ...createNewProject('読込検証'), format };
      const file = new File([JSON.stringify(project)], 'project.tpdd.json', {
        type: 'application/json',
      });

      const result = await parseAndValidateProjectJson(file);

      expect(result.success).toBe(true);
      expect(result.project?.format).toBe(format);
    }
  );

  it('P01: プロジェクトのJSONシリアライズとデシリアライズで整合性が完全保持される', () => {
    const original = createNewProject('ラウンドトリップ検証');
    const diagId = original.rootDiagramId;

    const { project: p1, newNode: n1 } = addNodeToDiagram(original, diagId, {
      label: '要求A',
      levelId: 'level-requirement',
      x: 50,
      y: 100,
    });
    const { project: p2, newNode: n2 } = addNodeToDiagram(p1, diagId, {
      label: '機能B',
      levelId: 'level-function',
      x: 350,
      y: 100,
    });
    const { project: p3 } = addEdgeToDiagram(p2, diagId, {
      sourceId: n1.id,
      targetId: n2.id,
      kind: 'decomposition',
      label: '分解',
    });

    // JSON変換
    const jsonStr = JSON.stringify(p3, null, 2);
    const parsed = JSON.parse(jsonStr) as Project;

    // 検証
    const validation = validateProject(parsed);
    expect(validation.valid).toBe(true);
    expect(parsed.id).toBe(p3.id);
    expect(parsed.diagrams[0].nodes).toHaveLength(2);
    expect(parsed.diagrams[0].edges).toHaveLength(1);
    expect(parsed.diagrams[0].edges[0].label).toBe('分解');
  });

  it('P02: 存在しないlevelIdを参照するノードは拒否される', () => {
    const project = createNewProject('異常系テスト');
    const { project: invalidProj } = addNodeToDiagram(project, project.rootDiagramId, {
      label: '不正列ノード',
      levelId: 'non-existent-level',
      x: 100,
      y: 100,
    });

    const validation = validateProject(invalidProj);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.message.includes('存在しない抽象度列ID'))).toBe(true);
  });

  it('P02: 存在しないノードを参照するエッジは拒否される', () => {
    const project = createNewProject('異常系テスト');
    // 直接不正なエッジを注入
    const invalidProj: Project = {
      ...project,
      diagrams: [
        {
          ...project.diagrams[0],
          edges: [
            {
              id: 'edge-orphan',
              sourceId: 'ghost-source',
              targetId: 'ghost-target',
              kind: 'decomposition',
              label: '不正エッジ',
            },
          ],
        },
      ],
    };

    const validation = validateProject(invalidProj);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.message.includes('始点ノード'))).toBe(true);
  });

  it('P02: 図階層の循環を検出して拒否する', () => {
    const project = createNewProject('循環階層テスト');
    const rootId = project.rootDiagramId;
    const childId = 'child-diag-1';

    // ルート図のノードが子図を参照
    const { project: p1, newNode: n1 } = addNodeToDiagram(project, rootId, {
      label: '親ノード',
      levelId: 'level-requirement',
      x: 100,
      y: 100,
    });
    n1.childDiagramId = childId;

    // 子図を作成し、その中のノードがルート図を参照して循環させる
    const { project: p2, newNode: n2 } = addNodeToDiagram(p1, rootId, {
      label: '子図内ノード',
      levelId: 'level-function',
      x: 200,
      y: 200,
    });
    n2.childDiagramId = rootId; // 循環

    const cyclicProject: Project = {
      ...p2,
      diagrams: [
        p2.diagrams[0],
        {
          id: childId,
          title: '子図1',
          nodes: [n2],
          edges: [],
        },
      ],
    };

    const validation = validateProject(cyclicProject);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.message.includes('循環') || e.message.includes('ルート図'))).toBe(true);
  });
});
