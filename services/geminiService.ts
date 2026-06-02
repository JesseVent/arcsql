import { runSqlQueryTool, createTableTool } from "./geminiTypes.js";
import { MlRequest } from "../types.js";

async function callGeminiApi(functionName: string, args: any[]): Promise<any> {
    const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ functionName, args }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Gemini API call failed: ${response.statusText}`);
    }
    return response.json();
}

export { runSqlQueryTool, createTableTool };

export const generateSnowflakeSql = async (prompt: string, currentSql: string = ""): Promise<string> => {
    return callGeminiApi("generateSnowflakeSql", [prompt, currentSql]);
};

export const generateVectorSql = async (prompt: string): Promise<string> => {
    return callGeminiApi("generateVectorSql", [prompt]);
};

export const fixSqlError = async (sql: string, error: string, availableTables: string[] = []): Promise<string> => {
    return callGeminiApi("fixSqlError", [sql, error, availableTables]);
};

export const optimizeSnowflakeSql = async (sql: string): Promise<{ optimizedSql: string; explanation: string }> => {
    return callGeminiApi("optimizeSnowflakeSql", [sql]);
};

export const generateMockData = async (tableDescription: string): Promise<{ tableName: string; schemaSql: string; data: any[] }> => {
    return callGeminiApi("generateMockData", [tableDescription]);
};

export const agentChat = async (prompt: string, tools: any[] = []): Promise<any> => {
    // We don't send the full tool objects to avoid payload size and potential serialization issues
    // instead just send names or if they are standard. 
    // However, here we just pass the tool names or similar if they are used on server too.
    // For now, let's just pass them as requested.
    return callGeminiApi("agentChat", [prompt, tools]);
};

export const parseMlRequest = async (prompt: string): Promise<MlRequest> => {
    return callGeminiApi("parseMlRequest", [prompt]);
};

export const generateEncodingSql = async (
    tableName: string, 
    columnName: string, 
    distinctValues: any[], 
    operation: MlRequest['operation']
): Promise<string> => {
    return callGeminiApi("generateEncodingSql", [tableName, columnName, distinctValues, operation]);
};
