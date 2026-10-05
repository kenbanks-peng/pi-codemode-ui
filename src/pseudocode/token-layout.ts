import { parse, tokenizer, type Token } from "acorn";
import type { Program } from "estree";
import { isPrimaryTool } from "../tools/display.ts";
import { codemodeHelpers, type MarkTool } from "./helpers.ts";
import { formatToolCall } from "./tool-call.ts";

/** Simplify tokens without changing strings or comments. */
export function renderTokenLayout(code: string, mark: MarkTool): string {
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
      token.type.label === "name" &&
      code.slice(token.start, token.end) === "tools" &&
      ![".", "?."].includes(scanned[index - 1]?.type.label ?? "") &&
      scanned[index + 1]?.type.label === "." &&
      property?.type.label === "name" &&
      scanned[index + 3]?.type.label === "("
    ) {
      const close = pairs.get(index + 3);
      const call = close === undefined ? undefined : code.slice(token.start, scanned[close]!.end);
      let summary: string | undefined;
      if (call && call.length <= 50000) {
        try {
          const parsed = parse(call, {
            ecmaVersion: "latest",
            allowAwaitOutsideFunction: true,
          }) as unknown as Program;
          const expression = parsed.body[0];
          if (
            expression?.type === "ExpressionStatement" &&
            expression.expression.type === "CallExpression"
          ) {
            summary = formatToolCall(
              expression.expression,
              call,
              code.slice(property.start, property.end),
              mark,
            );
          }
        } catch {
          /* Keep incomplete calls readable. */
        }
      }
      replacements.push({
        start: token.start,
        end: summary !== undefined ? scanned[close!]!.end : property.end,
        text:
          summary !== undefined
            ? summary
            : isPrimaryTool(code.slice(property.start, property.end))
              ? code.slice(property.start, property.end)
              : mark(code.slice(property.start, property.end)),
      });
    }
    if (
      ["const", "let", "var"].includes(code.slice(token.start, token.end)) &&
      (token.type.keyword || token.type.label === "name")
    ) {
      let depth = 0;
      for (let cursor = index + 1; cursor < scanned.length; cursor++) {
        const current = scanned[cursor]!;
        const label = current.type.label;
        if (["[", "{"].includes(label)) depth++;
        else if (["]", "}"].includes(label)) depth--;
        if (depth < 0 || (depth === 0 && [";", "in", "of"].includes(label))) break;
        if (depth === 0 && label === "=") {
          replacements.push({
            start: token.start,
            end: scanned[cursor + 1]?.start ?? current.end,
            text: "",
          });
          break;
        }
      }
    }
    if (token.type.label !== "name" || code.slice(token.start, token.end) !== "text") return;
    const previous = scanned[index - 1]?.type.label;
    if ([".", "?.", "function", "new"].includes(previous ?? "")) return;
    const close = pairs.get(index + 1);
    if (close === undefined || scanned[close + 1]?.type.label === "{") return;
    if (
      close === index + 3 &&
      scanned[index + 2]?.type.label === "name" &&
      !codemodeHelpers.has(code.slice(scanned[index + 2]!.start, scanned[index + 2]!.end))
    ) {
      replacements.push({
        start: token.start,
        end: scanned[close + 1]?.type.label === ";" ? scanned[close + 1]!.end : scanned[close]!.end,
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
