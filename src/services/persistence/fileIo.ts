import { Project, ProjectSchema } from '../../domain/schema';
import { validateProject } from '../../domain/validation';
import { getRuntimeConfig } from '../../config/runtimeConfig';

/**
 * Windowsファイル名の禁止文字および予約語をサニタイズ
 */
export function sanitizeFilename(name: string, fallback = 'tpdd-project'): string {
  if (!name || name.trim().length === 0) {
    return fallback;
  }
  // Windows禁止文字 \ / : * ? " < > | および 制御文字 (0x00 - 0x1f)
  let clean = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();

  // 予約語 (CON, PRN, AUX, NUL, COM1-9, LPT1-9) チェック
  const reservedRegex = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reservedRegex.test(clean)) {
    clean = `${clean}_file`;
  }

  // 末尾のピリオドや空白を削除
  clean = clean.replace(/[. ]+$/, '');

  return clean.length > 0 ? clean : fallback;
}

/**
 * ProjectをJSONファイル (.tpdd.json) としてダウンロード保存
 */
export type PrepareProjectJsonResult =
  | { success: true; json: string; byteLength: number }
  | { success: false; errorMessage: string; validationErrors?: { path: string; message: string }[] };

/** 検査する文字列とダウンロードする文字列を同一にする。 */
export function prepareProjectJson(project: Project): PrepareProjectJsonResult {
  const validation = validateProject(project);
  if (!validation.valid) {
    return {
      success: false,
      errorMessage: 'プロジェクトのスキーマまたは整合性検証に失敗しました',
      validationErrors: validation.errors,
    };
  }
  const json = JSON.stringify(project, null, 2);
  const byteLength = new TextEncoder().encode(json).byteLength;
  const maximum = getRuntimeConfig().maxProjectFileBytes;
  if (byteLength > maximum) {
    return {
      success: false,
      errorMessage: `出力JSONのUTF-8サイズ (${byteLength.toLocaleString()}バイト) が上限${maximum.toLocaleString()}バイトを超えています`,
    };
  }
  return { success: true, json, byteLength };
}

export function saveProjectToFile(project: Project): PrepareProjectJsonResult {
  const prepared = prepareProjectJson(project);
  if (!prepared.success) return prepared;

  const blob = new Blob([prepared.json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.title)}.tpdd.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return prepared;
}

export interface LoadProjectResult {
  success: boolean;
  project?: Project;
  errorMessage?: string;
  validationErrors?: { path: string; message: string }[];
}

/**
 * ファイルからJSON文字列を読み込んでProjectとして検証・パース
 */
export async function parseAndValidateProjectJson(file: File): Promise<LoadProjectResult> {
  const maximum = getRuntimeConfig().maxProjectFileBytes;
  if (file.size > maximum) {
    return {
      success: false,
      errorMessage: `ファイルサイズ (${file.size.toLocaleString()}バイト) が上限${maximum.toLocaleString()}バイトを超えています`,
    };
  }

  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        success: false,
        errorMessage: 'JSON形式が正しくありません',
      };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return {
        success: false,
        errorMessage: '対応するデータ形式ではありません（オブジェクトではありません）',
      };
    }

    const schemaResult = ProjectSchema.safeParse(parsed);
    if (!schemaResult.success) {
      return {
        success: false,
        errorMessage: 'データのスキーマ検証に失敗しました',
        validationErrors: schemaResult.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      };
    }
    const validation = validateProject(schemaResult.data);
    if (!validation.valid) {
      return {
        success: false,
        errorMessage: 'データのスキーマまたは整合性検証に失敗しました',
        validationErrors: validation.errors,
      };
    }

    return {
      success: true,
      project: schemaResult.data,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: `ファイル読み込み中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
