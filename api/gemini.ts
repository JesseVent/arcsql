import * as geminiService from '../services/geminiImplementation.js';

const ALLOWED = new Set([
  "generateSnowflakeSql", "optimizeSnowflakeSql", "generateMockData",
  "agentChat", "parseMlRequest", "generateEncodingSql",
  "generateVectorSql", "fixSqlError",
]);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { functionName, args } = req.body;
  try {
    if (!ALLOWED.has(functionName)) {
      return res.status(400).json({ error: `Unknown function: ${functionName}` });
    }
    const result = await (geminiService as any)[functionName](...args);
    res.status(200).json(result);
  } catch (error) {
    console.error(`[gemini] ${functionName}:`, error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
