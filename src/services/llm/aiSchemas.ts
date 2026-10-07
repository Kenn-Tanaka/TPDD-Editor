import { z } from 'zod';
import { EdgeKindSchema, NodeKindSchema } from '../../domain/schema';
import { countCharacters, getRuntimeConfig } from '../../config/runtimeConfig';

const aiText = (limit: () => number, label: string) => z.string().superRefine((value, ctx) => {
  const maximum = limit();
  if (countCharacters(value) > maximum) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は${maximum}文字以内です` });
});
const aiArray = <T extends z.ZodTypeAny>(item: T, limit: () => number, label: string) => z.array(item).superRefine((value, ctx) => {
  const maximum = limit();
  if (value.length > maximum) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は最大${maximum}件です` });
});

// 候補ノード
export const NodeProposalSchema = z.object({
  candidateId: z.string().min(1, 'candidateIdは必須です'),
  label: aiText(() => getRuntimeConfig().nameMaxChars, 'ラベル').refine((v) => v.length > 0, 'ラベルは必須です'),
  kind: NodeKindSchema,
  levelId: z.string().min(1, 'levelIdは必須です'),
  description: aiText(() => getRuntimeConfig().descriptionMaxChars, '説明').default(''),
  tags: aiArray(aiText(() => getRuntimeConfig().tagMaxChars, 'タグ'), () => getRuntimeConfig().tagMaxCount, 'タグ').default([]),
  rationale: aiText(() => getRuntimeConfig().descriptionMaxChars, '採用理由').default(''),
  assumptions: aiArray(aiText(() => getRuntimeConfig().descriptionMaxChars, '前提'), () => getRuntimeConfig().tagMaxCount, '前提').default([]),
  checks: aiArray(aiText(() => getRuntimeConfig().descriptionMaxChars, '確認事項'), () => getRuntimeConfig().tagMaxCount, '確認事項').default([]),
});
export type NodeProposal = z.infer<typeof NodeProposalSchema>;

// 候補エッジ
export const EdgeProposalSchema = z.object({
  sourceRef: z.string().min(1), // existing:<nodeId> または candidate:<candidateId>
  targetRef: z.string().min(1),
  kind: EdgeKindSchema,
  label: aiText(() => getRuntimeConfig().nameMaxChars, 'エッジラベル').default(''),
});
export type EdgeProposal = z.infer<typeof EdgeProposalSchema>;

// 展開案・代替案レスポンス
export const ProposalResponseSchema = z.object({
  format: z.literal('tpdd-ai-proposal'),
  schemaVersion: z.literal(1),
  task: z.enum(['expand', 'alternatives']),
  summary: aiText(() => getRuntimeConfig().descriptionMaxChars, '要約'),
  nodes: aiArray(NodeProposalSchema, () => getRuntimeConfig().aiProposalMaxNodes, 'ノード提案').refine((v) => v.length > 0, 'ノード提案は最低1件必要です'),
  edges: aiArray(EdgeProposalSchema, () => getRuntimeConfig().aiProposalMaxEdges, 'エッジ提案'),
});
export type ProposalResponse = z.infer<typeof ProposalResponseSchema>;

// レビュー指摘事項
export const ReviewIssueSchema = z.object({
  severity: z.enum(['info', 'warning']),
  nodeIds: z.array(z.string()).default([]),
  edgeIds: z.array(z.string()).default([]),
  category: z.enum(['missing', 'conflict', 'ambiguity', 'verification']),
  message: aiText(() => getRuntimeConfig().descriptionMaxChars, '指摘メッセージ'),
  recommendation: aiText(() => getRuntimeConfig().descriptionMaxChars, '改善提案'),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

// レビューレスポンス
export const ReviewResponseSchema = z.object({
  format: z.literal('tpdd-ai-review'),
  schemaVersion: z.literal(1),
  task: z.literal('review'),
  summary: aiText(() => getRuntimeConfig().descriptionMaxChars, '要約'),
  issues: aiArray(ReviewIssueSchema, () => getRuntimeConfig().aiReviewMaxIssues, '指摘事項'),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

export const LevelDefinitionProposalSchema = z.object({
  format: z.literal('tpdd-ai-level-definition'),
  schemaVersion: z.literal(1),
  task: z.literal('define-level'),
  description: aiText(() => getRuntimeConfig().descriptionMaxChars, '説明文').refine((v) => v.length > 0, '説明文は必須です'),
  includes: aiArray(aiText(() => getRuntimeConfig().placementCriterionMaxChars, '配置基準').refine((v) => v.length > 0), () => getRuntimeConfig().placementCriterionMaxCount, '含める内容').refine((v) => v.length > 0, '含める内容は最低1件必要です'),
  excludes: aiArray(aiText(() => getRuntimeConfig().placementCriterionMaxChars, '配置基準').refine((v) => v.length > 0), () => getRuntimeConfig().placementCriterionMaxCount, '含めない内容'),
  assumptions: z.array(z.string().min(1).max(500)).max(10).default([]),
});
export type LevelDefinitionProposal = z.infer<typeof LevelDefinitionProposalSchema>;

export function validateLevelDefinitionProposal(rawJson: unknown): { valid: boolean; data?: LevelDefinitionProposal; error?: string } {
  const parsed = LevelDefinitionProposalSchema.safeParse(rawJson);
  if (!parsed.success) {
    return { valid: false, error: `スキーマ検証エラー: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}` };
  }
  const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  const data = { ...parsed.data, description: parsed.data.description.trim(), includes: unique(parsed.data.includes), excludes: unique(parsed.data.excludes) };
  if (data.includes.length === 0) return { valid: false, error: '含める内容は最低1件必要です。' };
  const included = new Set(data.includes.map((item) => item.toLocaleLowerCase()));
  const contradiction = data.excludes.find((item) => included.has(item.toLocaleLowerCase()));
  if (contradiction) return { valid: false, error: `「${contradiction}」が含める内容と含めない内容の両方にあります。` };
  return { valid: true, data };
}

/**
 * 仕様書 9.5: LLMテキスト出力をJSONとして検証・パース
 * 応答全体が単一の ```json ... ``` フェンスで囲まれている場合のみ外枠を除去
 */
export function extractAndParseAiJson(rawText: string): unknown {
  let cleaned = rawText.trim();

  // 単一の ```json ... ``` または ``` ... ``` コードフェンスの除去
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const match = cleaned.match(fenceRegex);
  if (match) {
    cleaned = match[1].trim();
  }

  // 最初と最後が { と } であることを確認 (単一JSONオブジェクト)
  if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
    throw new Error('AIの応答が単一のJSONオブジェクトではありません。');
  }

  return JSON.parse(cleaned);
}

export interface ValidationContext {
  validLevelIds: Set<string>;
  existingNodeIds: Set<string>;
  existingEdgeIds?: Set<string>;
  expectedTask?: 'expand' | 'alternatives';
}

/** 明確な別名・メタデータ欠落だけを補正し、内容や参照先の意味は推測しない。 */
export function normalizeProposalShape(rawJson: unknown, expectedTask?: 'expand' | 'alternatives'): unknown {
  if (typeof rawJson !== 'object' || rawJson === null || Array.isArray(rawJson)) return rawJson;
  const raw = rawJson as Record<string, unknown>;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return rawJson;

  const aliases = new Map<string, string>();
  const nodes = raw.nodes.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const node = value as Record<string, unknown>;
    const oldId = typeof node.candidateId === 'string' ? node.candidateId : typeof node.id === 'string' ? node.id : '';
    const candidateId = oldId.trim() || `c${index + 1}`;
    if (oldId.trim()) aliases.set(oldId.trim(), candidateId);
    return { ...node, candidateId };
  });

  const normalizeEndpoint = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed.startsWith('candidate:')) {
      const id = trimmed.slice('candidate:'.length).trim();
      return `candidate:${aliases.get(id) ?? id}`;
    }
    return aliases.get(trimmed) ?? trimmed;
  };
  const edges = raw.edges.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const edge = value as Record<string, unknown>;
    return {
      ...edge,
      sourceRef: normalizeEndpoint(edge.sourceRef ?? edge.source ?? edge.sourceId),
      targetRef: normalizeEndpoint(edge.targetRef ?? edge.target ?? edge.targetId),
    };
  });

  return {
    ...raw,
    format: 'tpdd-ai-proposal',
    schemaVersion: 1,
    task: raw.task ?? expectedTask,
    summary: raw.summary ?? 'AIによる提案',
    nodes,
    edges,
  };
}

/**
 * 提案応答の厳密整合性検証
 */
export function validateProposalResponse(
  rawJson: unknown,
  context: ValidationContext
): { valid: boolean; data?: ProposalResponse; error?: string } {
  const parseResult = ProposalResponseSchema.safeParse(normalizeProposalShape(rawJson, context.expectedTask));
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    return { valid: false, error: `スキーマ検証エラー: ${msg}` };
  }

  const data = parseResult.data;
  if (context.expectedTask && data.task !== context.expectedTask) {
    return { valid: false, error: `タスク種別が不一致です（期待: ${context.expectedTask}, 応答: ${data.task}）。` };
  }

  // candidateId の重複チェック
  const candidateIds = new Set<string>();
  for (const node of data.nodes) {
    if (candidateIds.has(node.candidateId)) {
      return { valid: false, error: `candidateId「${node.candidateId}」が重複しています。` };
    }
    candidateIds.add(node.candidateId);

    // levelId の存在確認
    if (!context.validLevelIds.has(node.levelId)) {
      return { valid: false, error: `提案ノードに存在しない抽象度列ID「${node.levelId}」が含まれています。` };
    }
  }

  // エッジ参照の解決と正規化（Gemma等のモデルがプレフィックスを省略して "c2" と出力した場合にも自動補完）
  const normalizeRef = (ref: string): string | null => {
    const trimmed = ref.trim();
    if (trimmed.startsWith('candidate:')) {
      const cId = trimmed.slice('candidate:'.length).trim();
      return candidateIds.has(cId) ? `candidate:${cId}` : null;
    }
    if (trimmed.startsWith('existing:')) {
      const eId = trimmed.slice('existing:'.length).trim();
      return context.existingNodeIds.has(eId) ? `existing:${eId}` : null;
    }
    // プレフィックス省略時のフォールバック (c1, c2 または 既存ノードID)
    if (candidateIds.has(trimmed)) {
      return `candidate:${trimmed}`;
    }
    if (context.existingNodeIds.has(trimmed)) {
      return `existing:${trimmed}`;
    }
    return null;
  };

  const edgeSet = new Set<string>();

  for (const edge of data.edges) {
    const normalizedSource = normalizeRef(edge.sourceRef);
    if (!normalizedSource) {
      return { valid: false, error: `エッジ始点参照「${edge.sourceRef}」が存在しないノードを参照しています。` };
    }

    const normalizedTarget = normalizeRef(edge.targetRef);
    if (!normalizedTarget) {
      return { valid: false, error: `エッジ終点参照「${edge.targetRef}」が存在しないノードを参照しています。` };
    }

    if (normalizedSource === normalizedTarget) {
      return { valid: false, error: `自己エッジ参照は禁止されています (${edge.sourceRef})。` };
    }

    // 正規化した参照に書き戻す (下流の proposalAdopter が安全に処理できるようにする)
    edge.sourceRef = normalizedSource;
    edge.targetRef = normalizedTarget;

    const key = `${normalizedSource}-->${normalizedTarget}::${edge.kind}`;
    if (edgeSet.has(key)) {
      return { valid: false, error: `重複エッジ提案は禁止されています (${key})。` };
    }
    edgeSet.add(key);
  }

  return { valid: true, data };
}

/**
 * レビュー応答の厳密整合性検証
 */
export function validateReviewResponse(
  rawJson: unknown,
  context: ValidationContext
): { valid: boolean; data?: ReviewResponse; error?: string } {
  const parseResult = ReviewResponseSchema.safeParse(rawJson);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    return { valid: false, error: `スキーマ検証エラー: ${msg}` };
  }

  const data = parseResult.data;

  // 指摘内のnodeIds, edgeIdsが存在するか確認
  for (const issue of data.issues) {
    for (const nId of issue.nodeIds) {
      if (!context.existingNodeIds.has(nId)) {
        return { valid: false, error: `レビュー指摘に存在しないノードID「${nId}」が含まれています。` };
      }
    }
    if (context.existingEdgeIds) {
      for (const eId of issue.edgeIds) {
        if (!context.existingEdgeIds.has(eId)) {
          return { valid: false, error: `レビュー指摘に存在しないエッジID「${eId}」が含まれています。` };
        }
      }
    }
  }

  return { valid: true, data };
}
