# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install           # Install dependencies
pnpm run dev           # Start dev server (Express + Vite, port 3000)
pnpm run build         # Production build (Vite only, no server bundling)
pnpm run lint          # Type-check only (tsc --noEmit)
```

No test suite exists in this project.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:
- `GEMINI_API_KEY` — required; used server-side only
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — optional; can also be configured at runtime via the UI

## Architecture

### Request Flow

The app is a single-page React app (SPA) served by a combined Express + Vite dev server (`server.ts`). The frontend never calls the Gemini API directly. Instead:

1. Frontend calls `services/geminiService.ts` which POSTs to `/api/gemini`
2. Express handler in `server.ts` dispatches to the corresponding function in `services/geminiImplementation.ts`
3. `geminiImplementation.ts` calls Google's `@google/genai` SDK with the server-side `GEMINI_API_KEY`

This split exists to keep the API key off the client. Any new Gemini capability must be added to both `geminiService.ts` (client stub) and `geminiImplementation.ts` (server implementation).

### In-Browser Engines (CDN-loaded at runtime)

Two heavy compute engines initialize on app boot — neither is bundled:

- **DuckDB WASM** (`services/duckDbService.ts`): Runs SQL in-browser. Loads VSS (vector similarity search), FTS (full-text search), Iceberg, and JSON extensions. Maintains a single persistent `conn` module-level singleton. The `initPromise` pattern prevents double-initialization.
- **Pyodide + SQLGlot** (`services/pyodideService.ts`): Python runtime in WASM used exclusively for SQL dialect transpilation via SQLGlot. Also installs Faker (for potential local data gen). Loaded from `cdn.jsdelivr.net/pyodide/v0.25.0/full/`.

Both are initialized in `App.tsx`'s boot effect and their readiness gates the UI action buttons.

### State & Component Structure

`App.tsx` is a single large component (~1100 lines) holding all application state. The three operating modes are defined in `types.ts` as `AppMode` (BUILDER, OPTIMIZER, CONVERTER) and control which action buttons appear and which Gemini call fires.

Modals (`DataSourceManager`, `SnippetManager`, `HelpPage`, `GlobalSearch`) are always mounted but hidden via `isOpen` props. SQL snippets persist to `localStorage` under the key `context7_snippets`.

### PII Scrubbing

`services/piiService.ts` scrubs emails, phone numbers, SSNs, credit cards, IPs, DOBs, and ZIP codes from text before every Gemini API call. The `scrubPii()` function wraps all prompt inputs in `geminiImplementation.ts`.

### Supabase (Optional)

Supabase credentials are stored in `localStorage` at runtime (keys: `context7_supabase_url`, `context7_supabase_anon_key`). `supabaseService.ts` uses a lazy singleton with a custom auth storage adapter that falls back to an in-memory store for iframe environments. When configured, Supabase tables are materialized into DuckDB as local tables via JSON buffer registration.

### Gemini Models

Both `MODEL_NLP` and `MODEL_FAST` constants in `geminiImplementation.ts` currently point to the same model. The split is intentional to allow routing complex reasoning tasks (SQL generation, optimization explanations, agent chat) to a more capable model and simpler extraction tasks (parsing ML requests, generating encodings) to a faster/cheaper one.

### Agent Tool Calls

The Auto-Architect mode uses Gemini function calling. Tool definitions (`run_sql_query`, `create_table`) live in `services/geminiTypes.ts` as `FunctionDeclaration` objects shared between client and server. When Gemini returns `functionCalls`, `App.tsx` executes them sequentially against DuckDB.
