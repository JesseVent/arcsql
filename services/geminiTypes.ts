import { FunctionDeclaration, Type } from "@google/genai";

// Tool Definitions
export const runSqlQueryTool: FunctionDeclaration = {
  name: "run_sql_query",
  description: "Executes a SQL query against the DuckDB database.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      sql: { type: Type.STRING, description: "The SQL query to execute." },
    },
    required: ["sql"],
  },
};

export const createTableTool: FunctionDeclaration = {
  name: "create_table",
  description: "Creates a new table in the DuckDB database.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tableName: { type: Type.STRING, description: "The name of the table to create." },
      schemaSql: { type: Type.STRING, description: "The CREATE TABLE SQL statement." },
      data: { type: Type.ARRAY, items: { type: Type.OBJECT }, description: "The mock data to insert." },
    },
    required: ["tableName", "schemaSql", "data"],
  },
};
