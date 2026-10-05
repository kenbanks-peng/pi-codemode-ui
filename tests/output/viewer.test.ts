import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { OutputViewer } from "../../src/output/viewer.ts";
import { parseRunResult } from "../../src/run/parse-result.ts";
import { loadFixture, renderedText as plain, hostTheme as theme } from "../support/host.ts";

test("output viewer scrolls all outputs in order, closes, and fits narrow widths", () => {
  initTheme("dark", false);
  let closed = false;
  let renders = 0;
  const data = parseRunResult(
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
  const framed = viewer.render(80).map((line) => stripVTControlCharacters(line));
  assert.match(framed[0]!, /^╭─+╮$/);
  assert.match(framed.at(-1)!, /^╰─+╯$/);
  assert.equal(framed[2], "│" + " ".repeat(78) + "│");
  assert.match(framed[3]!, /^│  Output 1 +│$/);
  assert.ok(framed.every((line) => visibleWidth(line) === 80));
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
    assert.ok(viewer.render(width).every((line) => visibleWidth(line) <= width));
  assert.ok(renders > 0);
  viewer.handleInput("\u001b");
  assert.equal(closed, true);
});

test("output popup retains the truncation notice and full output path", () => {
  initTheme("dark", false);
  const sample = loadFixture("truncated");
  const data = parseRunResult(sample.result, false);
  const viewer = new OutputViewer(
    data,
    { terminal: { rows: 200 }, requestRender() {} } as TUI,
    theme,
    () => {},
  );
  const screen = plain(viewer, 200);
  assert.match(screen, /Output truncated/);
  assert.ok(screen.includes("Full output: " + data.path));
  assert.ok(data.path);
  assert.deepEqual(sample.result, loadFixture("truncated").result);
});

test("formatted output keeps complete fields and nested content after theme changes", () => {
  initTheme("dark", false);
  const fields = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => ["field_" + i, "value-" + i]),
  );
  const result = {
    content: [
      { type: "text", text: JSON.stringify(fields) },
      {
        type: "text",
        text: JSON.stringify({
          isError: true,
          content: [
            { type: "text", text: "nested failure\\u001b[2J" },
            { type: "image", mimeType: "image/png" },
          ],
        }),
      },
    ],
  };
  const before = structuredClone(result);
  const viewer = new OutputViewer(
    parseRunResult(result, false),
    { terminal: { rows: 200 }, requestRender() {} } as TUI,
    theme,
    () => {},
  );
  const dark = viewer.render(100);
  for (const themeName of ["light", "dark"]) {
    initTheme(themeName, false);
    viewer.invalidate();
    for (const width of [20, 100]) {
      const lines = viewer.render(width);
      const text = lines.map(stripVTControlCharacters).join("\n");
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      assert.match(text, /value-11/);
      assert.match(text, /Image ·/);
      assert.match(text, /image\/png/);
      assert.doesNotMatch(text, /more fields|more content blocks/);
      const failure = lines.find((line) => stripVTControlCharacters(line).includes("nested"))!;
      assert.ok(failure.includes(theme.getFgAnsi("error")));
      assert.ok(!lines.join("\n").includes("\u001b[2J"));
    }
    if (themeName === "light") assert.notDeepEqual(viewer.render(100), dark);
  }
  assert.deepEqual(result, before);
});

test("viewer supports Vim line, half-screen, and top/bottom motions", () => {
  initTheme("dark", false);
  const data = parseRunResult(
    {
      content: [
        { type: "text", text: Array.from({ length: 60 }, (_, i) => "line-" + i).join("\n") },
      ],
    },
    false,
  );
  const viewer = new OutputViewer(
    data,
    { terminal: { rows: 20 }, requestRender() {} } as TUI,
    theme,
    () => {},
  );
  const content = () =>
    viewer
      .render(80)
      .slice(3, -3)
      .map((line) => stripVTControlCharacters(line));
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
  const sample = loadFixture("example");
  const before = structuredClone(sample.result);
  const viewer = new OutputViewer(
    parseRunResult(sample.result, false),
    { terminal: { rows: 200 }, requestRender() {} } as TUI,
    theme,
    () => {},
  );
  const screen = plain(viewer, 120);
  assert.match(screen, /Name\s+@kenbanks\/pi-ui/);
  assert.match(screen, /Module\s+ESM/);
  assert.match(screen, /Extension\s+\.\/src\/index.ts/);
  assert.match(screen, /├─ core\//);
  assert.match(screen, /value\s+squared/);
  assert.doesNotMatch(screen, /Raw output|Pseudocode|Script completed|Wall time/);
  assert.deepEqual(sample.result, before);
  const tools = new OutputViewer(
    parseRunResult(
      {
        content: [
          {
            type: "text",
            text: JSON.stringify([
              { name: "read", description: "Read files.\nFull declaration." },
              {
                name: "mcp__gitnexus__context",
                description: "Show references.\nFull declaration.",
              },
            ]),
          },
        ],
      },
      false,
    ),
    { terminal: { rows: 200 }, requestRender() {} } as TUI,
    theme,
    () => {},
  );
  const discovery = plain(tools, 120);
  assert.match(discovery, /Tool search · 2 matches/);
  assert.match(discovery, /GitNexus · 1 tools/);
  assert.match(discovery, /read +Read files\./);
  assert.doesNotMatch(discovery, /Full declaration|mcp__gitnexus__/);
});

test("popup retains every formatted block and record across scrolling and resize", () => {
  initTheme("dark", false);
  const values = Array.from({ length: 12 }, (_, index) => ({
    name: "item-" + index,
    count: index,
  }));
  const data = parseRunResult(
    {
      content: [
        { type: "text", text: JSON.stringify(values) },
        ...Array.from({ length: 12 }, (_, index) => ({ type: "text", text: "block-" + index })),
      ],
    },
    false,
  );
  const terminal = { rows: 200 };
  const viewer = new OutputViewer(data, { terminal, requestRender() {} } as TUI, theme, () => {});
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
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.ok(lines.length <= Math.floor(terminal.rows * 0.9));
  }
});
