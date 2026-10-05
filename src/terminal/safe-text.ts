export function safeText(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, (c) =>
    c === "\t" ? "  " : "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
