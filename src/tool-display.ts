/** Shared target selection and display-only options for known tools. */
export interface ToolDisplay {
  targetField?: string;
  fields?: string[];
  hidden?: string[];
  rawTarget?: boolean;
  labeled?: string[];
  redact?: string[];
}

const displays: Record<string, ToolDisplay> = {
  read: { targetField: "path", rawTarget: true, hidden: ["offset", "limit"] },
  edit: { targetField: "path", rawTarget: true, hidden: ["oldText", "newText", "edits"] },
  write: { targetField: "path", rawTarget: true, hidden: ["content"] },
  ls: { targetField: "path", rawTarget: true, hidden: ["limit"] },
  bash: { targetField: "command", rawTarget: true, hidden: ["timeout"] },
  powershell: { targetField: "command", rawTarget: true, hidden: ["timeout"] },
  grep: { targetField: "pattern", rawTarget: true, hidden: ["limit"] },
  find: { targetField: "pattern", rawTarget: true, hidden: ["limit"] },
  skill_search: { fields: ["query"], hidden: ["limit"] },
  tool_search: { fields: ["query"] },
  getToolGuidance: { fields: ["name"] },
  resolve_library_id: { fields: ["libraryName", "query"] },
  query_docs: { fields: ["libraryId", "query"] },
  mnemosyne_recall: { fields: ["query"] },
  mnemosyne_remember: { fields: ["content"] },
  mnemosyne_forget: { fields: ["id"] },
  web_search: { fields: ["query", "queries"], hidden: ["proxy"] },
  source_check: { fields: ["claim"], hidden: ["proxy"] },
  fetch_content: { fields: ["url", "urls"], hidden: ["proxy"], redact: ["auth"] },
  get_search_content: { fields: ["responseId", "findText", "url", "query"] },
  todo: { fields: ["action", "subject", "id"], hidden: ["activeForm"] },
  create_goal: { fields: ["objective"] },
  get_goal: { fields: ["section", "task_id"] },
  read_mcp_resource: { fields: ["uri", "server"] },
  mcp__gitnexus__query: { fields: ["search_query"] },
  mcp__gitnexus__context: { fields: ["name", "uid"] },
  mcp__gitnexus__impact: {
    fields: ["target", "target_uid", "symbol", "name", "direction", "mode"],
    labeled: ["direction", "mode"],
  },
  mcp__gitnexus__explain: { fields: ["target"] },
  mcp__gitnexus__pdg_query: { fields: ["target", "mode"], labeled: ["mode"] },
  mcp__gitnexus__rename: {
    fields: ["symbol_name", "symbol_uid", "new_name", "dry_run"],
    labeled: ["dry_run"],
  },
  mcp__gitnexus__trace: { fields: ["from", "from_uid", "to", "to_uid"] },
  mcp__gitnexus__cypher: { fields: ["statement"] },
  mcp__gitnexus__route_map: { fields: ["route"] },
  mcp__gitnexus__shape_check: { fields: ["route"] },
  mcp__gitnexus__api_impact: { fields: ["route", "file", "method"], labeled: ["method"] },
};

export function toolDisplay(name: string): ToolDisplay {
  return Object.hasOwn(displays, name) ? displays[name]! : {};
}

export function targetField(name: string): string | undefined {
  return toolDisplay(name.toLowerCase()).targetField;
}

export function preferredFields(display: ToolDisplay): string[] {
  return display.fields ?? (display.targetField ? [display.targetField] : []);
}

export function isPrimaryTool(name: string): boolean {
  return targetField(name) !== undefined;
}

export function isShellTool(name: string): boolean {
  return targetField(name) === "command";
}
