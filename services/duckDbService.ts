import * as duckdb from '@duckdb/duckdb-wasm';
import { QueryResult, ColumnInfo } from '../types';
import { getSupabaseClient } from './supabaseService.js';

export const splitSqlStatements = (sql: string): string[] => {
  const stmts: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    if (!inString) {
      if (ch === '-' && sql[i + 1] === '-') {
        while (i < sql.length && sql[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && sql[i + 1] === '*') {
        i += 2;
        while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"') { inString = true; stringChar = ch; }
      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed) stmts.push(trimmed);
        current = '';
        i++;
        continue;
      }
    } else {
      if (ch === stringChar) {
        if (sql[i + 1] === stringChar) { current += ch; i++; }
        else inString = false;
      }
    }
    current += ch;
    i++;
  }
  const trimmed = current.trim();
  if (trimmed) stmts.push(trimmed);
  return stmts;
};

export const getTableSchema = async (tableName: string): Promise<ColumnInfo[]> => {
  if (!conn) return [];
  try {
    const res = await conn.query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
    return res.toArray().map(r => r.toJSON()) as ColumnInfo[];
  } catch (e) {
    return [];
  }
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;
let vssEnabled = false;
let ftsEnabled = false;

// Explicitly define bundles to ensure matching versions and Iceberg/VSS support
const DUCKDB_VERSION = '1.28.1-dev106.0';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist`;

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: `${CDN_BASE}/duckdb-mvp.wasm`,
        mainWorker: `${CDN_BASE}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
        mainModule: `${CDN_BASE}/duckdb-eh.wasm`,
        mainWorker: `${CDN_BASE}/duckdb-browser-eh.worker.js`,
    },
};

export const initDuckDB = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (db) return;

    // Use selectBundle with manual config
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    conn = await db.connect();

    // Configure extensions for Client-as-a-Server pattern
    try {
      // 1. Enable HTTPFS for remote file reading
      // Usually built-in for WASM, but explicit configuration helps for signed URLs
      
      // 2. Install/Load VSS (Vector Similarity Search)
      try {
          await conn.query(`
            INSTALL vss; 
            LOAD vss;
          `);
          vssEnabled = true;
          console.log("VSS Extension Loaded");
      } catch(e) {
          console.warn("VSS extension load skipped (not available in this build):", e);
      }

      // 3. Install/Load Iceberg
      await conn.query(`
        INSTALL iceberg; 
        LOAD iceberg;
      `).then(() => console.log("Iceberg Extension Loaded"))
        .catch(e => console.warn("Iceberg extension load skipped:", e));

      // 4. ML/Preprocessing
      await conn.query(`INSTALL json; LOAD json;`).catch(() => {});

      // 5. Full Text Search (Text Analytics)
      try {
          await conn.query(`
            INSTALL fts; 
            LOAD fts;
          `);
          ftsEnabled = true;
          console.log("FTS Extension Loaded");
      } catch (e) {
          console.warn("FTS extension load skipped:", e);
      }

      // Allow unsigned extensions just in case
      await conn.query("SET allow_unsigned_extensions = true;");
      
    } catch (e) {
      console.warn("Extension configuration warning:", e);
    }
  })();

  return initPromise;
};

export const isVssAvailable = () => vssEnabled;
export const isFtsAvailable = () => ftsEnabled;

export const runQuery = async (sql: string): Promise<QueryResult> => {
  if (!conn) {
    throw new Error("DuckDB not initialized");
  }

  const start = performance.now();
  try {
    const result = await conn.query(sql);
    const rows = result.toArray().map((r) => r.toJSON());
    const columns = result.schema.fields.map((f) => f.name);
    
    const end = performance.now();
    return {
      rows,
      columns,
      executionTime: end - start
    };
  } catch (error: any) {
    return {
      rows: [],
      columns: [],
      error: error.message
    };
  }
};

export const explainQuery = async (sql: string): Promise<string> => {
    if (!conn) throw new Error("DB not init");
    try {
        const result = await conn.query(`EXPLAIN ${sql}`);
        // DuckDB EXPLAIN returns a table where 'explain_value' usually contains the tree
        const rows = result.toArray().map(r => r.toJSON());
        if(rows.length > 0 && rows[0].explain_value) {
            return rows.map(r => r.explain_value).join('\n');
        }
        // Fallback for some versions that might return logical_plan key
        if(rows.length > 0 && rows[0]['logical_plan']) {
             return rows[0]['logical_plan'];
        }
        return "No explanation returned.";
    } catch (e: any) {
        return `Failed to explain query: ${e.message}`;
    }
};

export const createTable = async (tableName: string, schemaSql: string, dataRows: any[]) => {
  if (!conn) throw new Error("DB not init");
  
  try {
      // Use CREATE OR REPLACE TABLE to be idempotent and handle concurrent calls better
      const safeSchemaSql = schemaSql.replace(/CREATE\s+TABLE/i, 'CREATE OR REPLACE TABLE');
      await conn.query(safeSchemaSql);

      if (dataRows.length > 0) {
        const keys = Object.keys(dataRows[0]);
        const values = dataRows.map(row => {
            const vals = keys.map(k => {
                const v = row[k];
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
                return v;
            }).join(', ');
            return `(${vals})`;
        }).join(',\n');
        
        await conn.query(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES ${values};`);
      }
      return true;
  } catch (e) {
      console.error("Error creating table", e);
      return false;
  }
};

export const registerRemoteTable = async (
    name: string, 
    url: string, 
    type: 'parquet' | 'csv' | 'json' | 'iceberg' | 'duckdb' | 'supabase',
    key?: string
) => {
  if (!conn) throw new Error("DB not init");

  try {
    // Clean up any existing connection/view with this name
    try { await conn.query(`DETACH "${name}";`); } catch (e) {}
    await conn.query(`DROP VIEW IF EXISTS "${name}";`);
    await conn.query(`DROP TABLE IF EXISTS "${name}";`);

    const safeUrl = url.replace(/'/g, "''");
    let sql = "";
    switch (type) {
      case 'duckdb': {
        // Attach encrypted or standard DuckDB file
        // Syntax: ATTACH 'url' AS alias (TYPE DUCKDB, READ_ONLY, KEY '...');
        const safeKey = key ? key.replace(/'/g, "''") : '';
        const keyPart = safeKey ? `, KEY '${safeKey}'` : '';
        sql = `ATTACH '${safeUrl}' AS "${name}" (TYPE DUCKDB, READ_ONLY${keyPart});`;
        break;
      }
      case 'parquet':
        sql = `CREATE VIEW "${name}" AS SELECT * FROM read_parquet('${safeUrl}');`;
        break;
      case 'csv':
        sql = `CREATE VIEW "${name}" AS SELECT * FROM read_csv_auto('${safeUrl}');`;
        break;
      case 'json':
        sql = `CREATE VIEW "${name}" AS SELECT * FROM read_json_auto('${safeUrl}');`;
        break;
      case 'iceberg':
        sql = `CREATE VIEW "${name}" AS SELECT * FROM iceberg_scan('${safeUrl}');`;
        break;
      case 'supabase': {
        if (!db) throw new Error("DuckDB instance not loaded");
        const headers: Record<string, string> = {};
        if (key) {
          headers['apikey'] = key;
          headers['Authorization'] = `Bearer ${key}`;
        }
        
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const errMsg = await response.text().catch(() => '');
          throw new Error(`Supabase REST Endpoint error (${response.status}): ${errMsg || response.statusText}`);
        }
        
        const jsonResult = await response.json();
        if (!Array.isArray(jsonResult)) {
          throw new Error("Supabase response must be a JSON array of records.");
        }

        if (jsonResult.length === 0) {
          throw new Error("Selected Supabase table is empty. Please add some rows first.");
        }

        const fileName = `${name}_supabase_temp.json`;
        const buffer = new TextEncoder().encode(JSON.stringify(jsonResult));
        await db.registerFileBuffer(fileName, buffer);
        sql = `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_json_auto('${fileName}');`;
        break;
      }
    }

    await conn.query(sql);

    if (type === 'supabase') {
      try {
        const fileName = `${name}_supabase_temp.json`;
        await db?.dropFile(fileName);
      } catch (e) {}
    }

    return true;
  } catch (e: any) {
    console.error(`Failed to register remote table ${name}:`, e);
    throw new Error(e.message);
  }
};

export const disconnectSource = async (name: string) => {
    if (!conn) return;
    try { await conn.query(`DETACH "${name}";`); } catch (e) {}
    try { await conn.query(`DROP VIEW IF EXISTS "${name}";`); } catch (e) {}
    try { await conn.query(`DROP TABLE IF EXISTS "${name}";`); } catch (e) {}
};

export const getTableNames = async (): Promise<string[]> => {
    if (!conn) return [];
    try {
        const res = await conn.query(`SHOW TABLES`);
        return res.toArray().map(r => r.name);
    } catch (e) {
        return [];
    }
}

export const exportTable = async (tableName: string, format: 'parquet' | 'csv' = 'parquet') => {
    if (!conn || !db) throw new Error("DB not init");
    
    const fileName = `${tableName}_export.${format}`;
    const copySql = `COPY (SELECT * FROM ${tableName}) TO '${fileName}' (FORMAT '${format.toUpperCase()}');`;
    
    try {
        await conn.query(copySql);
        
        // Copy from WASM FS to Blob
        const buffer = await db.copyFileToBuffer(fileName);
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Cleanup WASM FS
        await db.dropFile(fileName);
        
        return true;
    } catch (e: any) {
        console.error("Export failed:", e);
        throw new Error(`Export failed: ${e.message}`);
    }
};

export const registerSupabaseSdkTable = async (
    name: string, 
    supabaseTableName: string
) => {
  if (!conn) throw new Error("DuckDB not initialized");
  if (!db) throw new Error("DuckDB instance not loaded");

  const client = getSupabaseClient();
  if (!client) {
      throw new Error("Supabase is not configured yet. Configure URL and Anon Key in the Supabase Workspace tab.");
  }

  try {
      // Clear existing views/tables under this name
      try { await conn.query(`DETACH "${name}";`); } catch (e) {}
      await conn.query(`DROP VIEW IF EXISTS "${name}";`);
      await conn.query(`DROP TABLE IF EXISTS "${name}";`);

      // Fetch rows using authenticated Supabase Client SDK
      const { data, error } = await client.from(supabaseTableName).select('*');
      if (error) {
          throw new Error(`Supabase query error: ${error.message} (${error.code || ''})`);
      }

      if (!data || data.length === 0) {
          throw new Error(`The Supabase table '${supabaseTableName}' returned 0 rows or is empty.`);
      }

      const fileName = `${name}_supabase_temp.json`;
      const buffer = new TextEncoder().encode(JSON.stringify(data));
      await db.registerFileBuffer(fileName, buffer);
      
      const sql = `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_json_auto('${fileName}');`;
      await conn.query(sql);

      try {
          await db.dropFile(fileName);
      } catch (e) {}

      return true;
  } catch (e: any) {
      console.error(`Failed to register dynamic Supabase table ${name}:`, e);
      throw new Error(e.message);
  }
};

