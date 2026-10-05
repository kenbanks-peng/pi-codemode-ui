import {
  keyText,
  type Theme,
  type ThemeColor,
} from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  rgbColor,
  visibleWidth,
  type Component,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { isDiscovery, record, safeText, type Call, type Model } from "./model.ts";
import { summarize, type ToolSummary } from "./pseudocode.ts";
import { preview } from "./preview.ts";

const formatDuration = (ms: number): string =>
  ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms";

const scalar = (v: unknown): string =>
  typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
const label = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const simple = (v: unknown) =>
  v === null || ["string", "number", "boolean"].includes(typeof v);

/** Conservative relative path list; never infer a tree from arbitrary prose. */
function tree(value: unknown): string[] | undefined {
  const paths =
    typeof value === "string"
      ? value.trim().split("\n")
      : Array.isArray(value) && value.every((x) => typeof x === "string")
        ? value
        : [];
  if (
    paths.length < 2 ||
    paths.length > 100 ||
    paths.join("").length > 16384 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (p) =>
        p.split("/").length > 32 ||
        paths.some((other) => other.startsWith(p + "/")),
    ) ||
    !paths.every((p) => /^(?:[\w.@ -]+\/)+[\w.@ -]+$/.test(p))
  )
    return;
  interface Node {
    children: Map<string, Node>;
  }
  const root: Node = { children: new Map() };
  for (const path of paths) {
    let node = root;
    for (const part of path.split("/")) {
      if (!node.children.has(part))
        node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
  }
  const lines: string[] = [];
  function walk(node: Node, prefix: string, top: boolean) {
    const entries = [...node.children];
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1;
      lines.push(
        prefix +
          (top ? "" : last ? "└─ " : "├─ ") +
          name +
          (child.children.size ? "/" : ""),
      );
      walk(child, prefix + (top ? "" : last ? "   " : "│  "), false);
    });
  }
  walk(root, "", true);
  return lines;
}

/** Compare an incomplete host JSON string with a full source literal.
 * Do not decode a cut escape or treat a complete/malformed object as a prefix.
 */
function targetPrefixMatches(call: Call, target: string): boolean {
  if (call.target !== call.args) return false;
  try { JSON.parse(call.args); return false; } catch { /* host preview may be cut */ }
  const field = ({read: "path", edit: "path", write: "path", ls: "path",
    bash: "command", powershell: "command", grep: "pattern", find: "pattern"
  } as Record<string, string>)[call.name.toLowerCase()];
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
    return this.draw(width, false);
  }
  renderFormattedOutput(width: number): string[] {
    return this.draw(width, true);
  }
  private draw(width: number, outputOnly: boolean): string[] {
    this.buttonRow = -1;
    width = Math.max(0, Math.floor(width));
    if (!width) return [];
    if (!outputOnly && width < 11) return [truncateToWidth("CODEMODE", width, "")];
    const w = outputOnly ? width : width - 4;
    const lines: string[] = [];
    const fg = (token: ThemeColor, s: string) => this.theme.fg(token, s);
    const border = (s: string) => {
      const muted = this.theme.getFgAnsi("muted");
      const rgb = muted.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
      if (!rgb) return fg("muted", s);
      const color = rgb.slice(1).map((channel) => Math.round(Number(channel) * 0.85));
      return this.theme.style(s, { fg: rgbColor(color[0]!, color[1]!, color[2]!) });
    };
    const rule = (title: string, top = false) => {
      const left = (top ? "╭─ " : "├─ ") + title + " ";
      lines.push(
        border(
          truncateToWidth(left, width - 1, "") +
            "─".repeat(Math.max(0, width - visibleWidth(left) - 1)) +
            (top ? "╮" : "┤"),
        ),
      );
    };
    let outputColor: ThemeColor = "toolOutput";
    const row = (text = "", token: ThemeColor = outputColor, styled = false) => {
      for (const part of preview(w, styled ? text : safeText(text), Infinity)) {
        const fitted = truncateToWidth(part, w, "");
        if (outputOnly) {
          lines.push(fg(token, fitted));
          continue;
        }
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
      if (!outputOnly || lines.length) row();
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
    const hidden = (n: number, unit: string) => {
      if (n > 0) row("… " + n + " more " + unit + " in raw output", "muted");
    };
    const textBody = (text: string, all = false, indent = "") => {
      all ||= outputOnly;
      for (const part of preview(Math.max(1, w - visibleWidth(indent)),
        safeText(text), all ? Infinity : 8))
        row(indent + part);
    };
    const fields = (entries: [string, unknown][], depth = 0) => {
      if (!entries.length) {
        row("{}");
        return;
      }
      const shown = entries.slice(0, outputOnly ? undefined : 8);
      const labels = shown.map(([k]) => safeText(label(k)));
      const column = Math.min(
        20,
        Math.max(0, ...labels.map((s) => visibleWidth(s))),
      );
      shown.forEach(([, v], i) => {
        const name = labels[i]!;
        const value =
          Array.isArray(v) && v.length > 0 && v.every(simple)
            ? v.map(scalar).join(" · ")
            : scalar(v);
        if (record(v) && depth < 2) {
          row(name, "muted");
          fields(Object.entries(v), depth + 1);
        } else if (
          w < 48 ||
          visibleWidth(name) > column ||
          value.includes("\n") ||
          value.length > 1000
        ) {
          row(name, "muted");
          textBody(value, false, "  ");
        } else {
          const prefix = name + " ".repeat(column - visibleWidth(name) + 2);
          const available = w - visibleWidth(prefix);
          const parts = preview(available, safeText(value), outputOnly ? Infinity : 8);
          parts.forEach((part, j) =>
            row((j ? " ".repeat(visibleWidth(prefix)) : prefix) + part),
          );
        }
      });
      hidden(entries.length - shown.length, "fields");
    };
    const body = (v: unknown): void => {
      const paths = tree(v);
      if (paths) {
        paths.slice(0, outputOnly ? undefined : 16).forEach((p) => row(p));
        if (!outputOnly) hidden(paths.length - 16, "tree entries");
        return;
      }
      if (isDiscovery(v)) {
        const groups = new Map<string, { name: string; description: string }[]>();
        for (const tool of v) {
          const match = String(tool.name).match(/^mcp__(.+?)__(.+)$/);
          const provider = match?.[1] ?? "";
          const entries = groups.get(provider) ?? [];
          entries.push({
            name: safeText(match?.[2] ?? String(tool.name)),
            description: safeText(String(tool.description).split(/\n|(?<=\.)\s/)[0] ?? ""),
          });
          groups.set(provider, entries);
        }
        const clip = (text: string, size: number) => {
          return preview(size, text.replace(/\s+/g, " "), 1)[0] ?? "";
        };
        for (const [provider, entries] of groups) {
          if (provider) {
            row();
            const name = provider.toLowerCase() === "gitnexus" ? "GitNexus" : provider;
            row(clip(name + " · " + entries.length + " tools", w), "muted");
          }
          const column = Math.min(
            Math.max(...entries.map((tool) => visibleWidth(tool.name))),
            Math.max(1, Math.floor(w / 3)),
          );
          for (const tool of entries) {
            const name = clip(tool.name, column);
            const available = w - column - 2;
            const description = available >= 4 ? clip(tool.description, available) : "";
            row(fg("accent", name) +
              (description ? " ".repeat(column - visibleWidth(name) + 2) + description : ""),
              "toolOutput", true);
          }
        }
        row("Full descriptions and declarations in raw output", "muted");
        return;
      }
      if (Array.isArray(v) && v.length && v.every(record)) {
        const keys = Object.keys(v[0]!);
        if (
          keys.length > 0 &&
          keys.length <= 6 &&
          v.every(
            (item) =>
              Object.keys(item).length === keys.length &&
              keys.every(
                (k) =>
                  k in item &&
                  simple(item[k]) &&
                  !scalar(item[k]).includes("\n"),
              ),
          )
        ) {
          const shown = v.slice(0, outputOnly ? undefined : 8);
          const sizes = keys.map((k) =>
            Math.max(
              visibleWidth(safeText(k)),
              ...shown.map((item) => visibleWidth(safeText(scalar(item[k])))),
            ),
          );
          if (sizes.reduce((a, b) => a + b, 0) + (keys.length - 1) * 3 <= w) {
            const tableRow = (values: string[]) =>
              values
                .map(
                  (x, i) =>
                    safeText(x) +
                    " ".repeat(sizes[i]! - visibleWidth(safeText(x))),
                )
                .join("   ");
            row(tableRow(keys), "muted");
            shown.forEach((item) =>
              row(tableRow(keys.map((k) => scalar(item[k])))),
            );
          } else
            shown.forEach((item, i) => {
              row("Record " + (i + 1), "muted");
              fields(Object.entries(item));
            });
          hidden(v.length - shown.length, "records");
          return;
        }
      }
      if (
        record(v) &&
        typeof v.name === "string" &&
        typeof v.version === "string" &&
        v.type === "module" &&
        record(v.pi) &&
        Array.isArray(v.pi.extensions)
      ) {
        const keys = [
          "name",
          "version",
          "description",
          "type",
          "keywords",
          "files",
          "pi",
        ];
        const entries: [string, unknown][] = keys
          .filter((k) => k in v)
          .map((k) =>
            k === "type"
              ? ["Module", "ESM"]
              : k === "pi"
                ? ["Extension", (v.pi as Record<string, unknown>).extensions]
                : [k, v[k]],
          );
        fields(entries);
        const extra =
          Object.keys(v).filter((k) => !keys.includes(k)).length +
          Object.keys(v.pi).filter((k) => k !== "extensions").length;
        hidden(extra, "fields");
        return;
      }
      if (record(v) && Array.isArray(v.content) && v.content.every(record)) {
        if (v.isError === true) row("✗ Tool result failed", "error");
        for (const block of v.content.slice(0, outputOnly ? undefined : 8)) {
          if (block.type === "text" && typeof block.text === "string")
            textBody(block.text);
          else if (block.type === "image")
            row("Image · " + String(block.mimeType ?? "image"), "muted");
          else fields(Object.entries(block));
        }
        if (!outputOnly) hidden(v.content.length - 8, "content blocks");
        const extra = Object.entries(v).filter(
          ([k]) => !["content", "isError"].includes(k),
        );
        if (extra.length) fields(extra);
        return;
      }
      if (
        record(v) &&
        typeof v.output === "string" &&
        typeof v.exit_code === "number"
      ) {
        paired(
          "Exit " + v.exit_code,
          typeof v.wall_time_seconds === "number"
            ? v.wall_time_seconds + "s"
            : "",
          v.exit_code === 0 ? "muted" : "error",
        );
        textBody(v.output.replace(/\n$/, ""));
        if (v.truncated === true) row("Output truncated", "warning");
        if (typeof v.full_output_path === "string")
          row("Full output: " + v.full_output_path, "warning");
        const extra = Object.entries(v).filter(
          ([k]) =>
            ![
              "output",
              "exit_code",
              "wall_time_seconds",
              "truncated",
              "full_output_path",
            ].includes(k),
        );
        if (extra.length) fields(extra);
        return;
      }
      if (record(v)) {
        fields(Object.entries(v));
        return;
      }
      if (Array.isArray(v)) {
        v.slice(0, outputOnly ? undefined : 8).forEach((item) => textBody(scalar(item)));
        if (!outputOnly) hidden(v.length - 8, "items");
        if (!v.length) row("[]");
        return;
      }
      textBody(scalar(v));
    };
    if (outputOnly) {
      if (this.data.error) {
        heading("Error");
        row(this.data.error, "error");
      }
      for (const card of this.data.cards.filter(card => !card.confirmation)) {
        const failed = record(card.value) &&
          ((typeof card.value.exit_code === "number" && card.value.exit_code !== 0) ||
            card.value.isError === true);
        outputColor = failed ? "error" : "toolOutput";
        heading(failed ? "Error" : isDiscovery(card.value)
          ? card.title + " · " + card.value.length +
            (card.partialDiscovery ? " retained matches" : " matches")
          : card.title);
        if (card.partialDiscovery) row("Partial tool list · complete entries only", "warning");
        body(card.value);
        outputColor = "toolOutput";
      }
      if (!lines.length) row(this.data.cards.length ? "No additional output" : "No text output", "muted");
      if (this.data.path) {
        heading("Output truncated");
        row("Full output: " + this.data.path, "warning");
      }
      for (const mime of this.data.images) row("Image · " + mime + " (displayed by Pi)", "muted");
      return lines;
    }
    const calls = (all: boolean, selected?: Call[]) => {
      const source = selected ?? (all
        ? this.data.calls
        : [...this.data.calls]
            .sort(
              (a, b) => Number(a.status === "ok") - Number(b.status === "ok"),
            )
            .slice(0, 8));
      for (const c of source) {
        const symbol =
          (
            { ok: "✓", running: "…", error: "✗", cancelled: "–" } as Record<
              string,
              string
            >
          )[c.status] ?? "";
        const color =
          c.status === "ok"
            ? "success"
            : c.status === "error"
              ? "error"
              : "warning";
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
        if (all && c.args !== c.target) row("Arguments: " + c.args, "muted");
      }
      if (!all && this.data.calls.length > source.length)
        row(
          "… " +
            (this.data.calls.length - source.length) +
            " more calls in expanded view",
          "muted",
        );
      if (!source.length) row("No nested tool calls", "muted");
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
    const errorCards = this.data.cards.filter((card) =>
      record(card.value) &&
      ((typeof card.value.exit_code === "number" && card.value.exit_code !== 0) ||
       card.value.isError === true),
    );
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
        if (call?.status === "error" || call?.error) return "error";
        if (call?.status === "ok") return "success";
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
          const symbol = color === "error" ? "✗" : color === "success" ? "✓"
            : call?.status === "running" || (!call && match === "searchTools" && this.partial)
              ? "…" : call?.status === "cancelled" ? "–"
              : !call && generic && this.partial ? "…" : "";
          annotations.set(source.slice(0, offset).split("\n").length - 1, { symbol, color, call, defaultTool: compactName !== undefined && !compactCall?.command });
          return fg(color, displayName);
        },
      );
      const fileCommand = (
        command: string, duration: string, color: ThemeColor,
        timeColor: ThemeColor, call?: Call,
      ): boolean => {
        const fileRow = command.replace(/\x1b\[[0-9;]*m/g, "").match(
          /^((?:[✓✗…–?] )?(?:read|edit|write|ls) )(.+)$/,
        );
        if (fileRow) {
          const left = fileRow[1]!;
          let original = fileRow[2]!;
          if (original.trimStart().startsWith("{")) {
            // Host records can cut arguments before the path's closing quote.
            // Never present part of a JSON payload as a recovered filename.
            const retained = original.match(/^\s*\{\s*"path"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/);
            if (retained) {
              try { original = JSON.parse(retained[1]!) as string; }
              catch { return false; }
            } else if (/^\s*\{\s*"path"\s*:\s*"/.test(original)) {
              original = "… (path truncated)";
            } else return false;
          }
          const parts = preview(w, left + safeText(original), Infinity);
          parts.forEach((part, index) => {
            const last = index === parts.length - 1;
            if (last && duration && visibleWidth(part) + duration.length + 2 <= w)
              row(fg(color, part) + " ".repeat(w - visibleWidth(part) - duration.length) +
                fg(timeColor, duration), "toolOutput", true);
            else {
              row(part, color);
              if (last && duration)
                row(" ".repeat(Math.max(0, w - duration.length)) + fg(timeColor, duration),
                  "toolOutput", true);
            }
          });
          if (call?.status === "cancelled") row("cancelled", "warning");
          if (call?.cost !== undefined) row("Cost: $" + call.cost, "muted");
          return true;
        }
        return false;
      };
      styled.split("\n").forEach((line, index) => {
        const annotation = annotations.get(index);
        const call = annotation?.call;
        const prefix = annotation?.symbol ? fg(annotation.color, annotation.symbol) + " " : "";
        const duration = call?.duration === undefined ? "" : formatDuration(call.duration);
        const timeColor: ThemeColor = "muted";
        const command = annotation?.color === "error"
          ? fg("error", (annotation.symbol ? annotation.symbol + " " : "") +
              line.replace(/\x1b\[[0-9;]*m/g, ""))
          : prefix + line;
        if (!annotation?.defaultTool && fileCommand(command, duration, annotation?.color ?? "syntaxFunction", timeColor, call)) return;
        const shell = /^(?:bash|powershell)$/i.test(compactByLine.get(index)?.[0]?.name ?? call?.name ?? "");
        const parts = preview(Math.max(1, w - (duration ? visibleWidth(duration) + 2 : 0)),
          command, shell ? 1 : annotation ? 3 : Infinity);
        parts.forEach((part, i) => {
          if (duration && i === parts.length - 1 && visibleWidth(part) + duration.length + 2 <= w)
            row(part + " ".repeat(w - visibleWidth(part) - duration.length) + fg(timeColor, duration), "toolOutput", true);
          else {
            row(part, "toolOutput", true);
            if (duration && i === parts.length - 1)
              row(" ".repeat(Math.max(0, w - duration.length)) + fg(timeColor, duration), "toolOutput", true);
          }
        });
        if (call?.status === "cancelled") row("cancelled", "warning");
        if (call?.cost !== undefined) row("Cost: $" + call.cost, "muted");
      });
      const unmatched = this.data.calls.filter((call) => !used.has(call));
      for (const call of unmatched) {
        const color = call.status === "error" || call.error ? "error"
          : call.status === "ok" ? "success" : "warning";
        const symbol = color === "error" ? "✗" : color === "success" ? "✓" : "…";
        const command = symbol + " " + call.name.toLowerCase();
        const target = call.target &&
          !(["edit", "write"].includes(call.name) && call.target.trimStart().startsWith("{"))
          ? " " + safeText(call.target) : "";
        const duration = call.duration === undefined ? "" : formatDuration(call.duration);
        if (fileCommand(command + target, duration, color, "muted", call)) continue;
        const left = color === "error" ? fg(color, command + target) : fg(color, command) + target;
        if (visibleWidth(left) + duration.length + 2 <= w)
          row(left + " ".repeat(w - visibleWidth(left) - duration.length) + fg("muted", duration), "toolOutput", true);
        else {
          const shell = /^(?:bash|powershell)$/i.test(call.name);
          const parts = preview(Math.max(1, w - (duration ? visibleWidth(duration) + 2 : 0)),
            left, shell ? 1 : 3);
          parts.forEach((part, index) => {
            if (duration && index === parts.length - 1 &&
                visibleWidth(part) + visibleWidth(duration) + 2 <= w)
              row(part + " ".repeat(w - visibleWidth(part) - visibleWidth(duration)) +
                fg("muted", duration), "toolOutput", true);
            else {
              row(part, "toolOutput", true);
              if (duration && index === parts.length - 1)
                row(" ".repeat(Math.max(0, w - visibleWidth(duration))) +
                  fg("muted", duration), "toolOutput", true);
            }
          });
        }
        if (call.status === "cancelled") row("cancelled", "warning");
        if (call.cost !== undefined) row("Cost: $" + call.cost, "muted");
      }
    }
    if (this.expanded) {
      rule("Calls");
      calls(true);
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
