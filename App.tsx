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
  GitMerge,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
  FlaskConical,
} from 'lucide-react';

import { initDuckDB, runQuery, createTable, getTableNames, exportTable, disconnectSource, isVssAvailable, isFtsAvailable, explainQuery, splitSqlStatements, getTableSchema } from './services/duckDbService';
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
import { EvalManager } from './components/EvalManager';
import { AppMode, QueryResult, LogEntry, DataSource, HistoryEntry, ColumnInfo, EvalCase, EvalRun } from './types';
// @ts-ignore
import { format } from 'sql-formatter';

// Score a DuckDB explain plan — lower is better.
// Counts operator nodes + penalises expensive join/scan patterns.
const scorePlan = (plan: string): number => {
  const nodes = (plan.match(/┌─/g) || []).length || (plan.match(/[A-Z_]{4,}/g) || []).length;
  const expensive = ['HASH_JOIN', 'CROSS_PRODUCT', 'BLOCKWISE_NL_JOIN', 'NESTED_LOOP', 'SEQ_SCAN'];
  const penalty = expensive.reduce((acc, op) =>
    acc + (plan.match(new RegExp(op, 'g')) || []).length * 3, 0);
  return nodes + penalty;
};

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
  
  const [resultsTab, setResultsTab] = useState<'results' | 'tables' | 'logs' | 'history'>('results');
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
  const [isEvalsOpen, setIsEvalsOpen] = useState(false);
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

  // Query history
  const [queryHistory, setQueryHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('arcsql_history') || '[]'); } catch { return []; }
  });

  const pushHistory = (querySql: string, executionTime: number, statementCount: number) => {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      sql: querySql,
      timestamp: new Date().toLocaleTimeString(),
      executionTime,
      statementCount,
    };
    setQueryHistory(prev => {
      const next = [entry, ...prev].slice(0, 50);
      localStorage.setItem('arcsql_history', JSON.stringify(next));
      return next;
    });
  };

  // Schema expansion
  const [tableSchemas, setTableSchemas] = useState<Record<string, ColumnInfo[]>>({});
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const loadTableSchema = async (tableName: string) => {
    if (tableSchemas[tableName]) return;
    const cols = await getTableSchema(tableName);
    setTableSchemas(prev => ({ ...prev, [tableName]: cols }));
  };

  const toggleTableExpand = (tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) { next.delete(tableName); }
      else { next.add(tableName); loadTableSchema(tableName); }
      return next;
    });
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

    const stmts = splitSqlStatements(sql).filter(s => s.trim());
    if (stmts.length === 0) { setIsProcessing(false); return; }

    const isMulti = stmts.length > 1;
    if (isMulti) addLog('info', `Executing ${stmts.length} statements in DuckDB...`);

    let lastResult: QueryResult | null = null;
    let successCount = 0;
    let totalTime = 0;

    for (let si = 0; si < stmts.length; si++) {
      let currentSql = stmts[si];
      let attempt = 0;
      const maxRetries = isMulti ? 0 : 2;
      let stmtDone = false;

      while (attempt <= maxRetries && !stmtDone) {
        const isRetry = attempt > 0;
        if (!isMulti) addLog(isRetry ? 'warning' : 'info', isRetry ? `Retry ${attempt}/${maxRetries}...` : 'Executing query in DuckDB...');

        let runnableSql = currentSql;
        if (pyodideReady) {
          try {
            const trans = await transpileSql(currentSql, 'snowflake');
            if (trans.sql) runnableSql = trans.sql;
          } catch (e) {}
        }

        const res = await runQuery(runnableSql);

        if (!res.error) {
          addLog('success', isMulti
            ? `[${si + 1}/${stmts.length}] ${res.rows.length} rows (${(res.executionTime || 0).toFixed(0)}ms)`
            : `Query executed: ${res.rows.length} rows.`);
          if (isRetry) { setSql(currentSql); addLog('success', 'Agent: Fixed SQL syntax.'); }
          lastResult = res;
          successCount++;
          totalTime += res.executionTime || 0;
          stmtDone = true;
        } else {
          if (attempt < maxRetries) {
            addLog('error', `Error: ${res.error}`);
            addLog('info', 'Agent: Analyzing error...');
            try {
              await new Promise(r => setTimeout(r, 500 * attempt));
              const fixedSql = await fixSqlError(currentSql, res.error, tables);
              currentSql = formatSql(fixedSql);
              setSql(currentSql);
            } catch (e) {
              addLog('error', 'Agent: Could not fix.');
              lastResult = res;
              stmtDone = true;
            }
          } else {
            addLog('error', isMulti ? `[${si + 1}/${stmts.length}] Error: ${res.error}` : `Failed: ${res.error}`);
            lastResult = res;
            stmtDone = true;
          }
        }
        attempt++;
      }
    }

    if (lastResult) {
      setQueryResult(lastResult);
      if (!lastResult.error) pushHistory(sql, totalTime, stmts.length);
    }
    if (isMulti) addLog('info', `Done: ${successCount}/${stmts.length} statements succeeded.`);

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
    addLog('info', 'Analyzing query plan...');
    try {
        const result = await optimizeSnowflakeSql(sql);
        setSql(formatSql(result.optimizedSql));
        addLog('success', 'Optimization complete.');
        addLog('info', `Strategy: ${result.explanation}`);
    } catch (e) {
        addLog('error', 'Optimization failed.');
    }
    setIsProcessing(false);
  };

  const handleAutoOptimize = async () => {
    if (!sql.trim() || !duckDbReady) return;
    setIsProcessing(true);
    addLog('info', 'Auto-Optimizer: Starting explain → optimize → validate → execute loop...');

    const MAX_ITERATIONS = 5;
    let currentSql = sql;
    let currentPlan = '';
    let bestScore = Infinity;
    let iteration = 0;
    let improved = true;

    // Baseline plan
    addLog('info', 'Capturing baseline execution plan...');
    currentPlan = await explainQuery(currentSql);
    bestScore = scorePlan(currentPlan);
    addLog('info', `Baseline plan score: ${bestScore}`);
    setQueryResult({ rows: [], columns: [], explanation: currentPlan, executionTime: 0 });

    while (iteration < MAX_ITERATIONS && improved) {
      iteration++;
      improved = false;
      addLog('info', `─── Iteration ${iteration}/${MAX_ITERATIONS} ───`);

      // 1. Optimize — pass current plan as context
      addLog('info', '[1/4] Optimizing with plan context...');
      let newSql: string;
      let explanation: string;
      try {
        const result = await optimizeSnowflakeSql(currentSql, currentPlan);
        newSql = formatSql(result.optimizedSql);
        explanation = result.explanation;
      } catch (e) {
        addLog('error', 'Optimization call failed. Stopping.');
        break;
      }

      // 2. Validate syntax
      addLog('info', '[2/4] Validating syntax...');
      if (pyodideReady) {
        try {
          const check = await transpileSql(newSql, 'snowflake', 'snowflake');
          if (check.error) {
            addLog('warning', `Syntax invalid: ${check.error}. Stopping.`);
            break;
          }
        } catch (e) { /* non-fatal */ }
      }

      // 3. Execute to verify correctness
      addLog('info', '[3/4] Executing to verify...');
      let runnableSql = newSql;
      if (pyodideReady) {
        try {
          const trans = await transpileSql(newSql, 'snowflake');
          if (trans.sql) runnableSql = trans.sql;
        } catch (e) {}
      }
      const execResult = await runQuery(runnableSql);
      if (execResult.error) {
        addLog('error', `Execution failed: ${execResult.error}. Stopping.`);
        break;
      }
      addLog('success', `Executed: ${execResult.rows.length} rows.`);

      // 4. Explain new plan and compare scores
      addLog('info', '[4/4] Scoring new execution plan...');
      const newPlan = await explainQuery(runnableSql);
      const newScore = scorePlan(newPlan);
      const delta = bestScore - newScore;
      addLog(newScore < bestScore ? 'success' : 'info',
        `Plan score: ${bestScore} → ${newScore} (${delta > 0 ? `−${delta} improved` : 'no improvement'})`);

      if (newScore < bestScore) {
        bestScore = newScore;
        currentSql = newSql;
        currentPlan = newPlan;
        setSql(newSql);
        setQueryResult({ ...execResult, explanation: newPlan });
        addLog('success', `Iteration ${iteration}: Applied. Strategy: ${explanation}`);
        improved = true;
      } else {
        addLog('info', `Iteration ${iteration}: Plan did not improve. Stopping.`);
        setResultsTab('results');
      }
    }

    addLog('success', `Auto-Optimizer done: ${iteration} iteration(s), final score ${bestScore}.`);
    setIsProcessing(false);
  };

  const runEval = async (ev: EvalCase): Promise<EvalRun> => {
    const t0 = performance.now();
    let generatedSql = '';
    let execResult: QueryResult = { rows: [], columns: [] };

    try {
      generatedSql = formatSql(await generateSnowflakeSql(ev.prompt, ''));
      let runnableSql = generatedSql;
      if (pyodideReady) {
        try { const t = await transpileSql(generatedSql, 'snowflake'); if (t.sql) runnableSql = t.sql; } catch (e) {}
      }
      execResult = await runQuery(runnableSql);
    } catch (err: any) {
      return { evalId: ev.id, runAt: new Date().toISOString(), passed: false, generatedSql, executionTimeMs: performance.now() - t0, assertions: [], error: err.message || 'Unknown error' };
    }

    const assertionResults = ev.assertions.map(a => {
      switch (a.type) {
        case 'no_error':         return { label: a.label, passed: !execResult.error,                                              actual: execResult.error || null };
        case 'returns_rows':     return { label: a.label, passed: !execResult.error && execResult.rows.length > 0,                actual: `${execResult.rows.length} rows` };
        case 'row_count_equals': return { label: a.label, passed: execResult.rows.length === (a.params?.count ?? 0),             actual: `${execResult.rows.length} rows` };
        case 'row_count_gte':    return { label: a.label, passed: execResult.rows.length >= (a.params?.min ?? 1),                actual: `${execResult.rows.length} rows` };
        case 'has_column':       return { label: a.label, passed: execResult.columns.includes(a.params?.value ?? ''),            actual: execResult.columns.join(', ') };
        case 'sql_contains':     return { label: a.label, passed: generatedSql.toLowerCase().includes((a.params?.value ?? '').toLowerCase()), actual: null };
        case 'sql_not_contains': return { label: a.label, passed: !generatedSql.toLowerCase().includes((a.params?.value ?? '').toLowerCase()), actual: null };
        default:                 return { label: a.label, passed: false, actual: 'unknown' };
      }
    });

    return {
      evalId: ev.id,
      runAt: new Date().toISOString(),
      passed: !execResult.error && assertionResults.every(r => r.passed),
      generatedSql,
      executionTimeMs: performance.now() - t0,
      assertions: assertionResults,
    };
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

      <EvalManager
        isOpen={isEvalsOpen}
        onClose={() => setIsEvalsOpen(false)}
        onRunEval={runEval}
      />

      {/* Header */}
      <header className="h-16 border-b border-martian-border flex items-center justify-between px-6 bg-martian-surface/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
                 <Bot className="w-5 h-5 text-martian-primary" />
                 <span className="font-display text-sm font-bold text-white tracking-tight">ArcSQL</span>
             </div>

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
                onClick={() => setIsEvalsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-omop-emerald/10 border border-omop-emerald/30 text-omop-emerald hover:bg-omop-emerald/20 transition-all text-sm font-medium"
            >
                <FlaskConical className="w-4 h-4" />
                Evals
            </button>

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
                                <button
                                    onClick={() => setResultsTab('history')}
                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${resultsTab === 'history' ? 'border-omop-cyan text-omop-cyan' : 'border-transparent text-martian-muted hover:text-white'}`}
                                >
                                    <Clock className="w-3.5 h-3.5" />
                                    History {queryHistory.length > 0 && <span className="text-[9px] bg-omop-cyan/20 text-omop-cyan px-1 rounded">{queryHistory.length}</span>}
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
                                                const isExpanded = expandedTables.has(t);
                                                const schema = tableSchemas[t];
                                                return (
                                                    <div key={t} className="rounded-lg border border-martian-border/50 overflow-hidden">
                                                        <div
                                                            className="flex items-center justify-between gap-3 text-sm text-martian-text/90 px-3 py-2 bg-martian-surface/30 hover:border-martian-primary/50 cursor-pointer group transition-all"
                                                            onClick={() => toggleTableExpand(t)}
                                                        >
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-martian-muted/60 shrink-0">
                                                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                                                </span>
                                                                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isRemote ? 'bg-omop-amber/10 text-omop-amber' : 'bg-omop-slate/10 text-omop-slate'}`}>
                                                                    {isRemote ? <Globe className="w-3.5 h-3.5" /> : <Table className="w-3.5 h-3.5" />}
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-medium truncate text-sm">{t}</span>
                                                                    <span className="text-[10px] text-martian-muted uppercase tracking-tight">
                                                                        {isRemote ? 'Remote' : 'Local'}{schema ? ` · ${schema.length} cols` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleExport(t); }}
                                                                className="p-1.5 text-martian-muted hover:text-white hover:bg-martian-subtle rounded transition-all shrink-0"
                                                                title="Export to Parquet"
                                                            >
                                                                <HardDrive className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="bg-black/20 border-t border-martian-border/30">
                                                                {!schema && (
                                                                    <div className="flex items-center gap-2 px-4 py-2 text-[10px] text-martian-muted">
                                                                        <Loader2 className="w-3 h-3 animate-spin" /> Loading schema...
                                                                    </div>
                                                                )}
                                                                {schema && schema.length === 0 && (
                                                                    <div className="px-4 py-2 text-[10px] text-martian-muted italic">No columns found.</div>
                                                                )}
                                                                {schema && schema.map(col => (
                                                                    <div key={col.name} className="flex items-center justify-between px-4 py-1 hover:bg-martian-surface/20 group/col">
                                                                        <div className="flex items-center gap-2">
                                                                            {col.pk > 0 && <span className="text-[8px] text-omop-amber font-bold uppercase">PK</span>}
                                                                            <span className="text-[11px] font-mono text-martian-text/90">{col.name}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {col.notnull > 0 && <span className="text-[8px] text-martian-muted/60">NOT NULL</span>}
                                                                            <span className="text-[10px] font-mono text-omop-cyan/70">{col.type}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
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

                                {resultsTab === 'history' && (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2 border-b border-martian-border/50 shrink-0">
                                            <span className="text-[10px] font-bold text-martian-muted uppercase tracking-wider">
                                                Last {queryHistory.length} queries
                                            </span>
                                            {queryHistory.length > 0 && (
                                                <button
                                                    onClick={() => { setQueryHistory([]); localStorage.removeItem('arcsql_history'); }}
                                                    className="flex items-center gap-1 text-[10px] text-martian-muted hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Clear
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {queryHistory.length === 0 && (
                                                <div className="p-8 text-center text-martian-muted text-xs opacity-60">
                                                    No queries yet. Run a query to start building history.
                                                </div>
                                            )}
                                            {queryHistory.map(h => (
                                                <div
                                                    key={h.id}
                                                    className="border-b border-martian-border/30 px-4 py-3 hover:bg-martian-surface/30 group cursor-pointer transition-colors"
                                                    onClick={() => { setSql(h.sql); setResultsTab('results'); }}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-mono text-martian-muted">{h.timestamp}</span>
                                                        <div className="flex items-center gap-2 text-[10px] text-martian-muted">
                                                            {h.statementCount > 1 && <span className="bg-omop-amber/20 text-omop-amber px-1 rounded">{h.statementCount} stmts</span>}
                                                            <span>{h.executionTime.toFixed(0)}ms</span>
                                                        </div>
                                                    </div>
                                                    <pre className="text-[11px] font-mono text-martian-text/80 line-clamp-2 whitespace-pre-wrap break-all leading-relaxed">
                                                        {h.sql.trim().slice(0, 120)}{h.sql.trim().length > 120 ? '…' : ''}
                                                    </pre>
                                                    <span className="text-[10px] text-omop-cyan opacity-0 group-hover:opacity-100 transition-opacity mt-1 inline-block">
                                                        Click to load →
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Bar */}
                <div className="border-t border-martian-border bg-martian-surface/40 backdrop-blur-xl sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">

                    {/* Mode Selector */}
                    <div className="flex border-b border-martian-border/50">
                        {([
                            { m: AppMode.BUILDER,   Icon: Wand2,           label: 'Build',    desc: 'Write SQL from a description',          active: 'border-martian-primary text-martian-primary bg-martian-primary/5',   inactive: 'border-transparent text-martian-muted hover:bg-martian-surface/50' },
                            { m: AppMode.OPTIMIZER, Icon: Zap,             label: 'Optimize', desc: 'Rewrite editor SQL for performance',     active: 'border-omop-cyan text-omop-cyan bg-omop-cyan/5',                     inactive: 'border-transparent text-martian-muted hover:bg-martian-surface/50' },
                            { m: AppMode.CONVERTER, Icon: ArrowRightLeft,  label: 'Convert',  desc: 'Translate to another SQL dialect',       active: 'border-omop-magenta text-omop-magenta bg-omop-magenta/5',           inactive: 'border-transparent text-martian-muted hover:bg-martian-surface/50' },
                        ] as const).map(({ m, Icon, label, desc, active, inactive }) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 flex items-center gap-3 px-4 py-3 transition-all border-b-2 text-left ${mode === m ? active : inactive}`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <div>
                                    <div className="font-display text-xs font-bold leading-tight tracking-tight">{label}</div>
                                    <div className="text-[10px] text-martian-muted/60 leading-tight mt-0.5">{desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Mode Content */}
                    <div className="p-4 flex gap-3 items-end">

                        {/* BUILD: textarea + secondary tools */}
                        {mode === AppMode.BUILDER && (
                            <div className="flex-1 flex flex-col gap-2 min-w-0">
                                <textarea
                                    className="w-full bg-martian-bg/80 border border-martian-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-martian-primary transition-all resize-none shadow-inner h-[44px] focus:h-[72px] focus:bg-black/50"
                                    placeholder="Describe the SQL you want — e.g. 'Show top 10 customers by revenue last quarter'"
                                    value={nlPrompt}
                                    onChange={(e) => setNlPrompt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerateSql(); } }}
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-martian-muted/40 mr-0.5">Tools:</span>
                                    <button onClick={handleGenerateData} disabled={isProcessing} title="Generate a table with realistic mock data from a description" className="flex items-center gap-1.5 bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text/80 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-40">
                                        <Table className="w-3 h-3 text-martian-muted" /> Mock Data
                                    </button>
                                    <button onClick={handleMlPrep} disabled={isProcessing} title="Generate one-hot encoding, label encoding, or scaling SQL for a column" className="flex items-center gap-1.5 bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text/80 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-40">
                                        <Binary className="w-3 h-3 text-martian-muted" /> ML Features
                                    </button>
                                    <button onClick={handleVectorOp} disabled={isProcessing || (!vssReady && !ftsReady)} title="Generate vector similarity or full-text search SQL using DuckDB extensions" className="flex items-center gap-1.5 bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text/80 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-40">
                                        <Radar className="w-3 h-3 text-martian-muted" /> Vector Search
                                    </button>
                                    <div className="w-px bg-martian-border h-3.5 mx-0.5" />
                                    <button onClick={handleAutoArchitect} disabled={isProcessing} title="AI agent that designs schema, creates tables with mock data, and runs the analysis — all in one step" className="flex items-center gap-1.5 bg-gradient-to-r from-martian-primary/20 to-omop-indigo/20 border border-martian-primary/40 hover:border-martian-primary/70 text-martian-primary px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap disabled:opacity-40 active:scale-95">
                                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Agent
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* OPTIMIZE: description card */}
                        {mode === AppMode.OPTIMIZER && (
                            <div className="flex-1 bg-omop-cyan/5 border border-omop-cyan/20 rounded-xl px-4 py-3">
                                <p className="text-sm font-semibold text-omop-cyan">Optimize SQL in editor</p>
                                <p className="text-[11px] text-martian-muted mt-0.5 leading-relaxed">Rewrites your current query for Snowflake performance — clustering keys, partition pruning, window function rewrites, and unnecessary join elimination.</p>
                                <div className="flex items-start gap-3 mt-3 pt-3 border-t border-omop-cyan/10">
                                    <div className="flex-1">
                                        <p className="text-[11px] font-semibold text-omop-cyan/80">Auto-Optimize loop</p>
                                        <p className="text-[10px] text-martian-muted leading-relaxed mt-0.5">Runs up to 5 iterations of: explain → optimize → validate → execute. Scores each plan and stops when it can't improve further. Shows progress in Logs.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* CONVERT: dialect pills + description */}
                        {mode === AppMode.CONVERTER && (
                            <div className="flex-1 bg-omop-magenta/5 border border-omop-magenta/20 rounded-xl px-4 py-3">
                                <p className="text-sm font-semibold text-omop-magenta">Convert SQL dialect</p>
                                <p className="text-[11px] text-martian-muted mt-0.5 mb-2.5 leading-relaxed">Translates the editor SQL from Snowflake to your chosen dialect using SQLGlot — runs entirely in your browser, no server call.</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-martian-muted/50 mr-0.5">To:</span>
                                    {([['tsql','T-SQL'],['postgres','PostgreSQL'],['bigquery','BigQuery'],['snowflake','Snowflake']] as const).map(([val, label]) => (
                                        <button
                                            key={val}
                                            onClick={() => setTargetDialect(val)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${targetDialect === val ? 'bg-omop-magenta text-white border-omop-magenta shadow-lg shadow-omop-magenta/20' : 'border-martian-border text-martian-muted hover:text-white hover:border-martian-border/80'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Primary action buttons — always visible */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                            {mode === AppMode.BUILDER && (
                                <button
                                    onClick={handleGenerateSql}
                                    disabled={isProcessing || !nlPrompt.trim()}
                                    className="bg-martian-primary hover:bg-martian-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale shadow-lg shadow-martian-primary/20"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    Generate
                                </button>
                            )}
                            {mode === AppMode.OPTIMIZER && (
                                <>
                                    <button
                                        onClick={handleAutoOptimize}
                                        disabled={isProcessing || !duckDbReady}
                                        title="Iterative loop: explain → optimize → validate → execute. Repeats until plan score stops improving."
                                        className="bg-omop-cyan hover:bg-omop-cyan/90 text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale shadow-lg shadow-omop-cyan/20"
                                    >
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        Auto-Optimize
                                    </button>
                                    <button
                                        onClick={handleOptimize}
                                        disabled={isProcessing}
                                        title="Single-pass optimization — faster, one Gemini call."
                                        className="border border-omop-cyan/40 hover:border-omop-cyan/70 text-omop-cyan hover:bg-omop-cyan/10 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale"
                                    >
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                        Once
                                    </button>
                                </>
                            )}
                            {mode === AppMode.CONVERTER && (
                                <button
                                    onClick={handleConvert}
                                    disabled={isProcessing || !pyodideReady}
                                    className="bg-omop-magenta hover:bg-omop-magenta/90 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale shadow-lg shadow-omop-magenta/20"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                                    Convert
                                </button>
                            )}
                            <button
                                onClick={handleExplain}
                                disabled={isProcessing || !duckDbReady}
                                className="bg-omop-amber/90 hover:bg-omop-amber text-black px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale"
                                title="Show DuckDB execution plan for the current query"
                            >
                                <GitMerge className="w-4 h-4" /> Explain
                            </button>
                            <button
                                onClick={handleRunQuery}
                                disabled={isProcessing || !duckDbReady}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale shadow-lg shadow-green-900/30"
                                title="Execute SQL in DuckDB"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                Run SQL
                            </button>
                        </div>
                    </div>
                </div>
        </main>
      </div>

    </div>
  );
}