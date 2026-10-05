import type { CallExpression, Node } from "estree";
import { preferredFields, toolDisplay } from "../tools/display.ts";
import type { MarkTool } from "./helpers.ts";
import { propertyKey, sourceText, staticString } from "./syntax.ts";

/** Default for every tool without a more useful command-specific layout. */
export function formatToolCall(
  node: CallExpression,
  code: string,
  name: string,
  mark: MarkTool,
): string {
  const override = toolDisplay(name);
  const source = (node: Node) => sourceText(node, code).replace(/\s+/g, " ").trim();
  const value = (node: Node, depth = 0): string => {
    if (depth > 3) return "…";
    if (node.type === "Literal" && typeof node.value === "string")
      return JSON.stringify(node.value);
    if (node.type === "ObjectExpression") return "{" + items(node.properties, depth, ", ") + "}";
    if (node.type === "ArrayExpression")
      return (
        "[" +
        node.elements
          .slice(0, 3)
          .map((item) => (item ? value(item, depth + 1) : ""))
          .concat(node.elements.length > 3 ? ["…"] : [])
          .join(", ") +
        "]"
      );
    if (node.type === "Property" && !node.computed && !node.method && node.kind === "init") {
      const key =
        node.key.type === "Literal" &&
        typeof node.key.value === "string" &&
        /^[A-Za-z_$][\w$]*$/.test(node.key.value)
          ? node.key.value
          : source(node.key);
      // Non-boolean authentication can contain credentials or refer to them.
      if (
        override.redact?.includes(key) &&
        !(node.value.type === "Literal" && typeof node.value.value === "boolean")
      )
        return key + ": [redacted]";
      return node.shorthand ? value(node.value, depth) : key + ": " + value(node.value, depth);
    }
    return source(node);
  };
  const items = (nodes: Node[], depth: number, separator: string) =>
    nodes
      .slice(0, 3)
      .map((node) => value(node, depth + 1))
      .concat(nodes.length > 3 ? ["…"] : [])
      .join(separator);
  const argument = node.arguments[0];
  let args: string;
  let rawTarget = false;
  let identityTarget: string | undefined;
  if (node.arguments.length === 1 && argument?.type === "ObjectExpression") {
    // Spreads, computed keys, and duplicates can change the actual target.
    const keys = argument.properties.map(propertyKey);
    const safe = keys.every((key) => key !== undefined) && new Set(keys).size === keys.length;
    const preferred = safe ? preferredFields(override) : [];
    const targets = preferred.flatMap((key) =>
      argument.properties.filter((p) => propertyKey(p) === key),
    );
    const rest = argument.properties.filter(
      (p) => !targets.includes(p) && !override.hidden?.includes(propertyKey(p)!),
    );
    const visible = [...targets, ...rest];
    const shown = visible.slice(0, 3);
    args = shown
      .map((p) => {
        if (targets.includes(p) && p.type === "Property") {
          const key = propertyKey(p);
          if (override.labeled?.includes(key!)) return value(p);
          if (override.rawTarget) {
            rawTarget = true;
            const target = p.value;
            identityTarget = staticString(target);
            const displayTarget = (identityTarget ?? sourceText(target, code))
              .replace(/\s+/g, " ")
              .trim();
            return displayTarget;
          }
          if (
            name === "todo" &&
            key === "action" &&
            p.value.type === "Literal" &&
            typeof p.value.value === "string"
          )
            return p.value.value;
          if (name === "todo" && key === "id") return "#" + value(p.value);
          if (
            p.value.type === "Literal" &&
            typeof p.value.value === "string" &&
            /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(p.value.value)
          )
            return p.value.value;
          return value(p.value);
        }
        return value(p);
      })
      .concat(visible.length > shown.length ? ["…"] : [])
      .join(" · ");
    if (name === "todo" && targets.length > 1 && propertyKey(targets[0]!) === "action") {
      // The action and task target form one command.
      args = args.replace(" · ", " ");
    }
    if (name === "ask_user_question" && safe) {
      const questions = argument.properties.find((p) => propertyKey(p) === "questions");
      if (questions?.type === "Property" && questions.value.type === "ArrayExpression") {
        const entries = questions.value.elements;
        const texts = entries.map((entry) => {
          if (entry?.type !== "ObjectExpression") return undefined;
          const entryKeys = entry.properties.map(propertyKey);
          if (
            entryKeys.some((key) => key === undefined) ||
            new Set(entryKeys).size !== entryKeys.length
          )
            return undefined;
          const field = entry.properties.find((p) => propertyKey(p) === "question");
          return field?.type === "Property" ? value(field.value) : undefined;
        });
        if (texts.every((text) => text !== undefined)) {
          const extra = argument.properties.filter((p) => p !== questions);
          args =
            texts
              .slice(0, 3)
              .concat(texts.length > 3 ? ["…"] : [])
              .join(" · ") +
            " · " +
            entries.length +
            (entries.length === 1 ? " question" : " questions") +
            (extra.length ? " · " + items(extra, 0, " · ") : "");
        }
      }
    }
  } else args = items(node.arguments, 0, " · ");
  return mark(name, rawTarget, identityTarget) + (args ? " " + args : "");
}
