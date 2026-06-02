import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import * as geminiService from "./services/geminiImplementation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ALLOWED_GEMINI_FUNCTIONS = new Set([
    'generateSnowflakeSql',
    'optimizeSnowflakeSql',
    'generateMockData',
    'agentChat',
    'parseMlRequest',
    'generateEncodingSql',
    'generateVectorSql',
    'fixSqlError',
  ]);

  // API Route for Gemini
  app.post("/api/gemini", async (req, res) => {
    const { functionName, args } = req.body;

    try {
      if (!ALLOWED_GEMINI_FUNCTIONS.has(functionName)) {
        return res.status(400).json({ error: `Function ${functionName} not found` });
      }

      const result = await (geminiService as any)[functionName](...args);
      res.json(result);
    } catch (error) {
      console.error(`Error in ${functionName}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
