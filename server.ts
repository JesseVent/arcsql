// Must be first — overrides any shell NODE_ENV so imports initialise correctly
process.env.NODE_ENV = "development";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local before the Gemini SDK initialises
try {
  const envFile = readFileSync(path.join(__dirname, ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch { /* no .env.local */ }

async function startApiServer() {
  const geminiService = await import("./services/geminiImplementation.js");

  const app = express();
  const PORT = parseInt(process.env.API_PORT || "4002");

  app.use(express.json());

  const ALLOWED = new Set([
    "generateSnowflakeSql", "optimizeSnowflakeSql", "generateMockData",
    "agentChat", "parseMlRequest", "generateEncodingSql",
    "generateVectorSql", "fixSqlError",
  ]);

  app.post("/api/gemini", async (req, res) => {
    const { functionName, args } = req.body;
    try {
      if (!ALLOWED.has(functionName))
        return res.status(400).json({ error: `Unknown function: ${functionName}` });
      const result = await (geminiService as any)[functionName](...args);
      res.json(result);
    } catch (error) {
      console.error(`[gemini] ${functionName}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.listen(PORT, "0.0.0.0", () =>
    console.log(`  API server  http://localhost:${PORT}`)
  );
}

startApiServer().catch(console.error);
