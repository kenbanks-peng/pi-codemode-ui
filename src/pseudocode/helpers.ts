export type MarkTool = (name: string, command?: boolean, target?: string) => string;

// Codemode globals are meaningful operations, not ordinary result variables.
export const codemodeHelpers = new Set([
  "ALL_TOOLS",
  "searchTools",
  "describeTool",
  "describeNamespace",
  "text",
  "image",
  "console",
  "store",
  "load",
  "exit",
  "models",
]);
