import { parse, tokenizer, type Token } from "acorn";
import type { Node, Program } from "estree";

const primaryTools = new Set([
  "read", "edit", "write", "bash", "powershell", "grep", "find", "ls",
]);

// Codemode globals are meaningful operations, not ordinary result variables.
const codemodeHelpers = new Set([
  "ALL_TOOLS", "searchTools", "describeTool", "describeNamespace",
  "text", "image", "console", "store", "load", "exit", "models",
]);

/** Simplify tokens without changing strings or comments. */
function syntaxPseudocode(code: string): string {
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
      scanned[index + 3]?.type.label === "(" &&
      primaryTools.has(code.slice(property.start, property.end))
    ) {
      const close = pairs.get(index + 3);
      const call = close === undefined ? undefined
        : code.slice(token.start, scanned[close]!.end);
      let summary: string | undefined;
      if (call && call.length <= 50000) {
        try {
          const parsed = parse(call, { ecmaVersion: "latest" }) as unknown as Program;
          const expression = parsed.body[0];
          if (expression?.type === "ExpressionStatement" &&
              expression.expression.type === "CallExpression") {
            const arg = expression.expression.arguments[0];
            const name = code.slice(property.start, property.end);
            const key = ["bash", "powershell"].includes(name) ? "command"
              : ["find", "grep"].includes(name) ? "pattern" : "path";
            if (arg?.type === "ObjectExpression") {
              const field = arg.properties.find((p) => p.type === "Property" &&
                !p.computed && !p.method && p.kind === "init" &&
                ((p.key.type === "Identifier" && p.key.name === key) ||
                 (p.key.type === "Literal" && p.key.value === key)));
              if (field?.type === "Property" && field.value.type === "Literal" &&
                  typeof field.value.value === "string")
                summary = name + " " + field.value.value.replace(/\s+/g, " ").trim();
              else if (field?.type === "Property" && field.value.type === "TemplateLiteral" &&
                  field.value.expressions.length === 0)
                summary = name + " " + field.value.quasis.map((part) =>
                  part.value.cooked ?? part.value.raw).join("").replace(/\s+/g, " ").trim();
            }
          }
        } catch { /* Keep incomplete calls readable. */ }
      }
      replacements.push({
        start: token.start,
        end: summary?.startsWith(code.slice(property.start, property.end) + " ")
          ? scanned[close!]!.end : property.end,
        text: summary?.startsWith(code.slice(property.start, property.end) + " ")
          ? summary : code.slice(property.start, property.end),
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
export function pseudocode(code: string): string {
  if (!code.trim()) return "// no code";
  if (code.length > 50000) return syntaxPseudocode(code);
  try {
    const program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as unknown as Program;
    let budget = 2000;
    const describe = (node: Node, depth = 0): string => {
      if (--budget < 0 || depth > 24) throw new Error("Summary limit");
      const child = (value: Node) => describe(value, depth + 1);
      // Validate omitted items too, so unsupported syntax always uses the fallback.
      const list = (values: Node[], limit = 3) => {
        const items = values.map(child);
        return items
          .slice(0, limit)
          .concat(items.length > limit ? ["…"] : [])
          .join(", ");
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
            const value =
              node.value.length > 80
                ? node.value.slice(0, 77) + "…"
                : node.value;
            return JSON.stringify(value);
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
          const args = list(node.arguments);
          if (node.callee.type === "Identifier" && node.callee.name === "text")
            return node.arguments.length === 1 &&
              node.arguments[0]?.type === "Identifier" &&
              !codemodeHelpers.has(node.arguments[0].name) ? "" : args;
          const helper = node.callee.type === "Identifier" ? node.callee.name
            : node.callee.type === "MemberExpression" && !node.callee.computed &&
              node.callee.object.type === "Identifier" && node.callee.object.name === "tools" &&
              node.callee.property.type === "Identifier" ? node.callee.property.name : undefined;
          if (helper === "describeTool" || helper === "getToolGuidance" || helper === "searchTools") {
            let value: Node | undefined = node.arguments[0];
            if (helper === "getToolGuidance" && value?.type === "ObjectExpression") {
              const field = value.properties.find((p) => p.type === "Property" &&
                !p.computed && !p.method && p.kind === "init" &&
                ((p.key.type === "Identifier" && p.key.name === "name") ||
                 (p.key.type === "Literal" && p.key.value === "name")));
              value = field?.type === "Property" ? field.value : undefined;
            }
            if (value?.type === "Literal" && typeof value.value === "string")
              return helper + " " + value.value;
          }
          const callee = child(node.callee);
          const name =
            node.callee.type === "MemberExpression" &&
            !node.callee.computed &&
            node.callee.object.type === "Identifier" &&
            node.callee.object.name === "tools" &&
            node.callee.property.type === "Identifier" &&
            primaryTools.has(node.callee.property.name)
              ? node.callee.property.name
              : callee;
          const argument = node.arguments[0];
          if (primaryTools.has(name.toLowerCase()) &&
              node.arguments.length === 1 && argument?.type === "ObjectExpression") {
            const key = ["bash", "powershell"].includes(name.toLowerCase()) ? "command"
              : ["find", "grep"].includes(name.toLowerCase()) ? "pattern" : "path";
            const property = argument.properties.find((property) =>
              property.type === "Property" && !property.computed &&
              !property.method && property.kind === "init" &&
              ((property.key.type === "Identifier" && property.key.name === key) ||
               (property.key.type === "Literal" && property.key.value === key)));
            if (property?.type === "Property") {
              const value = property.value;
              return name.toLowerCase() + " " +
                (value.type === "Literal" && typeof value.value === "string"
                  ? value.value.replace(/\s+/g, " ").trim()
                  : value.type === "TemplateLiteral" && value.expressions.length === 0
                    ? value.quasis.map((part) => part.value.cooked ?? part.value.raw).join("").replace(/\s+/g, " ").trim()
                    : child(value).replace(/\s+/g, " ").trim());
            }
          }
          if (
            node.callee.type === "FunctionExpression" ||
            node.callee.type === "ArrowFunctionExpression"
          )
            return "(" + name + ")(" + args + ")";
          return name + "(" + args + ")";
        }
        case "VariableDeclaration":
          return node.declarations.map((declaration) =>
            node.kind === "const" && declaration.init
              ? child(declaration.init)
              : child(declaration),
          ).filter(Boolean).join("\n");
        case "VariableDeclarator":
          return node.init
            ? child(node.id) + " ← " + child(node.init)
            : "declare " + child(node.id);
        case "ArrayExpression": {
          const items = node.elements.map((item) => (item ? child(item) : ""));
          return (
            "[" +
            items
              .slice(0, 3)
              .concat(items.length > 3 ? ["…"] : [])
              .join(", ") +
            "]"
          );
        }
        case "ObjectExpression":
          return "{" + list(node.properties, 2) + "}";
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
          return (
            "(" +
            child(node.left) +
            " " +
            (operators[node.operator] ?? node.operator) +
            " " +
            child(node.right) +
            ")"
          );
        }
        case "ConditionalExpression":
          return (
            "if " +
            child(node.test) +
            " then " +
            child(node.consequent) +
            " else " +
            child(node.alternate)
          );
        case "UnaryExpression":
          if (node.operator === "!") return "not " + child(node.argument);
          if (node.operator === "-") return "-" + child(node.argument);
          throw new Error("Unsupported unary expression");
        case "EmptyStatement":
          return "";
        default: {
          const source = node as Node & { start: number; end: number };
          return syntaxPseudocode(code.slice(source.start, source.end));
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
    return syntaxPseudocode(code);
  }
}
