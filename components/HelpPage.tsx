
import React from 'react';
import { X, Activity, Wand2, Database, Globe, Binary, PieChart, Cpu, Terminal, GitMerge, BookMarked, ArrowRightLeft, Zap, Play, Sparkles, Network, Search } from 'lucide-react';

interface HelpPageProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpPage: React.FC<HelpPageProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-martian-bg border border-martian-border rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-martian-border bg-martian-surface/50">
           <div>
             <h2 className="text-2xl font-bold text-martian-text flex items-center gap-3">
               <div className="w-8 h-8 rounded bg-gradient-to-br from-omop-cyan to-omop-indigo flex items-center justify-center">
                 <Database className="text-white w-5 h-5" />
               </div>
               Gemini Snowflake Architect
             </h2>
             <p className="text-martian-muted mt-1 text-sm">Feature Reference Guide</p>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-martian-subtle rounded-full transition-colors text-martian-muted hover:text-white">
             <X className="w-6 h-6" />
           </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* 1. AI SQL Architect */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-martian-primary">
                        <Wand2 className="w-6 h-6" />
                        <h3 className="text-lg font-bold">AI SQL Architect (Builder)</h3>
                    </div>
                    <div className="bg-martian-surface border border-martian-border rounded-lg p-5 space-y-3">
                        <div className="flex gap-3">
                            <Terminal className="w-5 h-5 text-omop-cyan shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">NL to Snowflake SQL</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Converts plain English to dialect-specific Snowflake SQL. Use <strong>Auto-Build</strong> to generate schemas, mock data, and run queries in one click.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Binary className="w-5 h-5 text-omop-magenta shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Self-Healing Execution</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    If a query fails, the agent automatically analyzes the error, generates a fix, and retries up to 10 times until successful.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Optimizer */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-omop-cyan">
                        <Zap className="w-6 h-6" />
                        <h3 className="text-lg font-bold">Query Optimizer</h3>
                    </div>
                    <div className="bg-martian-surface border border-martian-border rounded-lg p-5 space-y-3">
                        <div className="flex gap-3">
                            <GitMerge className="w-5 h-5 text-omop-indigo shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Plan Visualization</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Visualize query execution plans in the Results pane. Features hierarchical tree rendering and cost highlighting to identify bottlenecks.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Activity className="w-5 h-5 text-omop-amber shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Performance Analysis</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Analyzes query plans for pruning and clustering optimizations, providing actionable insights.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Converter */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-omop-magenta">
                        <ArrowRightLeft className="w-6 h-6" />
                        <h3 className="text-lg font-bold">SQL Converter</h3>
                    </div>
                    <div className="bg-martian-surface border border-martian-border rounded-lg p-5 space-y-3">
                        <div className="flex gap-3">
                            <Database className="w-5 h-5 text-omop-slate shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Dialect Transpilation</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Convert between SQL dialects (T-SQL, PostgreSQL, BigQuery, Snowflake) using Pyodide and SQLGlot.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Connectivity & UI */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-omop-emerald">
                        <Globe className="w-6 h-6" />
                        <h3 className="text-lg font-bold">Connectivity & UI</h3>
                    </div>
                    <div className="bg-martian-surface border border-martian-border rounded-lg p-5 space-y-3">
                        <div className="flex gap-3">
                            <BookMarked className="w-5 h-5 text-omop-magenta shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Collapsible Snippets</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Save and load SQL snippets directly from the sidebar. The section is collapsible to maximize workspace.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Database className="w-5 h-5 text-omop-emerald shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Supabase Dynamic Mounting</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Mount live Supabase tables in-memory using browser-side "client-as-a-server" models. Run high-performance analytcial scans, aggregate multiple tables, or combine with local Parquet datasets.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <PieChart className="w-5 h-5 text-omop-magenta shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Interactive Charts</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Instant visualization (Bar, Line, Area, Scatter). Export results to Parquet.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Control Panel */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-omop-amber">
                        <Terminal className="w-6 h-6" />
                        <h3 className="text-lg font-bold">Control Panel</h3>
                    </div>
                    <div className="bg-martian-surface border border-martian-border rounded-lg p-5 space-y-3">
                        <div className="flex gap-3">
                            <Sparkles className="w-5 h-5 text-omop-magenta shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">AI Prompt</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Send natural language instructions to the AI Architect.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Network className="w-5 h-5 text-omop-cyan shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Context</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Manage schema context for the AI.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Play className="w-5 h-5 text-omop-emerald shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Execute</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Run the current SQL query.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Search className="w-5 h-5 text-omop-indigo shrink-0" />
                            <div>
                                <h4 className="font-bold text-sm text-martian-text">Action Buttons</h4>
                                <p className="text-xs text-martian-muted leading-relaxed">
                                    Generate SQL, Mock Data, ML Prep, Hybrid Search, or trigger the Auto-Architect.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-martian-border bg-martian-surface/30 text-center">
            <p className="text-xs text-martian-muted">Powered by Gemini 2.5 • DuckDB WASM • React 19 • Tailwind v4</p>
        </div>

      </div>
    </div>
  );
};
