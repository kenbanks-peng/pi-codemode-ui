import { visibleWidth } from "@earendil-works/pi-tui";
import { parse } from "acorn";
import type { Node, Program } from "estree";
import { isPrimaryTool } from "../tools/display.ts";
import { codemodeHelpers, type MarkTool } from "./helpers.ts";
import { findShellBatches } from "./shell-batch.ts";
import { directToolName, sourceText } from "./syntax.ts";
import { renderTokenLayout } from "./token-layout.ts";
import { formatToolCall } from "./tool-call.ts";

/** Reduce parsed syntax to code-like pseudocode. Never execute the script. */
export function renderAstLayout(code: string, mark: MarkTool, width: number): string {
  if (!code.trim()) return "// no code";
  if (code.length > 50000) return renderTokenLayout(code, mark);
  try {
    const program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as unknown as Program;
    const { batches, batchDeclarations } = findShellBatches(program);
    let budget = 2000;
    const describe = (node: Node, depth = 0, available = width): string => {
      if (--budget < 0 || depth > 24) throw new Error("Summary limit");
      const child = (value: Node) => describe(value, depth + 1, available);
      const batch = batches.get(node);
      if (batch) {
        const rows = batch.commands.map((command) => {
          // Use only an explicit leading printf banner as a label.
          const heading = command.match(
            /^\s*printf\s+['"](?:\\n|\s)*===\s+([^\r\n]+?)\s+===(?:\\n|\s)*['"]/,
          );
          const label = heading?.[1]?.trim();
          return (
            "  " +
            mark(batch.tool, true, command) +
            (label ? " · " + label : " " + command.replace(/\s+/g, " ").trim())
          );
        });
        return (
          "parallel " +
          batch.binding +
          ".map(" +
          batch.params.join(", ") +
          ")\n" +
          rows.join("\n") +
          "\n  output " +
          child(batch.output)
        );
      }
      const list = (values: Node[]) => values.map(child).join(", ");
      // Tool markers carry identity, not display width. Both render passes must
      // choose the same layout so call positions follow the visible text.
      const fits = (text: string) =>
        !text.includes("\n") &&
        visibleWidth(text.replace(/\u0000[^\u0000]*\u0000/g, "")) <=
          Math.max(12, available - depth * 2);
      const group = (items: string[], open: string, close: string, force = false) => {
        const inline = open + items.join(", ") + close;
        return !items.length || (!force && fits(inline))
          ? inline
          : open + "\n" + indent(items.join(",\n")) + "\n" + close;
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
          if ("regex" in node) return "/" + node.regex.pattern + "/" + node.regex.flags;
          if ("bigint" in node) return node.bigint + "n";
          if (typeof node.value === "string") {
            return JSON.stringify(node.value);
          }
          return JSON.stringify(node.value) ?? String(node.value);
        case "TemplateLiteral":
          return sourceText(node, code);
        case "ExpressionStatement": {
          const expression = node.expression;
          if (
            expression.type === "CallExpression" &&
            expression.callee.type === "Identifier" &&
            ["store", "load"].includes(expression.callee.name)
          )
            return "";
          return child(expression);
        }
        case "AwaitExpression":
          return child(node.argument);
        case "MemberExpression":
          if (node.optional) throw new Error("Optional member");
          if (node.computed) return child(node.object) + "[" + child(node.property) + "]";
          return child(node.object) + "." + child(node.property);
        case "CallExpression": {
          if (node.optional) throw new Error("Optional call");
          const argumentText = node.arguments.map(child);
          const args = argumentText.join(", ");
          if (node.callee.type === "Identifier" && node.callee.name === "text")
            return node.arguments.length === 1 &&
              node.arguments[0]?.type === "Identifier" &&
              !codemodeHelpers.has(node.arguments[0].name)
              ? ""
              : args;
          const tool = directToolName(node);
          const helper = node.callee.type === "Identifier" ? node.callee.name : tool;
          if (helper === "describeTool" || helper === "searchTools") {
            const value: Node | undefined = node.arguments[0];
            if (value?.type === "Literal" && typeof value.value === "string")
              return helper + " " + value.value;
          }
          if (tool) return formatToolCall(node, code, tool, mark);
          const member = node.callee.type === "MemberExpression" ? node.callee : undefined;
          if (member?.optional) throw new Error("Optional member");
          const object = member ? child(member.object) : undefined;
          const name = member
            ? object +
              (member.computed ? "[" + child(member.property) + "]" : "." + child(member.property))
            : child(node.callee);
          if (isPrimaryTool(name.toLowerCase()))
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
              return (
                object +
                "\n" +
                indent("." + child(node.callee.property) + group(argumentText, "(", ")"))
              );
            }
          }
          return group(argumentText, name + "(", ")");
        }
        case "VariableDeclaration":
          return node.declarations
            .map((declaration) => child(declaration))
            .filter(Boolean)
            .join("\n");
        case "VariableDeclarator": {
          const count = batchDeclarations.get(node);
          if (count !== undefined) return "[" + count + " shell commands]";
          return node.init ? child(node.init) : "";
        }
        case "ArrayExpression":
          return group(
            node.elements.map((item) => (item ? child(item) : "")),
            "[",
            "]",
            node.elements.some(
              (item) => item?.type === "ArrayExpression" || item?.type === "ObjectExpression",
            ),
          );
        case "ObjectExpression":
        case "ObjectPattern":
          return group(node.properties.map(child), "{", "}");
        case "Property":
          if (node.kind !== "init" || node.method || node.computed)
            throw new Error("Complex property");
          return node.shorthand ? child(node.value) : child(node.key) + ": " + child(node.value);
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
          return "[" + node.elements.map((item) => (item ? child(item) : "")).join(", ") + "]";
        case "RestElement":
        case "SpreadElement":
          return "..." + child(node.argument);
        case "TryStatement":
          return (
            "try\n" +
            indent(child(node.block)) +
            (node.handler ? "\n" + child(node.handler) : "") +
            (node.finalizer ? "\nfinally\n" + indent(child(node.finalizer)) : "") +
            "\nend try"
          );
        case "CatchClause":
          return (
            "catch" + (node.param ? " " + child(node.param) : "") + "\n" + indent(child(node.body))
          );
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
              ? node.left.declarations.map((declaration) => child(declaration.id)).join(", ")
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
          return "while " + child(node.test) + "\n" + indent(child(node.body)) + "\nend while";
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
          return fits(inline) ? inline : "(" + left + "\n" + indent(operator + " " + right) + ")";
        }
        case "ConditionalExpression": {
          const test = child(node.test);
          const consequent = child(node.consequent);
          const alternate = child(node.alternate);
          const inline = "if " + test + " then " + consequent + " else " + alternate;
          return fits(inline)
            ? inline
            : "if " +
                test +
                "\n" +
                indent("then " + consequent) +
                "\n" +
                indent("else " + alternate);
        }
        case "UnaryExpression":
          if (node.operator === "!") return "not " + child(node.argument);
          if (node.operator === "-") return "-" + child(node.argument);
          return node.operator + " " + child(node.argument);
        case "EmptyStatement":
          return "";
        default:
          return renderTokenLayout(sourceText(node, code), mark);
      }
    };
    // Validate the whole script and keep all pseudocode lines.
    const summary = program.body
      .map((node) => describe(node))
      .filter(Boolean)
      .join("\n");
    return summary || "// no code";
  } catch {
    return renderTokenLayout(code, mark);
  }
}
