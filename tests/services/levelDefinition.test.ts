import { describe, expect, it } from 'vitest';
import { createNewProject } from '../../src/domain/commands';
import { ProjectSchema } from '../../src/domain/schema';
import { validateLevelDefinitionProposal } from '../../src/services/llm/aiSchemas';
import { buildLevelDefinitionMessages } from '../../src/services/llm/levelDefinitionPrompt';

describe('列定義とAI提案', () => {
  it('従来形式の列定義も読み込める', () => {
    const project = createNewProject();
    project.levels = [{ id: 'legacy', label: '旧形式', order: 0 }];
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('プロジェクト文脈と既存列をorder順でプロンプトへ含める', () => {
    const project = createNewProject('設備設計');
    project.description = '保守可能な設備を設計する';
    project.levels = [
      { id: 'b', label: '下位', order: 1, description: '詳細' },
      { id: 'a', label: '上位', order: 0, includes: ['目的'] },
    ];
    const messages = buildLevelDefinitionMessages({ project, proposedLabel: '運用' });
    const user = messages[1].content;
    expect(user).toContain('設備設計');
    expect(user).toContain('保守可能な設備を設計する');
    expect(user).toContain('新規列名: 運用');
    expect(user.indexOf('"id": "a"')).toBeLessThan(user.indexOf('"id": "b"'));
  });

  it('提案を正規化し、包含・除外の矛盾を拒否する', () => {
    const base = { format: 'tpdd-ai-level-definition', schemaVersion: 1, task: 'define-level', description: '運用活動', includes: ['監視', '監視'], excludes: ['開発'], assumptions: [] };
    const valid = validateLevelDefinitionProposal(base);
    expect(valid.valid).toBe(true);
    expect(valid.data?.includes).toEqual(['監視']);
    const invalid = validateLevelDefinitionProposal({ ...base, excludes: ['監視'] });
    expect(invalid.valid).toBe(false);
  });
});
