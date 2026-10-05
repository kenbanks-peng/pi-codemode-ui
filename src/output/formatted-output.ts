import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { isDiscovery } from "../run/decode-output.ts";
import { isErrorOutput } from "../run/error-output.ts";
import { type RunModel } from "../run/types.ts";
import { mutedBorder } from "../terminal/border.ts";
import { preview } from "../terminal/preview.ts";
import { safeText } from "../terminal/safe-text.ts";
import { renderOutputValue } from "./format-value.ts";

/** All formatted output for one run. No source code or panel controls. */
export class FormattedOutput implements Component {
  constructor(
    private data: RunModel,
    private theme: Theme,
  ) {}
  invalidate(): void {} // No styled strings are cached.
  render(width: number): string[] {
    width = Math.max(0, Math.floor(width));
    if (!width) return [];
    const lines: string[] = [];
    let outputColor: ThemeColor = "toolOutput";
    const row = (text = "", color: ThemeColor = outputColor) => {
      for (const part of preview(width, safeText(text), Infinity))
        lines.push(this.theme.fg(color, truncateToWidth(part, width, "")));
    };
    const heading = (text: string) => {
      if (lines.length) row();
      row(text, outputColor === "error" ? "error" : "accent");
      lines.push(this.theme.fg("toolOutput", mutedBorder(this.theme, "─".repeat(width))));
    };
    if (this.data.error) {
      heading("Error");
      row(this.data.error, "error");
    }
    for (const card of this.data.cards.filter((card) => !card.mutationConfirmation)) {
      const failed = isErrorOutput(card.value);
      outputColor = failed ? "error" : "toolOutput";
      heading(
        failed
          ? "Error"
          : isDiscovery(card.value)
            ? card.title +
              " · " +
              card.value.length +
              (card.decodePartialDiscovery ? " retained matches" : " matches")
            : card.title,
      );
      if (card.decodePartialDiscovery) row("Partial tool list · complete entries only", "warning");
      lines.push(...renderOutputValue(card.value, width, this.theme, true, outputColor));
      outputColor = "toolOutput";
    }
    if (!lines.length)
      row(this.data.cards.length ? "No additional output" : "No text output", "muted");
    if (this.data.path) {
      heading("Output truncated");
      row("Full output: " + this.data.path, "warning");
    }
    for (const mime of this.data.images) row("Image · " + mime + " (displayed by Pi)", "muted");
    return lines;
  }
}
