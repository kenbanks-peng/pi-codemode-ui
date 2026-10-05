import { isRecord } from "./value.ts";

/** Reject ambiguous/lossy JSON, excessive size, and excessive nesting. */
export function decodeOutput(raw: string): unknown {
  if (raw.length > 131072) return raw;
  try {
    const scopes: (Set<string> | null)[] = [];
    const tokens =
      raw.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]|true|false|null/g) ??
      [];
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
        isRecord(x) &&
        typeof x.name === "string" &&
        typeof x.description === "string" &&
        Object.keys(x).every((k) => k === "name" || k === "description"),
    )
  );
}
/** Recover only the intact prefix of a host-truncated discovery array. */
export function decodePartialDiscovery(raw: string): Record<string, unknown>[] | undefined {
  if (raw.length > 131072) return;
  const header = raw.match(
    /^Warning: truncated output \(original token count: \d+\)\nTotal output lines: \d+\n\n\s*\[/,
  );
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
      if (quoted && c === "\\") {
        end++;
        continue;
      }
      if (c === '"') quoted = !quoted;
      if (!quoted && c === "}") break;
      if (!quoted && (c === "{" || c === "[")) return;
    }
    if (end === raw.length) break;
    const value = decodeOutput(raw.slice(start, end + 1));
    if (!isDiscovery([value])) return;
    entries.push(value as Record<string, unknown>);
    start = end + 1;
    while (/\s/.test(raw[start] ?? "") && start < raw.length) start++;
    if (raw[start] !== ",") break;
    start++;
  }
  return entries.length ? entries : undefined;
}
