import React, { useState, useEffect } from 'react';
import {
  X, FlaskConical, Play, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Loader2, Plus, RotateCcw,
} from 'lucide-react';
import { EvalCase, EvalRun, EvalAssertion, AssertionType } from '../types';

interface EvalManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunEval: (ev: EvalCase) => Promise<EvalRun>;
}

const EVAL_STORAGE = 'arcsql_evals';
const RUN_STORAGE  = 'arcsql_eval_runs';

const ASSERTION_LABELS: Record<AssertionType, string> = {
  no_error:         'Runs without error',
  returns_rows:     'Returns at least 1 row',
  row_count_equals: 'Returns exactly N rows',
  row_count_gte:    'Returns at least N rows',
  has_column:       'Result has column',
  sql_contains:     'Generated SQL contains',
  sql_not_contains: 'Generated SQL does not contain',
};

const defaultAssertions = (): EvalAssertion[] => [
  { type: 'no_error', label: 'Runs without error' },
];

export const EvalManager: React.FC<EvalManagerProps> = ({ isOpen, onClose, onRunEval }) => {
  const [evals,    setEvals]    = useState<EvalCase[]>([]);
  const [runs,     setRuns]     = useState<Record<string, EvalRun>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running,  setRunning]  = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);

  // New eval form
  const [name,       setName]       = useState('');
  const [prompt,     setPrompt]     = useState('');
  const [assertions, setAssertions] = useState<EvalAssertion[]>(defaultAssertions());
  const [showForm,   setShowForm]   = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    try { setEvals(JSON.parse(localStorage.getItem(EVAL_STORAGE) || '[]')); } catch { setEvals([]); }
    try { setRuns(JSON.parse(localStorage.getItem(RUN_STORAGE)   || '{}')); } catch { setRuns({}); }
  }, [isOpen]);

  const saveEvals = (next: EvalCase[]) => {
    setEvals(next);
    localStorage.setItem(EVAL_STORAGE, JSON.stringify(next));
  };

  const saveRuns = (next: Record<string, EvalRun>) => {
    setRuns(next);
    localStorage.setItem(RUN_STORAGE, JSON.stringify(next));
  };

  const addEval = () => {
    if (!name.trim() || !prompt.trim()) return;
    const ev: EvalCase = {
      id: crypto.randomUUID(),
      name: name.trim(),
      prompt: prompt.trim(),
      assertions,
      createdAt: new Date().toISOString(),
    };
    saveEvals([ev, ...evals]);
    setName(''); setPrompt(''); setAssertions(defaultAssertions()); setShowForm(false);
  };

  const deleteEval = (id: string) => {
    saveEvals(evals.filter(e => e.id !== id));
    const { [id]: _, ...rest } = runs;
    saveRuns(rest);
  };

  const executeEval = async (ev: EvalCase) => {
    setRunning(prev => new Set(prev).add(ev.id));
    try {
      const run = await onRunEval(ev);
      saveRuns({ ...runs, [ev.id]: run });
      setExpanded(prev => new Set(prev).add(ev.id));
    } finally {
      setRunning(prev => { const s = new Set(prev); s.delete(ev.id); return s; });
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    const nextRuns = { ...runs };
    for (const ev of evals) {
      setRunning(prev => new Set(prev).add(ev.id));
      try {
        const run = await onRunEval(ev);
        nextRuns[ev.id] = run;
        saveRuns(nextRuns);
      } finally {
        setRunning(prev => { const s = new Set(prev); s.delete(ev.id); return s; });
      }
    }
    setRunningAll(false);
  };

  const toggleAssertion = (type: AssertionType) => {
    const existing = assertions.find(a => a.type === type);
    if (existing) {
      if (type === 'no_error') return; // always required
      setAssertions(assertions.filter(a => a.type !== type));
    } else {
      setAssertions([...assertions, { type, label: ASSERTION_LABELS[type] }]);
    }
  };

  const setAssertionParam = (type: AssertionType, key: string, value: any) => {
    setAssertions(assertions.map(a =>
      a.type === type ? { ...a, params: { ...a.params, [key]: value } } : a
    ));
  };

  const passCount  = (Object.values(runs) as EvalRun[]).filter(r => r.passed).length;
  const totalRan   = Object.values(runs).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-martian-surface border border-martian-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-martian-border shrink-0">
          <div>
            <h2 className="text-xl font-bold text-martian-text flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-omop-emerald" />
              Eval Suite
            </h2>
            <p className="text-xs text-martian-muted mt-0.5">
              Define prompt → assertion tests. Run to verify AI produces correct, working SQL.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {totalRan > 0 && (
              <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${passCount === totalRan ? 'bg-omop-emerald/20 text-omop-emerald' : 'bg-red-500/20 text-red-400'}`}>
                {passCount}/{totalRan} passing
              </span>
            )}
            {evals.length > 0 && (
              <button
                onClick={runAll}
                disabled={runningAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-omop-emerald/10 hover:bg-omop-emerald/20 border border-omop-emerald/40 text-omop-emerald rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                {runningAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Run All
              </button>
            )}
            <button onClick={onClose} className="text-martian-muted hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Add eval button / form */}
          <div className="p-4 border-b border-martian-border/50">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-martian-border hover:border-omop-emerald/50 text-martian-muted hover:text-omop-emerald rounded-lg text-sm transition-all"
              >
                <Plus className="w-4 h-4" /> New Eval
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-martian-muted uppercase tracking-wider">New Eval</span>
                  <button onClick={() => setShowForm(false)} className="text-martian-muted hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Eval name (e.g. 'Customer revenue by region')"
                  className="w-full bg-martian-bg border border-martian-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-omop-emerald"
                />
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Prompt to send to Build mode (e.g. 'Show total spend per customer from the orders table')"
                  className="w-full bg-martian-bg border border-martian-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-omop-emerald resize-none h-16"
                />

                {/* Assertion builder */}
                <div>
                  <p className="text-[10px] font-bold text-martian-muted uppercase tracking-wider mb-2">Assertions</p>
                  <div className="space-y-1.5">
                    {(Object.keys(ASSERTION_LABELS) as AssertionType[]).map(type => {
                      const active = assertions.some(a => a.type === type);
                      const isRequired = type === 'no_error';
                      const assertion = assertions.find(a => a.type === type);
                      return (
                        <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${active ? 'bg-omop-emerald/10 border border-omop-emerald/30' : 'border border-martian-border/40 opacity-50'}`}>
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={isRequired}
                            onChange={() => toggleAssertion(type)}
                            className="accent-emerald-500 w-3.5 h-3.5 shrink-0"
                          />
                          <span className={active ? 'text-martian-text' : 'text-martian-muted'}>{ASSERTION_LABELS[type]}</span>
                          {active && type === 'row_count_equals' && (
                            <input type="number" min={0} defaultValue={assertion?.params?.count ?? 1}
                              onChange={e => setAssertionParam(type, 'count', parseInt(e.target.value))}
                              className="ml-auto w-16 bg-martian-bg border border-martian-border rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            />
                          )}
                          {active && type === 'row_count_gte' && (
                            <input type="number" min={1} defaultValue={assertion?.params?.min ?? 1}
                              onChange={e => setAssertionParam(type, 'min', parseInt(e.target.value))}
                              className="ml-auto w-16 bg-martian-bg border border-martian-border rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            />
                          )}
                          {active && (type === 'has_column' || type === 'sql_contains' || type === 'sql_not_contains') && (
                            <input type="text" placeholder={type === 'has_column' ? 'column_name' : 'keyword'}
                              defaultValue={assertion?.params?.value ?? ''}
                              onChange={e => setAssertionParam(type, 'value', e.target.value)}
                              className="ml-auto w-28 bg-martian-bg border border-martian-border rounded px-2 py-0.5 text-xs text-white focus:outline-none font-mono"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={addEval}
                  disabled={!name.trim() || !prompt.trim()}
                  className="w-full bg-omop-emerald hover:bg-omop-emerald/90 disabled:opacity-40 text-black font-bold py-2 rounded-lg text-sm transition-all"
                >
                  Save Eval
                </button>
              </div>
            )}
          </div>

          {/* Eval list */}
          <div className="p-4 space-y-2">
            {evals.length === 0 && !showForm && (
              <div className="text-center py-10 text-martian-muted opacity-50 text-sm">
                <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-50" />
                No evals yet. Add one to start verifying AI output quality.
              </div>
            )}
            {evals.map(ev => {
              const run = runs[ev.id];
              const isRunning = running.has(ev.id);
              const isExpanded = expanded.has(ev.id);
              return (
                <div key={ev.id} className="border border-martian-border/50 rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 bg-martian-bg/40 cursor-pointer hover:bg-martian-surface/50 transition-colors"
                    onClick={() => setExpanded(prev => { const s = new Set(prev); isExpanded ? s.delete(ev.id) : s.add(ev.id); return s; })}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-martian-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-martian-muted shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-martian-text truncate">{ev.name}</span>
                        {run && (
                          run.passed
                            ? <CheckCircle2 className="w-4 h-4 text-omop-emerald shrink-0" />
                            : <XCircle      className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-martian-muted truncate mt-0.5">{ev.prompt}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {run && (
                        <span className="text-[10px] font-mono text-martian-muted">
                          {run.assertions.filter(a => a.passed).length}/{run.assertions.length}
                        </span>
                      )}
                      <button
                        onClick={() => executeEval(ev)}
                        disabled={isRunning}
                        className="p-1.5 bg-omop-emerald/10 hover:bg-omop-emerald/20 border border-omop-emerald/30 text-omop-emerald rounded-lg transition-all disabled:opacity-50"
                        title="Run eval"
                      >
                        {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      </button>
                      <button
                        onClick={() => deleteEval(ev.id)}
                        className="p-1.5 text-martian-muted hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all"
                        title="Delete eval"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && run && (
                    <div className="border-t border-martian-border/30 bg-black/20 px-4 py-3 space-y-3">
                      {run.error && (
                        <p className="text-xs text-red-400 font-mono bg-red-900/20 px-3 py-2 rounded">{run.error}</p>
                      )}
                      <div className="space-y-1">
                        {run.assertions.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {a.passed
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-omop-emerald shrink-0" />
                              : <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                            <span className={a.passed ? 'text-martian-text/80' : 'text-red-300'}>{a.label}</span>
                            {a.actual != null && (
                              <span className="text-martian-muted font-mono text-[10px] ml-auto truncate max-w-[140px]">{String(a.actual)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {run.generatedSql && (
                        <details className="group">
                          <summary className="text-[10px] text-martian-muted cursor-pointer hover:text-white list-none flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                            Generated SQL · {run.executionTimeMs.toFixed(0)}ms
                          </summary>
                          <pre className="mt-2 text-[10px] font-mono text-martian-muted/80 bg-black/30 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                            {run.generatedSql.slice(0, 600)}{run.generatedSql.length > 600 ? '\n…' : ''}
                          </pre>
                        </details>
                      )}
                      <p className="text-[10px] text-martian-muted/50">
                        Last run {new Date(run.runAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
