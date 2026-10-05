import type { Theme } from "@earendil-works/pi-coding-agent";
import { rgbColor } from "@earendil-works/pi-tui";

/** Dim the theme's muted foreground; leave the host background unchanged. */
export function mutedBorder(theme: Theme, text: string): string {
  const muted = theme.getFgAnsi("muted");
  const rgb = muted.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  if (!rgb) return theme.fg("muted", text);
  const color = rgb.slice(1).map((channel) => Math.round(Number(channel) * 0.85));
  return theme.style(text, { fg: rgbColor(color[0]!, color[1]!, color[2]!) });
}
