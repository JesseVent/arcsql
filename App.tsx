import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Play, 
  Wand2, 
  ArrowRightLeft, 
  Terminal, 
  Loader2, 
  CheckCircle2, 
  Table,
  Zap,
  MessageSquare,
  Globe, 
  PlusCircle, 
  Sparkles, 
  Binary, 
  HardDrive, 
  Radar, 
  Activity, 
  HelpCircle, 
  BookMarked, 
  GripVertical, 
  GripHorizontal, 
  PanelLeft, 
  Columns2, 
  Rows2, 
  PanelBottom, 
  Maximize2, 
  Layout, 
  Search as SearchIcon, 
  Bot, 
  GitMerge 
} from 'lucide-react';

import { initDuckDB, runQuery, createTable, getTableNames, exportTable, disconnectSource, isVssAvailable, isFtsAvailable, explainQuery } from './services/duckDbService';
import { initPyodide, transpileSql } from './services/pyodideService';
import { 
  generateSnowflakeSql, 
  optimizeSnowflakeSql, 
  generateMockData, 
  agentChat,
  runSqlQueryTool,
  createTableTool,
  parseMlRequest, 
  generateEncodingSql, 
  generateVectorSql,
  fixSqlError
} from './services/geminiService';
import { CodeEditor } from './components/CodeEditor';
import { ResultsViewer } from './components/ResultsViewer';
import { DataSourceManager } from './components/DataSourceManager';
import { HelpPage } from './components/HelpPage';
import { SnippetList } from './components/SnippetList';
import { SnippetManager } from './components/SnippetManager';
import { GlobalSearch } from './components/GlobalSearch';
import { AppMode, QueryResult, LogEntry, DataSource } from './types';
// @ts-ignore
import { format } from 'sql-formatter';

const INITIAL_SQL = `
-- Example Query
SELECT 
    c.customer_name, 
    COUNT(o.order_id) as total_orders,
    SUM(o.amount) as total_spend
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY 1
ORDER BY 3 DESC
LIMIT 5;
`;

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.BUILDER);
  const [sql, setSql] = useState(INITIAL_SQL);
  const [nlPrompt, setNlPrompt] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  
  const [resultsTab, setResultsTab] = useState<'results' | 'tables' | 'logs'>('results');
  const [targetDialect, setTargetDialect] = useState<'tsql' | 'postgres' | 'bigquery' | 'snowflake'>('tsql');
  
  // System Status
  const [pyodideReady, setPyodideReady] = useState(false);
  const [duckDbReady, setDuckDbReady] = useState(false);
  const [vssReady, setVssReady] = useState(false);
  const [ftsReady, setFtsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Logs & Context
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  
  // Data Sources & Modals
  const [isDataSourceManagerOpen, setIsDataSourceManagerOpen] = useState(false);
  const [isSnippetManagerOpen, setIsSnippetManagerOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isSupabaseDbConfigured, setIsSupabaseDbConfigured] = useState(false);
  const [supabaseLoggedInUser, setSupabaseLoggedInUser] = useState<any>(null);

  const refreshSupabaseStatus = async () => {
    try {
      const { isSupabaseConfigured, getSupabaseUser } = await import('./services/supabaseService.js');
      setIsSupabaseDbConfigured(isSupabaseConfigured());
      const u = await getSupabaseUser();
      setSupabaseLoggedInUser(u);
    } catch (e) {
      console.warn("Supabase auth is disabled", e);
    }
  };

  useEffect(() => {
    refreshSupabaseStatus();
  }, []);

  // Refs for scrolling
  const logsEndRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef(false);

  // --- Layout State ---
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [editorRatio, setEditorRatio] = useState(0.5); // Percentage (0 to 1)
  const [resultsRatio, setResultsRatio] = useState(0.65); // Percentage of height for Results vs Logs
  
  const [showSidebar, setShowSidebar] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal'); // Split direction
  const [showResultsPane, setShowResultsPane] = useState(true);
  const [showSnippets, setShowSnippets] = useState(false);
  const [snippets, setSnippets] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('context7_snippets') || '[]'); } catch { return []; }
  });

  const refreshSnippets = () => {
    try { setSnippets(JSON.parse(localStorage.getItem('context7_snippets') || '[]')); } catch { setSnippets([]); }
  };

  const [resizing, setResizing] = useState<'sidebar' | 'editor' | 'results' | null>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize Systems
    const boot = async () => {
      if (bootRef.current) return;
      bootRef.current = true;

      addLog('info', 'Initializing Pyodide & SQLGlot...');
      try {
        await initPyodide();
        setPyodideReady(true);
        addLog('success', 'Pyodide + SQLGlot loaded via CDN.');
      } catch (e) {
        addLog('error', 'Failed to load Pyodide.');
      }

      addLog('info', 'Initializing DuckDB WASM...');
      try {
        await initDuckDB();
        setDuckDbReady(true);
        setVssReady(isVssAvailable());
        setFtsReady(isFtsAvailable());
        
        const features = [];
        if (isVssAvailable()) features.push('VSS');
        if (isFtsAvailable()) features.push('FTS');
        
        addLog('success', `DuckDB WASM Ready [${features.join(', ')}].`);
        
        // Seed some initial fake data via Gemini logic simulation
        await seedInitialData();
        
      } catch (e) {
        addLog('error', 'Failed to load DuckDB.');
      }
    };
    boot();
  }, []);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setIsSearchOpen(prev => !prev);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Resizing Effect ---
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
        if (resizing === 'sidebar') {
            const newWidth = Math.max(180, Math.min(600, e.clientX));
            setSidebarWidth(newWidth);
        } else if (resizing === 'editor') {
             if (editorContainerRef.current) {
                 const rect = editorContainerRef.current.getBoundingClientRect();
                 if (layoutMode === 'horizontal') {
                     const offsetX = e.clientX - rect.left;
                     const newRatio = Math.max(0.2, Math.min(0.8, offsetX / rect.width));
                     setEditorRatio(newRatio);
                 } else {
                     const offsetY = e.clientY - rect.top;
                     const newRatio = Math.max(0.2, Math.min(0.8, offsetY / rect.height));
                     setEditorRatio(newRatio);
                 }
             }
        } else if (resizing === 'results') {
             if (resultsContainerRef.current) {
                 const rect = resultsContainerRef.current.getBoundingClientRect();
                 const offsetY = e.clientY - rect.top;
                 const newRatio = Math.max(0.2, Math.min(0.8, offsetY / rect.height));
                 setResultsRatio(newRatio);
             }
        }
    };

    const handleMouseUp = () => {
        setResizing(null);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    // UI Feedback while dragging
    document.body.style.userSelect = 'none';
    if (resizing === 'sidebar') document.body.style.cursor = 'col-resize';
    else if (resizing === 'editor') document.body.style.cursor = layoutMode === 'horizontal' ? 'col-resize' : 'row-resize';
    else if (resizing === 'results') document.body.style.cursor = 'row-resize';

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
    };
  }, [resizing, layoutMode]);

  // Ensure panes reset to reasonable defaults if they get stuck
  const toggleResultsPane = () => {
      if (!showResultsPane) {
          // If we are showing it, make sure ratio is reasonable
          if (editorRatio < 0.1 || editorRatio > 0.9) setEditorRatio(0.5);
      }
      setShowResultsPane(!showResultsPane);
  };

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), type, message }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const seedInitialData = async () => {
    try {
        await createTable('customers', 
            'CREATE OR REPLACE TABLE customers (id INTEGER, customer_name VARCHAR, region VARCHAR)', 
            [{id: 1, customer_name: 'Acme Corp', region: 'US'}, {id: 2, customer_name: 'Globex', region: 'EU'}, {id: 3, customer_name: 'Soylent Corp', region: 'US'}]
        );
        await createTable('orders', 
            'CREATE OR REPLACE TABLE orders (order_id INTEGER, customer_id INTEGER, amount FLOAT, order_date DATE)', 
            [{order_id: 101, customer_id: 1, amount: 500.50, order_date: '2023-01-01'}, {order_id: 102, customer_id: 1, amount: 200.00, order_date: '2023-02-01'}]
        );
        await createTable('claims',
            'CREATE OR REPLACE TABLE claims (claim_id INTEGER, diagnosis_code VARCHAR, procedure_code VARCHAR, cost FLOAT)',
            [
                { claim_id: 1, diagnosis_code: 'I10', procedure_code: '99213', cost: 150.00 },
                { claim_id: 2, diagnosis_code: 'E11.9', procedure_code: '99214', cost: 200.00 },
                { claim_id: 3, diagnosis_code: 'J45.909', procedure_code: '30000', cost: 50.00 },
                { claim_id: 4, diagnosis_code: 'I10', procedure_code: '99213', cost: 150.00 },
                { claim_id: 5, diagnosis_code: 'Z00.00', procedure_code: '99395', cost: 300.00 }
            ]
        );
        refreshTableList();
        addLog('success', 'Context7: Loaded default tables (customers, orders, claims).');
    } catch (e) {
        console.error(e);
    }
  };

  const refreshTableList = async () => {
      const ts = await getTableNames();
      setTables(ts);
  };

  const formatSql = (rawSql: string): string => {
      try {
          return format(rawSql, { 
              language: 'snowflake', 
              keywordCase: 'upper',
              linesBetweenQueries: 2 
          });
      } catch (e) {
          console.warn("Formatting failed, using raw SQL", e);
          return rawSql;
      }
  };

  const handleRunQuery = async () => {
    if (!duckDbReady) return;
    setIsProcessing(true);
    
    let currentSql = sql;
    let attempt = 0;
    const maxRetries = 2;
    let success = false;

    while (attempt <= maxRetries && !success) {
        const isRetry = attempt > 0;
        addLog(isRetry ? 'warning' : 'info', 
            isRetry 
            ? `Retry attempt ${attempt}/${maxRetries} executing in DuckDB...` 
            : 'Executing query in DuckDB...'
        );
        
        let runnableSql = currentSql;
        if (pyodideReady) {
            try {
                const trans = await transpileSql(currentSql, 'snowflake'); 
                if (trans.sql) runnableSql = trans.sql;
            } catch (e) {
                // If transpilation fails, execution might still work if basic SQL, or fail and trigger auto-fix
            }
        }

        const res = await runQuery(runnableSql);
        
        if (!res.error) {
            setQueryResult(res);
            addLog('success', `Query executed successfully: ${res.rows.length} rows.`);
            if (isRetry) {
                setSql(currentSql);
                addLog('success', 'Context7 Agent: Automatically fixed SQL syntax.');
            }
            success = true;
        } else {
            if (attempt < maxRetries) {
                addLog('error', `Execution Error: ${res.error}`);
                addLog('info', 'Context7 Agent: Analyzing error and attempting fix...');
                
                try {
                    await new Promise(r => setTimeout(r, 500 * attempt));
                    const fixedSql = await fixSqlError(currentSql, res.error, tables);
                    currentSql = formatSql(fixedSql);
                    setSql(currentSql);
                } catch (e) {
                    addLog('error', 'Context7 Agent: Could not generate a fix.');
                    setQueryResult(res); 
                    break;
                }
            } else {
                setQueryResult(res);
                addLog('error', `Final execution failed after ${maxRetries} retries: ${res.error}`);
            }
        }
        attempt++;
    }

    setIsProcessing(false);
  };

  const handleExplain = async () => {
      if (!duckDbReady) return;
      if (!sql.trim()) return;
      setIsProcessing(true);
      addLog('info', 'Calculating Execution Plan...');

      let runnableSql = sql;
      if (pyodideReady) {
          try {
              const trans = await transpileSql(sql, 'snowflake');
              if (trans.sql) runnableSql = trans.sql;
          } catch (e) {}
      }

      const explanation = await explainQuery(runnableSql);
      setQueryResult({
          rows: [],
          columns: [],
          explanation: explanation,
          executionTime: 0
      });
      addLog('success', 'Execution Plan generated.');
      setIsProcessing(false);
  };

  const handleGenerateSql = async () => {
    if (!nlPrompt.trim()) return;
    setIsProcessing(true);
    addLog('info', 'Context7 Agent: Generating SQL...');
    try {
        const generated = await generateSnowflakeSql(nlPrompt, sql);
        setSql(formatSql(generated));
        addLog('success', 'SQL generated & formatted.');
    } catch (e) {
        addLog('error', 'Failed to generate SQL.');
    }
    setIsProcessing(false);
  };

  const handleOptimize = async () => {
    if (!sql.trim()) return;
    setIsProcessing(true);
    addLog('info', 'Context7 Agent: Analyzing query plan...');
    try {
        const result = await optimizeSnowflakeSql(sql);
        setSql(formatSql(result.optimizedSql));
        addLog('success', 'Optimization complete.');
        addLog('info', `Optimization Strategy: ${result.explanation}`);
    } catch (e) {
        addLog('error', 'Optimization failed.');
    }
    setIsProcessing(false);
  };

  const handleConvert = async () => {
    if (!sql.trim()) return;
    if (!pyodideReady) {
        addLog('warning', 'Pyodide not ready yet.');
        return;
    }
    setIsProcessing(true);
    addLog('info', `Transpiling Snowflake to ${targetDialect.toUpperCase()}...`);
    try {
        const res = await transpileSql(sql, 'snowflake', targetDialect);
        if (res.error) {
            addLog('error', res.error);
        } else {
            setSql(formatSql(res.sql));
            addLog('success', `Converted Snowflake to ${targetDialect.toUpperCase()} dialect.`);
        }
    } catch (e) {
        addLog('error', 'Conversion failed.');
    }
    setIsProcessing(false);
  };

  const handleGenerateData = async () => {
    if (!nlPrompt.trim()) {
        addLog('warning', 'Enter a description for the data (e.g. "sales data for Q1")');
        return;
    }
    setIsProcessing(true);
    addLog('info', 'Generating schema and mock data with Faker...');
    try {
        const res = await generateMockData(nlPrompt);
        addLog('info', `Creating table ${res.tableName}...`);
        
        await createTable(res.tableName, res.schemaSql, res.data);
        await refreshTableList();
        
        addLog('success', `Table ${res.tableName} created with ${res.data.length} rows.`);
    } catch (e) {
        addLog('error', 'Data generation failed.');
    }
    setIsProcessing(false);
  }

  const handleAutoArchitect = async () => {
    if (!nlPrompt.trim()) {
      addLog('warning', 'Describe what you want to build and analyze.');
      return;
    }
    setIsProcessing(true);
    addLog('info', 'Auto-Architect: Designing schema, data, and query...');
    
    try {
      const response = await agentChat(nlPrompt, [runSqlQueryTool, createTableTool]);
      
      if (response.functionCalls) {
          for (const call of response.functionCalls) {
              if (call.name === 'create_table') {
                  const { tableName, schemaSql, data } = call.args;
                  addLog('info', `Creating table: ${tableName}...`);
                  await createTable(tableName, schemaSql, data);
              } else if (call.name === 'run_sql_query') {
                  const { sql } = call.args;
                  addLog('info', `Running query: ${sql}...`);
                  const res = await runQuery(sql);
                  setQueryResult(res);
                  setSql(formatSql(sql));
              }
          }
          await refreshTableList();
          addLog('success', 'Auto-Architect complete!');
      } else {
          addLog('info', `Agent response: ${response.text}`);
      }

    } catch (e) {
      console.error(e);
      addLog('error', 'Auto-Architect failed to execute plan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMlPrep = async () => {
    if (!nlPrompt.trim()) {
      addLog('warning', 'Specify a column to encode (e.g., "One hot encode region in customers").');
      return;
    }
    setIsProcessing(true);
    addLog('info', 'ML Prep: Analyzing request...');

    try {
      // 1. Parse Request
      const req = await parseMlRequest(nlPrompt);
      
      if (!req.tableName || !req.columnName) {
        addLog('error', 'Could not identify table or column name from prompt.');
        setIsProcessing(false);
        return;
      }
      
      addLog('info', `Target: ${req.operation} on ${req.tableName}.${req.columnName}`);

      // 2. Get Distinct Values (if needed for one-hot)
      let distinctValues: any[] = [];
      if (req.operation === 'one_hot') {
        addLog('info', 'Fetching distinct values...');
        const res = await runQuery(`SELECT DISTINCT ${req.columnName} FROM ${req.tableName} WHERE ${req.columnName} IS NOT NULL LIMIT 50`);
        if (!res.error) {
          distinctValues = res.rows.map(r => r[req.columnName]);
        }
      }

      // 3. Generate SQL
      addLog('info', 'Generating feature engineering SQL...');
      const encodingSql = await generateEncodingSql(req.tableName, req.columnName, distinctValues, req.operation);
      
      setSql(formatSql(encodingSql));
      addLog('success', 'ML Preprocessing SQL generated.');

    } catch (e) {
      console.error(e);
      addLog('error', 'ML Prep failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVectorOp = async () => {
    if (!nlPrompt.trim()) {
      addLog('warning', 'Describe hybrid search (e.g. "Find documents about cats similar to this vector")');
      return;
    }
    if (!vssReady && !ftsReady) {
        addLog('warning', 'Neither VSS nor FTS extensions are available.');
        return;
    }

    setIsProcessing(true);
    addLog('info', 'Generating Hybrid/Vector SQL...');
    try {
        const sql = await generateVectorSql(nlPrompt);
        setSql(formatSql(sql));
        addLog('success', 'Hybrid SQL Generated.');
    } catch (e) {
        addLog('error', 'Failed to generate SQL.');
    }
    setIsProcessing(false);
  };

  const handleExport = async (tableName: string) => {
    addLog('info', `Exporting table '${tableName}' to Parquet...`);
    try {
        await exportTable(tableName, 'parquet');
        addLog('success', 'Export started.');
    } catch(e: any) {
        addLog('error', e.message);
    }
  };

  return (
    <div className="min-h-screen bg-martian-bg text-martian-text flex flex-col font-sans">
      <GlobalSearch 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        tables={tables}
        dataSources={dataSources}
        onSelectTable={(t) => {
            // Optional: You could switch to profiler mode if selected
        }}
        onLoadSql={(s) => {
            setSql(s);
            addLog('info', 'Search: SQL loaded.');
        }}
      />

      <DataSourceManager 
        isOpen={isDataSourceManagerOpen}
        onClose={() => {
            setIsDataSourceManagerOpen(false);
            refreshSupabaseStatus();
        }}
        currentSources={dataSources}
        onSourceAdded={(name, sourceObj) => {
             if (sourceObj) {
                 setDataSources(prev => [...prev.filter(s => s.name !== name), sourceObj]);
             }
             refreshTableList();
             refreshSupabaseStatus();
        }}
        onRemoveSource={async (name) => {
            await disconnectSource(name);
            setDataSources(prev => prev.filter(s => s.name !== name));
            refreshTableList();
        }}
      />
      
      <SnippetManager
        isOpen={isSnippetManagerOpen}
        onClose={() => { setIsSnippetManagerOpen(false); refreshSnippets(); }}
        currentSql={sql}
        onLoadSql={(s) => {
            setSql(s);
            addLog('info', 'Snippet loaded.');
        }}
      />

      <HelpPage 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
      />

      {/* Header */}
      <header className="h-16 border-b border-martian-border flex items-center justify-between px-6 bg-martian-surface/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
             {/* Open Agent Manager Button */}
             <button 
                onClick={() => setMode(AppMode.BUILDER)}
                className="flex items-center gap-2 text-sm font-medium text-white/90 hover:text-white transition-colors"
             >
                 <Bot className="w-5 h-5 text-martian-primary" />
                 Open Agent Manager
             </button>

             {/* Layout Controls - Grouped */}
             <div className="flex items-center bg-martian-bg/50 border border-martian-border rounded-lg p-0.5 gap-0.5">
                 <button 
                    onClick={() => setShowSidebar(!showSidebar)}
                    className={`p-1.5 rounded transition-all ${showSidebar ? 'bg-martian-subtle text-white' : 'text-martian-muted hover:text-white'}`}
                    title="Toggle Sidebar"
                 >
                     <PanelLeft className="w-4 h-4" />
                 </button>
                 <div className="w-px h-4 bg-martian-border/50 mx-1"></div>
                 <button 
                    onClick={() => setLayoutMode('horizontal')}
                    className={`p-1.5 rounded transition-all ${layoutMode === 'horizontal' ? 'bg-martian-subtle text-white' : 'text-martian-muted hover:text-white'}`}
                    title="Side-by-Side View"
                 >
                     <Columns2 className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={() => setLayoutMode('vertical')}
                    className={`p-1.5 rounded transition-all ${layoutMode === 'vertical' ? 'bg-martian-subtle text-white' : 'text-martian-muted hover:text-white'}`}
                    title="Stacked View"
                 >
                     <Rows2 className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={toggleResultsPane}
                    className={`p-1.5 rounded transition-all ${showResultsPane ? 'bg-martian-subtle text-white' : 'text-martian-muted hover:text-white'}`}
                    title={showResultsPane ? "Hide Results" : "Show Results"}
                 >
                     {showResultsPane ? <PanelBottom className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                 </button>
             </div>

             <button 
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-martian-bg border border-martian-border text-martian-muted hover:text-white hover:border-martian-primary/50 transition-all text-sm group"
             >
                <SearchIcon className="w-4 h-4 group-hover:text-martian-primary transition-colors" />
                <span className="hidden sm:inline">Search...</span>
                <div className="flex items-center gap-0.5 ml-2 opacity-50">
                    <kbd className="bg-martian-surface px-1.5 py-0.5 rounded text-[10px] font-mono border border-martian-border">⌘</kbd>
                    <kbd className="bg-martian-surface px-1.5 py-0.5 rounded text-[10px] font-mono border border-martian-border">K</kbd>
                </div>
             </button>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 hidden lg:flex">
                <div className={`w-2 h-2 rounded-full ${pyodideReady ? 'bg-omop-emerald' : 'bg-omop-amber animate-pulse'}`} />
                <span>Pyodide</span>
            </div>
            <div className="flex items-center gap-2 hidden lg:flex">
                <div className={`w-2 h-2 rounded-full ${duckDbReady ? 'bg-omop-emerald' : 'bg-omop-amber animate-pulse'}`} />
                <span>DuckDB</span>
                {vssReady && <span className="text-[10px] bg-omop-cyan/20 text-omop-cyan px-1 rounded">VSS</span>}
                {ftsReady && <span className="text-[10px] bg-omop-magenta/20 text-omop-magenta px-1 rounded">FTS</span>}
            </div>

            <div className="h-4 w-px bg-martian-border mx-1 hidden lg:block"></div>

            {/* Supabase Status Pill */}
            <button
                onClick={() => setIsDataSourceManagerOpen(true)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                    isSupabaseDbConfigured ? (
                        supabaseLoggedInUser ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20' : 'bg-martian-bg border-green-600/30 text-green-500 hover:bg-green-600/10'
                    ) : 'bg-martian-bg border-martian-border text-martian-muted hover:text-white hover:border-martian-primary/40'
                }`}
                title="Manage Live Supabase Connection & Sessions"
            >
                <Database className="w-3.5 h-3.5 text-green-500 shrink-0 animate-pulse" />
                <span>
                    {isSupabaseDbConfigured ? (
                        supabaseLoggedInUser ? `Supabase: ${supabaseLoggedInUser.email}` : 'Supabase: Active'
                    ) : 'Supabase Client'}
                </span>
            </button>

            <div className="h-4 w-px bg-martian-border mx-1 hidden lg:block"></div>
            
            <button 
                onClick={() => setIsHelpOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-martian-primary/10 border border-martian-primary/30 text-martian-primary hover:bg-martian-primary/20 transition-all text-sm font-medium"
            >
                <HelpCircle className="w-4 h-4" />
                Help
            </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Resizable Sidebar */}
        {showSidebar && (
            <>
            <aside 
                style={{ width: sidebarWidth }} 
                className="bg-martian-surface border-r border-martian-border flex flex-col flex-shrink-0 transition-none"
            >
            <div className="p-4 space-y-2">
                <div className="px-2 py-1 text-[10px] font-bold text-martian-muted uppercase tracking-wider">
                    Library
                </div>
                {/* Snippets Section */}
                <div className="border border-martian-border bg-martian-surface/30 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-martian-surface/50">
                        <button 
                            onClick={() => setShowSnippets(!showSnippets)}
                            className="flex items-center gap-1 text-[10px] font-bold text-martian-muted uppercase tracking-wider hover:text-white"
                        >
                            {showSnippets ? '▼' : '▶'} Snippets
                        </button>
                        {showSnippets && (
                            <button 
                                onClick={() => setIsSnippetManagerOpen(true)}
                                className="text-[10px] text-martian-primary hover:text-white"
                            >
                                + Save
                            </button>
                        )}
                    </div>
                    {showSnippets && (
                        <div className="p-2">
                            <SnippetList
                                snippets={snippets}
                                onLoadSql={(s) => {
                                    setSql(s);
                                    addLog('info', 'Snippet loaded.');
                                }}
                                onDelete={(id) => {
                                    const updated = snippets.filter((s: any) => s.id !== id);
                                    localStorage.setItem('context7_snippets', JSON.stringify(updated));
                                    setSnippets(updated);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
            </aside>
            {/* Sidebar Resizer */}
            <div 
                className="w-1 cursor-col-resize hover:bg-martian-primary bg-martian-border/20 transition-colors z-10 flex flex-col justify-center items-center group/resizer flex-shrink-0"
                onMouseDown={() => setResizing('sidebar')}
            >
                <div className="h-8 w-0.5 bg-martian-muted/50 group-hover/resizer:bg-white rounded-full transition-colors"></div>
            </div>
            </>
        )}

        {/* Workspace */}
        <main className="flex-1 flex flex-col min-w-0" ref={editorContainerRef}>
            {/* Resizable Editor/Results Split */}
                <div className={`flex-1 flex overflow-hidden ${layoutMode === 'vertical' ? 'flex-col' : 'flex-row'}`}>
                    
                    {/* Editor Pane */}
                    <div 
                        style={{ 
                            width: layoutMode === 'horizontal' ? (showResultsPane ? `${editorRatio * 100}%` : '100%') : '100%',
                            height: layoutMode === 'vertical' ? (showResultsPane ? `${editorRatio * 100}%` : '100%') : '100%',
                            minWidth: showResultsPane && layoutMode === 'horizontal' ? '100px' : undefined,
                            minHeight: showResultsPane && layoutMode === 'vertical' ? '100px' : undefined,
                        }} 
                        className={`flex flex-col flex-shrink-0 border-martian-border transition-none ${layoutMode === 'horizontal' && showResultsPane ? 'border-r' : ''} ${layoutMode === 'vertical' && showResultsPane ? 'border-b' : ''}`}
                    >
                        <div className="flex-1 h-full flex flex-col">
                            <div className="flex-1">
                                <CodeEditor value={sql} onChange={setSql} />
                            </div>
                        </div>
                    </div>

                    {/* Splitter */}
                    {showResultsPane && (
                        <div 
                            className={`${layoutMode === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'} hover:bg-martian-primary bg-martian-border/20 transition-colors z-10 flex justify-center items-center group/resizer flex-shrink-0`}
                            onMouseDown={() => setResizing('editor')}
                        >
                             <div className={`${layoutMode === 'horizontal' ? 'h-8 w-0.5' : 'w-8 h-0.5'} bg-martian-muted/50 group-hover/resizer:bg-white rounded-full transition-colors`}></div>
                        </div>
                    )}

                    {/* Results / Logs / Tables Pane */}
                    {showResultsPane && (
                        <div className="flex-1 flex flex-col bg-martian-bg min-w-0 min-h-0" ref={resultsContainerRef}>
                            {/* Tabs Header */}
                            <div className="flex items-center border-b border-martian-border bg-martian-surface/50 px-2">
                                <button 
                                    onClick={() => setResultsTab('results')}
                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${resultsTab === 'results' ? 'border-martian-primary text-martian-primary' : 'border-transparent text-martian-muted hover:text-white'}`}
                                >
                                    <Table className="w-3.5 h-3.5" />
                                    Results
                                </button>
                                <button 
                                    onClick={() => setResultsTab('tables')}
                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${resultsTab === 'tables' ? 'border-omop-amber text-omop-amber' : 'border-transparent text-martian-muted hover:text-white'}`}
                                >
                                    <Database className="w-3.5 h-3.5" />
                                    Tables
                                </button>
                                <button 
                                    onClick={() => setResultsTab('logs')}
                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${resultsTab === 'logs' ? 'border-omop-magenta text-omop-magenta' : 'border-transparent text-martian-muted hover:text-white'}`}
                                >
                                    <Terminal className="w-3.5 h-3.5" />
                                    Logs
                                </button>
                            </div>

                            <div className="flex-1 overflow-hidden flex flex-col">
                                {resultsTab === 'results' && (
                                    <div className="flex-1 p-4 overflow-hidden">
                                        <ResultsViewer result={queryResult} />
                                    </div>
                                )}

                                {resultsTab === 'tables' && (
                                    <div className="flex-1 flex flex-col p-4 overflow-hidden">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-xs font-bold text-martian-muted uppercase tracking-wider">Tables & Sources</h3>
                                            <button 
                                                onClick={() => setIsDataSourceManagerOpen(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-martian-primary/10 hover:bg-martian-primary/20 text-martian-primary border border-martian-primary/30 rounded text-[10px] font-bold transition-all"
                                            >
                                                <PlusCircle className="w-3 h-3" />
                                                Connect Source
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                                            {tables.length === 0 && <span className="text-xs text-martian-muted italic">No tables loaded.</span>}
                                            {tables.map(t => {
                                                const isRemote = dataSources.some(ds => ds.name === t);
                                                return (
                                                    <div key={t} className="flex items-center justify-between gap-3 text-sm text-martian-text/90 px-3 py-2 rounded-lg bg-martian-surface/30 border border-martian-border/50 hover:border-martian-primary/50 cursor-pointer group transition-all">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isRemote ? 'bg-omop-amber/10 text-omop-amber' : 'bg-omop-slate/10 text-omop-slate'}`}>
                                                                {isRemote ? <Globe className="w-4 h-4" /> : <Table className="w-4 h-4" />}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-medium truncate">{t}</span>
                                                                <span className="text-[10px] text-martian-muted uppercase tracking-tight">{isRemote ? 'Remote Source' : 'Local Table'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleExport(t); }}
                                                                className="p-1.5 text-martian-muted hover:text-white hover:bg-martian-subtle rounded transition-all"
                                                                title="Export to Parquet"
                                                            >
                                                                <HardDrive className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {resultsTab === 'logs' && (
                                    <div className="flex-1 bg-black/20 p-4 overflow-auto flex flex-col font-mono text-xs">
                                        <div className="flex-1 space-y-1">
                                            {logs.map((log, i) => (
                                                <div key={i} className="flex gap-2">
                                                    <span className="text-martian-border shrink-0">[{log.timestamp}]</span>
                                                    <span className={`
                                                        ${log.type === 'error' ? 'text-red-400' : ''}
                                                        ${log.type === 'success' ? 'text-green-400' : ''}
                                                        ${log.type === 'warning' ? 'text-yellow-400' : ''}
                                                        ${log.type === 'info' ? 'text-martian-muted' : ''}
                                                    `}>
                                                        {log.type === 'success' && '✓ '}
                                                        {log.type === 'error' && '✕ '}
                                                        {log.message}
                                                    </span>
                                                </div>
                                            ))}
                                            <div ref={logsEndRef} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Bar / Chat Input */}
                <div className="p-4 border-t border-martian-border bg-martian-surface/40 backdrop-blur-xl flex flex-col gap-3 sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center bg-martian-bg/50 border border-martian-border rounded-lg p-1 gap-1">
                            <button 
                                onClick={() => setMode(AppMode.BUILDER)}
                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === AppMode.BUILDER ? 'bg-martian-primary text-white shadow-lg shadow-martian-primary/20' : 'text-martian-muted hover:text-white'}`}
                            >
                                <Wand2 className="w-3 h-3" />
                                Build
                            </button>
                            <button 
                                onClick={() => setMode(AppMode.OPTIMIZER)}
                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === AppMode.OPTIMIZER ? 'bg-omop-cyan text-white shadow-lg shadow-omop-cyan/20' : 'text-martian-muted hover:text-white'}`}
                            >
                                <Zap className="w-3 h-3" />
                                Optimize
                            </button>
                            <button 
                                onClick={() => setMode(AppMode.CONVERTER)}
                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === AppMode.CONVERTER ? 'bg-omop-magenta text-white shadow-lg shadow-omop-magenta/20' : 'text-martian-muted hover:text-white'}`}
                            >
                                <ArrowRightLeft className="w-3 h-3" />
                                Convert
                            </button>
                        </div>

                        {mode === AppMode.CONVERTER && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-martian-muted uppercase">Target:</span>
                                <select 
                                    value={targetDialect}
                                    onChange={(e) => setTargetDialect(e.target.value as any)}
                                    className="bg-martian-bg border border-martian-border text-white text-[10px] rounded px-2 py-1 focus:outline-none focus:border-omop-magenta"
                                >
                                    <option value="tsql">T-SQL</option>
                                    <option value="postgres">PostgreSQL</option>
                                    <option value="bigquery">BigQuery</option>
                                    <option value="snowflake">Snowflake</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="relative flex-1 group">
                            <div className="absolute left-3 top-3 w-5 h-5 flex items-center justify-center pointer-events-none">
                                <MessageSquare className="w-4 h-4 text-martian-primary/70 group-focus-within:text-martian-primary transition-colors" />
                            </div>
                            <textarea 
                                className="w-full bg-martian-bg/80 border border-martian-border rounded-xl pl-10 pr-14 py-2.5 text-sm focus:outline-none focus:border-martian-primary transition-all resize-none shadow-inner h-[50px] focus:h-[80px] focus:bg-black/50"
                                placeholder={
                                    mode === AppMode.BUILDER ? "Ask AI to build or analyze (e.g., 'Analyze sales by region for last quarter')" :
                                    mode === AppMode.OPTIMIZER ? "Describe optimization goal..." :
                                    "Enter prompt or paste SQL..."
                                }
                                value={nlPrompt}
                                onChange={(e) => setNlPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if(mode === AppMode.BUILDER) handleGenerateSql();
                                        else if(mode === AppMode.OPTIMIZER) handleOptimize();
                                        else if(mode === AppMode.CONVERTER) handleConvert();
                                    }
                                }}
                            />
                             <div className="absolute right-2 bottom-2 flex items-center gap-2">
                                {isProcessing && (
                                    <div className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </div>
                                )}
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => {
                                            if(mode === AppMode.BUILDER) handleGenerateSql();
                                            else if(mode === AppMode.OPTIMIZER) handleOptimize();
                                            else if(mode === AppMode.CONVERTER) handleConvert();
                                        }}
                                        disabled={isProcessing || !nlPrompt.trim()}
                                        className={`font-medium p-1.5 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:grayscale ${
                                            mode === AppMode.BUILDER ? 'bg-martian-primary text-white' :
                                            mode === AppMode.OPTIMIZER ? 'bg-omop-cyan text-white' :
                                            'bg-omop-magenta text-white'
                                        }`}
                                        title={
                                            mode === AppMode.BUILDER ? "Generate SQL" :
                                            mode === AppMode.OPTIMIZER ? "Optimize SQL" :
                                            "Convert SQL"
                                        }
                                    >
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    </button>
                                    <button 
                                        onClick={handleExplain}
                                        disabled={isProcessing || !duckDbReady}
                                        className="bg-omop-amber/90 hover:bg-omop-amber text-black font-medium p-1.5 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                                        title="Explain Plan"
                                    >
                                        <GitMerge className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={handleRunQuery}
                                        disabled={isProcessing || !duckDbReady}
                                        className="bg-green-600 hover:bg-green-500 text-white p-1.5 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                                        title="Run SQL (Ctrl+Enter)"
                                    >
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                    </button>
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Context Buttons Row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            {mode === AppMode.BUILDER && (
                                <>
                                    <button onClick={handleGenerateSql} disabled={isProcessing} className="bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap">
                                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Wand2 className="w-3.5 h-3.5 text-martian-muted" />}
                                        Generate SQL
                                    </button>
                                    <button onClick={handleGenerateData} disabled={isProcessing} className="bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap">
                                        <Table className="w-3.5 h-3.5 text-martian-muted" />
                                        Gen Data
                                    </button>
                                    <button onClick={handleMlPrep} disabled={isProcessing} className="bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap">
                                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Binary className="w-3.5 h-3.5 text-martian-muted" />}
                                        ML Prep
                                    </button>
                                    <button onClick={handleVectorOp} disabled={isProcessing || (!vssReady && !ftsReady)} className="bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap">
                                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Radar className="w-3.5 h-3.5 text-martian-muted" />}
                                        Hybrid Search
                                    </button>
                                    <div className="w-px bg-martian-border h-4 mx-1"></div>
                                    <button 
                                        onClick={handleAutoArchitect} 
                                        disabled={isProcessing} 
                                        className="bg-gradient-to-r from-martian-primary/20 to-omop-indigo/20 border border-martian-primary/50 hover:bg-martian-primary/30 text-martian-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
                                        title="Auto-Architect: Generates tables, mock data, and executes analysis query"
                                    >
                                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5" />}
                                        Auto-Architect
                                    </button>
                                </>
                            )}

                            {mode === AppMode.OPTIMIZER && (
                                <button onClick={handleOptimize} disabled={isProcessing} className="bg-omop-cyan/10 hover:bg-omop-cyan/20 border border-omop-cyan/50 text-omop-cyan px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Zap className="w-3.5 h-3.5" />}
                                    Optimize
                                </button>
                            )}

                            {mode === AppMode.CONVERTER && (
                                <button onClick={handleConvert} disabled={isProcessing || !pyodideReady} className="bg-omop-magenta/10 hover:bg-omop-magenta/20 border border-omop-magenta/50 text-omop-magenta px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                                    Convert to {targetDialect.toUpperCase()}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
        </main>
      </div>

    </div>
  );
}