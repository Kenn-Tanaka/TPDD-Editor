import React from 'react';
import ReactDOM from 'react-dom/client';
import { loadRuntimeConfig } from '../config/runtimeConfig';
import '../index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function bootstrap(): Promise<void> {
  const loaded = await loadRuntimeConfig();
  if (!loaded.success) {
    root.render(
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <section className="mx-auto max-w-3xl rounded-lg border border-red-300 bg-white p-6 shadow">
          <h1 className="text-xl font-bold text-red-700">運用設定を読み込めません</h1>
          <p className="mt-3 text-sm">配布フォルダーの <code>tpdd-config.json</code> を修正してから再読込してください。不正値は使用されていません。</p>
          <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-red-800">
            {loaded.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </section>
      </main>,
    );
    return;
  }

  try {
    const { loadAppSettings } = await import('../services/persistence/appStorage');
    loadAppSettings();
  } catch (error) {
    root.render(
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <section className="mx-auto max-w-3xl rounded-lg border border-red-300 bg-white p-6 shadow">
          <h1 className="text-xl font-bold text-red-700">保存済み設定を読み込めません</h1>
          <p className="mt-3 text-sm">ブラウザのサイトデータにある <code>tpdd_editor_settings</code> を修正または削除してから再読込してください。不正値は使用されていません。</p>
          <p className="mt-4 text-sm text-red-800">{error instanceof Error ? error.message : String(error)}</p>
        </section>
      </main>,
    );
    return;
  }

  // 設定検証完了後にドメインスキーマとアプリ本体を初期化する。
  const [{ AppProvider }, { AiExecutionProvider }, { AppContent }] = await Promise.all([
    import('./AppContext'),
    import('./AiExecutionContext'),
    import('./App'),
  ]);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <AiExecutionProvider>
          <AppContent />
        </AiExecutionProvider>
      </AppProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
