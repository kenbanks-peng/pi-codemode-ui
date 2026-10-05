/** Data only. Output blocks and call records deliberately have no join key. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const asString = (v: unknown) => (typeof v === "string" ? v : "");
