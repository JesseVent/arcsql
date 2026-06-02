import React, { useState } from 'react';
import { QueryResult } from '../types';
import { Download, Clock, AlertTriangle, Table as TableIcon, BarChart3, FileWarning, Terminal, GitMerge } from 'lucide-react';
import { ChartViewer } from './ChartViewer';

interface ResultsViewerProps {
  result: QueryResult | null;
}

type ViewMode = 'table' | 'chart' | 'plan';

export const ResultsViewer: React.FC<ResultsViewerProps> = ({ result }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Helper to format execution plan
  const renderPlan = (explanation: string) => {
    return (
        <div className="font-mono text-xs text-martian-text p-4 leading-normal">
            {explanation.split('\n').map((line, i) => {
                // Calculate indentation level
                const indent = line.search(/\S|$/);
                const paddingLeft = `${indent * 12}px`;
                
                // Highlighting heuristics
                let colorClass = 'text-martian-text';
                if (line.includes('SCAN')) colorClass = 'text-omop-cyan font-bold';
                else if (line.includes('JOIN')) colorClass = 'text-omop-magenta font-bold';
                else if (line.includes('FILTER')) colorClass = 'text-omop-amber';
                else if (line.includes('PROJECTION')) colorClass = 'text-omop-emerald';
                else if (line.includes('ORDER')) colorClass = 'text-blue-400';
                
                // Highlight costs/rows if standard DuckDB format "EC=..."
                const parts = line.split(/(\[EC=\d+\])/g);
                
                return (
                    <div key={i} className={`${colorClass} hover:bg-white/5 flex items-center`} style={{ paddingLeft }}>
                         {parts.map((part, j) => 
                            part.startsWith('[EC=') 
                                ? <span key={j} className="text-martian-muted font-normal opacity-70 ml-2 bg-martian-surface px-1 rounded">{part}</span> 
                                : part
                         )}
                    </div>
                );
            })}
        </div>
    );
  };

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-martian-muted select-none">
        <div className="w-16 h-16 rounded-2xl bg-martian-surface border border-martian-border flex items-center justify-center mb-4 shadow-lg shadow-black/20">
            <Terminal className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm font-medium text-martian-text/70">Ready to execute</p>
        <p className="text-xs text-martian-muted mt-1">Run a query to see results here.</p>
      </div>
    );
  }

  if (result.error) {
    // Extract line number if present (common in SQL errors)
    const lineMatch = result.error.match(/line\s+(\d+)/i);
    const lineNumber = lineMatch ? lineMatch[1] : null;

    // Categorize error
    let title = "Execution Error";
    let helpfulHint = "Check the query logic and syntax.";
    
    if (result.error.includes("Parser Error") || result.error.includes("syntax error")) {
        title = "Syntax Error";
        helpfulHint = "There is a typo or invalid SQL keyword in your query.";
    } else if (result.error.includes("Catalog Error") || result.error.includes("does not exist")) {
        title = "Object Not Found";
        helpfulHint = "A table or column referenced does not exist. Check your spelling or schema.";
    } else if (result.error.includes("Binder Error")) {
        title = "Type or Binding Error";
        helpfulHint = "Column types might be incompatible, or ambiguous column names.";
    }

    return (
      <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-status-error/10 border border-status-error/20 text-status-error mb-4 shadow-[0_0_20px_rgba(255,100,103,0.15)]">
            <FileWarning className="w-6 h-6" />
        </div>

        <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-status-error/90">{title}</h3>
            {lineNumber && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded text-xs font-mono bg-status-error/10 border border-status-error/20 text-status-error/80">
                    <span className="opacity-50">LOCATION:</span>
                    <span className="font-bold">LINE {lineNumber}</span>
                </div>
            )}
        </div>

        <div className="w-full max-w-2xl bg-black/40 border border-status-error/20 rounded-lg overflow-hidden backdrop-blur-sm">
            <div className="bg-status-error/10 px-4 py-2 border-b border-status-error/10 flex items-center gap-2">
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-status-error/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-status-warning/20"></div>
                </div>
                <span className="text-[10px] uppercase font-bold text-status-error/50 tracking-wider">Error Output</span>
            </div>
            <div className="p-4 overflow-auto max-h-[200px]">
                <pre className="font-mono text-sm text-status-error/80 break-words whitespace-pre-wrap leading-relaxed">
                    {result.error}
                </pre>
            </div>
        </div>

        <p className="mt-6 text-xs text-martian-muted text-center max-w-md leading-relaxed border-t border-martian-border/50 pt-4">
            <span className="text-omop-amber">Tip:</span> {helpfulHint}
        </p>
      </div>
    );
  }

  // Force PLAN view if explanation exists and rows are empty (Plan-only run)
  const effectiveViewMode = (result.explanation && result.rows.length === 0) ? 'plan' : viewMode;

  return (
    <div className="h-full flex flex-col">
      {/* Meta Bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          {/* View Toggles */}
          <div className="flex bg-martian-surface border border-martian-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                effectiveViewMode === 'table' 
                  ? 'bg-martian-primary text-white shadow-sm' 
                  : 'text-martian-muted hover:text-martian-text hover:bg-martian-bg'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Table
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                effectiveViewMode === 'chart' 
                  ? 'bg-omop-magenta text-white shadow-sm' 
                  : 'text-martian-muted hover:text-martian-text hover:bg-martian-bg'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Chart
            </button>
            <button
              onClick={() => setViewMode('plan')}
              disabled={!result.explanation}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                effectiveViewMode === 'plan' 
                  ? 'bg-omop-amber text-white shadow-sm' 
                  : !result.explanation 
                     ? 'text-martian-border cursor-not-allowed'
                     : 'text-martian-muted hover:text-martian-text hover:bg-martian-bg'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              Plan
            </button>
          </div>
          
          <div className="h-4 w-px bg-martian-border mx-1"></div>

          <div className="flex items-center gap-2 text-xs text-martian-muted">
            <Clock className="w-3 h-3" />
            <span>{result.executionTime?.toFixed(2)}ms</span>
            <span className="w-1 h-1 rounded-full bg-martian-border"></span>
            <span>{result.rows.length} rows</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {effectiveViewMode === 'table' && (
          <div className="h-full overflow-auto border border-martian-border rounded-lg bg-martian-bg/50">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-martian-surface sticky top-0 z-10 shadow-sm">
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="p-3 font-medium text-martian-muted border-b border-martian-border">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-martian-border/50">
                {result.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-martian-surface/50 transition-colors">
                    {result.columns.map((col) => (
                      <td key={`${i}-${col}`} className="p-3 text-martian-text">
                        {row[col] === null ? <span className="text-martian-muted italic">null</span> : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {effectiveViewMode === 'chart' && (
             <ChartViewer data={result.rows} columns={result.columns} />
        )}

        {effectiveViewMode === 'plan' && result.explanation && (
             <div className="h-full overflow-auto border border-martian-border rounded-lg bg-black/40 shadow-inner">
                {renderPlan(result.explanation)}
             </div>
        )}
      </div>
    </div>
  );
};
