import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  ScrollView,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import type { RunModel } from "../run/types.ts";
import { FormattedOutput } from "./formatted-output.ts";

/** One run, all formatted output in order. No output switching. */
export class OutputViewer implements Component {
  private scroll: ScrollView;
  private pageSize = 1;
  private pendingG = false;
  constructor(
    data: RunModel,
    private tui: TUI,
    private theme: Theme,
    private close: () => void,
  ) {
    this.scroll = new ScrollView(new FormattedOutput(data, theme), {
      scrollbar: "hidden",
      overscroll: "contain",
    });
  }
  invalidate(): void {
    this.scroll.invalidate();
  }
  render(width: number): string[] {
    width = Math.max(0, Math.floor(width));
    if (!width) return [];
    if (width < 3) return [truncateToWidth("Output", width, "")];
    const padding = width >= 8 ? 2 : width >= 5 ? 1 : 0;
    const inner = width - 2 - padding * 2;
    const lines = this.scroll.render(inner);
    this.pageSize = Math.max(1, Math.floor(this.tui.terminal.rows * 0.9) - 6);
    this.scroll.updateLayout(lines.length, this.pageSize, () => this.tui.requestRender());
    const border = (text: string) => this.theme.fg("borderMuted", text);
    const row = (text = "") => {
      const fitted = truncateToWidth(text, inner, "");
      return (
        border("│") +
        " ".repeat(padding) +
        fitted +
        " ".repeat(inner - visibleWidth(fitted) + padding) +
        border("│")
      );
    };
    const start = this.scroll.scrollTop;
    return [
      border("╭" + "─".repeat(width - 2) + "╮"),
      row(this.theme.fg("accent", truncateToWidth("CODEMODE · Output", inner, ""))),
      row(),
      ...lines.slice(start, start + this.pageSize).map((line) => row(line)),
      row(),
      row(this.theme.fg("muted", truncateToWidth("↑↓ j/k · ^u/d · gg/G · Esc", inner, ""))),
      border("╰" + "─".repeat(width - 2) + "╯"),
    ];
  }
  handleInput(input: string): void {
    const wasG = this.pendingG;
    this.pendingG = false;
    if (matchesKey(input, "escape") || matchesKey(input, "ctrl+c")) {
      this.close();
      return;
    }
    if (matchesKey(input, "g")) {
      if (wasG) this.scroll.scrollToStart();
      else this.pendingG = true;
      return;
    }
    const halfScreen = Math.max(1, Math.floor(this.pageSize / 2));
    if (matchesKey(input, "up") || matchesKey(input, "k")) this.scroll.scrollBy(-1);
    else if (matchesKey(input, "down") || matchesKey(input, "j")) this.scroll.scrollBy(1);
    else if (matchesKey(input, "ctrl+u")) this.scroll.scrollBy(-halfScreen);
    else if (matchesKey(input, "ctrl+d")) this.scroll.scrollBy(halfScreen);
    else if (matchesKey(input, "shift+g")) this.scroll.scrollToEnd();
  }
  handleMouse(event: TuiMouseEvent) {
    if (event.type === "click" && event.button === "left") {
      this.pendingG = false;
      this.close();
      return { handled: true };
    }
    if (event.type !== "wheel") return undefined;
    this.pendingG = false;
    this.scroll.scrollBy(event.wheelDelta ?? 0);
    return { handled: true };
  }
}
