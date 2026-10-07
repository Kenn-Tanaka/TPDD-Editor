import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { generateId } from '../shared/id';

export type AiTaskKind = 'expand' | 'alternatives' | 'review' | 'define-level';

export interface ActiveAiExecution {
  executionId: string;
  task: AiTaskKind;
  label: string;
  owner: string;
  startedAt: string;
}

export class AiBusyError extends Error {
  constructor(public readonly activeExecution: ActiveAiExecution) {
    super(`「${activeExecution.label}」を実行中です。`);
    this.name = 'AiBusyError';
  }
}

interface AiExecutionContextValue {
  activeExecution: ActiveAiExecution | null;
  runExclusive<T>(request: Omit<ActiveAiExecution, 'executionId' | 'startedAt'>, operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
  cancel(executionId?: string): void;
}

const AiExecutionContext = createContext<AiExecutionContextValue | null>(null);

export const AiExecutionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeExecution, setActiveExecution] = useState<ActiveAiExecution | null>(null);
  const activeRef = useRef<ActiveAiExecution | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const runExclusive: AiExecutionContextValue['runExclusive'] = async (request, operation) => {
    if (activeRef.current) throw new AiBusyError(activeRef.current);
    const execution: ActiveAiExecution = { ...request, executionId: generateId(), startedAt: new Date().toISOString() };
    const controller = new AbortController();
    activeRef.current = execution;
    controllerRef.current = controller;
    setActiveExecution(execution);
    try {
      return await operation(controller.signal);
    } finally {
      if (activeRef.current?.executionId === execution.executionId) {
        activeRef.current = null;
        controllerRef.current = null;
        setActiveExecution(null);
      }
    }
  };

  const cancel = (executionId?: string) => {
    if (!executionId || activeRef.current?.executionId === executionId) controllerRef.current?.abort();
  };

  return <AiExecutionContext.Provider value={{ activeExecution, runExclusive, cancel }}>{children}</AiExecutionContext.Provider>;
};

export function useAiExecution(): AiExecutionContextValue {
  const value = useContext(AiExecutionContext);
  if (!value) throw new Error('useAiExecution must be used within an AiExecutionProvider');
  return value;
}
