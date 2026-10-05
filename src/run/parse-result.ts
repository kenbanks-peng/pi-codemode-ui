import { preferredFields, toolDisplay } from "../tools/display.ts";
import { decodeOutput, decodePartialDiscovery, isDiscovery } from "./decode-output.ts";
import type { RunModel, ToolCall } from "./types.ts";
import { asString, isRecord } from "./value.ts";

/** Recognize only complete mutation receipts, never arbitrary successful data. */
function mutationConfirmation(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^Successfully replaced \d+ block\(s\) in [^\n]+\.?$/.test(value.trim())) return "edit";
  if (/^Successfully wrote(?: \d+ bytes)? to [^\n]+\.?$/.test(value.trim())) return "write";
}
export function parseRunResult(result: unknown, isError: boolean): RunModel {
  const r = isRecord(result) ? result : {};
  const details = isRecord(r.details) ? r.details : {};
  const blocks = Array.isArray(r.content) ? r.content : [];
  const raw = blocks
    .filter((b) => isRecord(b) && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  const first = blocks[0];
  const header =
    isRecord(first) && first.type === "text"
      ? asString(first.text).match(
          /^Script (completed|failed)\nWall time (\d+(?:\.\d+)?) seconds\nOutput:\n$/,
        )
      : null;
  const failed = isError || header?.[1] === "failed";
  const output = raw.slice(header ? 1 : 0);
  const errorIndex = failed ? output.findLastIndex((s) => s.startsWith("Script error:")) : -1;
  const error = errorIndex >= 0 ? output[errorIndex]! : "";
  const cards = output
    .filter((_, i) => i !== errorIndex)
    .map((s, i) => {
      const partial = decodePartialDiscovery(s);
      let value = partial ?? decodeOutput(s);
      let title = "Output " + (i + 1);
      if (isRecord(value) && Object.keys(value).length === 2 && "result" in value) {
        const label = ["demo", "title", "label"].find(
          (k) =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as Record<string, unknown>)[k] === "string",
        );
        if (label) {
          title = asString(value[label]);
          value = typeof value.result === "string" ? decodeOutput(value.result) : value.result;
        }
      }
      if (isDiscovery(value) && title.startsWith("Output ")) title = "Tool search";
      return {
        title,
        value,
        mutationConfirmation: mutationConfirmation(value),
        decodePartialDiscovery: !!partial,
      };
    });
  const calls: ToolCall[] = (Array.isArray(details.calls) ? details.calls : [])
    .filter(isRecord)
    .map((c) => {
      const args = isRecord(c.args) ? JSON.stringify(c.args) : asString(c.args);
      // Call targets must survive large edit payloads, unlike output previews.
      let parsed: unknown;
      try {
        parsed = JSON.parse(args);
      } catch {
        parsed = args;
      }
      // Truncated mutation arguments can still contain a complete leading path.
      const pathMatch = args.match(/^\s*\{\s*"path"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/);
      const retainedPath = pathMatch ? asString(JSON.parse(pathMatch[1]!)) : "";
      const target = isRecord(parsed)
        ? ([
            ...preferredFields(toolDisplay(asString(c.name))),
            "path",
            "pattern",
            "command",
            "query",
            "name",
          ]
            .map((k) => asString(parsed[k]))
            .find(Boolean) ?? args)
        : retainedPath || args;
      return {
        name: asString(c.name) || "Unknown tool",
        args,
        target,
        status: asString(c.status) || "unknown",
        duration:
          typeof c.durationMs === "number" && Number.isFinite(c.durationMs) && c.durationMs >= 0
            ? c.durationMs
            : undefined,
        error: asString(c.error),
        cost:
          typeof c.cost === "number" && Number.isFinite(c.cost) && c.cost >= 0 ? c.cost : undefined,
      };
    });
  return {
    cards,
    raw,
    calls,
    failed,
    error,
    elapsed: header?.[2] ?? "",
    path: asString(details.fullOutputPath),
    images: blocks
      .filter((b) => isRecord(b) && b.type === "image")
      .map((b) => asString(b.mimeType) || "image"),
  };
}
