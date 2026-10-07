import { initTheme, ToolExecutionComponent, type ExtensionAPI, type ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "../../src/index.ts";
import { registeredRenderers, renderedText, hostTheme as theme } from "../support/host.ts";
import { context } from "../support/render.ts";

function shell(args: unknown = { query: "read bash", limit: 2 }) {
  return new ToolExecutionComponent(
    "tool_search", "search", args, { showImages: false },
    registeredRenderers("tool_search"), { requestRender() {} } as TUI, process.cwd(),
  );
}

const loaded = {
  content: [{ type: "text", text: "Loaded 2 tools. They are available from your next call:\n- read: Read a file.\n- bash: Execute a command." }],
  details: { loaded: ["read", "bash"] },
  isError: false,
};

test("tool_search uses the skin and keeps raw output and arguments on expansion/replay", () => {
  initTheme("dark", false);
  const component = shell();
  const before = structuredClone(loaded);
  component.updateResult(loaded, false);
  const compact = renderedText(component);
  assert.match(compact, /TOOL SEARCH/);
  assert.match(compact, /search read bash/);
  assert.match(compact, /Loaded 2 tools/);
  assert.match(compact, /read/);
  assert.match(compact, /bash/);
  assert.match(compact, /output ↗/);
  assert.doesNotMatch(compact, /Read a file|Code|No nested tool calls/);
  for (const width of [0, 3, 5, 10, 11, 20, 40, 80, 120]) {
    assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
  }
  component.setExpanded(true);
  const expanded = renderedText(component, 200);
  assert.match(expanded, /Arguments/);
  assert.match(expanded, /"limit": 2/);
  for (const line of loaded.content[0]!.text.split("\n")) assert.ok(expanded.includes(line));
  assert.doesNotMatch(expanded, /No nested tool calls/);
  component.setExpanded(false);
  assert.equal(renderedText(component), compact);
  assert.deepEqual(loaded, before);
});

test("tool_search handles empty, error, partial, and unknown result shapes", () => {
  initTheme("dark", false);
  for (const [result, partial, expected] of [
    [{ content: [{ type: "text", text: "No matching tools found." }], details: { loaded: [] }, isError: false }, false, /No matching tools found/],
    [{ content: [{ type: "text", text: "query must not be empty" }], isError: true }, false, /query must not be empty/],
    [{ content: [{ type: "text", text: "Searching deferred tools…" }], isError: false }, true, /Searching deferred tools/],
    [{ content: [{ type: "text", text: "future result format" }], details: { loaded: [42] }, isError: false }, false, /future result format/],
    [{ content: [], isError: false }, false, /search read bash/],
  ] as [Parameters<ToolExecutionComponent["updateResult"]>[0], boolean, RegExp][]) {
    const component = shell();
    component.updateResult(result, partial);
    const screen = renderedText(component);
    assert.match(screen, /TOOL SEARCH/);
    assert.match(screen, expected);
  }
});

test("tool_search header and host background track pending, success, and error in both themes", () => {
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    for (const [partial, isError, color, bg] of [
      [true, false, "warning", "toolPendingBg"],
      [false, false, "success", "toolSuccessBg"],
      [false, true, "error", "toolErrorBg"],
    ] as const) {
      const component = shell();
      component.updateResult({ ...loaded, isError }, partial);
      for (const expanded of [false, true]) {
        component.setExpanded(expanded);
        const screen = component.render(80).join("\n");
        assert.ok(screen.includes(theme.fg(color, "TOOL SEARCH")));
        assert.ok(screen.includes(theme.getBgAnsi(bg)));
      }
    }
  }
});

test("search queries and loaded names are terminal-safe at narrow widths", () => {
  initTheme("dark", false);
  const component = shell({ query: "界👩‍💻é\n\u001b[31mquery", limit: 1 });
  component.updateResult({
    content: [{ type: "text", text: "original\u001b[31moutput" }],
    details: { loaded: ["界👩‍💻é\u001b[31mtool"] },
    isError: false,
  }, false);
  for (const expanded of [false, true]) {
    component.setExpanded(expanded);
    for (const width of [11, 20, 40, 80]) {
      assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
    }
    assert.ok(!component.render(80).join("\n").includes("\u001b[31m"));
  }
});

test("tool_search shows receiving and searching states before a result", () => {
  initTheme("dark", false);
  const renderers = registeredRenderers("tool_search");
  for (const complete of [false, true]) {
    const args = { query: "read bash" };
    const component = renderers.renderCall!(args, theme, context({
      args, isPartial: true, argsComplete: complete,
    }));
    const screen = renderedText(component);
    assert.match(screen, /TOOL SEARCH/);
    assert.match(screen, complete ? /Searching…/ : /Receiving search…/);
    if (complete) assert.match(screen, /search read bash/);
  }
});

test("other tools keep the downstream renderer", () => {
  let resolver!: ToolRendererResolver;
  extension({
    on() { return () => {}; },
    registerShortcut() {},
    registerToolRenderer(value: ToolRendererResolver) { resolver = value; },
  } as unknown as ExtensionAPI);
  const downstream = {};
  let called = false;
  assert.equal(resolver("read", () => { called = true; return downstream; }), downstream);
  assert.ok(called);
});
