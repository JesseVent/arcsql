# ArcSQL — Features & Agentic Functionality

## What ArcSQL is

A browser-native SQL workbench powered by Gemini and DuckDB WASM. Your data stays in the browser. Only PII-scrubbed prompts leave the machine to reach the Gemini API. The SQL engine, dialect transpiler, and all results run entirely client-side.

---

## Execution Engine

### In-browser SQL (DuckDB WASM)

Every query runs against a real DuckDB instance compiled to WebAssembly, loaded once at startup. No server query path, no round-trips for data.

**Outcomes:**
- Full SQL execution in milliseconds
- Results displayed in a sortable, scrollable table with execution time
- Multi-statement scripts (`;`-separated) execute sequentially; each statement logs its own row count and timing

**Extensions loaded at boot:**
- **VSS** — vector similarity search via HNSW indexes
- **FTS** — full-text search via BM25 (`match_bm25`)
- **Iceberg** — read Iceberg tables directly from a URL
- **JSON** — JSON file reading and unnesting

### SQL Editor

Monaco-style editor (react-simple-code-editor + Prism) with Snowflake SQL syntax highlighting. Validates syntax live via SQLGlot (Pyodide) with a 500ms debounce — errors appear in-editor before you run anything.

**Outcomes:**
- Catch syntax errors before execution
- Save the current query as a `.sql` file
- Load any `.sql` or `.txt` file from disk into the editor

---

## AI Modes

Three modes control what the prompt textarea and primary button do. The mode selector shows each one's purpose inline.

### Build — Write SQL from a description

**How it works:** Your natural-language prompt + the current editor SQL are sent to Gemini with a Snowflake expert system instruction. The model returns SQL that is then formatted (sql-formatter, Snowflake dialect, uppercase keywords) and placed in the editor.

**Outcomes:**
- New SQL in the editor, ready to run or iterate on
- Prompt can reference tables already loaded (e.g. "show top customers from the customers table")
- Current editor content is included as context so you can ask for modifications ("add a WHERE clause for region = US")

### Optimize — Rewrite editor SQL for performance

**How it works:** The current editor SQL is sent to Gemini with a request to analyze for Snowflake performance issues. The model returns a JSON object: `{ optimizedSql, explanation }`. The optimized SQL replaces the editor content.

**What it looks for:**
- Clustering key usage and partition pruning
- Unnecessary joins and subqueries
- Window function rewrites (replacing correlated subqueries)
- Missing QUALIFY clauses
- Aggregation and grouping efficiency

**Outcomes:**
- Rewritten SQL in the editor
- Markdown explanation in the Logs tab describing what changed and why

### Convert — Translate to another SQL dialect

**How it works:** Uses SQLGlot running inside Pyodide (Python in the browser). No Gemini call — entirely local. Parses the editor SQL as Snowflake and transpiles to the selected target.

**Supported targets:** T-SQL · PostgreSQL · BigQuery · Snowflake

**Outcomes:**
- Editor SQL replaced with the translated version
- Runs instantly (no network call)
- Handles function name mapping, date syntax, string functions, window frame syntax

---

## Agentic Features

These features involve multi-step reasoning, tool use, or autonomous decision-making beyond a single prompt → response.

### Auto-Architect (AI Agent)

The most capable agentic feature. Uses **Gemini function calling** (tool use) — the model receives two tools and decides when and how to call them.

**Tools available to the model:**
- `create_table(tableName, schemaSql, data[])` — creates a DuckDB table with provided schema and row data
- `run_sql_query(sql)` — executes a SQL statement and returns results

**How it works:**
1. Your prompt is sent to Gemini alongside the tool definitions
2. Gemini designs a schema, generates mock data, and decides which queries to run — returning function call objects rather than text
3. ArcSQL executes each tool call sequentially against DuckDB
4. Results are displayed and the executed SQL appears in the editor

**Example prompt:** *"Analyze churn risk by customer segment for a SaaS company"*

**Outcomes:**
- One or more new tables created in DuckDB with realistic mock data
- Analysis query executed and results displayed
- Editor populated with the final SQL Gemini ran
- Everything is visible in the Tables tab immediately

**What makes it agentic:** The model decides what schema to create, what data to generate, and what queries to write — you describe an outcome, not steps.

### Auto-Fix Loop

When a query fails execution, ArcSQL automatically attempts to repair it without user intervention.

**How it works:**
1. Query runs and returns an error from DuckDB
2. The failing SQL + error message + list of available table names are sent to Gemini's `fixSqlError` function
3. Gemini returns corrected SQL
4. The fixed SQL replaces the editor content and re-runs
5. Repeats up to 2 times with 500ms backoff between attempts

**What it fixes:**
- Table or column name mismatches (suggests closest available table)
- Snowflake-specific syntax that DuckDB doesn't support
- Missing casts, type errors, malformed date literals

**Outcomes:**
- Working query with no manual intervention
- "Agent: Fixed SQL syntax" confirmation in the Logs tab
- Fixed SQL visible in the editor (transparent — you see what changed)

**Note:** Auto-fix only applies to single-statement runs. Multi-statement scripts skip it to avoid cascading unpredictable rewrites.

### ML Features

A two-step agentic pipeline for feature engineering.

**How it works:**
1. **Parse** — prompt sent to Gemini to extract: table name, column name, operation type (`one_hot`, `label`, `min_max_scale`, `z_score_scale`)
2. **Fetch** — if one-hot encoding is requested, ArcSQL queries DuckDB for distinct values in that column (up to 50)
3. **Generate** — the extracted metadata + distinct values are sent to Gemini to generate the feature engineering SQL

**Supported operations:**
- **One-hot encoding** — `CASE WHEN col = 'X' THEN 1 ELSE 0 END` for each distinct value
- **Label encoding** — `DENSE_RANK()` over the column
- **Min-max scaling** — `(x - min) / (max - min)` using window functions
- **Z-score scaling** — `(x - avg) / stddev` using window functions

**Example prompt:** *"One hot encode region in customers"*

**Outcomes:**
- SQL SELECT with new feature columns added, ready to run or save as a view
- Works against actual data in your DuckDB session (distinct values are real, not assumed)

### Mock Data Generation

Describe a dataset; Gemini designs the schema and populates it.

**How it works:** Prompt is sent to Gemini requesting a JSON response: `{ tableName, schemaSql, data[] }` with at least 10 rows. ArcSQL then creates the table in DuckDB using the returned schema and data.

**Special handling:**
- If your prompt mentions "vectors" or "embeddings" — creates a `FLOAT[]` column with random array data so vector search features work immediately
- If your prompt mentions "text search" — ensures a long VARCHAR column with searchable content is included

**Outcomes:**
- New table in DuckDB with realistic rows
- Table appears immediately in the Tables tab
- Can be queried, exported, or used as input to other features

### Vector Search SQL Generation

Generates DuckDB VSS and FTS SQL from a plain-English description.

**How it works:** Prompt is sent to Gemini with full context on DuckDB's `vss` and `fts` extensions, available syntax, and the current tables. Returns ready-to-run SQL.

**Generated patterns:**
- `array_cosine_similarity(vec_a, vec_b)` for vector similarity
- `CREATE INDEX ... USING HNSW (vector_column)` for index creation
- `PRAGMA create_fts_index(...)` + `match_bm25(...)` for text search
- **Hybrid search** — CTE combining normalized vector score + BM25 score

**Outcomes:**
- SQL in the editor ready to run against your data
- If text search is involved, the FTS index PRAGMA is prepended automatically

---

## Data Sources

### Local Tables
Seed data is loaded at startup (customers, orders, claims). Any table created via Mock Data or Auto-Architect persists for the session.

### Remote Files (URL)
Connect via the Data Source Manager. Supported:
- **Parquet** — `read_parquet('url')`
- **CSV** — `read_csv_auto('url')`
- **JSON** — `read_json_auto('url')`
- **Iceberg** — `iceberg_scan('url')`
- **Encrypted DuckDB** — `ATTACH 'url' AS alias (TYPE DUCKDB, READ_ONLY, KEY '...')`

These become queryable views in DuckDB immediately.

### Supabase
Two connection methods:
- **SDK** — uses the Supabase JS client with authenticated session; fetches via `from(table).select('*')`
- **REST** — direct fetch to the Supabase REST endpoint with apikey header

Both materialise the data as a local DuckDB table for the session. Supabase credentials can be set at runtime in the UI — no restart required.

---

## Workflow Tools

### Schema Browser
Click any table in the Tables tab to expand its columns inline. Shows column name, type, PK badge, and NOT NULL marker. Schema is fetched once and cached for the session.

### Query History
Last 50 successful queries stored in `localStorage`. Each entry shows timestamp, execution time, and statement count for scripts. Click any entry to reload it into the editor. Persists across page refreshes.

### SQL Snippets
Save any query with a name via the Snippet Manager. Snippets persist to `localStorage`. Load from the sidebar or the global search. Useful for recurring queries, templates, or reference SQL.

### Global Search (`⌘K`)
Searches three sources simultaneously as you type:
- **Tables** — by name
- **Snippets** — by name and SQL content
- **Data** — "Deep Search" scans VARCHAR/TEXT columns in all loaded tables via `ILIKE`

Selecting a result loads the relevant SQL into the editor.

### Export
Any table can be exported to Parquet via the Tables tab. Triggers a browser download. Uses DuckDB's `COPY ... TO '...' (FORMAT PARQUET)` internally.

---

## PII Handling

Every prompt sent to Gemini passes through `piiService.ts` first. The scrubber strips:
- Email addresses
- Phone numbers (multiple formats)
- Social Security Numbers
- Credit card numbers
- IPv4 addresses
- Dates of birth (`DOB: MM/DD/YYYY` patterns)
- ZIP codes

Scrubbing is applied to both the user's prompt and any SQL context included with it. The original data in DuckDB is never affected.

---

## Outcomes Summary

| Feature | Input | Output |
|---|---|---|
| Run SQL | SQL in editor | Query results table, execution time |
| Build | Natural-language prompt | Formatted SQL in editor |
| Optimize | SQL in editor | Rewritten SQL + performance explanation |
| Convert | SQL in editor + target dialect | Translated SQL in editor |
| Auto-Architect | Goal description | Tables created + data populated + query results |
| Auto-Fix | Failing query + DuckDB error | Corrected SQL + successful results |
| ML Features | Column + operation description | Feature engineering SELECT |
| Mock Data | Dataset description | New DuckDB table with rows |
| Vector Search | Search goal description | VSS / FTS / hybrid SQL |
| Deep Search | Search term | Matching rows across all tables |
