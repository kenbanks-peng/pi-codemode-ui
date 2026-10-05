import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Wrap to terminal cells, then mark omitted content on the last retained row.
 * Infinity keeps all rows. ANSI styles and wide Unicode characters are supported.
 */
export function preview(width: number, content: string, maxLines: number): string[] {
  if (!Number.isFinite(width) || width < 1 || Number.isNaN(maxLines) || maxLines < 1)
    return [];
  width = Math.floor(width);
  const limit = Math.floor(maxLines);
  const rows = limit === 1 ? [content.split("\n")[0]!] : wrapTextWithAnsi(content, width);
  const omitted = limit === 1
    ? content.includes("\n") || visibleWidth(rows[0]!) > width
    : rows.length > limit;
  if (!omitted) return rows;
  const retained = rows.slice(0, limit);
  const last = retained.length - 1;
  // Force an omission marker even when the last retained row has spare space.
  const clipped = truncateToWidth(retained[last]!, Math.max(0, width - visibleWidth("…")), "")
    // Pi owns the panel background. A full reset would clear that background.
    .replace(/\x1b\[0m/g, "");
  retained[last] = clipped + "…";
  return retained;
}
