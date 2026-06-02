import { GoogleGenAI } from "@google/genai";
import { ExecutionPlan, MlRequest } from "../types.js";
import { scrubPii } from "./piiService.js";
import { FunctionDeclaration, Type } from "@google/genai";
import { runSqlQueryTool, createTableTool } from "./geminiTypes.js";

// Use process.env.GEMINI_API_KEY as per instructions
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Model Definitions
const MODEL_NLP = "gemini-3.1-flash-lite-preview";      // For complex reasoning, chat, and explanation tasks
const MODEL_FAST = "gemini-3.1-flash-lite-preview";    // For low-latency code gen, parsing, and data tasks

// Tool Definitions
// Tools are imported from geminiTypes.ts

const SYSTEM_INSTRUCTION = `
You are an expert Snowflake Data Engineer and SQL Architect. 
You are powered by "Context7", a deep knowledge base of Snowflake's latest features, syntax, and optimization techniques.
You also incorporate the "Snowflake Expert" skill best practices:

### Snowflake Expert Best Practices:
1.  **Warehouse Sizing and Management**: Start small, scale up. Use multi-cluster for concurrency. Set AUTO_SUSPEND (5-10 mins). Use separate warehouses for different workloads (ETL, BI, ad-hoc).
2.  **Data Organization**: Use databases for major boundaries, schemas for logical grouping. Cluster tables >1TB. Use transient tables for temporary data. Leverage zero-copy cloning.
3.  **Cost Optimization**: Use table types appropriately. Set data retention based on needs. Drop unused objects. Use result caching. Implement query timeouts.
4.  **Performance Optimization**: Cluster large tables. Use materialized views for expensive aggregations. Leverage search optimization. Ensure partition pruning with proper WHERE clauses. Monitor query profiles.
5.  **Security and Governance**: Implement role-based access control (RBAC). Use row-level and column-level security. Enable network policies. Use secure views for data sharing. Enable MFA.

### Data Exploration & Profiling Methodology:
- **Structural Understanding**: Identify grain, primary keys, and classify columns as identifiers, dimensions, metrics, or temporal.
- **Profiling**: For all columns, track null rates and cardinality. For metrics, calculate min/max/mean/median and standard deviation. For temporal data, identify time series gaps and distributions.
- **Quality Assessment**: Rate completeness and check for consistency (value formats, business rule violations, and impossible values).
- **Relationship Discovery**: Candidate foreign keys, hierarchies, and correlations.

### Statistical Analysis Guidance:
- **Central Tendency**: Always report mean and median together for skewed business metrics.
- **Variability**: Use Standard Deviation for normal data and IQR (p25-p75) for skewed data.
- **Trend Analysis**: Use moving averages to smooth noise and prioritize YoY comparisons to avoid seasonal bias.
- **Hypothesis Testing**: Distinguish between statistical significance (p < 0.05) and practical business significance (effect size).
- **Caution**: Watch for Simpson's Paradox, Survivorship Bias, and remember that Correlation is not Causation.

Your capabilities:
1.  **Snowflake Syntax Expert**: You write compliant Snowflake SQL.
2.  **Optimizer**: You identify performance bottlenecks (partition pruning, clustering, spilling to disk).
3.  **Data Generator**: You can generate realistic JSON data for testing.
4.  **External Data Querying**: You understand that the runtime (DuckDB WASM) can query external URLs directly using functions like \`read_parquet('url')\`, \`read_json_auto('url')\`, and \`iceberg_scan('url')\`.
5.  **ML Preprocessing**: You know how to generate SQL for feature engineering:
    - One-Hot Encoding: Using CASE WHEN or PIVOT logic.
    - Label Encoding: Using DENSE_RANK() or mapping tables.
    - Scaling: Using (x - min) / (max - min) or (x - avg) / stddev.
6.  **Vector Search (VSS)**: You know that the 'vss' extension is available in DuckDB.
    - **Distance**: Use \`array_cosine_similarity(vec_a, vec_b)\` for cosine similarity (ranges -1 to 1). Note that distance is often 1 - similarity.
    - **HNSW Indexes**: \`CREATE INDEX idx_name ON table_name USING HNSW (vector_column)\`.
    - **Vector Type**: Vectors are typically \`FLOAT[]\` arrays of fixed size.
7.  **Text Analytics (FTS)**: You know that the 'fts' extension is available.
    - **Setup**: \`PRAGMA create_fts_index('table', 'id_col', 'text_col');\` (Required before searching).
    - **Search**: \`SELECT *, match_bm25(id_col, 'search query') AS score FROM table WHERE score IS NOT NULL;\`
    - **Hybrid Search**: You can combine VSS and FTS. Use CTEs to normalize scores from both and join them.
8.  **Encrypted Databases**: You know this environment can ATTACH encrypted DuckDB files from CDNs.
    - Syntax: \`ATTACH 'url' AS alias (TYPE DUCKDB, READ_ONLY, KEY 'secret');\`

When asked to generate SQL:
- Prefer CTEs for readability.
- Use specific Snowflake functions (e.g., IFF, QUALIFY, FLATTEN) where appropriate.
- Always output clean, executable SQL.
- If the user references an external URL (e.g., an API endpoint or Parquet file), use the appropriate read function or assume a view has been created for it.

When asked to optimize:
- Explain *why* the change improves performance.

When asked for data:
- Return a JSON array of objects representing rows.
`;

// Helper to strip markdown code blocks from JSON responses
const cleanJson = (text: string) => {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const generateSnowflakeSql = async (prompt: string, currentSql: string = ""): Promise<string> => {
  try {
    const cleanPrompt = scrubPii(prompt);
    const cleanSql = scrubPii(currentSql);

    const fullPrompt = `
      User Request: ${cleanPrompt}
      
      ${cleanSql ? `Current SQL Context:\n${cleanSql}\n` : ''}
      
      Generate valid Snowflake/DuckDB SQL to answer the request. 
      Return ONLY the SQL code block. Do not wrap in markdown code fences if possible, or just the code.
    `;

    // Use NLP model for core SQL generation as it requires understanding intent
    const response = await ai.models.generateContent({
      model: MODEL_NLP,
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    let text = response.text || "";
    // Clean up markdown code blocks if present
    text = text.replace(/```sql/g, '').replace(/```/g, '').trim();
    return text;
  } catch (error) {
    console.error("Gemini SQL Generation Error:", error);
    throw error;
  }
};

export const generateVectorSql = async (prompt: string): Promise<string> => {
    try {
      const cleanPrompt = scrubPii(prompt);
      const fullPrompt = `
        User Request: ${cleanPrompt}
        
        The user wants to perform a Vector Similarity Search, Text Search, or Hybrid Search using DuckDB's 'vss' and 'fts' extensions.
        
        Tasks often include:
        1. "Find similar to X": \`SELECT *, array_cosine_similarity(vec_col, (SELECT vec_col FROM t WHERE id=X)) as score FROM t ORDER BY score DESC LIMIT 5;\`
        2. "Create Index": \`CREATE INDEX idx ON t USING HNSW (vec_col);\`
        3. "Text Search": \`PRAGMA create_fts_index('t', 'id', 'content'); SELECT *, match_bm25(id, 'query') as score FROM t ...\`
        4. "Hybrid": Combine vector score and match_bm25 score using CTEs.
        
        Generate the appropriate SQL.
        If Hybrid or Text search is implied, ALWAYS include the \`PRAGMA create_fts_index\` statement first to ensure the index exists, separated by a semicolon.
        Return ONLY the SQL code.
      `;
  
      // Use FAST model as this is more about syntax mapping than deep reasoning
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });
  
      let text = response.text || "";
      return text.replace(/```sql/g, '').replace(/```/g, '').trim();
    } catch (error) {
      console.error("Gemini Vector SQL Error:", error);
      throw error;
    }
  };

export const fixSqlError = async (sql: string, error: string, availableTables: string[] = []): Promise<string> => {
  try {
    const cleanSql = scrubPii(sql);
    const prompt = `
      The following SQL query failed with an error in DuckDB/Snowflake environment.
      
      SQL:
      ${cleanSql}
      
      Error:
      ${error}
      
      ${availableTables.length > 0 ? `Available Tables in Database: ${availableTables.join(', ')}` : ''}

      Fix the SQL to resolve the error. 
      If the error is about a missing table, check if there is a similar name in the Available Tables list.
      Ensure the syntax is compatible with DuckDB WASM.
      
      Return ONLY the fixed SQL code block.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    return (response.text || "").replace(/```sql/g, '').replace(/```/g, '').trim();
  } catch (error) {
    console.error("Fix SQL Error", error);
    throw error;
  }
};

export const optimizeSnowflakeSql = async (sql: string): Promise<{ optimizedSql: string; explanation: string }> => {
  try {
    const cleanSql = scrubPii(sql);
    const prompt = `
      Analyze the following SQL query for Snowflake optimization opportunities.
      Consider clustering, partition pruning, unnecessary joins, and window function usage.

      SQL TO OPTIMIZE:
      ${cleanSql}

      Return a JSON object with this structure:
      {
        "optimizedSql": "The rewritten SQL...",
        "explanation": "Markdown explanation of changes..."
      }
    `;

    // Use NLP model for optimization as it requires explanation and deep analysis
    const response = await ai.models.generateContent({
      model: MODEL_NLP,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    return JSON.parse(cleanJson(text));
  } catch (error) {
    console.error("Gemini Optimization Error:", error);
    throw error;
  }
};

export const generateMockData = async (tableDescription: string): Promise<{ tableName: string; schemaSql: string; data: any[] }> => {
  try {
    const cleanDescription = scrubPii(tableDescription);
    const prompt = `
      Generate a DuckDB/Snowflake compatible CREATE TABLE statement and a set of mock data (JSON array) for: "${cleanDescription}".
      
      The table is for a Snowflake environment but will run in DuckDB-WASM. 
      Use standard types: INTEGER, VARCHAR, DATE, BOOLEAN, FLOAT.
      
      If the user mentions "vectors" or "embeddings", create a FLOAT[] column and populate it with random array data (e.g. 5 dimensions).
      If the user mentions "text search", ensure there is a long VARCHAR column with searchable text content.

      Return JSON:
      {
        "tableName": "Name of table",
        "schemaSql": "CREATE TABLE ...",
        "data": [ ... array of objects matching columns ... ]
      }
      Generate at least 10 rows of realistic data.
    `;

    // Use FAST model for data generation
    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (error) {
     console.error("Gemini Data Gen Error:", error);
     throw error;
  }
};

export const agentChat = async (prompt: string, tools: FunctionDeclaration[] = []): Promise<any> => {
  try {
    const cleanPrompt = scrubPii(prompt);
    const response = await ai.models.generateContent({
      model: MODEL_NLP,
      contents: cleanPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      }
    });

    if (response.functionCalls) {
      return { functionCalls: response.functionCalls };
    }
    return { text: response.text };
  } catch (error) {
    console.error("Agent Chat Error:", error);
    throw error;
  }
};

export const parseMlRequest = async (prompt: string): Promise<MlRequest> => {
  try {
    const cleanPrompt = scrubPii(prompt);
    const aiPrompt = `
      Extract the table name, column name, and ML operation from this request: "${cleanPrompt}".
      
      Operations: 'one_hot', 'label', 'min_max_scale', 'z_score_scale'.
      Default to 'one_hot' if encoding is mentioned but unspecified.

      Return JSON:
      {
        "tableName": "string",
        "columnName": "string",
        "operation": "one_hot"
      }
    `;

    // Use FAST model for simple entity extraction
    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: aiPrompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (error) {
    console.error("Parse ML Request Error", error);
    throw error;
  }
};

export const generateEncodingSql = async (
  tableName: string, 
  columnName: string, 
  distinctValues: any[], 
  operation: MlRequest['operation']
): Promise<string> => {
  try {
    const distinctValStr = distinctValues.slice(0, 50).map(v => `'${v}'`).join(", ");
    
    const prompt = `
      Generate a Snowflake/DuckDB SQL query that performs ${operation} on column '${columnName}' of table '${tableName}'.
      
      ${operation === 'one_hot' ? `The distinct values are: [${distinctValStr}]. Create a column for each value.` : ''}
      
      Return ONLY the SQL.
      Example for one_hot:
      SELECT *, 
        CASE WHEN col = 'A' THEN 1 ELSE 0 END AS col_A,
        CASE WHEN col = 'B' THEN 1 ELSE 0 END AS col_B
      FROM table;
    `;

    // Use FAST model for template-based SQL generation
    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION
      }
    });

    return (response.text || "").replace(/```sql/g, '').replace(/```/g, '').trim();
  } catch (error) {
    console.error("Generate Encoding Error", error);
    throw error;
  }
};