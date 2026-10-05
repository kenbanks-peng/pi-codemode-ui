import { preferredFields, toolDisplay } from "./tool-display.ts";

/** Data only. Output blocks and call records deliberately have no join key. */
export const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const string = (v: unknown) => (typeof v === "string" ? v : "");
export function safeText(text: string): string {
  return text.replace(
    /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
    (c) =>
      c === "\t" ? "  " : "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/** Reject ambiguous/lossy JSON, excessive size, and excessive nesting. */
export function decode(raw: string): unknown {
  if (raw.length > 131072) return raw;
  try {
    const scopes: (Set<string> | null)[] = [];
    const tokens =
      raw.match(
        /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]|true|false|null/g,
      ) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t === "{" || t === "[") {
        scopes.push(t === "{" ? new Set() : null);
        if (scopes.length > 8) return raw;
      } else if (t === "}" || t === "]") scopes.pop();
      else if (t.startsWith('"') && tokens[i + 1] === ":") {
        const keys = scopes.at(-1);
        const key = JSON.parse(t) as string;
        if (keys?.has(key)) return raw;
        keys?.add(key);
      } else if (/^-?\d/.test(t)) {
        const n = Number(t);
        if (
          !Number.isFinite(n) ||
          Object.is(n, -0) ||
          (Number.isInteger(n) && !Number.isSafeInteger(n))
        )
          return raw;
      }
    }
    const value: unknown = JSON.parse(raw);
    if (raw.length > 16384 && !isDiscovery(value)) return raw;
    return value;
  } catch {
    return raw;
  }
}
export function isDiscovery(v: unknown): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (x) =>
        record(x) &&
        typeof x.name === "string" &&
        typeof x.description === "string" &&
        Object.keys(x).every((k) => k === "name" || k === "description"),
    )
  );
}
export function isErrorOutput(value: unknown): boolean {
  return record(value) &&
    ((typeof value.exit_code === "number" && value.exit_code !== 0) || value.isError === true);
}

/** Recover only the intact prefix of a host-truncated discovery array. */
function partialDiscovery(raw: string): Record<string, unknown>[] | undefined {
  if (raw.length > 131072) return;
  const header = raw.match(/^Warning: truncated output \(original token count: \d+\)\nTotal output lines: \d+\n\n\s*\[/);
  const marker = raw.match(/…\d+ tokens truncated…/);
  if (!header || !marker) return;
  raw = raw.slice(0, marker.index);
  const entries: Record<string, unknown>[] = [];
  let start = header[0].length;
  while (start < raw.length) {
    while (/\s/.test(raw[start] ?? "") && start < raw.length) start++;
    if (raw[start] !== "{") break;
    let quoted = false;
    let end = start + 1;
    for (; end < raw.length; end++) {
      const c = raw[end];
      if (quoted && c === "\\") { end++; continue; }
      if (c === '"') quoted = !quoted;
      if (!quoted && c === "}") break;
      if (!quoted && (c === "{" || c === "[")) return;
    }
    if (end === raw.length) break;
    const value = decode(raw.slice(start, end + 1));
    if (!isDiscovery([value])) return;
    entries.push(value as Record<string, unknown>);
    start = end + 1;
    while (/\s/.test(raw[start] ?? "") && start < raw.length) start++;
    if (raw[start] !== ",") break;
    start++;
  }
  return entries.length ? entries : undefined;
}
export interface Card {
  title: string;
  value: unknown;
  confirmation?: string;
  partialDiscovery?: boolean;
}

/** Recognize only complete mutation receipts, never arbitrary successful data. */
function confirmation(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^Successfully replaced \d+ block\(s\) in [^\n]+\.?$/.test(value.trim()))
    return "edit";
  if (/^Successfully wrote(?: \d+ bytes)? to [^\n]+\.?$/.test(value.trim()))
    return "write";
}
export interface Call {
  name: string;
  target: string;
  args: string;
  status: string;
  duration?: number;
  error: string;
  cost?: number;
}
export interface Model {
  cards: Card[];
  raw: string[];
  calls: Call[];
  images: string[];
  failed: boolean;
  error: string;
  elapsed: string;
  path: string;
}
export function model(result: unknown, isError: boolean): Model {
  const r = record(result) ? result : {};
  const details = record(r.details) ? r.details : {};
  const blocks = Array.isArray(r.content) ? r.content : [];
  const raw = blocks
    .filter((b) => record(b) && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  const first = blocks[0];
  const header =
    record(first) && first.type === "text"
      ? string(first.text).match(
          /^Script (completed|failed)\nWall time (\d+(?:\.\d+)?) seconds\nOutput:\n$/,
        )
      : null;
  const failed = isError || header?.[1] === "failed";
  const output = raw.slice(header ? 1 : 0);
  const errorIndex = failed
    ? output.findLastIndex((s) => s.startsWith("Script error:"))
    : -1;
  const error = errorIndex >= 0 ? output[errorIndex]! : "";
  const cards = output
    .filter((_, i) => i !== errorIndex)
    .map((s, i) => {
      const partial = partialDiscovery(s);
      let value = partial ?? decode(s);
      let title = "Output " + (i + 1);
      if (
        record(value) &&
        Object.keys(value).length === 2 &&
        "result" in value
      ) {
        const label = ["demo", "title", "label"].find(
          (k) =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as Record<string, unknown>)[k] === "string",
        );
        if (label) {
          title = string(value[label]);
          value =
            typeof value.result === "string"
              ? decode(value.result)
              : value.result;
        }
      }
      if (isDiscovery(value) && title.startsWith("Output "))
        title = "Tool search";
      return { title, value, confirmation: confirmation(value), partialDiscovery: !!partial };
    });
  const calls: Call[] = (Array.isArray(details.calls) ? details.calls : [])
    .filter(record)
    .map((c) => {
      const args = record(c.args) ? JSON.stringify(c.args) : string(c.args);
      // Call targets must survive large edit payloads, unlike output previews.
      let parsed: unknown;
      try { parsed = JSON.parse(args); } catch { parsed = args; }
      // Truncated mutation arguments can still contain a complete leading path.
      const pathMatch = args.match(/^\s*\{\s*"path"\s*:\s*("(?:\\.|[^"\\])*")\s*[,}]/);
      const retainedPath = pathMatch ? string(JSON.parse(pathMatch[1]!)) : "";
      const target = record(parsed)
        ? ([...preferredFields(toolDisplay(string(c.name))), "path", "pattern", "command", "query", "name"]
            .map((k) => string(parsed[k]))
            .find(Boolean) ?? args)
        : retainedPath || args;
      return {
        name: string(c.name) || "Unknown tool",
        args,
        target,
        status: string(c.status) || "unknown",
        duration:
          typeof c.durationMs === "number" &&
          Number.isFinite(c.durationMs) &&
          c.durationMs >= 0
            ? c.durationMs
            : undefined,
        error: string(c.error),
        cost:
          typeof c.cost === "number" && Number.isFinite(c.cost) && c.cost >= 0
            ? c.cost
            : undefined,
      };
    });
  return {
    cards,
    raw,
    calls,
    failed,
    error,
    elapsed: header?.[2] ?? "",
    path: string(details.fullOutputPath),
    images: blocks
      .filter((b) => record(b) && b.type === "image")
      .map((b) => string(b.mimeType) || "image"),
  };
}
