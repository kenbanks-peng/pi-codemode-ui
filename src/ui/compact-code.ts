import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ToolSummary } from "../pseudocode/summary.ts";
import type { RunModel, ToolCall } from "../run/types.ts";
import { safeText } from "../terminal/safe-text.ts";
import { isShellTool, targetField } from "../tools/display.ts";
import { callAppearance } from "./call-appearance.ts";
import { renderCompactCommand } from "./compact-command.ts";

/** Compare an incomplete host JSON string with a full source literal.
 * Do not decode a cut escape or treat a complete/malformed object as a prefix.
 */
function targetPrefixMatches(call: ToolCall, target: string): boolean {
  if (call.target !== call.args) return false;
  try {
    JSON.parse(call.args);
    return false;
  } catch {
    /* host preview may be cut */
  }
  const field = targetField(call.name);
  if (!field) return false;
  const retained = call.args.replace(/(?:\.{3}|…)$/, "");
  // The host can cut a later option after the target string has closed.
  // Match the intact target without parsing or repairing the remaining JSON.
  const complete = retained.match(
    /^\s*\{\s*"(path|command|pattern)"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/,
  );
  if (complete?.[1] === field) {
    try {
      return JSON.parse(complete[2]!) === target;
    } catch {
      return false;
    }
  }
  const prefix = retained.match(
    /^\s*\{\s*"(path|command|pattern)"\s*:\s*("(?:(?:\\.)|[^"\\])*(?:\\)?)$/,
  );
  return (
    prefix?.[1] === field && prefix[2]!.length >= 9 && JSON.stringify(target).startsWith(prefix[2]!)
  );
}

/** Match source calls to host records and render compact command rows. */
export function renderCompactCode(
  summary: ToolSummary,
  data: RunModel,
  partial: boolean,
  w: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const fg = (token: ThemeColor, text: string) => theme.fg(token, text);
  // Protect quoted strings and comments; style only primary call names.
  const formatted = summary;
  let source = safeText(formatted.text);
  const originalLines = formatted.text.split("\n");
  const compactCalls = formatted.calls.map((call) => ({
    ...call,
    column: safeText(originalLines[call.line]!.slice(0, call.column)).length,
  }));
  const compactByLine = new Map<number, typeof compactCalls>();

  const used = new Set<ToolCall>();
  const annotations = new Map<
    number,
    { symbol: string; color: ThemeColor; call?: ToolCall; defaultTool?: boolean }
  >();
  const commandColor = (name: string, call?: ToolCall): ThemeColor => {
    const tool = name.toLowerCase();
    if (call) return callAppearance(call, "syntaxFunction").color;
    if (
      !call &&
      ["searchTools", "describeTool", "describeNamespace"].includes(name) &&
      !partial &&
      !data.failed
    )
      return "success";
    if (!partial && !data.failed && data.cards.some((card) => card.mutationConfirmation === tool))
      return "success";
    return "syntaxFunction";
  };
  const groups = new Map<number, ToolCall>();
  const sourceLines = source.split("\n");
  const grouped: string[] = [];
  for (let index = 0; index < sourceLines.length; index++) {
    const search = sourceLines[index]?.match(/^searchTools (\S+)$/);
    const target = search?.[1];
    if (
      target &&
      sourceLines[index + 1] === "describeTool " + target &&
      sourceLines[index + 2] === "getToolGuidance " + target
    ) {
      const names = ["searchTools", "describeTool", "getToolGuidance"];
      const members = names.map((name) =>
        data.calls.find(
          (call) =>
            !used.has(call) &&
            call.name.toLowerCase() === name.toLowerCase() &&
            call.target === target,
        ),
      );
      members.forEach((call) => {
        if (call) used.add(call);
      });
      const recorded = members.filter((call): call is ToolCall => !!call);
      const status = recorded.some((call) => call.status === "error" || call.error)
        ? "error"
        : recorded.some((call) => call.status === "running")
          ? "running"
          : recorded.some((call) => call.status === "cancelled")
            ? "cancelled"
            : recorded.some((call) => call.status !== "ok")
              ? "unknown"
              : members[2] && !partial && !data.failed
                ? "ok"
                : "unknown";
      groups.set(grouped.length, {
        name: "discover",
        target,
        args: "",
        status,
        error: recorded.find((call) => call.error)?.error ?? "",
        duration:
          recorded.length && recorded.every((call) => call.duration !== undefined)
            ? recorded.reduce((sum, call) => sum + call.duration!, 0)
            : undefined,
        cost: recorded.some((call) => call.cost !== undefined)
          ? recorded.reduce((sum, call) => sum + (call.cost ?? 0), 0)
          : undefined,
      });
      grouped.push("discover " + target);
      index += 2;
    } else {
      compactByLine.set(
        grouped.length,
        compactCalls.filter((call) => call.line === index),
      );
      grouped.push(sourceLines[index]!);
    }
  }
  source = grouped.join("\n");
  const compactOffsets = new Map<number, ToolSummary["calls"][number]>();
  let lineOffset = 0;
  grouped.forEach((line, index) => {
    for (const call of compactByLine.get(index) ?? [])
      compactOffsets.set(lineOffset + call.column, call);
    lineOffset += line.length + 1;
  });
  const toolNames = [...new Set([...compactOffsets.values()].map((call) => call.name))]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const legacyPattern =
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|\btools\.[A-Za-z_$][\w$]*(?=\s*\()|\b(?:read|edit|write|bash|powershell|grep|find|ls|discover|searchTools|describeTool|describeNamespace|getToolGuidance)(?=\s*\()|\b(?:read|edit|write|bash|powershell|grep|find|ls|discover|searchTools|describeTool|describeNamespace|getToolGuidance)(?= [^\n])|^  (?:oldText|newText):/gm;
  const legacyOffsets = new Set([...source.matchAll(legacyPattern)].map((match) => match.index));
  const pattern = new RegExp(
    legacyPattern.source + (toolNames.length ? "|" + toolNames.join("|") : ""),
    "gm",
  );
  const styled = source.replace(pattern, (displayName, offset: number) => {
    const compactCall = compactOffsets.get(offset);
    const compactName = compactCall?.name;
    const generic = compactName !== undefined || displayName.startsWith("tools.");
    const match = compactName ?? (generic ? displayName.slice(6) : displayName);
    // A default tool name is valid only at a formatter-provided position.
    if (!compactName && !legacyOffsets.has(offset)) return displayName;
    if (
      (!compactName && !/^[A-Za-z_$][\w$]*$/.test(match)) ||
      /[\w.]/.test(source[offset - 1] ?? "")
    )
      return displayName;
    // Query words can be tool names; only the first command owns the row status.
    const lineIndex = source.slice(0, offset).split("\n").length - 1;
    if (annotations.has(lineIndex)) return displayName;
    const editPath =
      !compactName &&
      (match === "edit" || match === "read") &&
      source[offset + match.length] === " "
        ? source.slice(offset + match.length + 1).split("\n")[0]
        : undefined;
    const candidates = data.calls.filter(
      (call) => !used.has(call) && call.name.toLowerCase() === match.toLowerCase(),
    );
    let call =
      groups.get(lineIndex) ??
      candidates.find((call) =>
        compactCall?.target !== undefined
          ? call.target === compactCall.target
          : editPath === undefined || call.target === editPath,
      );
    if (!call && compactCall?.target !== undefined) {
      const target = compactCall.target;
      const partial = candidates.filter(
        (call) =>
          targetPrefixMatches(call, target) &&
          formatted.calls.filter(
            (sourceCall) =>
              sourceCall.name.toLowerCase() === match.toLowerCase() &&
              sourceCall.target !== undefined &&
              targetPrefixMatches(call, sourceCall.target),
          ).length === 1,
      );
      if (partial.length === 1) call = partial[0];
    }
    if (call) used.add(call);
    const color = commandColor(match, call);
    const symbol = call
      ? callAppearance(call).symbol
      : color === "error"
        ? "✗"
        : color === "success"
          ? "✓"
          : partial && (match === "searchTools" || generic)
            ? "…"
            : "";
    annotations.set(source.slice(0, offset).split("\n").length - 1, {
      symbol,
      color,
      call,
      defaultTool: compactName !== undefined && !compactCall?.command,
    });
    return fg(color, displayName);
  });
  styled.split("\n").forEach((line, index) => {
    const annotation = annotations.get(index);
    const call = annotation?.call;
    const prefix = annotation?.symbol ? fg(annotation.color, annotation.symbol) + " " : "";
    const command =
      annotation?.color === "error"
        ? fg(
            "error",
            (annotation.symbol ? annotation.symbol + " " : "") +
              line.replace(/\x1b\[[0-9;]*m/g, ""),
          )
        : prefix + line;
    const shell = isShellTool(compactByLine.get(index)?.[0]?.name ?? call?.name ?? "");
    for (const part of renderCompactCommand(command, w, theme, {
      call,
      color: annotation?.color ?? "syntaxFunction",
      filePath: !annotation?.defaultTool,
      maxLines: shell ? 1 : annotation ? 3 : Infinity,
    }))
      lines.push(part);
  });
  for (const call of data.calls.filter((call) => !used.has(call))) {
    const { color, symbol } = callAppearance(call);
    const command = (symbol ? symbol + " " : "") + call.name.toLowerCase();
    const target =
      call.target &&
      !(["edit", "write"].includes(call.name) && call.target.trimStart().startsWith("{"))
        ? " " + safeText(call.target)
        : "";
    const left = color === "error" ? fg(color, command + target) : fg(color, command) + target;
    for (const part of renderCompactCommand(left, w, theme, {
      call,
      color,
      filePath: true,
      maxLines: isShellTool(call.name) ? 1 : 3,
    }))
      lines.push(part);
  }
  return lines;
}
