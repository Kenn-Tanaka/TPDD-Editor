import { generateId } from '../shared/id';
import { getRuntimeConfig } from '../config/runtimeConfig';
import {
  EdgeKind,
  LevelDefinition,
  NodeKind,
  NodeStatus,
  Project,
  ThoughtEdge,
  ThoughtNode,
} from './schema';

export const DEFAULT_LEVELS: LevelDefinition[] = [
  { id: 'level-requirement', label: '要求', description: '利用者やシステムが満たすべき目的・期待を表します。', includes: ['達成したい目的', '満たすべき要求'], excludes: ['具体的な実現方法'], order: 0 },
  { id: 'level-function', label: '機能', description: '要求を実現するために必要な働きや振る舞いを表します。', includes: ['必要な機能', '入出力や振る舞い'], excludes: ['具体的な部品構成'], order: 1 },
  { id: 'level-mechanism', label: '機構', description: '機能を成立させる方式や仕組みを表します。', includes: ['実現方式', '動作原理'], excludes: ['個別部品の詳細構造'], order: 2 },
  { id: 'level-structure', label: '構造', description: '機構を構成する要素や接続関係を表します。', includes: ['構成要素', '部品間の関係'], excludes: ['上位の目的だけの記述'], order: 3 },
];

export interface AddLevelParams {
  label: string;
  description?: string;
  includes?: string[];
  excludes?: string[];
}

function normalizeLevelItems(items?: string[]): string[] | undefined {
  if (!items) return undefined;
  const normalized = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

export const DEFAULT_MODEL_ID = 'lmstudio/default';

/**
 * 新規Project生成
 */
export function createNewProject(title = '新規思考展開図'): Project {
  const rootDiagramId = generateId();
  const now = new Date().toISOString();

  return {
    format: 'tpdd-project',
    schemaVersion: 1,
    id: generateId(),
    title,
    description: '',
    createdAt: now,
    updatedAt: now,
    rootDiagramId,
    levels: [...DEFAULT_LEVELS],
    diagrams: [
      {
        id: rootDiagramId,
        title: 'ルート図',
        nodes: [],
        edges: [],
      },
    ],
    aiPreferences: {
      modelId: DEFAULT_MODEL_ID,
      timeoutSeconds: getRuntimeConfig().aiTaskTimeoutMs / 1000,
      temperature: 0.2,
      stream: false,
    },
  };
}

/**
 * ノード追加
 */
export function addNodeToDiagram(
  project: Project,
  diagramId: string,
  params: {
    label?: string;
    kind?: NodeKind;
    status?: NodeStatus;
    levelId: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    description?: string;
    origin?: 'manual' | 'llm';
    modelId?: string;
    task?: 'expand' | 'alternatives';
    promptVersion?: string;
    requestId?: string;
  }
): { project: Project; newNode: ThoughtNode } {
  const newNode: ThoughtNode = {
    id: generateId(),
    label: params.label || '新規ノード',
    kind: params.kind || 'requirement',
    status: params.status || 'draft',
    levelId: params.levelId,
    x: params.x,
    y: params.y,
    width: params.width ?? 180,
    height: params.height ?? 72,
    meta: {
      description: params.description || '',
      tags: [],
      sourceLinks: [],
    },
    provenance: {
      origin: params.origin || 'manual',
      createdAt: new Date().toISOString(),
      modelId: params.modelId,
      task: params.task,
      promptVersion: params.promptVersion,
      requestId: params.requestId,
    },
  };

  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      nodes: [...d.nodes, newNode],
    };
  });

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      diagrams,
    },
    newNode,
  };
}

/**
 * ノード更新 (座標、サイズ、属性等)
 */
export function updateNodeInDiagram(
  project: Project,
  diagramId: string,
  nodeId: string,
  patch: Partial<Omit<ThoughtNode, 'id' | 'provenance'>>
): Project {
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          ...patch,
          meta: patch.meta ? { ...n.meta, ...patch.meta } : n.meta,
        };
      }),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * ノード削除 (関連エッジも同トランザクションで削除)
 */
export function removeNodeFromDiagram(
  project: Project,
  diagramId: string,
  nodeId: string
): Project {
  // 子図が存在する場合の処理は上位の階層処理コマンドでカスケード削除するが、
  // ここでは単一図内でのノード・エッジ削除を行う
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      nodes: d.nodes.filter((n) => n.id !== nodeId),
      edges: d.edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * 複数ノードの位置を一括更新 (複数選択ドラッグ移動・整列等)
 */
export function updateNodesPosition(
  project: Project,
  diagramId: string,
  positions: { id: string; x: number; y: number }[]
): Project {
  const posMap = new Map(positions.map((p) => [p.id, p]));
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      nodes: d.nodes.map((n) => {
        const target = posMap.get(n.id);
        if (!target) return n;
        return {
          ...n,
          x: target.x,
          y: target.y,
        };
      }),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * 複数ノードの一括削除 (関連エッジも同トランザクションで削除)
 */
export function removeMultipleNodesFromDiagram(
  project: Project,
  diagramId: string,
  nodeIds: string[]
): Project {
  const idSet = new Set(nodeIds);
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      nodes: d.nodes.filter((n) => !idSet.has(n.id)),
      edges: d.edges.filter((e) => !idSet.has(e.sourceId) && !idSet.has(e.targetId)),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * エッジ追加
 */
export function addEdgeToDiagram(
  project: Project,
  diagramId: string,
  params: {
    sourceId: string;
    targetId: string;
    kind: EdgeKind;
    label?: string;
  }
): { project: Project; newEdge?: ThoughtEdge; error?: string } {
  // 自己エッジチェック
  if (params.sourceId === params.targetId) {
    return { project, error: '自己エッジは作成できません' };
  }

  const diagram = project.diagrams.find((d) => d.id === diagramId);
  if (!diagram) {
    return { project, error: '図が見つかりません' };
  }

  // 重複チェック: 同じsourceId, targetId, kind
  const exists = diagram.edges.some(
    (e) =>
      e.sourceId === params.sourceId &&
      e.targetId === params.targetId &&
      e.kind === params.kind
  );
  if (exists) {
    return { project, error: '同一種別の重複エッジは作成できません' };
  }

  const newEdge: ThoughtEdge = {
    id: generateId(),
    sourceId: params.sourceId,
    targetId: params.targetId,
    kind: params.kind,
    label: params.label || '',
  };

  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      edges: [...d.edges, newEdge],
    };
  });

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      diagrams,
    },
    newEdge,
  };
}

/**
 * エッジ削除
 */
export function removeEdgeFromDiagram(
  project: Project,
  diagramId: string,
  edgeId: string
): Project {
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      edges: d.edges.filter((e) => e.id !== edgeId),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * エッジ更新
 */
export function updateEdgeInDiagram(
  project: Project,
  diagramId: string,
  edgeId: string,
  patch: Partial<Pick<ThoughtEdge, 'kind' | 'label'>>
): Project {
  const diagrams = project.diagrams.map((d) => {
    if (d.id !== diagramId) return d;
    return {
      ...d,
      edges: d.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    };
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams,
  };
}

/**
 * 子孫図IDのリストを再帰的に取得
 */
export function findDescendantDiagramIds(project: Project, startDiagramId: string): string[] {
  const result: string[] = [];
  const startDiag = project.diagrams.find((d) => d.id === startDiagramId);
  if (!startDiag) return result;

  const stack = [startDiag];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const node of current.nodes) {
      if (node.childDiagramId) {
        result.push(node.childDiagramId);
        const childDiag = project.diagrams.find((d) => d.id === node.childDiagramId);
        if (childDiag) {
          stack.push(childDiag);
        }
      }
    }
  }

  return result;
}

/**
 * ノードに対するサブ図（詳細図）を作成または取得
 * 仕様書 6.2: 既存子図がある場合はその図へ移動、なければ空の子Diagramを作る
 */
export function createSubDiagramForNode(
  project: Project,
  parentDiagramId: string,
  parentNodeId: string,
  title?: string
): { project: Project; childDiagramId: string; created: boolean } {
  const parentDiag = project.diagrams.find((d) => d.id === parentDiagramId);
  if (!parentDiag) {
    throw new Error('親図が見つかりません');
  }

  const parentNode = parentDiag.nodes.find((n) => n.id === parentNodeId);
  if (!parentNode) {
    throw new Error('親ノードが見つかりません');
  }

  if (parentNode.childDiagramId) {
    // 既に存在する場合は既存子図を返す
    return {
      project,
      childDiagramId: parentNode.childDiagramId,
      created: false,
    };
  }

  const newDiagramId = generateId();
  const diagramTitle = title || `${parentNode.label} の詳細`;

  const newDiagram = {
    id: newDiagramId,
    title: diagramTitle,
    nodes: [],
    edges: [],
  };

  const updatedDiagrams = project.diagrams.map((d) => {
    if (d.id !== parentDiagramId) return d;
    return {
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.id !== parentNodeId) return n;
        return {
          ...n,
          childDiagramId: newDiagramId,
        };
      }),
    };
  });

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      diagrams: [...updatedDiagrams, newDiagram],
    },
    childDiagramId: newDiagramId,
    created: true,
  };
}

/**
 * サブ図の削除 (子孫図も含めてカスケード削除)
 * 仕様書 6.2: 子孫図を含めて削除し、親ノードのchildDiagramIdも解除
 */
export function removeDiagramCascade(
  project: Project,
  diagramIdToRemove: string
): { project: Project; removedDiagramIds: string[] } {
  if (diagramIdToRemove === project.rootDiagramId) {
    throw new Error('ルート図は削除できません');
  }

  const descendants = findDescendantDiagramIds(project, diagramIdToRemove);
  const idsToRemove = new Set([diagramIdToRemove, ...descendants]);

  // 親ノードの childDiagramId を解除
  const updatedDiagrams = project.diagrams
    .filter((d) => !idsToRemove.has(d.id))
    .map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.childDiagramId && idsToRemove.has(n.childDiagramId)) {
          const { childDiagramId, ...rest } = n;
          return rest as ThoughtNode;
        }
        return n;
      }),
    }));

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      diagrams: updatedDiagrams,
    },
    removedDiagramIds: Array.from(idsToRemove),
  };
}

/**
 * ノード削除（もし子図を持っていれば子孫図もカスケード削除）
 * 仕様書 6.2: 親ノード削除時は子孫図を含めて削除
 */
export function removeNodeWithDescendants(
  project: Project,
  diagramId: string,
  nodeId: string
): { project: Project; removedDiagramCount: number } {
  const diag = project.diagrams.find((d) => d.id === diagramId);
  const node = diag?.nodes.find((n) => n.id === nodeId);

  let updatedProj = project;
  let removedDiagramCount = 0;

  if (node?.childDiagramId) {
    const cascadeResult = removeDiagramCascade(updatedProj, node.childDiagramId);
    updatedProj = cascadeResult.project;
    removedDiagramCount = cascadeResult.removedDiagramIds.length;
  }

  updatedProj = removeNodeFromDiagram(updatedProj, diagramId, nodeId);

  return {
    project: updatedProj,
    removedDiagramCount,
  };
}

/**
 * 図タイトルの変更
 */
export function updateDiagramTitle(
  project: Project,
  diagramId: string,
  newTitle: string
): Project {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    diagrams: project.diagrams.map((d) =>
      d.id === diagramId ? { ...d, title: newTitle.trim() || d.title } : d
    ),
  };
}

/**
 * プロジェクト名の変更
 */
export function updateProjectTitle(project: Project, newTitle: string): Project {
  return {
    ...project,
    title: newTitle.trim() || project.title,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * プロジェクトメタ情報（タイトル・説明）の更新
 */
export function updateProjectMeta(
  project: Project,
  patch: { title?: string; description?: string }
): Project {
  return {
    ...project,
    title: patch.title !== undefined ? (patch.title.trim() || project.title) : project.title,
    description: patch.description !== undefined ? patch.description : project.description,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 抽象度列の追加 (1〜12列)
 */
export function addLevel(project: Project, params: AddLevelParams): Project {
  const maximum = getRuntimeConfig().levelMaxCount;
  if (project.levels.length >= maximum) {
    throw new Error(`抽象度列は最大${maximum}列までです`);
  }

  const maxOrder = project.levels.reduce((max, l) => Math.max(max, l.order), -1);
  const newLevel: LevelDefinition = {
    id: `level-${generateId().slice(0, 8)}`,
    label: params.label.trim() || '新規列',
    description: params.description?.trim() || undefined,
    includes: normalizeLevelItems(params.includes),
    excludes: normalizeLevelItems(params.excludes),
    order: maxOrder + 1,
  };

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    levels: [...project.levels, newLevel],
  };
}

/**
 * 抽象度列の更新
 */
export function updateLevel(
  project: Project,
  levelId: string,
  patch: Partial<Pick<LevelDefinition, 'label' | 'description' | 'includes' | 'excludes' | 'order'>>
): Project {
  const current = project.levels.find((level) => level.id === levelId);
  if (!current) return project;
  const next = { ...current, ...patch };
  if (JSON.stringify(current) === JSON.stringify(next)) return project;
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    levels: project.levels.map((l) => (l.id === levelId ? { ...l, ...patch } : l)),
  };
}

/** 列順を一つの不可分な確定操作として再設定する。 */
export function reorderLevels(project: Project, orderedLevelIds: string[]): Project {
  if (orderedLevelIds.length !== project.levels.length
    || new Set(orderedLevelIds).size !== project.levels.length
    || orderedLevelIds.some((id) => !project.levels.some((level) => level.id === id))) {
    throw new Error('列順には現在の全列IDを重複なく指定してください');
  }
  const currentIds = [...project.levels].sort((a, b) => a.order - b.order).map((level) => level.id);
  if (currentIds.every((id, index) => id === orderedLevelIds[index])) return project;
  const orderById = new Map(orderedLevelIds.map((id, index) => [id, index]));
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    levels: project.levels.map((level) => ({ ...level, order: orderById.get(level.id)! })),
  };
}

/**
 * 抽象度列の削除 (所属ノードを指定の別列へ一括再割り当て)
 * 仕様書 4.1: 列を削除する場合、その列のノードの移動先を選択してから一括更新する
 */
export function removeLevelWithReassign(
  project: Project,
  levelIdToRemove: string,
  targetLevelId: string
): Project {
  if (project.levels.length <= 1) {
    throw new Error('最低1つの抽象度列が必要です');
  }
  if (levelIdToRemove === targetLevelId) {
    throw new Error('移動先は別の列を指定してください');
  }

  // 全図のノードで levelIdToRemove を参照しているものを targetLevelId へ変更
  const diagrams = project.diagrams.map((d) => ({
    ...d,
    nodes: d.nodes.map((n) =>
      n.levelId === levelIdToRemove ? { ...n, levelId: targetLevelId } : n
    ),
  }));

  const levels = project.levels
    .filter((l) => l.id !== levelIdToRemove)
    .map((l, idx) => ({ ...l, order: idx })); // order再番号付け

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    levels,
    diagrams,
  };
}

