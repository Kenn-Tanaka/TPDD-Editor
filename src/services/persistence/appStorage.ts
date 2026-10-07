export interface AppSettings {
  gatewayUrl: string;
  gatewayAuthEnabled: boolean;
  favoriteModelIds: string[];
}

const STORAGE_KEY = 'tpdd_editor_settings';
export const DEFAULT_GATEWAY_URL = getRuntimeConfig().defaultGatewayUrl;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  gatewayUrl: DEFAULT_GATEWAY_URL,
  gatewayAuthEnabled: false,
  favoriteModelIds: ['lmstudio/default'],
};

/**
 * 仕様書 8.2: loopback URLの厳格な検証
 * localhost, 127.0.0.1, [::1] のhttp URLのみ許可し、userinfo, query, fragmentを拒否
 */
export function isValidLoopbackUrl(urlStr: string): { valid: boolean; message?: string } {
  if (isLoopbackGatewayUrl(urlStr)) return { valid: true };
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, message: 'プロトコルはhttpまたはhttpsである必要があります' };
    }
    if (url.username || url.password) {
      return { valid: false, message: 'URLにユーザー情報（認証情報）を含めることはできません' };
    }
    if (url.search) {
      return { valid: false, message: 'URLにクエリパラメータを含めることはできません' };
    }
    if (url.hash) {
      return { valid: false, message: 'URLにフラグメントを含めることはできません' };
    }

    const host = url.hostname.toLowerCase();
    const isLoopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]';

    if (!isLoopback) {
      return { valid: false, message: '初版ではローカル loopback アドレス (127.0.0.1, localhost, ::1) のみ許可されています' };
    }

    return { valid: true };
  } catch {
    return { valid: false, message: 'URLの形式が正しくありません' };
  }
}

/**
 * 端末設定の読み込み
 */
export function loadAppSettings(): AppSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_APP_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('保存済み設定はオブジェクトではありません');
    const value = parsed as Record<string, unknown>;
    const gatewayUrl = value.gatewayUrl;
    if (typeof gatewayUrl !== 'string') throw new Error('gatewayUrl は文字列である必要があります');
    const urlValidation = isValidLoopbackUrl(gatewayUrl);
    if (!urlValidation.valid) throw new Error(`gatewayUrl: ${urlValidation.message}`);
    if (typeof value.gatewayAuthEnabled !== 'boolean') throw new Error('gatewayAuthEnabled は真偽値である必要があります');
    if (!Array.isArray(value.favoriteModelIds) || value.favoriteModelIds.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new Error('favoriteModelIds は空でない文字列の配列である必要があります');
    }
    return { gatewayUrl, gatewayAuthEnabled: value.gatewayAuthEnabled, favoriteModelIds: value.favoriteModelIds as string[] };
  } catch (error) {
    throw new Error(`保存済み端末設定 (${STORAGE_KEY}) が不正です: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 端末設定の保存 (Gateway Tokenは絶対に含めない)
 */
export function saveAppSettings(settings: Partial<AppSettings>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = loadAppSettings();
    const next: AppSettings = {
      ...current,
      ...settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('設定の保存に失敗しました:', e);
  }
}
import { getRuntimeConfig, isLoopbackGatewayUrl } from '../../config/runtimeConfig';
