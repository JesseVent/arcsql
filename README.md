# ArcSQL

An AI-powered SQL workbench that runs entirely in your browser. Write, generate, optimize, and convert SQL — powered by Gemini, executed locally by DuckDB WASM.

## What it does

- **Build** — describe what you want in plain English; Gemini writes the SQL
- **Optimize** — paste any query; get Snowflake-specific optimization advice and a rewritten query
- **Convert** — translate Snowflake SQL to T-SQL, PostgreSQL, or BigQuery via SQLGlot (runs in-browser via Pyodide — no server round-trip)
- **Execute** — run queries against real in-browser tables powered by DuckDB WASM
- **Auto-Architect** — describe a full analysis; an AI agent designs the schema, generates mock data, and runs the query
- **ML Prep** — generate one-hot encoding, label encoding, and scaling SQL for any column
- **Hybrid Search** — generate vector similarity (VSS) and full-text search (FTS) SQL using DuckDB extensions
- **Connect live data** — attach Supabase tables, remote Parquet/CSV/JSON files, or Iceberg catalogs

## Tech stack

| Layer | Tech |
|---|---|
| AI | Gemini (`@google/genai`) via server-side proxy |
| In-browser SQL | DuckDB WASM (VSS, FTS, Iceberg, JSON extensions) |
| SQL transpilation | Pyodide + SQLGlot (runs in-browser) |
| Frontend | React 19, TypeScript, Tailwind CSS, Recharts |
| Server | Express (dev) + Vite middleware |

Your data never leaves the browser. Only PII-scrubbed prompts are sent to Gemini.

## Setup

```bash
# 1. Clone and install
git clone https://github.com/jessevent/arcsql
cd arcsql
pnpm install

# 2. Configure
cp .env.example .env.local
# Add your GEMINI_API_KEY to .env.local

# 3. Run
pnpm dev
# → http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Server-side only. Never exposed to the client. |
| `VITE_SUPABASE_URL` | No | Can also be configured at runtime via the UI |
| `VITE_SUPABASE_ANON_KEY` | No | Can also be configured at runtime via the UI |

> **Note:** The Gemini API key is used exclusively by the Express server (`server.ts`). It is never bundled into the client.

## Architecture

```
Browser                          Express Server
──────────────────────           ──────────────────
React SPA                        /api/gemini
  │                                │
  ├─ geminiService.ts ──POST──────▶ geminiImplementation.ts
  │  (client stub)                  (calls @google/genai with server key)
  │
  ├─ duckDbService.ts              (DuckDB WASM — runs in browser)
  └─ pyodideService.ts             (Pyodide + SQLGlot — runs in browser)
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Global search |
| `Enter` | Submit prompt |
| `Shift+Enter` | New line in prompt |

## License

MIT
