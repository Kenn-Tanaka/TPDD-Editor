import { z } from 'zod';
import { countCharacters, getRuntimeConfig } from '../config/runtimeConfig';

function limitedString(limit: () => number, label: string) {
  return z.string().superRefine((value, ctx) => {
    const maximum = limit();
    if (countCharacters(value) > maximum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は${maximum.toLocaleString()}文字以内です` });
    }
  });
}

function limitedUrl(limit: () => number, label: string) {
  return z.string().url('URL形式が不正です').superRefine((value, ctx) => {
    const maximum = limit();
    if (countCharacters(value) > maximum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は${maximum.toLocaleString()}文字以内です` });
    }
  });
}

function limitedArray<T extends z.ZodTypeAny>(item: T, limit: () => number, label: string) {
  return z.array(item).superRefine((value, ctx) => {
    const maximum = limit();
    if (value.length > maximum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は最大${maximum.toLocaleString()}件です` });
    }
  });
}

// ノード種別
export const NodeKindSchema = z.enum([
  'requirement',
  'function',
  'mechanism',
  'structure',
  'constraint',
  'note',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

// ノード状態
export const NodeStatusSchema = z.enum([
  'draft',
  'candidate',
  'adopted',
  'rejected',
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

// エッジ種別
export const EdgeKindSchema = z.enum([
  'decomposition',
  'dependency',
  'constraint',
  'reference',
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

// 抽象度列定義 (1〜12列)
export const LevelDefinitionSchema = z.object({
  id: z.string().min(1, '列IDは空にできません'),
  label: limitedString(() => getRuntimeConfig().nameMaxChars, '列名').refine((v) => v.length > 0, '列名は空にできません'),
  description: limitedString(() => getRuntimeConfig().descriptionMaxChars, '列の説明').optional(),
  includes: limitedArray(
    limitedString(() => getRuntimeConfig().placementCriterionMaxChars, '配置基準').refine((v) => v.length > 0, '配置基準は空にできません'),
    () => getRuntimeConfig().placementCriterionMaxCount,
    '含める内容',
  ).optional(),
  excludes: limitedArray(
    limitedString(() => getRuntimeConfig().placementCriterionMaxChars, '配置基準').refine((v) => v.length > 0, '配置基準は空にできません'),
    () => getRuntimeConfig().placementCriterionMaxCount,
    '含めない内容',
  ).optional(),
  order: z.number().int().min(0),
});
export type LevelDefinition = z.infer<typeof LevelDefinitionSchema>;

// 来歴情報
export const ProvenanceSchema = z.object({
  origin: z.enum(['manual', 'llm']),
  createdAt: z.string().datetime({ message: 'ISO 8601形式のUTC日時である必要があります' }),
  modelId: z.string().optional(),
  task: z.enum(['expand', 'alternatives']).optional(),
  promptVersion: z.string().optional(),
  requestId: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ノード定義
export const ThoughtNodeSchema = z.object({
  id: z.string().min(1, 'ノードIDは空にできません'),
  label: limitedString(() => getRuntimeConfig().nameMaxChars, 'ラベル').refine((v) => v.length > 0, 'ラベルは空にできません'),
  kind: NodeKindSchema,
  status: NodeStatusSchema,
  levelId: z.string().min(1, '抽象度列IDは必須です'),
  x: z.number().finite().min(-1000000).max(1000000),
  y: z.number().finite().min(-1000000).max(1000000),
  width: z.number().finite().min(120, '幅は120以上').max(1000, '幅は1000以下'),
  height: z.number().finite().min(48, '高さは48以上').max(2000, '高さは2000以下'),
  childDiagramId: z.string().optional(),
  meta: z.object({
    description: limitedString(() => getRuntimeConfig().descriptionMaxChars, '説明'),
    tags: limitedArray(limitedString(() => getRuntimeConfig().tagMaxChars, 'タグ'), () => getRuntimeConfig().tagMaxCount, 'タグ'),
    sourceLinks: limitedArray(
      limitedUrl(() => getRuntimeConfig().sourceLinkMaxChars, 'リンク')
        .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
          message: 'リンクはhttpまたはhttpsのみ許可されます',
        }),
      () => getRuntimeConfig().sourceLinkMaxCount,
      'リンク',
    ),
  }),
  provenance: ProvenanceSchema,
});
export type ThoughtNode = z.infer<typeof ThoughtNodeSchema>;

// エッジ定義
export const ThoughtEdgeSchema = z.object({
  id: z.string().min(1, 'エッジIDは空にできません'),
  sourceId: z.string().min(1, '始点ノードIDは必須です'),
  targetId: z.string().min(1, '終点ノードIDは必須です'),
  kind: EdgeKindSchema,
  label: limitedString(() => getRuntimeConfig().nameMaxChars, 'エッジラベル'),
});
export type ThoughtEdge = z.infer<typeof ThoughtEdgeSchema>;

// 図定義
export const DiagramSchema = z.object({
  id: z.string().min(1, '図IDは空にできません'),
  title: limitedString(() => getRuntimeConfig().nameMaxChars, '図タイトル').refine((v) => v.length > 0, '図タイトルは空にできません'),
  nodes: limitedArray(ThoughtNodeSchema, () => getRuntimeConfig().nodesPerDiagramMaxCount, '1図あたりのノード'),
  edges: limitedArray(ThoughtEdgeSchema, () => getRuntimeConfig().edgesPerDiagramMaxCount, '1図あたりのエッジ'),
});
export type Diagram = z.infer<typeof DiagramSchema>;

// AI設定
export const AiPreferencesSchema = z.object({
  modelId: z.string().min(1),
  timeoutSeconds: z.number().int().superRefine((value, ctx) => {
    const config = getRuntimeConfig();
    if (value * 1000 < config.aiTaskTimeoutMinMs || value * 1000 > config.aiTaskTimeoutMaxMs) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `タイムアウトは${config.aiTaskTimeoutMinMs / 1000}〜${config.aiTaskTimeoutMaxMs / 1000}秒です` });
    }
  }),
  temperature: z.number().min(0).max(2).nullable(),
  stream: z.boolean(),
});
export type AiPreferences = z.infer<typeof AiPreferencesSchema>;

// プロジェクト定義 (正本)
export const ProjectSchema = z.object({
  format: z.literal('tpdd-project'),
  schemaVersion: z.literal(1),
  id: z.string().min(1, 'プロジェクトIDは空にできません'),
  title: limitedString(() => getRuntimeConfig().nameMaxChars, 'プロジェクト名').refine((v) => v.length > 0, 'プロジェクト名は空にできません'),
  description: limitedString(() => getRuntimeConfig().descriptionMaxChars, '説明'),
  createdAt: z.string().datetime({ message: 'ISO 8601形式のUTC日時である必要があります' }),
  updatedAt: z.string().datetime({ message: 'ISO 8601形式のUTC日時である必要があります' }),
  rootDiagramId: z.string().min(1, 'ルート図IDは必須です'),
  levels: limitedArray(LevelDefinitionSchema, () => getRuntimeConfig().levelMaxCount, '抽象度列').refine((v) => v.length > 0, '抽象度列は最低1列必要です'),
  diagrams: limitedArray(DiagramSchema, () => getRuntimeConfig().diagramMaxCount, '図').refine((v) => v.length > 0, '図は最低1つ必要です'),
  aiPreferences: AiPreferencesSchema,
});
export type Project = z.infer<typeof ProjectSchema>;
