import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  initTheme,
  ToolExecutionComponent,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI, type Component } from "@earendil-works/pi-tui";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import extension from "../../src/index.ts";
import { OutputViewer } from "../../src/output.ts";
import { model } from "../../src/model.ts";

const plain = (component: Component, width = 80) =>
  stripVTControlCharacters(component.render(width).join("\n"));
test("output viewer scrolls all outputs in order, closes, and fits narrow widths", () => {
  initTheme("dark", false);
  let closed = false;
  let renders = 0;
  const data = model(
    {
      content: [
        { type: "text", text: "first\n" + "body\n".repeat(40) },
        { type: "text", text: "last\u001b[2J" },
      ],
    },
    false,
  );
  const viewer = new OutputViewer(
    data,
    {
      terminal: { rows: 16 },
      requestRender() {
        renders++;
      },
    } as TUI,
    theme,
    () => {
      closed = true;
    },
  );
  const framed = viewer.render(80).map(line => stripVTControlCharacters(line));
  assert.match(framed[0]!, /^╭─+╮$/);
  assert.match(framed.at(-1)!, /^╰─+╯$/);
  assert.equal(framed[2], "│" + " ".repeat(78) + "│");
  assert.match(framed[3]!, /^│  Output 1 +│$/);
  assert.ok(framed.every(line => visibleWidth(line) === 80));
  assert.match(plain(viewer), /first/);
  assert.doesNotMatch(plain(viewer), /last/);
  viewer.handleInput("\u0004");
  assert.doesNotMatch(plain(viewer), /first/);
  viewer.handleInput("G");
  assert.match(plain(viewer), /last\\u001b\[2J/);
  assert.doesNotMatch(viewer.render(80).join("\n"), /\u001b\[2J/);
  viewer.handleInput("g");
  viewer.handleInput("g");
  assert.match(plain(viewer), /first/);
  for (const width of [0, 1, 5, 20, 80])
    assert.ok(
      viewer.render(width).every((line) => visibleWidth(line) <= width),
    );
  assert.ok(renders > 0);
  viewer.handleInput("\u001b");
  assert.equal(closed, true);
});

test("output popup retains the truncation notice and full output path", () => {
  initTheme("dark", false);
  const sample = JSON.parse(readFileSync(
    new URL("../fixtures/truncated.json", import.meta.url), "utf8"));
  const data = model(sample.result, false);
  const viewer = new OutputViewer(data,
    { terminal: { rows: 200 }, requestRender() {} } as TUI, theme, () => {});
  const screen = plain(viewer, 200);
  assert.match(screen, /Output truncated/);
  assert.ok(screen.includes("Full output: " + data.path));
  assert.ok(data.path);
  assert.deepEqual(sample.result, JSON.parse(readFileSync(
    new URL("../fixtures/truncated.json", import.meta.url), "utf8")).result);
});

test("viewer supports Vim line, half-screen, and top/bottom motions", () => {
  initTheme("dark", false);
  const data = model({content: [{type: "text", text: Array.from(
    {length: 60}, (_, i) => "line-" + i).join("\n")}]}, false);
  const viewer = new OutputViewer(data,
    {terminal: {rows: 20}, requestRender() {}} as TUI, theme, () => {});
  const content = () => viewer.render(80).slice(3, -3)
    .map(line => stripVTControlCharacters(line));
  const top = () => content()[0]!.trim();
  content(); // Establish a 12-line viewport.
  viewer.handleInput("j");
  const afterJ = top();
  assert.match(afterJ, /─/);
  viewer.handleInput("k");
  assert.match(top(), /Output 1/);
  viewer.handleInput("\u001b[B");
  assert.equal(top(), afterJ);
  viewer.handleInput("\u001b[A");
  assert.match(top(), /Output 1/);
  viewer.handleInput("\u0004");
  assert.match(top(), /line-4/); // Six rows down, including title and rule.
  viewer.handleInput("\u0015");
  assert.match(top(), /Output 1/);
  viewer.handleInput("G");
  const bottom = top();
  assert.match(content().at(-1)!, /line-59/);
  viewer.handleInput("g");
  assert.equal(top(), bottom);
  viewer.handleInput("x"); // An unrelated key cancels a pending g.
  viewer.handleInput("g");
  assert.equal(top(), bottom);
  viewer.handleInput("g");
  assert.match(top(), /Output 1/);
  for (const key of ["\u001b[5~", "\u001b[6~", "\u001b[H", "\u001b[F"]) {
    viewer.handleInput(key);
    assert.match(top(), /Output 1/);
  }
  assert.match(plain(viewer), /j\/k|↑↓/);
  assert.doesNotMatch(plain(viewer), /PgUp|PgDn|Home|End/);
});

test("popup restores formatted metadata, file trees, tables, and tool discovery", () => {
  initTheme("dark", false);
  const sample = JSON.parse(readFileSync(new URL("../fixtures/example.json", import.meta.url), "utf8"));
  const before = structuredClone(sample.result);
  const viewer = new OutputViewer(model(sample.result, false),
    { terminal: { rows: 200 }, requestRender() {} } as TUI, theme, () => {});
  const screen = plain(viewer, 120);
  assert.match(screen, /Name\s+@kenbanks\/pi-ui/);
  assert.match(screen, /Module\s+ESM/);
  assert.match(screen, /Extension\s+\.\/src\/index.ts/);
  assert.match(screen, /├─ core\//);
  assert.match(screen, /value\s+squared/);
  assert.doesNotMatch(screen, /Raw output|Pseudocode|Script completed|Wall time/);
  assert.deepEqual(sample.result, before);
  const tools = new OutputViewer(model({ content: [{ type: "text", text: JSON.stringify([
    { name: "read", description: "Read files.\nFull declaration." },
    { name: "mcp__gitnexus__context", description: "Show references.\nFull declaration." },
  ]) }] }, false), { terminal: { rows: 200 }, requestRender() {} } as TUI, theme, () => {});
  const discovery = plain(tools, 120);
  assert.match(discovery, /Tool search · 2 matches/);
  assert.match(discovery, /GitNexus · 1 tools/);
  assert.match(discovery, /read +Read files\./);
  assert.doesNotMatch(discovery, /Full declaration|mcp__gitnexus__/);
});

test("popup retains every formatted block and record across scrolling and resize", () => {
  initTheme("dark", false);
  const values = Array.from({length: 12}, (_, index) => ({name: "item-" + index, count: index}));
  const data = model({ content: [
    {type: "text", text: JSON.stringify(values)},
    ...Array.from({length: 12}, (_, index) => ({type: "text", text: "block-" + index})),
  ] }, false);
  const terminal = {rows: 200};
  const viewer = new OutputViewer(data, {terminal, requestRender() {}} as TUI, theme, () => {});
  const complete = plain(viewer, 100);
  assert.match(complete, /name +count/);
  assert.match(complete, /item-11 +11/);
  assert.match(complete, /block-11/);
  assert.doesNotMatch(complete, /more records|more output blocks/);
  terminal.rows = 16;
  viewer.render(40);
  viewer.handleInput("G");
  assert.match(plain(viewer, 40), /block-11/);
  for (const width of [1, 3, 5, 8, 20, 80]) {
    const lines = viewer.render(width);
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    assert.ok(lines.length <= Math.floor(terminal.rows * 0.9));
  }
});

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
        factory: (
          tui: TUI,
          theme: Theme,
          keys: never,
          done: () => void,
        ) => Component,
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
    const component = new ToolExecutionComponent(
      "codemode",
      id,
      { code: "text(value);" },
      {},
      resolver("codemode", () => undefined),
      { requestRender() {} } as TUI,
      process.cwd(),
    );
    component.updateResult(
      { content: [{ type: "text", text }], isError: false },
      false,
    );
    return component;
  };
  const first = shell("first", "first output");
  shell("second", "second output");
  const before = plain(first);
  const lines = first.render(80);
  const y = lines.findIndex((line) =>
    stripVTControlCharacters(line).includes("output"),
  );
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
