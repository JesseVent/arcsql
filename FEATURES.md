# ArcSQL — Feature Validation Guide

This document exists so you can confirm that each feature and agentic workflow actually executes end-to-end. Every entry below lists what to do, what observable output confirms it ran, and what failure looks like.

---

## Prerequisites

Before validating any AI feature, confirm the system status indicators in the header are green:
- **Pyodide** — required for SQL syntax validation and Convert mode
- **DuckDB** — required for all query execution
- **VSS / FTS** — optional, required only for Vector Search

Three seed tables are loaded at startup: `customers`, `orders`, `claims`. All validation steps below assume these are present.

---

## 1. SQL Execution

**What to run:**
```sql
SELECT * FROM customers;
```

**Expected output:**
- Results tab shows 3 rows (Acme Corp, Globex, Soylent Corp)
- Execution time appears in the log (e.g. `Query executed: 3 rows.`)
- Columns: `id`, `customer_name`, `region`

**Multi-statement validation:**
```sql
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM orders;
```
**Expected:** Two log entries — `[1/2] 1 rows` and `[2/2] 1 rows` — and the last result shown in the Results tab.

**Failure indicator:** Red error in the Logs tab. DuckDB not ready = Run SQL button is disabled.

---

## 2. Live Syntax Validation

**What to do:** Type invalid SQL in the editor and wait 500ms.

```sql
SELEKT * FORM customers
```

**Expected output:**
- Red "Syntax Error" indicator appears in the editor toolbar
- Error detail shown in the red bar below the editor
- No execution needed — validation runs client-side via SQLGlot

**Failure indicator:** No error shown for clearly invalid SQL means Pyodide hasn't loaded yet.

---

## 3. Build Mode — Generate SQL

**What to do:** Switch to Build mode, type a prompt, press Enter or click Generate.

**Test prompt:** `Show total spend per customer`

**Expected output:**
- Editor content is replaced with formatted Snowflake SQL
- SQL references the `customers` and `orders` tables from the session
- Log entry: `SQL generated & formatted.`

**Validate it runs:** Click Run SQL. Should return rows from the seeded data.

**Failure indicator:** Log entry `Failed to generate SQL.` = Gemini API key missing or invalid. Check `.env.local` for `GEMINI_API_KEY`.

---

## 4. Optimize Mode — Rewrite for Performance

**What to do:** Paste a query into the editor, switch to Optimize, click Optimize.

**Test query:**
```sql
SELECT *
FROM orders o, customers c
WHERE o.customer_id = c.id
AND o.amount > 100;
```

**Expected output:**
- Editor SQL is replaced with a rewritten version (likely using explicit JOIN syntax, possibly adding column selection)
- Log entry: `Optimization complete.`
- Log entry: `Optimization Strategy: [explanation of changes]`

**Validate the explanation:** Check the Logs tab — you should see a plain-English description of what changed and why (e.g. "replaced implicit cross join with explicit INNER JOIN for clarity and optimizer hints").

**Failure indicator:** No change to editor SQL and no log entry = Gemini call failed.

---

## 5. Convert Mode — Dialect Transpilation

**What to do:** Put Snowflake SQL in the editor, switch to Convert, select a target dialect, click Convert.

**Test query (Snowflake):**
```sql
SELECT
  customer_name,
  IFF(region = 'US', 'domestic', 'international') AS market_type
FROM customers
QUALIFY ROW_NUMBER() OVER (PARTITION BY region ORDER BY id) = 1;
```

**Expected output for T-SQL target:**
- `IFF()` becomes `IIF()` or `CASE WHEN`
- `QUALIFY` clause is rewritten as a subquery with `WHERE rn = 1`
- Log entry: `Converted Snowflake to TSQL dialect.`

**No AI call is made.** This runs entirely in Pyodide. If Pyodide is not ready, the Convert button is disabled.

**Failure indicator:** Log entry with error text = SQLGlot could not parse the input. The original SQL may have syntax errors; validate in Build mode first.

---

## 6. Auto-Fix Loop

**What to do:** Run SQL that references a non-existent table.

**Test query:**
```sql
SELECT * FROM customer_orders;
```

**Expected output:**
- Log: `Failed: [error]`
- Log: `Agent: Analyzing error...`
- Gemini is called with the error + list of available tables (`customers`, `orders`, `claims`)
- Editor SQL is updated to reference the correct table (`customers` or `orders`)
- Log: `Agent: Fixed SQL syntax.`
- Query re-runs and returns results

**Validate the fix is visible:** The editor will show the corrected SQL — you can see exactly what the agent changed.

**Failure indicator:** After 2 retries, log shows `Failed: [error]` with no further attempts. Either the error was unfixable or the API key is missing.

---

## 7. Auto-Architect (AI Agent with Tool Use)

This is the primary agentic workflow. Gemini receives tool definitions and decides which to call.

**What to do:** Switch to Build mode, type a prompt, click **AI Agent**.

**Test prompt:** `Analyse product sales performance by category for Q1`

**Expected output (each step visible in logs):**
1. Log: `Creating table: [tableName]...` — Gemini called `create_table`
2. Log: `Creating table: [tableName]...` — repeated for each table the model decides to create
3. Log: `Running query: [sql]...` — Gemini called `run_sql_query`
4. Results tab shows query output
5. Editor is populated with the final SQL that ran
6. Tables tab shows the newly created tables

**Validate tool use occurred:** Open the Tables tab — new tables should exist that were not there before. These were created by the agent's tool calls, not by you.

**Validate the query ran:** Results tab should have data. If the agent created meaningful mock data, the query should return non-empty results.

**Failure indicator:**
- Log: `Auto-Architect failed to execute plan.` = Gemini call error
- Log: `Agent response: [text]` (with no tool calls) = Model chose to respond in text rather than use tools; try a more specific prompt

---

## 8. Mock Data Generation

**What to do:** Switch to Build, type a description, click **Mock Data**.

**Test prompt:** `Healthcare claims with diagnosis codes, procedures, and costs`

**Expected output:**
- Log: `Creating table [tableName]...`
- Log: `Table [tableName] created with [N] rows.`
- New table appears in the Tables tab
- Running `SELECT * FROM [tableName] LIMIT 5` returns realistic rows

**Validate the data:** Run a query against it. If your prompt mentioned "vectors" or "embeddings", a `FLOAT[]` column should be present. If you mentioned "text search", a long VARCHAR column should exist.

**Failure indicator:** Log: `Data generation failed.` = Gemini returned malformed JSON or the create failed. Check the Logs tab for the specific error.

---

## 9. ML Features — Feature Engineering SQL

**What to do:** Load the seed `customers` table, switch to Build, click **ML Features**.

**Test prompt:** `One hot encode region in customers`

**Expected output (3 steps):**
1. Log: `ML Prep: Analyzing request...` — Gemini parses table/column/operation
2. Log: `Target: one_hot on customers.region` — parsed correctly
3. Log: `Fetching distinct values...` — ArcSQL queries DuckDB for real distinct values
4. Log: `Generating feature engineering SQL...`
5. Log: `ML Preprocessing SQL generated.`
6. Editor contains a SELECT with one column per region value (`region_US`, `region_EU`, etc.)

**Validate the pipeline ran:** Click Run SQL. The output should have the original columns plus the new binary indicator columns.

**Validation that distinct values were real:** The column names in the output (e.g. `region_US`, `region_EU`) should match the actual values in the `customers` table, not invented ones.

**Failure indicator:** Log: `Could not identify table or column name from prompt.` = Gemini couldn't parse the intent. Be more explicit: "one hot encode the region column in the customers table."

---

## 10. Vector Search SQL

**Prerequisite:** VSS and/or FTS indicator must show in the header. If absent, these extensions didn't load.

**What to do:** First create a table with vector data:

**Test prompt for Mock Data:** `Product catalog with text descriptions and 5-dimension embeddings`

Then switch to Build and click **Vector Search**.

**Test prompt:** `Find products similar to product id 1 using vector similarity`

**Expected output:**
- Editor contains a valid DuckDB VSS query using `array_cosine_similarity()`
- If a text search was requested, a `PRAGMA create_fts_index(...)` statement appears before the SELECT

**Validate it runs:** Click Run SQL. If the mock data table was created with the right vector column type, it should return ranked results.

**Failure indicator:** Log: `Neither VSS nor FTS extensions are available.` = Extensions failed to load at startup (visible in the boot log).

---

## 11. Auto-Optimize Loop

The primary agentic optimization workflow. Runs up to 5 iterations of: explain → optimize → validate → execute, stopping when the plan score stops improving.

**What to do:** Put a query in the editor, switch to Optimize mode, click **Auto-Optimize**.

**Test query:**
```sql
SELECT *
FROM orders o, customers c
WHERE o.customer_id = c.id;
```

**Expected output per iteration (visible in Logs tab):**
```
─── Iteration 1/5 ───
[1/4] Optimizing with plan context...
[2/4] Validating syntax...
[3/4] Executing to verify...
Executed: 2 rows.
[4/4] Scoring new execution plan...
Plan score: 12 → 8 (−4 improved)
Iteration 1: Applied. Strategy: [explanation...]
─── Iteration 2/5 ───
...
Plan score: 8 → 8 (no improvement)
Iteration 2: Plan did not improve. Stopping.
Auto-Optimizer done: 2 iteration(s), final score 8.
```

**Validate plan context is used:** On each iteration, Gemini receives both the current SQL *and* the current DuckDB execution plan. The optimizations it suggests should directly reference operators in the plan (e.g., "removing the HASH_JOIN by rewriting as a filtered subquery").

**Validate the loop stops correctly:**
- The Results tab shows the explain plan of the *best* SQL found, not the original
- The editor contains the best SQL found
- If the first iteration produces no improvement, the loop runs exactly once and stops

**Scoring method:** Plan nodes are counted from the DuckDB EXPLAIN output. Expensive operators (HASH_JOIN, CROSS_PRODUCT, BLOCKWISE_NL_JOIN, NESTED_LOOP, SEQ_SCAN) add 3 points each. Lower score = simpler, cheaper plan.

**Single-pass alternative:** The **Once** button (outline style) runs a single optimization pass — one Gemini call, no iteration. Use when you want a quick rewrite without multiple API calls.

**Failure indicators:**
- `Syntax invalid: [error]. Stopping.` = Gemini returned malformed SQL; original is preserved
- `Execution failed: [error]. Stopping.` = Rewritten SQL breaks query correctness; original is preserved
- `Optimization call failed. Stopping.` = Gemini API error

---

## 12. Schema Browser

**What to do:** Click the Tables tab in the results pane. Click the chevron next to any table name.

**Expected output:**
- Row expands to show each column with name, type, PK badge (if applicable), NOT NULL badge
- `customers` table should show: `id INTEGER`, `customer_name VARCHAR`, `region VARCHAR`
- Subtitle updates to show column count: "Local · 3 cols"

**Validate lazy loading:** Schema is only fetched when first expanded, not on page load. Opening and closing the same table multiple times should not produce additional log entries.

---

## 12. Query History

**What to do:** Run any query successfully. Click the **History** tab.

**Expected output:**
- Entry appears with timestamp, execution time, and SQL preview
- Click the entry — editor is populated with that query and tab switches to Results

**Validate persistence:** Refresh the page. History entries should still be present (stored in `localStorage` under key `arcsql_history`).

**Validate capacity:** After 50 successful queries, oldest entries are dropped. The tab badge shows the current count.

---

## 13. Global Search

**What to do:** Press `⌘K`. Type a table name or value.

**Test:** Type `customer`

**Expected output:**
- `customers` table appears under "Resources"
- Any snippet containing "customer" appears
- Clicking the result loads `SELECT * FROM customers LIMIT 100;` into the editor

**Deep search validation:** Press Enter or click "Deep Search in Data". This runs `ILIKE` across all VARCHAR/TEXT columns in loaded tables.

**Test:** Type `Acme` and press Enter. Should find the row from the `customers` table where `customer_name = 'Acme Corp'`.

---

## Validation Checklist

| # | Feature | Pass condition |
|---|---|---|
| 1 | SQL execution | Results tab shows rows, log shows row count |
| 2 | Syntax validation | Error shown for invalid SQL within 500ms |
| 3 | Build / Generate SQL | Editor SQL replaced, log confirms generation |
| 4 | Optimize (Once) | SQL rewritten, explanation in Logs tab |
| 5 | Auto-Optimize loop | Log shows iteration steps, plan score improves, loop stops when score plateaus |
| 6 | Convert | SQL dialect-translated, no API call made |
| 7 | Auto-Fix | Agent corrects failing SQL and re-runs |
| 8 | Auto-Architect | New tables appear in Tables tab, results shown |
| 9 | Mock Data | New table created, `SELECT *` returns rows |
| 10 | ML Features | Output SQL has real column values from DB |
| 11 | Vector Search | DuckDB VSS/FTS query in editor, runs without error |
| 12 | Schema browser | Columns visible on expand, cached on second open |
| 13 | Query history | Entry persists after page refresh |
| 14 | Global search | Deep search returns matching rows from data |
