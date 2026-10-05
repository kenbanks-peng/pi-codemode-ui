import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { isDiscovery } from "../run/decode-output.ts";
import { isRecord } from "../run/value.ts";
import { preview } from "../terminal/preview.ts";
import { safeText } from "../terminal/safe-text.ts";

const scalar = (v: unknown): string =>
  typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const simple = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

import { formatPathTree } from "./path-tree.ts";

/** Format one output value, without run-panel borders or controls. */
export function renderOutputValue(
  value: unknown,
  width: number,
  theme: Theme,
  complete = false,
  color: ThemeColor = "toolOutput",
): string[] {
  const lines: string[] = [];
  const fg = (token: ThemeColor, text: string) => theme.fg(token, text);
  const row = (text = "", token: ThemeColor = color, styled = false) => {
    for (const part of preview(width, styled ? text : safeText(text), Infinity))
      lines.push(fg(token, truncateToWidth(part, width, "")));
  };

  const paired = (
    left: string,
    right: string,
    token: ThemeColor = "toolOutput",
    rightToken: ThemeColor = token,
  ) => {
    left = safeText(left);
    right = safeText(right);
    if (visibleWidth(left) + visibleWidth(right) + 2 <= width)
      row(
        fg(token, left) +
          " ".repeat(width - visibleWidth(left) - visibleWidth(right)) +
          fg(rightToken, right),
        "toolOutput",
        true,
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
    all ||= complete;
    for (const part of preview(
      Math.max(1, width - visibleWidth(indent)),
      safeText(text),
      all ? Infinity : 8,
    ))
      row(indent + part);
  };
  const fields = (entries: [string, unknown][], depth = 0) => {
    if (!entries.length) {
      row("{}");
      return;
    }
    const shown = entries.slice(0, complete ? undefined : 8);
    const labels = shown.map(([k]) => safeText(label(k)));
    const column = Math.min(20, Math.max(0, ...labels.map((s) => visibleWidth(s))));
    shown.forEach(([, v], i) => {
      const name = labels[i]!;
      const value =
        Array.isArray(v) && v.length > 0 && v.every(simple) ? v.map(scalar).join(" · ") : scalar(v);
      if (isRecord(v) && depth < 2) {
        row(name, "muted");
        fields(Object.entries(v), depth + 1);
      } else if (
        width < 48 ||
        visibleWidth(name) > column ||
        value.includes("\n") ||
        value.length > 1000
      ) {
        row(name, "muted");
        textBody(value, false, "  ");
      } else {
        const prefix = name + " ".repeat(column - visibleWidth(name) + 2);
        const available = width - visibleWidth(prefix);
        const parts = preview(available, safeText(value), complete ? Infinity : 8);
        parts.forEach((part, j) => row((j ? " ".repeat(visibleWidth(prefix)) : prefix) + part));
      }
    });
    hidden(entries.length - shown.length, "fields");
  };
  const body = (v: unknown): void => {
    const paths = formatPathTree(v);
    if (paths) {
      paths.slice(0, complete ? undefined : 16).forEach((p) => row(p));
      if (!complete) hidden(paths.length - 16, "tree entries");
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
          row(clip(name + " · " + entries.length + " tools", width), "muted");
        }
        const column = Math.min(
          Math.max(...entries.map((tool) => visibleWidth(tool.name))),
          Math.max(1, Math.floor(width / 3)),
        );
        for (const tool of entries) {
          const name = clip(tool.name, column);
          const available = width - column - 2;
          const description = available >= 4 ? clip(tool.description, available) : "";
          row(
            fg("accent", name) +
              (description ? " ".repeat(column - visibleWidth(name) + 2) + description : ""),
            "toolOutput",
            true,
          );
        }
      }
      row("Full descriptions and declarations in raw output", "muted");
      return;
    }
    if (Array.isArray(v) && v.length && v.every(isRecord)) {
      const keys = Object.keys(v[0]!);
      if (
        keys.length > 0 &&
        keys.length <= 6 &&
        v.every(
          (item) =>
            Object.keys(item).length === keys.length &&
            keys.every((k) => k in item && simple(item[k]) && !scalar(item[k]).includes("\n")),
        )
      ) {
        const shown = v.slice(0, complete ? undefined : 8);
        const sizes = keys.map((k) =>
          Math.max(
            visibleWidth(safeText(k)),
            ...shown.map((item) => visibleWidth(safeText(scalar(item[k])))),
          ),
        );
        if (sizes.reduce((a, b) => a + b, 0) + (keys.length - 1) * 3 <= width) {
          const tableRow = (values: string[]) =>
            values
              .map((x, i) => safeText(x) + " ".repeat(sizes[i]! - visibleWidth(safeText(x))))
              .join("   ");
          row(tableRow(keys), "muted");
          shown.forEach((item) => row(tableRow(keys.map((k) => scalar(item[k])))));
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
      isRecord(v) &&
      typeof v.name === "string" &&
      typeof v.version === "string" &&
      v.type === "module" &&
      isRecord(v.pi) &&
      Array.isArray(v.pi.extensions)
    ) {
      const keys = ["name", "version", "description", "type", "keywords", "files", "pi"];
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
    if (isRecord(v) && Array.isArray(v.content) && v.content.every(isRecord)) {
      if (v.isError === true) row("✗ Tool result failed", "error");
      for (const block of v.content.slice(0, complete ? undefined : 8)) {
        if (block.type === "text" && typeof block.text === "string") textBody(block.text);
        else if (block.type === "image")
          row("Image · " + String(block.mimeType ?? "image"), "muted");
        else fields(Object.entries(block));
      }
      if (!complete) hidden(v.content.length - 8, "content blocks");
      const extra = Object.entries(v).filter(([k]) => !["content", "isError"].includes(k));
      if (extra.length) fields(extra);
      return;
    }
    if (isRecord(v) && typeof v.output === "string" && typeof v.exit_code === "number") {
      paired(
        "Exit " + v.exit_code,
        typeof v.wall_time_seconds === "number" ? v.wall_time_seconds + "s" : "",
        v.exit_code === 0 ? "muted" : "error",
      );
      textBody(v.output.replace(/\n$/, ""));
      if (v.truncated === true) row("Output truncated", "warning");
      if (typeof v.full_output_path === "string")
        row("Full output: " + v.full_output_path, "warning");
      const extra = Object.entries(v).filter(
        ([k]) =>
          !["output", "exit_code", "wall_time_seconds", "truncated", "full_output_path"].includes(
            k,
          ),
      );
      if (extra.length) fields(extra);
      return;
    }
    if (isRecord(v)) {
      fields(Object.entries(v));
      return;
    }
    if (Array.isArray(v)) {
      v.slice(0, complete ? undefined : 8).forEach((item) => textBody(scalar(item)));
      if (!complete) hidden(v.length - 8, "items");
      if (!v.length) row("[]");
      return;
    }
    textBody(scalar(v));
  };

  body(value);
  return lines;
}
