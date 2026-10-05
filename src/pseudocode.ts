import { parse, tokenizer, type Token } from "acorn";
import type { CallExpression, Node, Program } from "estree";
import { visibleWidth } from "@earendil-works/pi-tui";

const targetFields: Record<string, string> = {
  read: "path", edit: "path", write: "path", ls: "path",
  bash: "command", powershell: "command", grep: "pattern", find: "pattern",
};
const primaryTools = new Set(Object.keys(targetFields));

/** Ordered fields are displayed first and without redundant labels. */
const displayFields: Record<string, string[]> = {
  skill_search: ["query"], tool_search: ["query"], getToolGuidance: ["name"],
  resolve_library_id: ["libraryName", "query"],
  query_docs: ["libraryId", "query"],
  mnemosyne_recall: ["query"], mnemosyne_remember: ["content"],
  mnemosyne_forget: ["id"],
  web_search: ["query", "queries"], source_check: ["claim"],
  fetch_content: ["url", "urls"],
  get_search_content: ["responseId", "findText", "url", "query"],
  todo: ["action", "subject", "id"],
  create_goal: ["objective"], get_goal: ["section", "task_id"],
};

interface DisplayOverride {
  fields?: string[];
  hidden?: string[];
  rawTarget?: boolean;
  labeled?: string[];
  redact?: string[];
}
const displayOverrides: Record<string, DisplayOverride> = {
  ...Object.fromEntries(Object.entries(targetFields).map(([name, field]) =>
    [name, { fields: [field], rawTarget: true }])),
  read: { fields: ["path"], rawTarget: true, hidden: ["offset", "limit"] },
  grep: { fields: ["pattern"], rawTarget: true, hidden: ["limit"] },
  find: { fields: ["pattern"], rawTarget: true, hidden: ["limit"] },
  ls: { fields: ["path"], rawTarget: true, hidden: ["limit"] },
  bash: { fields: ["command"], rawTarget: true, hidden: ["timeout"] },
  powershell: { fields: ["command"], rawTarget: true, hidden: ["timeout"] },
  edit: { fields: ["path"], rawTarget: true, hidden: ["oldText", "newText", "edits"] },
  write: { fields: ["path"], rawTarget: true, hidden: ["content"] },
  skill_search: { fields: ["query"], hidden: ["limit"] },
  todo: { hidden: ["activeForm"] },
  web_search: { hidden: ["proxy"] },
  source_check: { hidden: ["proxy"] },
  fetch_content: { hidden: ["proxy"], redact: ["auth"] },
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
    fields: ["symbol_name", "symbol_uid", "new_name", "dry_run"], labeled: ["dry_run"],
  },
  mcp__gitnexus__trace: { fields: ["from", "from_uid", "to", "to_uid"] },
  mcp__gitnexus__cypher: { fields: ["statement"] },
  mcp__gitnexus__route_map: { fields: ["route"] },
  mcp__gitnexus__shape_check: { fields: ["route"] },
  mcp__gitnexus__api_impact: { fields: ["route", "file", "method"], labeled: ["method"] },
};

type MarkTool = (name: string, command?: boolean, target?: string) => string;

/** Default for every tool without a more useful command-specific layout. */
function defaultToolCall(node: CallExpression, code: string, name: string, mark: MarkTool,
  override: DisplayOverride = {}): string {
  const source = (node: Node) => {
    const range = node as Node & { start: number; end: number };
    return code.slice(range.start, range.end).replace(/\s+/g, " ").trim();
  };
  const value = (node: Node, depth = 0): string => {
    if (depth > 3) return "…";
    if (node.type === "Literal" && typeof node.value === "string")
      return JSON.stringify(node.value);
    if (node.type === "ObjectExpression")
      return "{" + items(node.properties, depth, ", ") + "}";
    if (node.type === "ArrayExpression")
      return "[" + node.elements.slice(0, 3).map(item => item ? value(item, depth + 1) : "")
        .concat(node.elements.length > 3 ? ["…"] : []).join(", ") + "]";
    if (node.type === "Property" && !node.computed && !node.method && node.kind === "init") {
      const key = node.key.type === "Literal" && typeof node.key.value === "string" &&
        /^[A-Za-z_$][\w$]*$/.test(node.key.value) ? node.key.value : source(node.key);
      // Non-boolean authentication can contain credentials or refer to them.
      if (override.redact?.includes(key) &&
          !(node.value.type === "Literal" && typeof node.value.value === "boolean"))
        return key + ": [redacted]";
      return node.shorthand ? value(node.value, depth)
        : key + ": " + value(node.value, depth);
    }
    return source(node);
  };
  const items = (nodes: Node[], depth: number, separator: string) =>
    nodes.slice(0, 3).map(node => value(node, depth + 1))
      .concat(nodes.length > 3 ? ["…"] : []).join(separator);
  const argument = node.arguments[0];
  let args: string;
  let rawTarget = false;
  let identityTarget: string | undefined;
  if (node.arguments.length === 1 && argument?.type === "ObjectExpression") {
    const keyOf = (node: Node): string | undefined =>
      node.type === "Property" && !node.computed && !node.method && node.kind === "init"
        ? node.key.type === "Identifier" ? node.key.name
          : node.key.type === "Literal" && typeof node.key.value === "string" ? node.key.value
          : undefined : undefined;
    // Spreads, computed keys, and duplicates can change the actual target.
    const keys = argument.properties.map(keyOf);
    const safe = keys.every(key => key !== undefined) && new Set(keys).size === keys.length;
    const preferred = safe ? override.fields ?? (Object.hasOwn(displayFields, name) ? displayFields[name]! : []) : [];
    const targets = preferred.flatMap(key => argument.properties.filter(p => keyOf(p) === key));
    const rest = argument.properties.filter(p => !targets.includes(p) &&
      !override.hidden?.includes(keyOf(p)!));
    const visible = [...targets, ...rest];
    const shown = visible.slice(0, 3);
    args = shown.map(p => {
      if (targets.includes(p) && p.type === "Property") {
        const key = keyOf(p);
        if (override.labeled?.includes(key!)) return value(p);
        if (override.rawTarget) {
          rawTarget = true;
          const target = p.value;
          if (target.type === "Literal" && typeof target.value === "string")
            identityTarget = target.value;
          else if (target.type === "TemplateLiteral" && target.expressions.length === 0)
            identityTarget = target.quasis.map(part => part.value.cooked ?? part.value.raw).join("");
          const range = target as Node & { start: number; end: number };
          const displayTarget = (target.type === "Literal" && typeof target.value === "string"
            ? target.value
            : target.type === "TemplateLiteral" && target.expressions.length === 0
              ? target.quasis.map(part => part.value.cooked ?? part.value.raw).join("")
              : code.slice(range.start, range.end)).replace(/\s+/g, " ").trim();
          return displayTarget;
        }
        if (name === "todo" && key === "action" && p.value.type === "Literal" &&
            typeof p.value.value === "string") return p.value.value;
        if (name === "todo" && key === "id") return "#" + value(p.value);
        if (p.value.type === "Literal" && typeof p.value.value === "string" &&
            /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(p.value.value))
          return p.value.value;
        return value(p.value);
      }
      return value(p);
    }).concat(visible.length > shown.length ? ["…"] : []).join(" · ");
    if (name === "todo" && targets.length > 1 && keyOf(targets[0]!) === "action") {
      // The action and task target form one command.
      args = args.replace(" · ", " ");
    }
    if (name === "ask_user_question" && safe) {
      const questions = argument.properties.find(p => keyOf(p) === "questions");
      if (questions?.type === "Property" && questions.value.type === "ArrayExpression") {
        const entries = questions.value.elements;
        const texts = entries.map(entry => {
          if (entry?.type !== "ObjectExpression") return undefined;
          const entryKeys = entry.properties.map(keyOf);
          if (entryKeys.some(key => key === undefined) || new Set(entryKeys).size !== entryKeys.length)
            return undefined;
          const field = entry.properties.find(p => keyOf(p) === "question");
          return field?.type === "Property" ? value(field.value) : undefined;
        });
        if (texts.every(text => text !== undefined)) {
          const extra = argument.properties.filter(p => p !== questions);
          args = texts.slice(0, 3).concat(texts.length > 3 ? ["…"] : []).join(" · ") +
            " · " + entries.length + (entries.length === 1 ? " question" : " questions") +
            (extra.length ? " · " + items(extra, 0, " · ") : "");
        }
      }
    }
  } else args = items(node.arguments, 0, " · ");
  return mark(name, rawTarget, identityTarget) + (args ? " " + args : "");
}

/** All tool layouts use the default formatter with display-only overrides. */
function formatToolCall(node: CallExpression, code: string, name: string, mark: MarkTool): string {
  return defaultToolCall(node, code, name, mark,
    Object.hasOwn(displayOverrides, name) ? displayOverrides[name] : undefined);
}

// Codemode globals are meaningful operations, not ordinary result variables.
const codemodeHelpers = new Set([
  "ALL_TOOLS", "searchTools", "describeTool", "describeNamespace",
  "text", "image", "console", "store", "load", "exit", "models",
]);

/** Simplify tokens without changing strings or comments. */
function syntaxPseudocode(code: string, mark: MarkTool): string {
  const tokens = tokenizer(code, { ecmaVersion: "latest" });
  const replacements: { start: number; end: number; text: string }[] = [];
  const scanned: Token[] = [];
  try {
    while (true) {
      const token = tokens.getToken();
      if (token.type.label === "eof") break;
      scanned.push(token);
      const original = code.slice(token.start, token.end);
      if (
        ["await", "const", "let", "var"].includes(original) &&
        (token.type.keyword || token.type.label === "name")
      ) {
        // Keep property names such as object.await and {await: value}.
        const before = code.slice(0, token.start).trimEnd().slice(-1);
        const after = code.slice(token.end).trimStart().slice(0, 1);
        if (
          before === "." ||
          after === ":" ||
          after === "," ||
          after === "}" ||
          (after === "(" && (before === "{" || before === ","))
        )
          continue;
        let end = token.end;
        while (code[end] === " " || code[end] === "\t") end++;
        replacements.push({ start: token.start, end, text: "" });
      } else if (original === "=") {
        replacements.push({ start: token.start, end: token.end, text: "←" });
      }
    }
  } catch {
    // Partial or invalid scripts keep the unparsed remainder, without clipping it.
  }
  // Match call parentheses using tokens, not text inside strings or comments.
  const stack: number[] = [];
  const pairs = new Map<number, number>();
  scanned.forEach((token, index) => {
    if (token.type.label === "(") stack.push(index);
    if (token.type.label === ")") {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, index);
    }
  });
  scanned.forEach((token, index) => {
    const property = scanned[index + 2];
    if (
      token.type.label === "name" && code.slice(token.start, token.end) === "tools" &&
      ![".", "?."].includes(scanned[index - 1]?.type.label ?? "") &&
      scanned[index + 1]?.type.label === "." &&
      property?.type.label === "name" &&
      scanned[index + 3]?.type.label === "("
    ) {
      const close = pairs.get(index + 3);
      const call = close === undefined ? undefined
        : code.slice(token.start, scanned[close]!.end);
      let summary: string | undefined;
      if (call && call.length <= 50000) {
        try {
          const parsed = parse(call, { ecmaVersion: "latest", allowAwaitOutsideFunction: true }) as unknown as Program;
          const expression = parsed.body[0];
          if (expression?.type === "ExpressionStatement" &&
              expression.expression.type === "CallExpression") {
            summary = formatToolCall(expression.expression, call,
              code.slice(property.start, property.end), mark);
          }
        } catch { /* Keep incomplete calls readable. */ }
      }
      replacements.push({
        start: token.start,
        end: summary !== undefined
          ? scanned[close!]!.end : property.end,
        text: summary !== undefined
          ? summary : primaryTools.has(code.slice(property.start, property.end))
            ? code.slice(property.start, property.end) : mark(code.slice(property.start, property.end)),
      });
    }
    if (
      token.type.keyword === "const" &&
      scanned[index + 1]?.type.label === "name" &&
      scanned[index + 2]?.type.label === "="
    ) {
      replacements.push({
        start: token.start,
        end: scanned[index + 3]?.start ?? scanned[index + 2]!.end,
        text: "",
      });
    }
    if (
      token.type.label !== "name" ||
      code.slice(token.start, token.end) !== "text"
    )
      return;
    const previous = scanned[index - 1]?.type.label;
    if ([".", "?.", "function", "new"].includes(previous ?? "")) return;
    const close = pairs.get(index + 1);
    if (close === undefined || scanned[close + 1]?.type.label === "{") return;
    if (close === index + 3 && scanned[index + 2]?.type.label === "name" &&
        !codemodeHelpers.has(code.slice(scanned[index + 2]!.start, scanned[index + 2]!.end))) {
      replacements.push({
        start: token.start,
        end: scanned[close + 1]?.type.label === ";"
          ? scanned[close + 1]!.end : scanned[close]!.end,
        text: "",
      });
      return;
    }
    replacements.push(
      { start: token.start, end: scanned[index + 1]!.end, text: "" },
      { start: scanned[close]!.start, end: scanned[close]!.end, text: "" },
    );
  });
  replacements.sort((a, b) => a.start - b.start || b.end - a.end);
  let output = "";
  let offset = 0;
  for (const replacement of replacements) {
    if (replacement.start < offset) continue;
    output += code.slice(offset, replacement.start) + replacement.text;
    offset = replacement.end;
  }
  return (output + code.slice(offset)).trim();
}

/** Reduce parsed syntax to code-like pseudocode. Never execute the script. */
function renderPseudocode(code: string, mark: MarkTool, width: number): string {
  if (!code.trim()) return "// no code";
  if (code.length > 50000) return syntaxPseudocode(code, mark);
  try {
    const program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as unknown as Program;
    // Only compress an adjacent, immutable literal array and a simple shell
    // mapper. Dynamic arrays and callbacks with extra work keep the full layout.
    const batches = new Map<Node, { binding: string; commands: string[];
      tool: string; params: string[]; output: Node }>();
    const batchDeclarations = new Map<Node, number>();
    for (let i = 1; i < program.body.length; i++) {
      const declaration = program.body[i - 1];
      const statement = program.body[i];
      if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const" ||
          declaration.declarations.length !== 1 || statement?.type !== "ExpressionStatement") continue;
      const entry = declaration.declarations[0]!;
      if (entry.id.type !== "Identifier" || entry.init?.type !== "ArrayExpression" ||
          !entry.init.elements.length) continue;
      const commands = entry.init.elements.map(element =>
        element?.type === "Literal" && typeof element.value === "string" ? element.value
          : element?.type === "TemplateLiteral" && !element.expressions.length
            ? element.quasis.map(part => part.value.cooked ?? part.value.raw).join("") : undefined);
      if (!commands.every((command): command is string => command !== undefined)) continue;
      const expression = statement.expression.type === "AwaitExpression"
        ? statement.expression.argument : statement.expression;
      if (expression.type !== "CallExpression" || expression.optional ||
          expression.callee.type !== "MemberExpression" || expression.callee.computed ||
          expression.callee.optional || expression.callee.object.type !== "Identifier" ||
          expression.callee.object.name !== "Promise" || expression.callee.property.type !== "Identifier" ||
          expression.callee.property.name !== "all" || expression.arguments.length !== 1) continue;
      const mapper = expression.arguments[0];
      if (mapper?.type !== "CallExpression" || mapper.optional ||
          mapper.callee.type !== "MemberExpression" || mapper.callee.computed || mapper.callee.optional ||
          mapper.callee.object.type !== "Identifier" || mapper.callee.object.name !== entry.id.name ||
          mapper.callee.property.type !== "Identifier" || mapper.callee.property.name !== "map" ||
          mapper.arguments.length !== 1) continue;
      const callback = mapper.arguments[0];
      if (callback?.type !== "ArrowFunctionExpression" || !callback.async ||
          !callback.params.length || callback.params.length > 2 ||
          !callback.params.every(param => param.type === "Identifier") ||
          callback.body.type !== "BlockStatement" || callback.body.body.length !== 2) continue;
      const [result, output] = callback.body.body;
      if (result?.type !== "VariableDeclaration" || result.declarations.length !== 1 ||
          result.declarations[0]?.id.type !== "Identifier" ||
          result.declarations[0].init?.type !== "AwaitExpression" ||
          output?.type !== "ExpressionStatement" || output.expression.type !== "CallExpression" ||
          output.expression.callee.type !== "Identifier" || output.expression.callee.name !== "text") continue;
      const call = result.declarations[0].init.argument;
      if (call.type !== "CallExpression" || call.optional ||
          call.callee.type !== "MemberExpression" || call.callee.optional || call.callee.computed ||
          call.callee.object.type !== "Identifier" || call.callee.object.name !== "tools" ||
          call.callee.property.type !== "Identifier" ||
          !["bash", "powershell"].includes(call.callee.property.name) ||
          call.arguments.length !== 1 || call.arguments[0]?.type !== "ObjectExpression") continue;
      const properties = call.arguments[0].properties;
      const keys = properties.map(property => property.type === "Property" &&
        !property.computed && !property.method && property.kind === "init" &&
        property.key.type === "Identifier" ? property.key.name : undefined);
      if (keys.some(key => key === undefined || !["command", "timeout"].includes(key)) ||
          new Set(keys).size !== keys.length) continue;
      const command = properties[keys.indexOf("command")];
      if (command?.type !== "Property" || command.value.type !== "Identifier" ||
          command.value.name !== callback.params[0]!.name) continue;
      // Options and output must not contain hidden calls or other side effects.
      const timeout = properties[keys.indexOf("timeout")];
      if (timeout && (timeout.type !== "Property" || timeout.value.type !== "Literal")) continue;
      const pureOutput = (node: Node): boolean => {
        switch (node.type) {
          case "Identifier": case "Literal": return true;
          case "ObjectExpression": return node.properties.every(pureOutput);
          case "Property": return !node.computed && !node.method && node.kind === "init" &&
            pureOutput(node.key) && pureOutput(node.value);
          case "SpreadElement": return pureOutput(node.argument);
          case "BinaryExpression": return pureOutput(node.left) && pureOutput(node.right);
          default: return false;
        }
      };
      if (!output.expression.arguments.every(pureOutput)) continue;
      batches.set(statement.expression, { binding: entry.id.name, commands,
        tool: call.callee.property.name, params: callback.params.map(param => param.name), output });
      batchDeclarations.set(entry, commands.length);
    }
    let budget = 2000;
    const describe = (node: Node, depth = 0, available = width): string => {
      if (--budget < 0 || depth > 24) throw new Error("Summary limit");
      const child = (value: Node) => describe(value, depth + 1, available);
      const batch = batches.get(node);
      if (batch) {
        const rows = batch.commands.map(command => {
          // Use only an explicit leading printf banner as a label.
          const heading = command.match(/^\s*printf\s+['"](?:\\n|\s)*===\s+([^\r\n]+?)\s+===(?:\\n|\s)*['"]/);
          const label = heading?.[1]?.trim();
          return "  " + mark(batch.tool, true, command) +
            (label ? " · " + label : " " + command.replace(/\s+/g, " ").trim());
        });
        return "parallel " + batch.binding + ".map(" + batch.params.join(", ") + ")\n" +
          rows.join("\n") + "\n  output " + child(batch.output);
      }
      const list = (values: Node[]) => values.map(child).join(", ");
      // Tool markers carry identity, not display width. Both render passes must
      // choose the same layout so call positions follow the visible text.
      const fits = (text: string) => !text.includes("\n") &&
        visibleWidth(text.replace(/\u0000[^\u0000]*\u0000/g, "")) <=
          Math.max(12, available - depth * 2);
      const group = (items: string[], open: string, close: string, force = false) => {
        const inline = open + items.join(", ") + close;
        return !items.length || (!force && fits(inline)) ? inline :
          open + "\n" + indent(items.join(",\n")) + "\n" + close;
      };
      const indent = (text: string) =>
        text
          .split("\n")
          .map((line) => "  " + line)
          .join("\n");
      switch (node.type) {
        case "Identifier":
          return node.name;
        case "Literal":
          if ("regex" in node)
            return "/" + node.regex.pattern + "/" + node.regex.flags;
          if ("bigint" in node) return node.bigint + "n";
          if (typeof node.value === "string") {
            return JSON.stringify(node.value);
          }
          return JSON.stringify(node.value) ?? String(node.value);
        case "TemplateLiteral": {
          const source = node as Node & { start: number; end: number };
          return code.slice(source.start, source.end);
        }
        case "ExpressionStatement": {
          const expression = node.expression;
          if (expression.type === "CallExpression" &&
              expression.callee.type === "Identifier" &&
              ["store", "load"].includes(expression.callee.name))
            return "";
          return child(expression);
        }
        case "AwaitExpression":
          return child(node.argument);
        case "MemberExpression":
          if (node.optional) throw new Error("Optional member");
          if (node.computed)
            return child(node.object) + "[" + child(node.property) + "]";
          return child(node.object) + "." + child(node.property);
        case "CallExpression": {
          if (node.optional) throw new Error("Optional call");
          const argumentText = node.arguments.map(child);
          const args = argumentText.join(", ");
          if (node.callee.type === "Identifier" && node.callee.name === "text")
            return node.arguments.length === 1 &&
              node.arguments[0]?.type === "Identifier" &&
              !codemodeHelpers.has(node.arguments[0].name) ? "" : args;
          const helper = node.callee.type === "Identifier" ? node.callee.name
            : node.callee.type === "MemberExpression" && !node.callee.computed &&
              node.callee.object.type === "Identifier" && node.callee.object.name === "tools" &&
              node.callee.property.type === "Identifier" ? node.callee.property.name : undefined;
          if (helper === "describeTool" || helper === "searchTools") {
            const value: Node | undefined = node.arguments[0];
            if (value?.type === "Literal" && typeof value.value === "string")
              return helper + " " + value.value;
          }
          if (node.callee.type === "MemberExpression" && !node.callee.computed &&
              node.callee.object.type === "Identifier" && node.callee.object.name === "tools" &&
              node.callee.property.type === "Identifier")
            return formatToolCall(node, code, node.callee.property.name, mark);
          const member = node.callee.type === "MemberExpression" ? node.callee : undefined;
          if (member?.optional) throw new Error("Optional member");
          const object = member ? child(member.object) : undefined;
          const name = member ? object + (member.computed
            ? "[" + child(member.property) + "]" : "." + child(member.property))
            : child(node.callee);
          if (primaryTools.has(name.toLowerCase()))
            return formatToolCall(node, code, name.toLowerCase(), mark);
          if (
            node.callee.type === "FunctionExpression" ||
            node.callee.type === "ArrowFunctionExpression"
          )
            return "(" + name + ")(" + args + ")";
          // Break fluent calls at member boundaries before wrapping arguments.
          if (node.callee.type === "MemberExpression" && !node.callee.computed) {
            const inline = name + "(" + args + ")";
            if (!fits(inline)) {
              return object + "\n" + indent("." + child(node.callee.property) +
                group(argumentText, "(", ")"));
            }
          }
          return group(argumentText, name + "(", ")");
        }
        case "VariableDeclaration":
          return node.declarations.map((declaration) =>
            child(declaration),
          ).filter(Boolean).join("\n");
        case "VariableDeclarator": {
          const binding = child(node.id);
          const count = batchDeclarations.get(node);
          if (count !== undefined) return binding + " ← [" + count + " shell commands]";
          return node.init
            ? binding + " ← " + describe(node.init, depth + 1,
                available - visibleWidth(binding + " ← "))
            : "declare " + binding;
        }
        case "ArrayExpression":
          return group(node.elements.map(item => item ? child(item) : ""), "[", "]",
            node.elements.some(item => item?.type === "ArrayExpression" ||
              item?.type === "ObjectExpression"));
        case "ObjectExpression":
        case "ObjectPattern":
          return group(node.properties.map(child), "{", "}");
        case "Property":
          if (node.kind !== "init" || node.method || node.computed)
            throw new Error("Complex property");
          return node.shorthand
            ? child(node.value)
            : child(node.key) + ": " + child(node.value);
        case "ArrowFunctionExpression":
        case "FunctionExpression":
          if (node.generator) throw new Error("Generator");
          return (
            (node.async ? "async " : "") +
            "(" +
            list(node.params) +
            ") → " +
            (node.body.type === "BlockStatement"
              ? "{\n" + indent(child(node.body)) + "\n}"
              : child(node.body))
          );
        case "BlockStatement":
          return node.body.map(child).filter(Boolean).join("\n");
        case "ArrayPattern":
          return "[" + node.elements.map(item => item ? child(item) : "").join(", ") + "]";
        case "RestElement":
        case "SpreadElement":
          return "..." + child(node.argument);
        case "TryStatement":
          return "try\n" + indent(child(node.block)) +
            (node.handler ? "\n" + child(node.handler) : "") +
            (node.finalizer ? "\nfinally\n" + indent(child(node.finalizer)) : "") +
            "\nend try";
        case "CatchClause":
          return "catch" + (node.param ? " " + child(node.param) : "") +
            "\n" + indent(child(node.body));
        case "ReturnStatement":
          return "return" + (node.argument ? " " + child(node.argument) : "");
        case "ThrowStatement":
          return "throw " + child(node.argument);
        case "IfStatement":
          return (
            "if " +
            child(node.test) +
            " then\n" +
            indent(child(node.consequent)) +
            (node.alternate ? "\nelse\n" + indent(child(node.alternate)) : "") +
            "\nend if"
          );
        case "ForOfStatement": {
          const left =
            node.left.type === "VariableDeclaration"
              ? node.left.declarations
                  .map((declaration) => child(declaration.id))
                  .join(", ")
              : child(node.left);
          return (
            "for " +
            left +
            " in " +
            child(node.right) +
            "\n" +
            indent(child(node.body)) +
            "\nend for"
          );
        }
        case "WhileStatement":
          return (
            "while " +
            child(node.test) +
            "\n" +
            indent(child(node.body)) +
            "\nend while"
          );
        case "AssignmentExpression":
          if (node.operator !== "=") throw new Error("Compound assignment");
          return child(node.left) + " ← " + child(node.right);
        case "BinaryExpression":
        case "LogicalExpression": {
          const operators: Record<string, string> = {
            "===": "is",
            "!==": "is not",
            "&&": "and",
            "||": "or",
            "??": "??",
          };
          const left = child(node.left);
          const right = child(node.right);
          const operator = operators[node.operator] ?? node.operator;
          const inline = "(" + left + " " + operator + " " + right + ")";
          return fits(inline) ? inline :
            "(" + left + "\n" + indent(operator + " " + right) + ")";
        }
        case "ConditionalExpression": {
          const test = child(node.test);
          const consequent = child(node.consequent);
          const alternate = child(node.alternate);
          const inline = "if " + test + " then " + consequent + " else " + alternate;
          return fits(inline) ? inline : "if " + test + "\n" +
            indent("then " + consequent) + "\n" + indent("else " + alternate);
        }
        case "UnaryExpression":
          if (node.operator === "!") return "not " + child(node.argument);
          if (node.operator === "-") return "-" + child(node.argument);
          return node.operator + " " + child(node.argument);
        case "EmptyStatement":
          return "";
        default: {
          const source = node as Node & { start: number; end: number };
          return syntaxPseudocode(code.slice(source.start, source.end), mark);
        }
      }
    };
    // Validate the whole script and keep all pseudocode lines.
    const summary = program.body
      .map((node) => describe(node))
      .filter(Boolean)
      .join("\n");
    return summary || "// no code";
  } catch {
    return syntaxPseudocode(code, mark);
  }
}

export interface ToolSummary {
  text: string;
  calls: { name: string; line: number; column: number; command?: boolean; target?: string }[];
}

/** Retain call identity separately from its display text. */
export function summarize(code: string, width = 80): ToolSummary {
  width = Number.isFinite(width) ? Math.max(12, Math.floor(width)) : 80;
  // Check decoded display text too: escaped string literals can introduce NULs.
  const plain = renderPseudocode(code, name => name, width);
  let marker = "\u0000tool";
  while (code.includes(marker) || plain.includes(marker)) marker += "_";
  const names: { name: string; command?: boolean; target?: string }[] = [];
  const marked = renderPseudocode(code, (name, command, target) => {
    names.push({ name, ...(command ? { command: true } : {}),
      ...(target !== undefined ? { target } : {}) });
    return marker + (names.length - 1) + "\u0000" + name;
  }, width);
  const calls: ToolSummary["calls"] = [];
  let text = "";
  let offset = 0;
  while (true) {
    const start = marked.indexOf(marker, offset);
    if (start < 0) break;
    text += marked.slice(offset, start);
    const end = marked.indexOf("\u0000", start + marker.length);
    const identity = names[Number(marked.slice(start + marker.length, end))]!;
    calls.push({ ...identity, line: text.split("\n").length - 1,
      column: text.length - text.lastIndexOf("\n") - 1 });
    offset = end + 1;
  }
  text += marked.slice(offset);
  return { text, calls };
}

export function pseudocode(code: string, width = 80): string {
  return summarize(code, width).text;
}
