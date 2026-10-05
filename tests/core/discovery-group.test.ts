import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { Screen } from "../../src/screen.ts";
import { model } from "../../src/model.ts";

test("expand and collapse hints sit at the bottom left when space permits", () => {
  initTheme("dark", false);
  for (const expanded of [false, true]) {
    for (const width of [20, 80, 120]) {
      const lines = new Screen(model({content: []}, false), "", expanded, false, theme).render(width);
      const hint = stripVTControlCharacters(lines.at(-1)!);
      assert.ok(hint.length <= width);
      if (width === 20 && expanded) {
        assert.ok(lines.some(line => stripVTControlCharacters(line).includes("ctrl+o collapse")));
        assert.match(hint, /^╰─+╯$/);
      } else {
      assert.match(hint, new RegExp("^╰─ ctrl\\+o " + (expanded ? "collapse" : "expand") + " ─+╯$"));
      }
    }
  }
});

test("same-tool discovery is one status row; expansion retains each call", () => {
  initTheme("dark", false);
  const code = 'text(await searchTools("edit"));\ntext(await describeTool("edit"));\ntext(await tools.getToolGuidance({name:"edit"}));';
  for (const status of ["ok", "error", "running", "cancelled"]) {
    const data = model({content: [], details: {calls: [
      {name:"searchTools", args:{query:"edit"}, status:"ok", durationMs:20},
      {name:"describeTool", args:{name:"edit"}, status:"ok", durationMs:30},
      {name:"getToolGuidance", args:{name:"edit"}, status, durationMs:70},
    ]}}, false);
    const draw = (expanded = false) => stripVTControlCharacters(
      new Screen(data, code, expanded, status === "running", theme).render(120).join("\n"));
    assert.match(draw(), new RegExp(({ok:"✓",error:"✗",running:"…",cancelled:"–"})[status]! + " discover edit +120ms"));
    assert.doesNotMatch(draw(), /searchTools edit|describeTool edit|getToolGuidance edit/);
    assert.ok(draw(true).includes(code.split("\n")[0]!));
  }
});

test("searchTools shows running status without a nested call record", () => {
  initTheme("dark", false);
  const data = model({content: [], details: {}}, false);
  const screen = stripVTControlCharacters(new Screen(
    data, 'const results = await searchTools("read bash"); text(results);',
    false, true, theme,
  ).render(120).join("\n"));
  assert.match(screen, /… searchTools read bash/);
});

test("searchTools uses recorded success and error states", () => {
  initTheme("dark", false);
  for (const [status, symbol] of [["ok", "✓"], ["error", "✗"], ["running", "…"]]) {
    const data = model({content: [], details: {calls: [
      {name: "searchTools", args: {query: "read bash"}, status},
    ]}}, status === "error");
    const screen = stripVTControlCharacters(new Screen(
      data, 'text(await searchTools("read bash"));',
      false, status === "running", theme,
    ).render(120).join("\n"));
    assert.ok(screen.includes(symbol + " searchTools read bash"));
  }
});

test("generic tools receive status and duration without a name allowlist", () => {
  initTheme("dark", false);
  for (const name of ["skill_search", "mcp__provider__lookup", "futureTool42"]) {
    for (const [status, symbol] of [["ok", "✓"], ["error", "✗"], ["running", "…"], ["cancelled", "–"], ["unknown", "?"]]) {
      const code = 'text(await tools.' + name + '({query: "read bash"}));';
      const data = model({content: [], details: {calls: [
        {name, args: {query: "read bash"}, status, durationMs: 12},
      ]}}, false);
      const screen = stripVTControlCharacters(new Screen(
        data, code, false, status === "running", theme,
      ).render(160).join("\n"));
      assert.ok(screen.includes(symbol + " " + name + (name === "skill_search" ? ' "read bash"' : ' query: "read bash"')), screen);
      assert.match(screen, /12ms/);
    }
  }
});

test("generic tool status does not annotate quoted text or other objects", () => {
  initTheme("dark", false);
  const code = 'text("tools.skill_search()"); other.skill_search();';
  const data = model({content: [], details: {calls: [
    {name: "skill_search", args: {}, status: "ok"},
  ]}}, false);
  const screen = stripVTControlCharacters(new Screen(data, code, false, false, theme).render(160).join("\n"));
  assert.ok(!screen.includes("✓ tools.skill_search"));
  assert.ok(!screen.includes("✓ other.skill_search"));
});

test("output appears only when there is output to view", () => {
  initTheme("dark", false);
  for (const [texts, expected] of [
    [[], false],
    [[""], false],
    [["   "], false],
    [["Successfully wrote 12 bytes to file.ts"], false],
    [["Successfully replaced 1 block(s) in file.ts."], false],
    [["result"], true],
    [["0"], true],
    [["[]"], true],
    [["Script error: failed"], true],
  ] as [string[], boolean][]) {
    const data = model({content: texts.map(text => ({type: "text", text}))},
      texts[0]?.startsWith("Script error:") ?? false);
    const screen = new Screen(data, "await tools.read({path: 'file'});", false, false, theme);
    assert.equal(stripVTControlCharacters(screen.render(120).join("\n")).includes("output"), expected);
    if (!expected) assert.equal(screen.handleMouse({type: "click", button: "left", x: 110, y: 3} as never), undefined);
  }
});

test("different tools and interrupted discovery stay separate", () => {
  initTheme("dark", false);
  for (const code of [
    'await searchTools("read"); await describeTool("edit"); await tools.getToolGuidance({name:"edit"});',
    'await searchTools("edit"); await tools.read({path:"file"}); await describeTool("edit"); await tools.getToolGuidance({name:"edit"});',
  ]) {
    const screen = stripVTControlCharacters(new Screen(
      model({content: [], details: {}}, false), code, false, false, theme,
    ).render(120).join("\n"));
    assert.doesNotMatch(screen, /discover /);
    assert.match(screen, /describeTool edit/);
    assert.match(screen, /getToolGuidance edit/);
  }
});
