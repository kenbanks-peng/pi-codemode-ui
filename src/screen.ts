import {
  keyText,
  type Theme,
  type ThemeColor,
} from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { isErrorOutput, safeText, type Call, type Model } from "./model.ts";
import { summarize, type ToolSummary } from "./pseudocode.ts";
import { preview } from "./preview.ts";
import { callAppearance, formatDuration } from "./call-status.ts";
import { renderCompactCommand } from "./compact-call.ts";
import { renderOutputValue } from "./formatted-value.ts";
import { mutedBorder } from "./panel-style.ts";
import { targetField, isShellTool } from "./tool-display.ts";

/** Compare an incomplete host JSON string with a full source literal.
 * Do not decode a cut escape or treat a complete/malformed object as a prefix.
 */
function targetPrefixMatches(call: Call, target: string): boolean {
  if (call.target !== call.args) return false;
  try { JSON.parse(call.args); return false; } catch { /* host preview may be cut */ }
  const field = targetField(call.name);
  if (!field) return false;
  const retained = call.args.replace(/(?:\.{3}|…)$/, "");
  // The host can cut a later option after the target string has closed.
  // Match the intact target without parsing or repairing the remaining JSON.
  const complete = retained.match(
    /^\s*\{\s*"(path|command|pattern)"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/,
  );
  if (complete?.[1] === field) {
    try { return JSON.parse(complete[2]!) === target; }
    catch { return false; }
  }
  const prefix = retained.match(
    /^\s*\{\s*"(path|command|pattern)"\s*:\s*("(?:(?:\\.)|[^"\\])*(?:\\)?)$/,
  );
  return prefix?.[1] === field && prefix[2]!.length >= 9 &&
    JSON.stringify(target).startsWith(prefix[2]!);
}

export class Screen implements Component {
  private summary: ToolSummary | undefined;
  private summaryWidth = -1;
  private buttonRow = -1;
  private buttonWidth = 0;
  private buttonLeft = 2;
  constructor(
    private data: Model,
    private code: string,
    private expanded: boolean,
    private partial: boolean,
    private theme: Theme,
    private viewOutput: () => void = () => {},
    private receiving = false,
    private isLatestOutput: () => boolean = () => false,
  ) {}
  invalidate(): void {} // No styled strings are cached.
  handleMouse(event: TuiMouseEvent) {
    if (event.type === "click" && event.button === "left" &&
        event.y === this.buttonRow && event.x >= this.buttonLeft && event.x < this.buttonLeft + this.buttonWidth) {
      this.viewOutput();
      return { handled: true };
    }
    return undefined;
  }
  render(width: number): string[] {
    this.buttonRow = -1;
    width = Math.max(0, Math.floor(width));
    if (!width) return [];
    if (width < 11) return [truncateToWidth("CODEMODE", width, "")];
    const w = width - 4;
    const lines: string[] = [];
    const fg = (token: ThemeColor, s: string) => this.theme.fg(token, s);
    const border = (text: string) => mutedBorder(this.theme, text);
    const rule = (title: string) => {
      const left = "├─ " + title + " ";
      lines.push(
        border(
          truncateToWidth(left, width - 1, "") +
            "─".repeat(Math.max(0, width - visibleWidth(left) - 1)) +
            "┤",
        ),
      );
    };
    let outputColor: ThemeColor = "toolOutput";
    const row = (text = "", token: ThemeColor = outputColor, styled = false) => {
      for (const part of preview(w, styled ? text : safeText(text), Infinity)) {
        const fitted = truncateToWidth(part, w, "");
        lines.push(
          border("│ ") +
            fg(token, fitted) +
            " ".repeat(Math.max(0, w - visibleWidth(fitted))) +
            border(" │"),
        );
      }
    };
    const hasOutput = !!(this.data.error || this.data.path || this.data.images.length ||
      this.data.cards.some(card => !card.confirmation &&
        (typeof card.value !== "string" || card.value.trim().length > 0)));
    const heading = (text: string) => {
      row();
      row(text, outputColor === "error" ? "error" : "accent");
      row(border("─".repeat(w)), "toolOutput", true);
    };
    const paired = (
      left: string,
      right: string,
      token: ThemeColor = "toolOutput",
      rightToken: ThemeColor = token,
    ) => {
      left = safeText(left);
      right = safeText(right);
      if (visibleWidth(left) + visibleWidth(right) + 2 <= w)
        row(
          fg(token, left) +
            " ".repeat(w - visibleWidth(left) - visibleWidth(right)) +
            fg(rightToken, right),
          "toolOutput", true,
        );
      else {
        row(left, token);
        if (right) row(right, rightToken);
      }
    };
    const textBody = (text: string, all = false) => {
      for (const part of preview(w, safeText(text), all ? Infinity : 8))
        row(part);
    };
    const body = (value: unknown) => {
      for (const line of renderOutputValue(value, w, this.theme, false, outputColor))
        row(line, outputColor, true);
    };
    const expandedCalls = () => {
      for (const c of this.data.calls) {
        const { symbol, color } = callAppearance(c);
        const duration =
          c.duration === undefined ? "" : formatDuration(c.duration);
        if (
          w >= 48 &&
          visibleWidth(safeText(c.name + c.target)) + duration.length + 6 <= w
        )
          paired(symbol + " " + c.name + "  " + c.target, duration, color, "muted");
        else {
          paired(symbol + " " + c.name, duration, color, "muted");
          row("  " + c.target);
        }
        if (c.status === "cancelled" || c.status === "unknown")
          row(c.status, "warning");
        if (c.error) row(c.error, "error");
        if (c.cost !== undefined) row("Cost: $" + c.cost, "muted");
        if (c.args !== c.target) row("Arguments: " + c.args, "muted");
      }
      if (!this.data.calls.length) row("No nested tool calls", "muted");
    };
    const statusColor: ThemeColor = this.partial ? "warning" : this.data.failed ? "error" : "success";
    const count = this.data.calls.length;
    // Codemode rounds wall time to 0.1s before sending it. Zero is not an exact duration.
    const stats = this.data.elapsed
      ? Number(this.data.elapsed) === 0 ? "<50ms" : formatDuration(Number(this.data.elapsed) * 1000)
      : "";
    const title = "CODEMODE";
    if (visibleWidth(title) + visibleWidth(stats) + 8 <= width) {
      const left = "╭─ " + title + " ";
      const right = stats ? " " + stats + " ╮" : "╮";
      lines.push(border("╭─ ") + fg(statusColor, title) +
        border(" " + "─".repeat(width - visibleWidth(left) - visibleWidth(right))) +
        (stats ? " " + fg("muted", stats) + border(" ╮") : border("╮")));
    } else {
      lines.push(border("╭─ ") + fg(statusColor, title) +
        border("─".repeat(Math.max(0, width - visibleWidth(title) - 4)) + "╮"));
      if (stats) paired("", stats, "muted");
    }
    row(); // Top padding inside the panel.
    if (this.receiving) {
      row("Receiving script…", "muted");
      row();
      lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
      return lines;
    }
    const errorCards = this.data.cards.filter(card => isErrorOutput(card.value));
    const failedCalls = this.data.calls.filter((call) => call.status === "error" || call.error);
    if (this.data.error || (this.data.failed && (failedCalls.length || errorCards.length))) {
      heading("Error");
      if (this.data.error) row(this.data.error, "error");
      for (const call of failedCalls) {
        row(call.name.toLowerCase() + (call.target && call.target !== call.args ? " " + call.target : ""), "error");
        if (call.error) {
          outputColor = "error";
          textBody(call.error);
          outputColor = "toolOutput";
        }
      }
      for (const card of errorCards) {
        outputColor = "error";
        body(card.value);
        outputColor = "toolOutput";
      }
    }
    const noCallsMade = this.data.failed && !count &&
      this.data.raw.some((raw) => /^No tool calls were made\.$/m.test(raw));
    if (this.expanded || !noCallsMade) {
    if (!this.expanded && this.summaryWidth !== w) {
      this.summary = summarize(this.code, w);
      this.summaryWidth = w;
    }
    const summary = this.summary;
    if (this.expanded) heading("Code");
    if (this.expanded) {
      textBody(this.code, true);
    } else {
      // Protect quoted strings and comments; style only primary call names.
      const formatted = summary ?? summarize(this.code, w);
      let source = safeText(formatted.text);
      const originalLines = formatted.text.split("\n");
      const compactCalls = formatted.calls.map(call => ({
        ...call, column: safeText(originalLines[call.line]!.slice(0, call.column)).length,
      }));
      const compactByLine = new Map<number, typeof compactCalls>();

      const used = new Set<Call>();
      const annotations = new Map<number, { symbol: string; color: ThemeColor; call?: Call; defaultTool?: boolean }>();
      const commandColor = (name: string, call?: Call): ThemeColor => {
        const tool = name.toLowerCase();
        if (call) return callAppearance(call, "syntaxFunction").color;
        if (!call && ["searchTools", "describeTool", "describeNamespace"].includes(name) &&
            !this.partial && !this.data.failed) return "success";
        if (!this.partial && !this.data.failed &&
            this.data.cards.some((card) => card.confirmation === tool))
          return "success";
        return "syntaxFunction";
      };
      const groups = new Map<number, Call>();
      const sourceLines = source.split("\n");
      const grouped: string[] = [];
      for (let index = 0; index < sourceLines.length; index++) {
        const search = sourceLines[index]?.match(/^searchTools (\S+)$/);
        const target = search?.[1];
        if (target && sourceLines[index + 1] === "describeTool " + target &&
            sourceLines[index + 2] === "getToolGuidance " + target) {
          const names = ["searchTools", "describeTool", "getToolGuidance"];
          const members = names.map((name) => this.data.calls.find((call) =>
            !used.has(call) && call.name.toLowerCase() === name.toLowerCase() &&
            call.target === target));
          members.forEach((call) => { if (call) used.add(call); });
          const recorded = members.filter((call): call is Call => !!call);
          const status = recorded.some((call) => call.status === "error" || call.error) ? "error"
            : recorded.some((call) => call.status === "running") ? "running"
            : recorded.some((call) => call.status === "cancelled") ? "cancelled"
            : recorded.some((call) => call.status !== "ok") ? "unknown"
            : members[2] && !this.partial && !this.data.failed ? "ok" : "unknown";
          groups.set(grouped.length, {
            name: "discover", target, args: "", status,
            error: recorded.find((call) => call.error)?.error ?? "",
            duration: recorded.length && recorded.every((call) => call.duration !== undefined)
              ? recorded.reduce((sum, call) => sum + call.duration!, 0) : undefined,
            cost: recorded.some((call) => call.cost !== undefined)
              ? recorded.reduce((sum, call) => sum + (call.cost ?? 0), 0) : undefined,
          });
          grouped.push("discover " + target);
          index += 2;
        } else {
          compactByLine.set(grouped.length, compactCalls.filter(call => call.line === index));
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
      const toolNames = [...new Set([...compactOffsets.values()].map(call => call.name))].sort((a, b) => b.length - a.length)
        .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const legacyPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|\btools\.[A-Za-z_$][\w$]*(?=\s*\()|\b(?:read|edit|write|bash|powershell|grep|find|ls|discover|searchTools|describeTool|describeNamespace|getToolGuidance)(?=\s*\()|\b(?:read|edit|write|bash|powershell|grep|find|ls|discover|searchTools|describeTool|describeNamespace|getToolGuidance)(?= [^\n])|^  (?:oldText|newText):/gm;
      const legacyOffsets = new Set([...source.matchAll(legacyPattern)].map(match => match.index));
      const pattern = new RegExp(legacyPattern.source +
        (toolNames.length ? "|" + toolNames.join("|") : ""), "gm");
      const styled = source.replace(pattern,
        (displayName, offset: number) => {
          const compactCall = compactOffsets.get(offset);
          const compactName = compactCall?.name;
          const generic = compactName !== undefined || displayName.startsWith("tools.");
          const match = compactName ?? (generic ? displayName.slice(6) : displayName);
          // A default tool name is valid only at a formatter-provided position.
          if (!compactName && !legacyOffsets.has(offset)) return displayName;
          if ((!compactName && !/^[A-Za-z_$][\w$]*$/.test(match)) ||
              /[\w.]/.test(source[offset - 1] ?? ""))
            return displayName;
          // Query words can be tool names; only the first command owns the row status.
          const lineIndex = source.slice(0, offset).split("\n").length - 1;
          if (annotations.has(lineIndex)) return displayName;
          const editPath = !compactName && (match === "edit" || match === "read") && source[offset + match.length] === " "
            ? source.slice(offset + match.length + 1).split("\n")[0]
            : undefined;
          const candidates = this.data.calls.filter(call =>
            !used.has(call) && call.name.toLowerCase() === match.toLowerCase());
          let call = groups.get(lineIndex) ?? candidates.find(call =>
            compactCall?.target !== undefined ? call.target === compactCall.target
              : editPath === undefined || call.target === editPath);
          if (!call && compactCall?.target !== undefined) {
            const target = compactCall.target;
            const partial = candidates.filter(call => targetPrefixMatches(call, target) &&
              formatted.calls.filter(sourceCall => sourceCall.name.toLowerCase() === match.toLowerCase() &&
                sourceCall.target !== undefined && targetPrefixMatches(call, sourceCall.target)).length === 1);
            if (partial.length === 1) call = partial[0];
          }
          if (call) used.add(call);
          const color = commandColor(match, call);
          const symbol = call ? callAppearance(call).symbol
            : color === "error" ? "✗" : color === "success" ? "✓"
            : this.partial && (match === "searchTools" || generic) ? "…" : "";
          annotations.set(source.slice(0, offset).split("\n").length - 1, { symbol, color, call, defaultTool: compactName !== undefined && !compactCall?.command });
          return fg(color, displayName);
        },
      );
      styled.split("\n").forEach((line, index) => {
        const annotation = annotations.get(index);
        const call = annotation?.call;
        const prefix = annotation?.symbol ? fg(annotation.color, annotation.symbol) + " " : "";
        const command = annotation?.color === "error"
          ? fg("error", (annotation.symbol ? annotation.symbol + " " : "") +
              line.replace(/\x1b\[[0-9;]*m/g, ""))
          : prefix + line;
        const shell = isShellTool(compactByLine.get(index)?.[0]?.name ?? call?.name ?? "");
        for (const part of renderCompactCommand(command, w, this.theme, {
          call, color: annotation?.color ?? "syntaxFunction",
          filePath: !annotation?.defaultTool, maxLines: shell ? 1 : annotation ? 3 : Infinity,
        })) row(part, "toolOutput", true);
      });
      for (const call of this.data.calls.filter(call => !used.has(call))) {
        const { color, symbol } = callAppearance(call);
        const command = (symbol ? symbol + " " : "") + call.name.toLowerCase();
        const target = call.target &&
          !(["edit", "write"].includes(call.name) && call.target.trimStart().startsWith("{"))
          ? " " + safeText(call.target) : "";
        const left = color === "error" ? fg(color, command + target) : fg(color, command) + target;
        for (const part of renderCompactCommand(left, w, this.theme, {
          call, color, filePath: true, maxLines: isShellTool(call.name) ? 1 : 3,
        })) row(part, "toolOutput", true);
      }
    }
    if (this.expanded) {
      rule("Calls");
      expandedCalls();
      heading("Raw output");
      this.data.raw.forEach((raw, i) => {
        if (i) row();
        textBody(raw, true);
      });
      if (!this.data.raw.length) row("No text output", "muted");
    } else {
      if (!this.data.failed) for (const card of errorCards) {
        outputColor = "error";
        heading("Error");
        body(card.value);
        outputColor = "toolOutput";
      }
      if (!this.data.failed && !errorCards.length) {
        for (const call of failedCalls) {
          outputColor = "error";
          heading("Error");
          row(call.name.toLowerCase() + (call.target !== call.args ? " " + call.target : ""), "error");
          if (call.error) textBody(call.error);
          outputColor = "toolOutput";
        }
      }
    }
    }
    if (this.expanded && this.data.path) {
      heading("Output truncated");
      row("Full output: " + this.data.path, "warning");
    }
    this.data.images.forEach((mime) =>
      row("Image · " + mime + " (displayed by Pi)", "muted"),
    );
    row(); // Bottom padding inside the panel.
    const key = keyText("app.tools.expand") || "ctrl+o";
    const hint = (key ? key + " " : "") + (this.expanded ? "collapse" : "expand");
    const button = !this.expanded && hasOutput
      ? (this.isLatestOutput() ? " ctrl+alt+o output ↗ " : " output ↗ ")
      : "";
    const separator = button ? " ·" : " ";
    const footerFits = visibleWidth(hint) + visibleWidth(separator) + visibleWidth(button) + 6 <= width;
    if (footerFits) {
      if (button) {
        this.buttonRow = lines.length;
        this.buttonLeft = 3 + visibleWidth(hint) + visibleWidth(separator);
        this.buttonWidth = visibleWidth(button);
      }
      const gap = width - 4 - visibleWidth(hint) - visibleWidth(separator) - visibleWidth(button);
      lines.push(border("╰─ ") + fg("muted", hint) + border(separator) +
        fg("muted", button) + border("─".repeat(gap) + "╯"));
    } else {
      // Keep the same control order when both cannot fit in the footer.
      row(hint, "muted");
      if (button) {
        const fitted = truncateToWidth(button, w, "").replace(/\x1b\[[0-9;]*m/g, "");
        this.buttonRow = lines.length;
        this.buttonLeft = 2;
        this.buttonWidth = visibleWidth(fitted);
        row(fg("muted", fitted), "toolOutput", true);
      }
      lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
    }
    return lines;
  }
}
