import {
  initTheme,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import { type Component, type TUI } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import extension from "../../src/index.ts";
import { createToolShell, renderedText as plain, hostTheme as theme } from "../support/host.ts";

test("real host button opens its own run; shortcut opens latest run without changing expansion", async () => {
  initTheme("dark", false);
  let resolver!: ToolRendererResolver;
  let start!: (event: never, ctx: ExtensionContext) => void;
  let shortcut!: (ctx: ExtensionContext) => Promise<void> | void;
  let opened = "";
  const ctx = {
    hasUI: true,
    mode: "tui",
    ui: {
      custom: async (
        factory: (tui: TUI, theme: Theme, keys: never, done: () => void) => Component,
      ) => {
        const component = factory(
          { terminal: { rows: 24 }, requestRender() {} } as TUI,
          theme,
          undefined as never,
          () => {},
        );
        opened = plain(component);
      },
      notify() {},
    },
  } as unknown as ExtensionContext;
  extension({
    on(name: string, handler: typeof start) {
      if (name === "session_start") start = handler;
      return () => {};
    },
    registerShortcut(_key: string, options: { handler: typeof shortcut }) {
      shortcut = options.handler;
    },
    registerToolRenderer(value: ToolRendererResolver) {
      resolver = value;
    },
  } as unknown as ExtensionAPI);
  start(undefined as never, ctx);
  const shell = (id: string, text: string) => {
    const component = createToolShell("text(value);", {
      id,
      renderers: resolver("codemode", () => undefined),
    });
    component.updateResult({ content: [{ type: "text", text }], isError: false }, false);
    return component;
  };
  const first = shell("first", "first output");
  shell("second", "second output");
  const before = plain(first);
  const lines = first.render(80);
  const y = lines.findIndex((line) => stripVTControlCharacters(line).includes("output"));
  assert.ok(y >= 0);
  const header = stripVTControlCharacters(lines[y]!);
  assert.match(header, /╰─ (?:ctrl\+o )?expand · output ↗ ─+╯/);
  assert.ok(!lines[y]!.includes("\u001b[48;2;40;85;135m"));
  assert.doesNotMatch(header, /\[|\]/);
  const x = header.indexOf("output");
  const result = first.handleMouse({
    type: "click",
    button: "left",
    x,
    y,
    screenX: x,
    screenY: y,
    width: 80,
    height: lines.length,
    shift: false,
    alt: false,
    ctrl: false,
  });
  assert.ok(result?.handled);
  await Promise.resolve();
  assert.match(opened, /first output/);
  assert.equal(plain(first), before);
  await shortcut(ctx);
  assert.match(opened, /second output/);
  assert.doesNotMatch(before, /first output/);
});
