import { PyodideInterface } from '../types';

declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

let pyodideInstance: PyodideInterface | null = null;
let isInitializing = false;

export const initPyodide = async (): Promise<PyodideInterface> => {
  if (pyodideInstance) return pyodideInstance;
  if (isInitializing) {
    while (!pyodideInstance) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return pyodideInstance;
  }

  isInitializing = true;

  try {
    const pyodide = await window.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
    });

    await pyodide.loadPackage("micropip");
    
    // Install SQLGlot for parsing/transpilation and Faker for potential local data gen
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install(["sqlglot", "Faker"])
    `);
    
    // Pre-run imports to warm up the environment
    pyodide.runPython(`
      import sqlglot
      from sqlglot import transpile, exp, parse_one
      from sqlglot.optimizer import optimize
      from sqlglot.errors import ParseError
      from faker import Faker
    `);

    pyodideInstance = pyodide;
    return pyodide;
  } catch (err) {
    console.error("Failed to load Pyodide:", err);
    throw err;
  } finally {
    isInitializing = false;
  }
};

export const transpileSql = async (sql: string, readDialect: string = 'tsql', writeDialect: string = 'snowflake'): Promise<{ sql: string; error?: string }> => {
  const pyodide = await initPyodide();

  // Base64-encode the SQL so it never conflicts with Python string delimiters
  const b64 = btoa(unescape(encodeURIComponent(sql)));

  const pythonCode = `
import base64
_sql = base64.b64decode('${b64}').decode('utf-8')
output_val = ""
try:
    output_val = transpile(_sql, read='${readDialect}', write='${writeDialect}')[0]
except Exception as e:
    output_val = f"ERROR: {str(e)}"
output_val
`;

  const result = await pyodide.runPythonAsync(pythonCode);

  if (typeof result === 'string' && result.startsWith("ERROR:")) {
    return { sql: '', error: result.replace("ERROR: ", "") };
  }

  return { sql: result };
};

export const checkSqlSyntax = async (sql: string): Promise<{ isValid: boolean; error?: string }> => {
  const pyodide = await initPyodide();

  const b64 = btoa(unescape(encodeURIComponent(sql)));

  const pythonCode = `
import base64
_sql = base64.b64decode('${b64}').decode('utf-8')
output_val = ""
try:
    parse_one(_sql, read='snowflake')
    output_val = "VALID"
except Exception as e:
    output_val = str(e)
output_val
`;

  const result = await pyodide.runPythonAsync(pythonCode);

  if (result === "VALID") {
    return { isValid: true };
  } else {
    return { isValid: false, error: result };
  }
};
