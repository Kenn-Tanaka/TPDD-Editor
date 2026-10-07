import { afterEach, describe, expect, it } from 'vitest';
import defaults from '../../config/defaults.json';
import {
  countCharacters,
  loadRuntimeConfig,
  resetRuntimeConfigForTests,
  RuntimeConfigSchema,
} from '../../src/config/runtimeConfig';

describe('runtime configuration', () => {
  afterEach(() => resetRuntimeConfigForTests());

  it('既定値は厳格スキーマを満たし、絵文字を1コードポイントとして数える', () => {
    expect(RuntimeConfigSchema.parse(defaults).maxProjectFileBytes).toBe(10 * 1024 * 1024);
    expect(countCharacters('日本😀')).toBe(3);
  });

  it('配信JSONの変更を起動時に反映する', async () => {
    const changed = { ...defaults, descriptionMaxChars: 2345 };
    const result = await loadRuntimeConfig(async () => new Response(JSON.stringify(changed), { status: 200 })) as Awaited<ReturnType<typeof loadRuntimeConfig>>;
    expect(result.success).toBe(true);
    if (result.success) expect(result.config.descriptionMaxChars).toBe(2345);
  });

  it('配信上書きが存在しない場合は既定値で動作する', async () => {
    const result = await loadRuntimeConfig(async () => new Response('', { status: 404 })) as Awaited<ReturnType<typeof loadRuntimeConfig>>;
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source).toBe('defaults');
      expect(result.config.descriptionMaxChars).toBe(2000);
    }
  });

  it('未知項目と不正値を項目名付きで拒否する', async () => {
    const invalid = { ...defaults, aiTaskTimeoutMs: -1, unknownOption: true };
    const result = await loadRuntimeConfig(async () => new Response(JSON.stringify(invalid), { status: 200 })) as Awaited<ReturnType<typeof loadRuntimeConfig>>;
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join(' ')).toContain('aiTaskTimeoutMs');
      expect(result.errors.join(' ')).toContain('unknownOption');
    }
  });
});
