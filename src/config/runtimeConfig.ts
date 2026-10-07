import { z } from 'zod';
import defaultsJson from '../../config/defaults.json';

/** 運用設定で無効化できない、ブラウザ資源枯渇を防ぐ絶対安全上限。 */
export const CONFIG_SAFETY_LIMITS = Object.freeze({
  maxTextChars: 100_000,
  maxCollectionCount: 100_000,
  maxResponseBytes: 64 * 1024 * 1024,
  maxProjectFileBytes: 100 * 1024 * 1024,
  maxTimeoutMs: 60 * 60 * 1000,
  maxPngSidePx: 32_768,
  maxPngTotalPixels: 268_435_456,
  maxRuntimeConfigBytes: 1024 * 1024,
});

const positiveInt = (maximum: number) => z.number().int().positive().max(maximum);
const port = z.number().int().min(1).max(65_535);

export function isLoopbackGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username && !url.password && !url.search && !url.hash
      && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1');
  } catch {
    return false;
  }
}

export const RuntimeConfigSchema = z.object({
  configVersion: z.literal(1),
  descriptionMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars),
  nameMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars),
  tagMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars),
  tagMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  sourceLinkMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars),
  sourceLinkMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  placementCriterionMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars),
  placementCriterionMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  levelMaxCount: positiveInt(1_000),
  diagramMaxCount: positiveInt(10_000),
  nodesPerDiagramMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  edgesPerDiagramMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  projectNodeMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  projectEdgeMaxCount: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  maxProjectFileBytes: positiveInt(CONFIG_SAFETY_LIMITS.maxProjectFileBytes),
  maxModelListResponseBytes: positiveInt(CONFIG_SAFETY_LIMITS.maxResponseBytes),
  maxLlmResponseBytes: positiveInt(CONFIG_SAFETY_LIMITS.maxResponseBytes),
  aiTaskTimeoutMs: positiveInt(CONFIG_SAFETY_LIMITS.maxTimeoutMs).multipleOf(1_000),
  aiTaskTimeoutMinMs: positiveInt(CONFIG_SAFETY_LIMITS.maxTimeoutMs).multipleOf(1_000),
  aiTaskTimeoutMaxMs: positiveInt(CONFIG_SAFETY_LIMITS.maxTimeoutMs).multipleOf(1_000),
  modelListTimeoutMs: positiveInt(CONFIG_SAFETY_LIMITS.maxTimeoutMs),
  launcherStartupTimeoutMs: z.number().int().min(1_000).max(CONFIG_SAFETY_LIMITS.maxTimeoutMs),
  undoHistoryMaxEntries: positiveInt(10_000),
  autosaveIntervalMs: positiveInt(60 * 60 * 1000),
  autosaveSnapshotMaxCount: positiveInt(10_000),
  aiPreviewMaxNodes: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  aiPreviewMaxEdges: positiveInt(CONFIG_SAFETY_LIMITS.maxCollectionCount),
  aiPreviewMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars * 100),
  aiRepairInputMaxChars: positiveInt(CONFIG_SAFETY_LIMITS.maxTextChars * 10),
  aiProposalMaxNodes: positiveInt(1_000),
  aiProposalMaxEdges: positiveInt(10_000),
  aiReviewMaxIssues: positiveInt(10_000),
  pngMaxSidePx: positiveInt(CONFIG_SAFETY_LIMITS.maxPngSidePx),
  pngMaxTotalPixels: positiveInt(CONFIG_SAFETY_LIMITS.maxPngTotalPixels),
  aiAutoRepairEnabled: z.boolean(),
  defaultGatewayUrl: z.string().url(),
  gatewayPort: port,
  editorPort: port,
}).strict().superRefine((value, ctx) => {
  if (value.aiTaskTimeoutMinMs > value.aiTaskTimeoutMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiTaskTimeoutMs'], message: '既定値は最小値以上である必要があります' });
  }
  if (value.aiTaskTimeoutMs > value.aiTaskTimeoutMaxMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiTaskTimeoutMs'], message: '既定値は最大値以下である必要があります' });
  }
  if (value.projectNodeMaxCount < value.nodesPerDiagramMaxCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectNodeMaxCount'], message: '図単位のノード上限以上である必要があります' });
  }
  if (value.projectEdgeMaxCount < value.edgesPerDiagramMaxCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectEdgeMaxCount'], message: '図単位のエッジ上限以上である必要があります' });
  }
  if (!isLoopbackGatewayUrl(value.defaultGatewayUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultGatewayUrl'], message: 'loopback（127.0.0.1、localhost、::1）URLのみ指定できます' });
  } else {
    const url = new URL(value.defaultGatewayUrl);
    const effectivePort = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (effectivePort !== value.gatewayPort) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gatewayPort'], message: 'defaultGatewayUrlのポートと一致する必要があります' });
    }
  }
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function formatConfigIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

const parsedDefaults = RuntimeConfigSchema.safeParse(defaultsJson);
if (!parsedDefaults.success) {
  throw new Error(`config/defaults.json が不正です: ${formatConfigIssues(parsedDefaults.error.issues).join('; ')}`);
}
const validatedDefaults = parsedDefaults.data as RuntimeConfig;
let activeConfig: RuntimeConfig = Object.freeze(validatedDefaults);

export function getRuntimeConfig(): RuntimeConfig {
  return activeConfig;
}

/** Unicodeコードポイント単位。サロゲートペアの絵文字は1文字として数える。 */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export type RuntimeConfigLoadResult =
  | { success: true; config: RuntimeConfig; source: 'runtime' | 'defaults' }
  | { success: false; errors: string[] };

export async function loadRuntimeConfig(fetcher: typeof fetch = fetch): Promise<RuntimeConfigLoadResult> {
  let response: Response;
  try {
    response = await fetcher('/tpdd-config.json', { cache: 'no-store' });
  } catch (error) {
    return { success: false, errors: [`tpdd-config.jsonを取得できません: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (response.status === 404) {
    activeConfig = Object.freeze(validatedDefaults);
    return { success: true, config: activeConfig, source: 'defaults' };
  }
  if (!response.ok) {
    return { success: false, errors: [`tpdd-config.json: HTTP ${response.status}`] };
  }
  let json: unknown;
  try {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > CONFIG_SAFETY_LIMITS.maxRuntimeConfigBytes) {
      await response.body?.cancel();
      return { success: false, errors: [`tpdd-config.json: ${CONFIG_SAFETY_LIMITS.maxRuntimeConfigBytes}バイトを超えています`] };
    }
    if (!response.body) return { success: false, errors: ['tpdd-config.json: 応答本文がありません'] };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > CONFIG_SAFETY_LIMITS.maxRuntimeConfigBytes) {
        await reader.cancel();
        return { success: false, errors: [`tpdd-config.json: ${CONFIG_SAFETY_LIMITS.maxRuntimeConfigBytes}バイトを超えています`] };
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    json = JSON.parse(new TextDecoder().decode(merged));
  } catch (error) {
    return { success: false, errors: [`tpdd-config.json: JSONを解析できません (${String(error)})`] };
  }
  const parsed = RuntimeConfigSchema.safeParse(json);
  if (!parsed.success) {
    return { success: false, errors: formatConfigIssues(parsed.error.issues) };
  }
  activeConfig = Object.freeze(parsed.data);
  return { success: true, config: activeConfig, source: 'runtime' };
}

export function setRuntimeConfigForTests(value: unknown): RuntimeConfig {
  activeConfig = Object.freeze(RuntimeConfigSchema.parse(value));
  return activeConfig;
}

export function resetRuntimeConfigForTests(): void {
  activeConfig = Object.freeze(validatedDefaults);
}
