
export interface QueryResult {
  columns: string[];
  rows: any[];
  executionTime?: number;
  error?: string;
  explanation?: string;
}

export enum AppMode {
  BUILDER = 'BUILDER',
  OPTIMIZER = 'OPTIMIZER',
  CONVERTER = 'CONVERTER'
}

export interface TableSchema {
  tableName: string;
  columns: { name: string; type: string }[];
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export interface DataSource {
  name: string;
  url: string;
  type: 'parquet' | 'csv' | 'json' | 'iceberg' | 'duckdb' | 'supabase';
  key?: string;
}

export interface ExecutionPlan {
  tables: {
    tableName: string;
    schemaSql: string;
    data: any[];
  }[];
  finalSql: string;
  explanation: string;
}

export interface MlRequest {
  tableName: string;
  columnName: string;
  operation: 'one_hot' | 'label' | 'min_max_scale' | 'z_score_scale';
}

export type AssertionType =
  | 'no_error'
  | 'returns_rows'
  | 'row_count_equals'
  | 'row_count_gte'
  | 'has_column'
  | 'sql_contains'
  | 'sql_not_contains';

export interface EvalAssertion {
  type: AssertionType;
  label: string;
  params?: Record<string, any>;
}

export interface EvalCase {
  id: string;
  name: string;
  prompt: string;
  assertions: EvalAssertion[];
  createdAt: string;
}

export interface AssertionResult {
  label: string;
  passed: boolean;
  actual?: string | null;
}

export interface EvalRun {
  evalId: string;
  runAt: string;
  passed: boolean;
  generatedSql: string;
  executionTimeMs: number;
  assertions: AssertionResult[];
  error?: string;
}

export interface HistoryEntry {
  id: string;
  sql: string;
  timestamp: string;
  executionTime: number;
  statementCount: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

// Minimal type for Pyodide
export interface PyodideInterface {
  loadPackage: (packages: string | string[]) => Promise<void>;
  runPythonAsync: (code: string) => Promise<any>;
  runPython: (code: string) => any;
  globals: any;
}
