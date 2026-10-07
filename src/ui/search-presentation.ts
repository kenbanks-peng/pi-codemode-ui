import type { RunModel } from "../run/types.ts";
import { asString, isRecord } from "../run/value.ts";
import type { PanelPresentation } from "./run-panel.ts";

/** Use Pi's recorded loaded names, not guesses from human-readable output. */
export function searchPresentation(
  args: unknown,
  result?: unknown,
  data?: RunModel,
): PanelPresentation {
  const input = isRecord(args) ? args : {};
  const details = isRecord(result) && isRecord(result.details) ? result.details : {};
  const loaded =
    Array.isArray(details.loaded) && details.loaded.every((name) => typeof name === "string")
      ? (details.loaded as string[])
      : undefined;
  const compact = ["search " + asString(input.query)];
  if (data) {
    if (!data.failed && loaded) {
      compact.push(
        loaded.length
          ? `Loaded ${loaded.length} tool${loaded.length === 1 ? "" : "s"}`
          : "No matching tools found.",
      );
      compact.push(...loaded.map((name) => "  " + name));
    } else {
      compact.push(...data.raw);
    }
  } else {
    compact.push("Searching…");
  }
  return {
    title: "TOOL SEARCH",
    receivingText: "Receiving search…",
    content: { compact, expanded: [JSON.stringify(args ?? {}, null, 2)] },
  };
}
