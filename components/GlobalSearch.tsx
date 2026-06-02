import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Table, 
  Globe, 
  Code, 
  Database, 
  X, 
  ChevronRight, 
  Loader2, 
  ArrowRight, 
  FileText, 
  LayoutTemplate
} from 'lucide-react';
import { DataSource } from '../types';
import { runQuery } from '../services/duckDbService';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  tables: string[];
  dataSources: DataSource[];
  onSelectTable: (table: string) => void;
  onLoadSql: (sql: string) => void;
}

interface SearchResult {
  id: string;
  type: 'TABLE' | 'SOURCE' | 'SNIPPET' | 'COLUMN' | 'DATA';
  title: string;
  subtitle?: string;
  action?: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ 
  isOpen, 
  onClose, 
  tables, 
  dataSources,
  onSelectTable,
  onLoadSql
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [snippets, setSnippets] = useState<any[]>([]);
  const [isSearchingData, setIsSearchingData] = useState(false);
  const [dataResults, setDataResults] = useState<SearchResult[]>([]);

  // Load snippets on open
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('context7_snippets');
      if (saved) {
        try {
            setSnippets(JSON.parse(saved));
        } catch(e) {
            setSnippets([]);
        }
      }
      // Focus input
      setTimeout(() => document.getElementById('global-search-input')?.focus(), 50);
    }
  }, [isOpen]);

  // Handle local metadata search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const lowerQ = query.toLowerCase();
    const hits: SearchResult[] = [];

    // 1. Tables
    tables.forEach(t => {
      if (t.toLowerCase().includes(lowerQ)) {
        hits.push({
          id: `tbl-${t}`,
          type: 'TABLE',
          title: t,
          subtitle: 'Database Table',
          action: () => {
             onLoadSql(`SELECT * FROM ${t} LIMIT 100;`);
             onSelectTable(t);
             onClose();
          }
        });
      }
    });

    // 2. Sources
    dataSources.forEach(ds => {
      if (ds.name.toLowerCase().includes(lowerQ) || ds.url.toLowerCase().includes(lowerQ)) {
        hits.push({
          id: `src-${ds.name}`,
          type: 'SOURCE',
          title: ds.name,
          subtitle: `Remote Source (${ds.type})`,
          action: () => {
             onLoadSql(`SELECT * FROM ${ds.name} LIMIT 100;`);
             onClose();
          }
        });
      }
    });

    // 3. Snippets
    snippets.forEach(s => {
      if (s.name.toLowerCase().includes(lowerQ) || s.sql.toLowerCase().includes(lowerQ)) {
        hits.push({
          id: `snip-${s.id}`,
          type: 'SNIPPET',
          title: s.name,
          subtitle: 'Saved Query',
          action: () => {
             onLoadSql(s.sql);
             onClose();
          }
        });
      }
    });

    setResults(hits);
  }, [query, tables, dataSources, snippets, onClose, onLoadSql, onSelectTable]);

  // Deep Data Search Logic
  const handleDeepSearch = async () => {
    if (!query.trim()) return;
    setIsSearchingData(true);
    setDataResults([]);

    try {
        const hits: SearchResult[] = [];
        
        // Search across all tables for text columns containing the query
        // Limit to 5 tables for performance safety
        const targetTables = tables.slice(0, 5);

        for (const table of targetTables) {
            // Get text columns
            const schema = await runQuery(`PRAGMA table_info('${table}')`);
            if (schema.error) continue;
            
            const textCols = schema.rows
                .filter((r: any) => r.type.includes('VARCHAR') || r.type.includes('TEXT'))
                .map((r: any) => r.name);

            if (textCols.length === 0) continue;

            // Escape SQL special characters: single quotes for SQL, % and _ for ILIKE wildcards
            const escapedQuery = query.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
            const whereClause = textCols.map(c => `${c} ILIKE '%${escapedQuery}%' ESCAPE '\\'`).join(' OR ');
            const sql = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 3`;
            
            const res = await runQuery(sql);
            if (!res.error && res.rows.length > 0) {
                 res.rows.forEach((row: any, idx: number) => {
                     // Find which column matched to show in subtitle
                     const matchCol = textCols.find(c => String(row[c]).toLowerCase().includes(query.toLowerCase()));
                     const preview = matchCol ? String(row[matchCol]).substring(0, 50) : 'Match found';

                     hits.push({
                         id: `data-${table}-${idx}`,
                         type: 'DATA',
                         title: `${table}`,
                         subtitle: `Match in ${matchCol}: "${preview}..."`,
                         action: () => {
                             onLoadSql(`SELECT * FROM ${table} WHERE ${whereClause}`);
                             onClose();
                         }
                     });
                 });
            }
        }
        
        setDataResults(hits);

    } catch (e) {
        console.error("Deep search failed", e);
    } finally {
        setIsSearchingData(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-2xl bg-martian-bg border border-martian-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[70vh]">
        
        {/* Input */}
        <div className="flex items-center gap-3 p-4 border-b border-martian-border bg-martian-surface/50">
          <Search className="w-5 h-5 text-martian-primary" />
          <input 
            id="global-search-input"
            type="text"
            className="flex-1 bg-transparent text-lg text-white placeholder-martian-muted focus:outline-none"
            placeholder="Search tables, snippets, or data..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') handleDeepSearch();
                if (e.key === 'Escape') onClose();
            }}
            autoComplete="off"
          />
          <div className="flex items-center gap-2">
             <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-martian-border bg-martian-bg text-[10px] text-martian-muted font-mono">
                ESC
             </kbd>
             <button onClick={onClose} className="text-martian-muted hover:text-white">
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto">
            {!query && (
                <div className="p-8 text-center text-martian-muted opacity-60">
                    <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Type to search across your database project.</p>
                    <p className="text-xs mt-2">Try "customers", "select", or data values.</p>
                </div>
            )}

            {query && results.length === 0 && dataResults.length === 0 && !isSearchingData && (
                 <div className="px-4 py-2">
                    <button 
                        onClick={handleDeepSearch}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-martian-surface group transition-colors"
                    >
                        <div className="w-8 h-8 rounded-lg bg-martian-surface border border-martian-border flex items-center justify-center group-hover:border-martian-primary/50 transition-colors">
                            <Search className="w-4 h-4 text-martian-primary" />
                        </div>
                        <div>
                            <div className="text-sm font-medium text-martian-text">Deep Search in Data</div>
                            <div className="text-xs text-martian-muted">Run SQL scan for "{query}" in all tables...</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-martian-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                 </div>
            )}

            {/* Metadata Results */}
            {results.length > 0 && (
                <div className="px-2 py-2 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold text-martian-muted uppercase tracking-wider">Resources</div>
                    {results.map(res => (
                        <button 
                            key={res.id}
                            onClick={res.action}
                            className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-martian-surface group transition-colors"
                        >
                            <div className={`w-8 h-8 rounded-lg border border-martian-border flex items-center justify-center shrink-0
                                ${res.type === 'TABLE' ? 'bg-omop-cyan/10 text-omop-cyan' : ''}
                                ${res.type === 'SOURCE' ? 'bg-omop-amber/10 text-omop-amber' : ''}
                                ${res.type === 'SNIPPET' ? 'bg-omop-magenta/10 text-omop-magenta' : ''}
                            `}>
                                {res.type === 'TABLE' && <Table className="w-4 h-4" />}
                                {res.type === 'SOURCE' && <Globe className="w-4 h-4" />}
                                {res.type === 'SNIPPET' && <Code className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-martian-text truncate">{res.title}</div>
                                <div className="text-xs text-martian-muted truncate">{res.subtitle}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-martian-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            )}

            {/* Deep Search Results */}
            {(isSearchingData || dataResults.length > 0) && (
                <div className="px-2 py-2 space-y-1 border-t border-martian-border/50 mt-2">
                    <div className="px-2 py-1 text-[10px] font-bold text-martian-muted uppercase tracking-wider flex items-center gap-2">
                        Data Content
                        {isSearchingData && <Loader2 className="w-3 h-3 animate-spin" />}
                    </div>
                    
                    {dataResults.length === 0 && !isSearchingData && (
                        <div className="px-4 py-4 text-center text-xs text-martian-muted italic">
                            No data matches found.
                        </div>
                    )}

                    {dataResults.map(res => (
                        <button 
                            key={res.id}
                            onClick={res.action}
                            className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-martian-surface group transition-colors"
                        >
                            <div className="w-8 h-8 rounded-lg bg-martian-bg border border-martian-border flex items-center justify-center shrink-0 text-martian-muted">
                                <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-martian-text truncate">{res.title}</div>
                                <div className="text-xs text-omop-emerald truncate font-mono">{res.subtitle}</div>
                            </div>
                            <LayoutTemplate className="w-4 h-4 text-martian-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            )}

        </div>
        
        {/* Footer */}
        <div className="p-3 bg-martian-surface/30 border-t border-martian-border flex items-center justify-between text-[10px] text-martian-muted">
             <div className="flex gap-3">
                 <span><kbd className="font-sans bg-martian-bg border border-martian-border px-1 rounded">↵</kbd> to select</span>
                 <span><kbd className="font-sans bg-martian-bg border border-martian-border px-1 rounded">esc</kbd> to close</span>
             </div>
             <div>
                 Deep Search scans up to 5 tables
             </div>
        </div>

      </div>
    </div>
  );
};
