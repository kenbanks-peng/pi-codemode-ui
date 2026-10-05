import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ToolCall } from "../run/types.ts";
import { preview } from "../terminal/preview.ts";
import { safeText } from "../terminal/safe-text.ts";
import { formatDuration } from "./call-appearance.ts";

interface CommandOptions {
  call?: ToolCall;
  color: ThemeColor;
  filePath: boolean;
  maxLines: number;
}

/** Layout only: source matching and inferred status belong to the run panel. */
export function renderCompactCommand(
  command: string,
  width: number,
  theme: Theme,
  options: CommandOptions,
): string[] {
  const { call, color } = options;
  const duration = call?.duration === undefined ? "" : formatDuration(call.duration);
  const rows: string[] = [];
  const append = (text: string) => {
    if (color === "error") {
      const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
      rows.push(theme.fg("error", plain + " ".repeat(Math.max(0, width - visibleWidth(plain)))));
    } else rows.push(text);
  };
  const file = options.filePath ? fileCommand(command, duration, width, theme, color) : undefined;
  if (file !== undefined) append(file);
  else {
    const parts = preview(
      Math.max(1, width - (duration ? visibleWidth(duration) + 2 : 0)),
      command,
      options.maxLines,
    );
    parts.forEach((part, index) => {
      if (
        duration &&
        index === parts.length - 1 &&
        visibleWidth(part) + visibleWidth(duration) + 2 <= width
      ) {
        append(
          part +
            " ".repeat(width - visibleWidth(part) - visibleWidth(duration)) +
            theme.fg("muted", duration),
        );
      } else {
        append(part);
        if (duration && index === parts.length - 1)
          append(
            " ".repeat(Math.max(0, width - visibleWidth(duration))) + theme.fg("muted", duration),
          );
      }
    });
  }
  if (call?.status === "cancelled") rows.push(theme.fg("warning", "cancelled"));
  if (call?.cost !== undefined) rows.push(theme.fg("muted", "Cost: $" + call.cost));
  return rows;
}

function fileCommand(
  command: string,
  duration: string,
  width: number,
  theme: Theme,
  color: ThemeColor,
): string | undefined {
  const fg = (token: ThemeColor, text: string) => theme.fg(token, text);
  const fileRow = command
    .replace(/\x1b\[[0-9;]*m/g, "")
    .match(/^((?:[✓✗…–?] )?(?:read|edit|write|ls) )(.+)$/);
  if (fileRow) {
    const left = fileRow[1]!;
    let original = fileRow[2]!;
    if (original.trimStart().startsWith("{")) {
      // Host records can cut arguments before the path's closing quote.
      // Never present part of a JSON payload as a recovered filename.
      const retained = original.match(/^\s*\{\s*"path"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/);
      if (retained) {
        try {
          original = JSON.parse(retained[1]!) as string;
        } catch {
          return;
        }
      } else if (/^\s*\{\s*"path"\s*:\s*"/.test(original)) {
        original = "… (path truncated)";
      } else return;
    }
    const available = Math.max(
      0,
      width - visibleWidth(left) - (duration ? visibleWidth(duration) + 2 : 0),
    );
    const separator = original.includes("/") ? "/" : "\\";
    const segments = safeText(original).split(separator);
    let target =
      segments.length > 3
        ? "…" + separator + segments.slice(-3).join(separator)
        : segments.join(separator);
    while (visibleWidth(target) > available && segments.length > 1) {
      segments.shift();
      target = "…" + separator + segments.join(separator);
    }
    if (visibleWidth(target) > available) {
      const tail = Array.from(segments[0] ?? target);
      while (tail.length && visibleWidth("…" + tail.join("")) > available) tail.shift();
      target = available ? "…" + tail.join("") : "";
    }
    const fitted = truncateToWidth(left + target, width, "").replace(/\x1b\[[0-9;]*m/g, "");
    const gap = duration ? Math.max(0, width - visibleWidth(fitted) - visibleWidth(duration)) : 0;
    const nameStart = left.match(/^[✓✗…–?] /)?.[0].length ?? 0;
    const nameEnd = left.trimEnd().length;
    const styledCommand =
      color === "error"
        ? fg(color, fitted)
        : fg(color, fitted.slice(0, nameStart)) +
          fg(color, fitted.slice(nameStart, nameEnd)) +
          fitted.slice(nameEnd);
    return styledCommand + " ".repeat(gap) + fg("muted", duration);
  }
  return;
}
