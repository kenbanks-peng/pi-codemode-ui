import { initTheme, Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { hostTheme, registeredRenderers as renderer } from "./host.ts";

export type Context = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
export const context = (overrides: Partial<Context> = {}): Context => ({
  args: { code: "text(value);" },
  toolCallId: "test",
  invalidate() {},
  lastComponent: undefined,
  state: {},
  cwd: process.cwd(),
  executionStarted: true,
  argsComplete: true,
  isPartial: false,
  expanded: false,
  showImages: true,
  isError: false,
  ...overrides,
});
export function theme(): Theme {
  initTheme("dark", false);
  return hostTheme;
}
export function render(value: unknown, width = 72, expanded = false) {
  return renderer().renderResult!(
    value as never,
    { expanded, isPartial: false },
    theme(),
    context({ expanded }),
  ).render(width);
}
