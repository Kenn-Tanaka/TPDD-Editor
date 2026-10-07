import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, X, AlertTriangle, Sparkles, Square } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { AiBusyError, useAiExecution } from '../../app/AiExecutionContext';
import { LevelDefinition } from '../../domain/schema';
import { gatewayClient } from '../../services/llm/gatewayClient';
import { buildLevelDefinitionMessages } from '../../services/llm/levelDefinitionPrompt';
import { extractAndParseAiJson, validateLevelDefinitionProposal } from '../../services/llm/aiSchemas';
import { loadAppSettings } from '../../services/persistence/appStorage';

interface LevelsModalProps { isOpen: boolean; onClose: () => void; }
const splitItems = (text: string) => [...new Set(text.split(/\r?\n/).map((item) => item.trim().slice(0, 300)).filter(Boolean))].slice(0, 10);
const joinItems = (items?: string[]) => (items ?? []).join('\n');

const LevelDetailsEditor: React.FC<{ level: LevelDefinition; onSave: (patch: Partial<LevelDefinition>) => void }> = ({ level, onSave }) => {
  const [description, setDescription] = useState(level.description ?? '');
  const [includes, setIncludes] = useState(joinItems(level.includes));
  const [excludes, setExcludes] = useState(joinItems(level.excludes));
  useEffect(() => { setDescription(level.description ?? ''); setIncludes(joinItems(level.includes)); setExcludes(joinItems(level.excludes)); }, [level]);
  const save = () => onSave({ description: description.trim() || undefined, includes: splitItems(includes), excludes: splitItems(excludes) });
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-slate-500">説明・配置基準</summary>
    <div className="mt-2 grid gap-2">
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} maxLength={1000} rows={2} placeholder="列の意味や配置基準" className="w-full p-2 border border-slate-300 rounded" />
      <div className="grid grid-cols-2 gap-2">
        <textarea value={includes} onChange={(e) => setIncludes(e.target.value)} onBlur={save} rows={3} placeholder="含める内容（1行1項目）" className="w-full p-2 border border-slate-300 rounded" />
        <textarea value={excludes} onChange={(e) => setExcludes(e.target.value)} onBlur={save} rows={3} placeholder="含めない内容（1行1項目）" className="w-full p-2 border border-slate-300 rounded" />
      </div>
    </div>
  </details>;
};

export const LevelsModal: React.FC<LevelsModalProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useApp();
  const project = state.history.present;
  const { levels } = project;
  const { activeExecution, runExclusive, cancel } = useAiExecution();
  const [newLevelName, setNewLevelName] = useState('');
  const [description, setDescription] = useState('');
  const [includes, setIncludes] = useState('');
  const [excludes, setExcludes] = useState('');
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [deletingLevelId, setDeletingLevelId] = useState<string | null>(null);
  const [targetLevelId, setTargetLevelId] = useState('');
  const latestRevision = useRef(state.history.revision);
  const latestName = useRef(newLevelName);
  latestRevision.current = state.history.revision;
  latestName.current = newLevelName;

  const handleClose = () => {
    if (activeExecution?.owner === 'levels-modal') cancel(activeExecution.executionId);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!isOpen) return null;
  const sortedLevels = [...levels].sort((a, b) => a.order - b.order);
  const isDefining = activeExecution?.owner === 'levels-modal';
  const aiBusy = activeExecution !== null;

  const handleAdd = () => {
    const label = newLevelName.trim();
    if (!label || levels.length >= 12) return;
    if (levels.some((level) => level.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) { setProposalError('同じ名前の列が既に存在します。'); return; }
    const includedItems = splitItems(includes);
    const excludedItems = splitItems(excludes);
    const includedSet = new Set(includedItems.map((item) => item.toLocaleLowerCase()));
    const contradiction = excludedItems.find((item) => includedSet.has(item.toLocaleLowerCase()));
    if (contradiction) { setProposalError(`「${contradiction}」が含める内容と含めない内容の両方にあります。`); return; }
    dispatch({ type: 'ADD_LEVEL', params: { label, description, includes: includedItems, excludes: excludedItems } });
    setNewLevelName(''); setDescription(''); setIncludes(''); setExcludes(''); setAssumptions([]); setProposalError(null);
  };

  const handleSuggest = async () => {
    const label = newLevelName.trim();
    if (!label) { setProposalError('先に新規列名を入力してください。'); return; }
    const revision = state.history.revision;
    setProposalError(null); setAssumptions([]);
    const settings = loadAppSettings();
    try {
      const response = await runExclusive(
        { task: 'define-level', label: `列「${label}」の配置基準生成`, owner: 'levels-modal' },
        (signal) => gatewayClient.complete({ apiBaseUrl: settings.gatewayUrl, authEnabled: settings.gatewayAuthEnabled, token: state.ui.gatewayToken }, {
          modelId: project.aiPreferences.modelId,
          messages: buildLevelDefinitionMessages({ project, proposedLabel: label }),
          temperature: project.aiPreferences.temperature,
          timeoutSeconds: project.aiPreferences.timeoutSeconds,
          stream: project.aiPreferences.stream,
          signal,
        })
      );
      if (latestRevision.current !== revision || latestName.current.trim() !== label) throw new Error('生成中にプロジェクトまたは列名が変更されました。再度提案してください。');
      const validated = validateLevelDefinitionProposal(extractAndParseAiJson(response.content));
      if (!validated.valid || !validated.data) throw new Error(validated.error ?? '列定義の検証に失敗しました。');
      setDescription(validated.data.description); setIncludes(joinItems(validated.data.includes)); setExcludes(joinItems(validated.data.excludes)); setAssumptions(validated.data.assumptions);
    } catch (error) {
      if (error instanceof AiBusyError) setProposalError(error.message);
      else if (error instanceof DOMException && error.name === 'AbortError') setProposalError('提案生成をキャンセルしました。');
      else setProposalError(error instanceof Error ? error.message : String(error));
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const otherIndex = index + delta;
    if (otherIndex < 0 || otherIndex >= sortedLevels.length) return;
    const current = sortedLevels[index], other = sortedLevels[otherIndex];
    dispatch({ type: 'UPDATE_LEVEL', levelId: current.id, patch: { order: other.order } });
    dispatch({ type: 'UPDATE_LEVEL', levelId: other.id, patch: { order: current.order } });
  };
  const startDelete = (levelId: string) => { if (levels.length <= 1) return; setDeletingLevelId(levelId); setTargetLevelId(levels.find((level) => level.id !== levelId)?.id ?? ''); };
  const confirmDelete = () => { if (!deletingLevelId || !targetLevelId) return; dispatch({ type: 'REMOVE_LEVEL', levelIdToRemove: deletingLevelId, targetLevelId }); setDeletingLevelId(null); };
  const deletingLevel = levels.find((level) => level.id === deletingLevelId);

  return createPortal(
    <div onMouseDown={(event) => { if (event.target === event.currentTarget) handleClose(); }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div><h2 className="text-sm font-bold text-slate-800">抽象度列の管理</h2><p className="text-xs text-slate-500">列名・配置基準・並び順の変更、列の追加・削除（1〜12列）</p></div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="space-y-2">
            {sortedLevels.map((level, index) => <div key={level.id} className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400 w-5 text-center">{index + 1}</span>
                <input value={level.label} onChange={(e) => dispatch({ type: 'UPDATE_LEVEL', levelId: level.id, patch: { label: e.target.value } })} className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white" />
                <button disabled={index === 0} onClick={() => move(index, -1)} className="p-1 text-slate-500 disabled:text-slate-300" title="上へ移動"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button disabled={index === sortedLevels.length - 1} onClick={() => move(index, 1)} className="p-1 text-slate-500 disabled:text-slate-300" title="下へ移動"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button disabled={levels.length <= 1} onClick={() => startDelete(level.id)} className="p-1 text-slate-400 hover:text-red-600 disabled:text-slate-200" title="列を削除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <LevelDetailsEditor level={level} onSave={(patch) => dispatch({ type: 'UPDATE_LEVEL', levelId: level.id, patch })} />
            </div>)}
          </div>
          {levels.length < 12 && <section className="pt-3 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-bold text-slate-700">新しい列</h3>
            <input value={newLevelName} onChange={(e) => setNewLevelName(e.target.value)} maxLength={200} placeholder="新規列名（例: 運用、施策など）" className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded" />
            <div className="flex items-center gap-2">
              {isDefining ? <button onClick={() => cancel(activeExecution?.executionId)} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center gap-1"><Square className="w-3 h-3" />取消</button>
                : <button onClick={handleSuggest} disabled={aiBusy || !newLevelName.trim()} className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded text-xs flex items-center gap-1 disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" />AIで配置基準を提案</button>}
              {activeExecution && !isDefining && <span className="text-[11px] text-amber-700">{activeExecution.label}を実行中です。</span>}
            </div>
            {proposalError && <p className="text-xs text-red-600">{proposalError}</p>}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="説明文：この列が表す概念や配置基準" className="w-full p-2 text-xs border border-slate-300 rounded" />
            <div className="grid grid-cols-2 gap-3">
              <textarea value={includes} onChange={(e) => setIncludes(e.target.value)} rows={4} placeholder="含める内容（1行1項目、最大10件）" className="w-full p-2 text-xs border border-slate-300 rounded" />
              <textarea value={excludes} onChange={(e) => setExcludes(e.target.value)} rows={4} placeholder="含めない内容（1行1項目、最大10件）" className="w-full p-2 text-xs border border-slate-300 rounded" />
            </div>
            {assumptions.length > 0 && <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded"><strong>AIが置いた前提:</strong><ul className="list-disc ml-4">{assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            <div className="flex justify-end"><button onClick={handleAdd} disabled={!newLevelName.trim() || isDefining} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium flex items-center gap-1 disabled:opacity-50"><Plus className="w-3.5 h-3.5" />内容を確認して列を追加</button></div>
          </section>}
          {deletingLevelId && <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2.5">
            <div className="flex items-center gap-1.5 text-red-700 text-xs font-bold"><AlertTriangle className="w-4 h-4" />列「{deletingLevel?.label}」の削除確認</div>
            <select value={targetLevelId} onChange={(e) => setTargetLevelId(e.target.value)} className="w-full p-1.5 text-xs border border-red-300 rounded bg-white">{levels.filter((level) => level.id !== deletingLevelId).map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select>
            <div className="flex justify-end gap-2"><button onClick={() => setDeletingLevelId(null)} className="px-2.5 py-1 border rounded text-xs">キャンセル</button><button onClick={confirmDelete} className="px-2.5 py-1 bg-red-600 text-white rounded text-xs">ノードを移動して削除</button></div>
          </div>}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end"><button onClick={handleClose} className="px-4 py-1.5 bg-slate-200 rounded text-xs">閉じる</button></div>
      </div>
    </div>, document.body
  );
};
