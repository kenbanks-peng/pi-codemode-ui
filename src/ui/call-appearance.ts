import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ToolCall } from "../run/types.ts";

export const formatDuration = (ms: number): string =>
  ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms";

/** Recorded status takes precedence over inferred source-call status. */
export function callAppearance(
  call: ToolCall,
  unknownColor: ThemeColor = "warning",
): { symbol: string; color: ThemeColor } {
  if (call.status === "error" || call.error) return { symbol: "✗", color: "error" };
  switch (call.status) {
    case "ok":
      return { symbol: "✓", color: "success" };
    case "running":
      return { symbol: "…", color: "warning" };
    case "cancelled":
      return { symbol: "–", color: "warning" };
    default:
      return { symbol: "", color: unknownColor };
  }
}
