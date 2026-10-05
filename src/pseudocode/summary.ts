import { renderAstLayout } from "./ast-layout.ts";

export interface ToolSummary {
  text: string;
  calls: { name: string; line: number; column: number; command?: boolean; target?: string }[];
}

/** Retain call identity separately from its display text. */
export function summarize(code: string, width = 80): ToolSummary {
  width = Number.isFinite(width) ? Math.max(12, Math.floor(width)) : 80;
  // Check decoded display text too: escaped string literals can introduce NULs.
  const plain = renderAstLayout(code, (name) => name, width);
  let marker = "\u0000tool";
  while (code.includes(marker) || plain.includes(marker)) marker += "_";
  const names: { name: string; command?: boolean; target?: string }[] = [];
  const marked = renderAstLayout(
    code,
    (name, command, target) => {
      names.push({
        name,
        ...(command ? { command: true } : {}),
        ...(target !== undefined ? { target } : {}),
      });
      return marker + (names.length - 1) + "\u0000" + name;
    },
    width,
  );
  const calls: ToolSummary["calls"] = [];
  let text = "";
  let offset = 0;
  while (true) {
    const start = marked.indexOf(marker, offset);
    if (start < 0) break;
    text += marked.slice(offset, start);
    const end = marked.indexOf("\u0000", start + marker.length);
    const identity = names[Number(marked.slice(start + marker.length, end))]!;
    calls.push({
      ...identity,
      line: text.split("\n").length - 1,
      column: text.length - text.lastIndexOf("\n") - 1,
    });
    offset = end + 1;
  }
  text += marked.slice(offset);
  return { text, calls };
}

export function pseudocode(code: string, width = 80): string {
  return summarize(code, width).text;
}
