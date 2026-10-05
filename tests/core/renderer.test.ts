import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import {
  initTheme,
  Theme,
  type ToolRenderers,
  type ExtensionAPI,
  type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import extension from "../../src/index.ts";

type Context = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
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
function renderer() {
  let resolver: ToolRendererResolver | undefined;
  extension({
    on() { return () => {}; },
    registerShortcut() {},
    registerToolRenderer(value: ToolRendererResolver) {
      resolver = value;
    },
  } as unknown as ExtensionAPI);
  assert.ok(resolver);
  return resolver("codemode", () => undefined)!;
}
import { theme as hostTheme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
function theme(): Theme {
  initTheme("dark", false);
  return hostTheme;
}
const plain = (lines: string[]) => stripVTControlCharacters(lines.join("\n"));
function render(value: unknown, width = 72, expanded = false) {
  return renderer().renderResult!(
    value as never,
    { expanded, isPartial: false },
    theme(),
    context({ expanded }),
  ).render(width);
}

test("receiving script keeps the panel border and padding", () => {
  const component = renderer().renderCall!(
    {}, theme(), context({ isPartial: true, argsComplete: false }),
  );
  for (const width of [20, 72, 100]) {
    const lines = component.render(width).map(stripVTControlCharacters);
    assert.match(lines[0]!, /^╭─ CODEMODE .*╮$/);
    assert.equal(lines[1], "│ " + " ".repeat(width - 4) + " │");
    assert.match(lines[2]!, /^│ Receiving/);
    assert.match(lines.join("\n"), /script…/);
    assert.equal(lines.at(-2), lines[1]);
    assert.match(lines.at(-1)!, /^╰─+╯$/);
    assert.ok(lines.every(line => visibleWidth(line) === width));
  }
});

test("truncation notice stays out of compact view without changing raw output", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../fixtures/truncated.json", import.meta.url), "utf8"),
  );
  const before = structuredClone(sample.result);
  const compact = plain(render(sample.result, 100));
  assert.doesNotMatch(compact, /0123456789/);
  assert.match(compact, /output/);
  assert.doesNotMatch(compact, /Output truncated|Full output:|\/var\/folders\//);
  const expanded = plain(render(sample.result, 100, true));
  assert.match(expanded, /Raw output/);
  assert.match(expanded, /Output truncated/);
  assert.ok(expanded.indexOf("Raw output") < expanded.indexOf("Output truncated"));
  assert.deepEqual(sample.result, before);
});

test("compact visual contract: header stats and footer controls in one panel", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../fixtures/example.json", import.meta.url), "utf8"),
  );
  const before = structuredClone(sample.result);
  const lines = render(sample.result);
  const screen = plain(lines);
  assert.ok(stripVTControlCharacters(lines[0]!).startsWith("╭─ CODEMODE "));
  assert.match(stripVTControlCharacters(lines[0]!), /CODEMODE ─+ 100ms ╮$/);
  assert.match(stripVTControlCharacters(lines.at(-1)!), /^╰─ (?:ctrl\+o )?expand · ctrl\+alt\+o output ↗ ─+╯$/);
  assert.equal((screen.match(/CODEMODE/g) ?? []).length, 1);
  assert.doesNotMatch(screen, /Pseudocode/);
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Read package metadata|Version\s+0.1.0|value\s+.*squared/);
  assert.doesNotMatch(screen, /CALLS/);
  assert.match(screen, /ctrl\+o expand|expand/);
  assert.doesNotMatch(
    screen,
    /Script completed|Wall time|\\\\n|\\\\"|0 running|0 error/,
  );
  assert.deepEqual(sample.result, before);
});

test("all scripts show uncapped pseudocode, including syntax outside the main converter", () => {
  const code =
    "const message = `hello ${name}`;\n" +
    Array.from({ length: 12 }, (_, i) => `text("line-${i}");`).join("\n");
  const result = { content: [], details: {} };
  const screen = plain(
    renderer().renderResult!(
      result as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(100),
  );
  assert.doesNotMatch(screen, /Pseudocode/);
  assert.match(screen, /line-11/);
  assert.match(screen, /`hello \$\{name\}`/);
  assert.match(screen, /message ←/);
});

test("pseudocode fallback keeps all lines for complex, large, and incomplete scripts", () => {
  const tail = Array.from({ length: 12 }, (_, i) => `text("tail-${i}");`).join(
    "\n",
  );
  for (const prefix of [
    'try { await tools.read({path: "test"}); } catch (error) { text(error); }',
    "for (let i = 0; i < 2; i++) { text(i); }",
    'text("large");\n'.repeat(1700),
    "const broken = ;",
  ]) {
    const code = prefix + "\n" + tail;
    const options = { expanded: false, isPartial: false };
    const result = { content: [], details: {} };
    const component = renderer().renderResult!(
      result as never,
      options,
      theme(),
      context({ args: { code } }),
    );
    const screen = plain(component.render(100));
    assert.doesNotMatch(screen, /Pseudocode/);
    assert.match(screen, /tail-11/);
    assert.doesNotMatch(screen, /await tools\.read/);
    const expanded = plain(
      renderer().renderResult!(
        result as never,
        { ...options, expanded: true },
        theme(),
        context({ args: { code }, expanded: true }),
      ).render(100000),
    );
    assert.ok(expanded.includes(code.split("\n")[0]!));
  }
});

test("pseudocode shows text arguments without the output wrapper", () => {
  for (const code of [
    'text(await tools.read({path: "file"}));',
    'try { text(await tools.read({path: "file"})); } catch (error) { text(error); }',
  ]) {
    const result = { content: [], details: {} };
    const screen = plain(
      renderer().renderResult!(
        result as never,
        { expanded: false, isPartial: false },
        theme(),
        context({ args: { code } }),
      ).render(100),
    );
    assert.match(screen, code.startsWith("try") ? /READ\(\{path: "file"\}\)/ : /READ file/);
    assert.doesNotMatch(screen, /text\(/);
    const expanded = plain(
      renderer().renderResult!(
        result as never,
        { expanded: true, isPartial: false },
        theme(),
        context({ args: { code }, expanded: true }),
      ).render(1000),
    );
    assert.ok(expanded.includes(code));
  }
});

test("pseudocode omits const bindings and text variables but keeps calls", () => {
  for (const prefix of ["", "try {} catch (error) {}\n", "/* large */".repeat(5000)]) {
  const code = prefix + 'const matches = await searchTools("read");\ntext(matches);\ntext(searchTools("edit"));';
  const screen = plain(
    renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(100),
  );
  assert.match(screen, /searchTools\("read"\)/);
  assert.match(screen, /searchTools\("edit"\)/);
  assert.doesNotMatch(screen, /matches|text\(/);
  }
});

test("pseudocode keeps codemode helpers visible inside text wrappers", () => {
  for (const prefix of ["", "try {} catch (error) {}\n", "/* large */".repeat(5000)]) {
    const code = prefix + "text(ALL_TOOLS);\ntext(searchTools);\ntext(describeTool);\ntext(describeNamespace);\ntext(value);";
    const component = (expanded: boolean) => renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded, isPartial: false }, theme(),
      context({ args: { code }, expanded }),
    );
    const screen = plain(component(false).render(100));
    for (const helper of ["ALL_TOOLS", "searchTools", "describeTool", "describeNamespace"])
      assert.ok(screen.includes(helper), helper);
    assert.doesNotMatch(screen, /text\(|value/);
    assert.ok(plain(component(true).render(100000)).includes("text(ALL_TOOLS);"));
  }
});

test("pseudocode uses uppercase primary tool names without changing other names or strings", () => {
  for (const prefix of ["", "try {", "/* large */".repeat(5000)]) {
    const code = prefix +
      'text(await tools.read({path: "tools.read"}));\n' +
      'await tools.edit({path: "file"});\nawait tools.bash({command: "pwd"});\n' +
      'await tools.write({}); await tools.grep({}); await tools.find({}); await tools.ls({});\n' +
      'await tools.powershell({}); await tools.custom({}); other.read();' +
      (prefix === "try {" ? "} catch (error) {}" : "");
    const screen = plain(renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(100));
    for (const name of ["READ", "EDIT", "BASH", "WRITE", "GREP", "FIND", "LS", "POWERSHELL"])
      assert.ok(screen.includes(prefix === "" && name === "BASH" ? "BASH pwd" : prefix === "" && name === "READ" ? "READ tools.read" : name + "("), name);
    assert.match(screen, prefix === "" ? /READ tools\.read/ : /"tools\.read"/);
    assert.match(screen, /custom/);
    assert.doesNotMatch(screen, /tools\.custom/);
    assert.match(screen, /other\.read\(\)/);
  }
});

test("pseudocode primary tool names use theme syntaxFunction", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded: false, isPartial: false },
    currentTheme,
    context({ args: { code: 'await tools.read({path: "file"}); await tools.edit({});' } }),
  ).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("syntaxFunction", "READ")));
  assert.ok(lines.join("\n").includes(currentTheme.fg("syntaxFunction", "EDIT")));
});

test("pseudocode keeps multiline write content complete", () => {
  const code = 'await tools.write({path: "script.mjs", content: `#!/usr/bin/env node\nimport { readFileSync } from "node:fs";\nconst hidden = 1;\nconst tail = 2;`});';
  const component = (expanded: boolean) => renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded, isPartial: false },
    theme(),
    context({ args: { code }, expanded }),
  );
  const screen = plain(component(false).render(200));
  assert.match(screen, /WRITE\(/);
  assert.match(screen, /#!\/usr\/bin\/env node/);
  assert.match(screen, /const hidden = 1;/);
  assert.match(screen, /const tail = 2;/);
  assert.ok(plain(component(true).render(200)).includes("const tail = 2;"));
});

test("pseudocode shows only EDIT and path while expanded code keeps edits", () => {
  for (const edits of [
    '[{oldText: "old", newText: "new"}]',
    '[{oldText: `old first\nold hidden`, newText: `new first\nnew hidden`}]',
  ]) {
    const code = 'await tools.edit({path: "src/screen.ts", edits: ' + edits + '});';
    const component = (expanded: boolean) => renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded, isPartial: false }, theme(),
      context({ args: { code }, expanded }),
    );
    const screen = plain(component(false).render(100));
    assert.ok(screen.includes("EDIT src/screen.ts"));
    assert.doesNotMatch(screen, /oldText|newText|old hidden|new hidden|EDIT\(/);
    const expanded = plain(component(true).render(200));
    assert.match(expanded, /oldText|newText/);
  }
});

test("edit confirmations become success color and remain in expanded raw output", () => {
  const code = 'await tools.edit({path: "file.ts", edits: [{oldText: "old", newText: "new"}]});';
  const receipt = "Successfully replaced 1 block(s) in file.ts.";
  const currentTheme = theme();
  const result = { content: [{ type: "text", text: receipt }], details: {} };
  const component = (expanded: boolean) => renderer().renderResult!(
    result as never, { expanded, isPartial: false }, currentTheme,
    context({ args: { code }, expanded }),
  );
  const lines = component(false).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("success", "EDIT")));
  assert.doesNotMatch(plain(lines), /Successfully replaced|Output 1|No text output/);
  assert.ok(plain(component(true).render(200)).includes(receipt));
});

test("failed tool calls use error color and retain error output", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    { content: [{ type: "text", text: "permission denied" }], details: {
      calls: [{ name: "edit", args: '{"path":"file.ts"}', status: "error", error: "permission denied" }],
    } } as never,
    { expanded: false, isPartial: false }, currentTheme,
    context({ args: { code: 'await tools.edit({path: "file.ts", edits: []});' } }),
  ).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", "✗ EDIT file.ts")));
  assert.match(plain(lines), /permission denied/);
});

test("pseudocode merges per-call status and right-aligned execution times", () => {
  const code = 'await tools.edit({path: "first.ts", edits: []});\nawait tools.edit({path: "second.ts", edits: []});';
  const screen = plain(renderer().renderResult!(
    { content: [], details: { calls: [
      { name: "edit", args: '{"path":"first.ts"}', status: "ok", durationMs: 12 },
      { name: "edit", args: '{"path":"second.ts"}', status: "error", durationMs: 8624, error: "denied" },
    ] } } as never,
    { expanded: false, isPartial: false }, theme(),
    context({ args: { code } }),
  ).render(100));
  assert.match(screen, /✓ EDIT first\.ts +12ms/);
  assert.match(screen, /✗ EDIT second\.ts +8\.6s/);
  assert.match(screen, /denied/);
  assert.doesNotMatch(screen, /CALLS/);
});

test("pseudocode execution times match success and error colors", () => {
  const currentTheme = theme();
  const result = { content: [], details: { calls: [
    { name: "edit", args: '{"path":"first.ts"}', status: "ok", durationMs: 12 },
    { name: "edit", args: '{"path":"second.ts"}', status: "error", durationMs: 8624 },
  ] } };
  const code = 'await tools.edit({path: "first.ts", edits: []});\nawait tools.edit({path: "second.ts", edits: []});';
  for (const width of [20, 100]) {
    const styled = renderer().renderResult!(
      result as never, { expanded: false, isPartial: false }, currentTheme,
      context({ args: { code } }),
    ).render(width).join("\n");
    assert.ok(styled.includes(currentTheme.fg("success", "12ms")));
    assert.ok(styled.includes(currentTheme.fg("error", "8.6s")));
  }
});

test("script errors before any tool call show only Error until expanded", () => {
  const code = 'text("broken");';
  const raw = "Script error:\nSyntaxError: Unexpected token\n\nNo tool calls were made.";
  const result = { content: [{ type: "text", text: raw }], details: {}, isError: true };
  const component = (expanded: boolean) => renderer().renderResult!(
    result as never, { expanded, isPartial: false }, theme(),
    context({ args: { code }, expanded, isError: true }),
  );
  const screen = plain(component(false).render(100));
  assert.match(screen, /Error/);
  assert.match(screen, /Unexpected token/);
  assert.match(screen, /ctrl\+o expand · ctrl\+alt\+o output ↗ ─+╯$/);
  assert.doesNotMatch(screen, /Code and raw output/);
  assert.doesNotMatch(screen, /Pseudocode|Output before failure|No text output|broken/);
  const expanded = plain(component(true).render(200));
  assert.match(expanded, /broken|Raw output|No tool calls were made/);
});

test("mixed call failures stay in top Error and never inside Pseudocode", () => {
  const code = 'await tools.edit({path: "file.ts", edits: []});\nawait tools.bash({command: "npm run check"});';
  const raw = JSON.stringify({ exit_code: 1, output: "one test failed", wall_time_seconds: 6 });
  const result = { isError: true, content: [{ type: "text", text: raw }], details: { calls: [
    { name: "edit", args: '{"path":"file.ts","edits":[]}', status: "ok", durationMs: 3 },
    { name: "bash", args: '{"command":"npm run check"}', status: "error", durationMs: 6000, error: "one test failed" },
  ] } };
  const component = (expanded: boolean) => renderer().renderResult!(
    result as never, { expanded, isPartial: false }, theme(),
    context({ args: { code }, expanded, isError: true }),
  );
  const screen = plain(component(false).render(100));
  assert.doesNotMatch(screen, /Complete|Script failed|Running/);
  assert.ok(screen.indexOf("Error") < screen.indexOf("✓ edit"));
  assert.ok(screen.indexOf("one test failed") < screen.indexOf("✓ edit"));
  assert.doesNotMatch(screen.slice(screen.indexOf("✓ edit")), /one test failed|edits:|Arguments:/);
  assert.ok(plain(component(true).render(300)).includes(raw));
});

test("recovered tool errors keep success color and appear in output order", () => {
  const failure = JSON.stringify({ exit_code: 1, output: "recovered failure" });
  const result = { content: [
    { type: "text", text: "Script completed\nWall time 1 seconds\nOutput:\n" },
    { type: "text", text: "before sentinel" },
    { type: "text", text: failure },
    { type: "text", text: "after sentinel" },
  ], details: { calls: [
    { name: "bash", args: '{"command":"false"}', status: "error", error: "recovered failure" },
  ] } };
  const screen = plain(renderer().renderResult!(
    result as never, { expanded: false, isPartial: false }, theme(),
    context({ args: { code: 'await tools.bash({command: "false"});' } }),
  ).render(100));
  assert.doesNotMatch(screen, /Complete|Script failed|Running/);
  assert.doesNotMatch(screen, /Script failed/);
  assert.match(screen, /✗ BASH/);
  assert.ok(screen.indexOf("Pseudocode") < screen.indexOf("Error"));
  assert.doesNotMatch(screen, /before sentinel|after sentinel/);
  const expanded = plain(render(result, 1000, true));
  assert.ok(expanded.indexOf("before sentinel") < expanded.indexOf(failure));
  assert.ok(expanded.indexOf(failure) < expanded.indexOf("after sentinel"));
});

test("recovered error output uses theme error text color", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    { content: [{ type: "text", text: '{"exit_code":1,"output":"failure sentinel"}' }], details: {} } as never,
    { expanded: false, isPartial: false }, currentTheme, context(),
  ).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", "Error")));
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", "failure sentinel")));
});

test("failed pseudocode calls color their full command error", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    { content: [], details: { calls: [
      { name: "bash", args: '{"command":"npm run check","timeout":120}', status: "error", durationMs: 6000 },
    ] } } as never,
    { expanded: false, isPartial: false }, currentTheme,
    context({ args: { code: 'await tools.bash({command: "npm run check", timeout: 120});' } }),
  ).render(100);
  const command = '✗ BASH npm run check · timeout 120s  ';
  assert.ok(lines.join("\n").includes(currentTheme.fg("error",
    command + " ".repeat(96 - command.length - 4) + "6.0s")));
});

test("tool search stays hidden until output is opened or expanded", () => {
  const tools = [
    ...["find", "bash", "edit", "grep", "write", "skill_search"].map((name) => ({
      name, description: "Search file paths. Full declaration follows.\nSchema",
    })),
    ...["rename", "context", "cypher", "impact"].map((name) => ({
      name: "mcp__gitnexus__" + name,
      description: "Show symbol references. Full declaration follows.",
    })),
  ];
  const raw = JSON.stringify(tools);
  const result = { content: [{ type: "text", text: raw }], details: {} };
  const screen = plain(render(result, 100));
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Tool search|GitNexus|Search file paths/);
  assert.doesNotMatch(screen, /Available tools|more tools|mcp__gitnexus__|Full declaration/);
  assert.ok(plain(render(result, 1000, true)).includes(raw));
  for (const width of [6, 10, 20, 38, 72, 120]) {
    const lines = render(result, width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
});

test("hidden tool search keeps compact Unicode output within width", () => {
  const result = { content: [{ type: "text", text: JSON.stringify([
    { name: "界👩‍💻long_tool_name", description: "Search file paths with a very long description that must not wrap." },
    { name: "read", description: "Read file contents with a very long description that must not wrap." },
  ]) }], details: {} };
  const screen = plain(render(result, 48));
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Search file/);
  assert.ok(render(result, 48).every((line) => visibleWidth(line) <= 48));
});

test("code does not make a second panel during execution", () => {
  const component = renderer().renderCall!(
    { code: "const x=1;\ntext(x);" },
    theme(),
    context(),
  );
  assert.deepEqual(component.render(72), []);
});

test("narrow, Unicode and control output stay within every supplied width", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          label: "Unicode",
          result: { name: "界👩‍💻é", text: "abc\u001b[2J\rdef" },
        }),
      },
    ],
    details: {},
  };
  for (const width of [0, 1, 2, 5, 20, 38, 72, 120]) {
    const lines = render(result, width);
    assert.ok(
      lines.every((line) => visibleWidth(line) <= width),
      "width " + width,
    );
    assert.ok(!lines.join("\n").includes("\u001b[2J"));
  }
});

test("bash command previews use one available row and hide control fields", () => {
  const code = 'await tools.bash({command: "npm run check --workspace=' + '界'.repeat(100) + '\\nnext", timeout: 120});';
  const component = (expanded: boolean) => renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded, isPartial: false }, theme(),
    context({ args: { code }, expanded }),
  );
  for (const width of [20, 48, 72, 120]) {
    const lines = component(false).render(width);
    const screen = plain(lines);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.equal(screen.split('\n').filter((line) => line.includes('bash ')).length, 1);
    assert.ok([...screen].filter(character => character === "界").length < 100);
    assert.match(screen, /…/);
    assert.doesNotMatch(screen, /next|timeout/);
  }
  assert.ok(plain(component(true).render(1000)).includes(code));
});

test("shell preview grows with panel width and reserves status and duration", () => {
  const command = "echo " + "x".repeat(300);
  const code = "tools.bash(" + JSON.stringify({command}) + ")";
  const component = renderer().renderResult!(
    {content: [], details: {calls: [
      {name: "bash", args: {command}, status: "ok", durationMs: 12},
    ]}} as never, {expanded: false, isPartial: false}, theme(),
    context({args: {code}}),
  );
  let previous = 0;
  for (const width of [32, 72, 120]) {
    const lines = component.render(width);
    const commandRow = plain(lines).split("\n").find(line => line.includes("bash "))!;
    assert.match(commandRow, /✓ bash echo x+…\s+12ms/);
    const retained = [...commandRow].filter(character => character === "x").length;
    assert.ok(retained > previous);
    previous = retained;
    assert.ok(lines.every(line => visibleWidth(line) <= width));
  }
});

test("file paths wrap in full and preserve expanded code", () => {
  const path = "/Users/kenbanks/Software/ToolChain/node_modules/.pnpm/very-long-package/node_modules/pi-coding-agent/docs/codemode.md";
  for (const tool of ["read", "edit", "write", "ls"]) {
    const code = `await tools.${tool}({path: ${JSON.stringify(path)}});`;
    const component = (expanded: boolean) => renderer().renderResult!(
      { content: [], details: { calls: [
        { name: tool, args: JSON.stringify({ path }), status: "ok", durationMs: 12 },
      ] } } as never,
      { expanded, isPartial: false }, theme(),
      context({ args: { code }, expanded }),
    );
    for (const width of [32, 72, 160]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      const body = screen.split("\n").filter(line => line.startsWith("│ "))
        .map(line => line.slice(2, -2).trimEnd()).join("");
      assert.ok(body.includes(path));
      assert.doesNotMatch(screen, /…\/|\.\.\./);
      assert.equal(screen.split("\n").filter((line) => line.includes("✓ " + tool + " ")).length, 1);
      assert.match(screen, /12ms/);

    }
    assert.ok(plain(component(true).render(1000)).includes(code));
  }
});

test("recorded read calls show full paths when pseudocode has no matching call", () => {
  const path = "/Users/kenbanks/Software/ToolChain/node_modules/pi-coding-agent/docs/codemode.md";
  for (const args of [JSON.stringify({ path }), JSON.stringify({ path, limit: 100 }).slice(0, -2)]) {
    const code = "text(value);";
    const component = (expanded: boolean) => renderer().renderResult!(
      { content: [], details: { calls: [
        { name: "read", args, status: "ok", durationMs: 12 },
      ] } } as never,
      { expanded, isPartial: false }, theme(),
      context({ args: { code }, expanded }),
    );
    for (const width of [32, 72, 160]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      const body = screen.split("\n").filter(line => line.startsWith("│ "))
        .map(line => line.slice(2, -2).trimEnd()).join("");
      assert.ok(body.includes(path));
      assert.match(screen, /✓ read/);
      assert.doesNotMatch(screen, /…\/|\{"path"/);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      assert.match(screen, /12ms/);
    }
    assert.ok(plain(component(true).render(1000)).includes(args));
  }
});

test("read arguments cut inside a path do not display a JSON fragment as a filename", () => {
  const args = '{"path":"/Users/kenbanks/Software/ToolChain/node_modules/.pnpm/package...';
  const screen = plain(renderer().renderResult!(
    { content: [], details: { calls: [{ name: "read", args, status: "ok" }] } } as never,
    { expanded: false, isPartial: false }, theme(), context(),
  ).render(100));
  assert.match(screen, /✓ read … \(path truncated\)/);
  assert.doesNotMatch(screen, /\{"path"|Users\/kenbanks|package/);
});

test("wrapped bash commands do not reset the host background", () => {
  const lines = renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded: false, isPartial: false }, theme(),
    context({ args: { code: 'await tools.bash({command: "' + 'x'.repeat(200) + '", timeout: 120});' } }),
  ).render(72);
  const command = lines.find((line) => plain([line]).includes('bash '))!;
  const screen = plain(lines);
  assert.ok([...screen].filter(character => character === "x").length < 200);
  assert.match(screen, /…/);
  assert.doesNotMatch(screen, /\.\.\.|timeout/);
  const content = command.replace(/^\x1b\[48;[0-9;]*m/, "").replace(/\x1b\[49m$/, "");
  assert.doesNotMatch(content, /\x1b\[(?:0)?m|\x1b\[49m|\x1b\[4[0-8]m|\x1b\[48[;:]/);
});

test("primary calls hide control fields and match each recorded status once", () => {
  const code = 'tools.read({path: "src/pseudocode.ts", offset: 300, limit: 35});\n' +
    'tools.read({path: "src/index.ts", limit: 120});\n' +
    'tools.bash({command: "git status --short; pwd", timeout: 30});';
  const calls = [
    { name: "read", args: {path: "src/index.ts", limit: 120}, status: "cancelled", durationMs: 9 },
    { name: "read", args: {path: "src/pseudocode.ts", offset: 300, limit: 35}, status: "ok", durationMs: 2 },
    { name: "bash", args: {command: "git status --short; pwd", timeout: 30}, status: "ok", durationMs: 13 },
  ];
  for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
    const component = (expanded: boolean) => renderer().renderResult!(
      { content: [], details: { calls } } as never, { expanded, isPartial: false },
      theme(), context({args: {code: prefix + code}, expanded}),
    );
    const screen = plain(component(false).render(120));
    assert.match(screen, /✓ read src\/pseudocode.ts;?\s+2ms/);
    assert.match(screen, /– read src\/index.ts;?\s+9ms/);
    assert.match(screen, /✓ bash git status --short; pwd;?\s+13ms/);
    assert.equal(screen.split("src/pseudocode.ts").length - 1, 1);
    assert.equal(screen.split("src/index.ts").length - 1, 1);
    assert.doesNotMatch(screen, /offset:|limit:|timeout:/);
    const expanded = plain(component(true).render(1000));
    for (const line of code.split("\n")) assert.ok(expanded.includes(line));
  }
});

test("truncated host arguments attach status to one complete source command", () => {
  const command = "node --input-type=module <<'JS'\n" + "console.log(" +
    JSON.stringify("界".repeat(150)) + ");\nJS";
  const path = "/Users/kenbanks/Software/ToolChain/node_modules/pi-coding-agent/docs/packages.md";
  const code = "tools.bash(" + JSON.stringify({command, timeout: 30}) + ");\n" +
    "tools.read(" + JSON.stringify({path, limit: 100}) + ");";
  for (const suffix of ["", "...", "…"]) {
    const calls = [
      {name: "bash", args: JSON.stringify({command, timeout: 30}).slice(0, 80) + suffix,
        status: "ok", durationMs: 39},
      {name: "read", args: JSON.stringify({path, limit: 100}).slice(0, 45) + suffix,
        status: "ok", durationMs: 9},
    ];
    const component = (expanded: boolean) => renderer().renderResult!(
      {content: [], details: {calls}} as never, {expanded, isPartial: false},
      theme(), context({args: {code}, expanded}),
    );
    for (const width of [48, 120]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      assert.equal(screen.split("\n").filter(line => line.includes("bash ")).length, 1);
      assert.equal(screen.split("\n").filter(line => line.includes("read ")).length, 1);
      assert.match(screen, /✓ bash/);
      assert.match(screen, /✓ read/);
      assert.match(screen, /39ms/);
      assert.match(screen, /9ms/);
      const body = screen.split("\n").filter(line => line.startsWith("│ "))
        .map(line => line.slice(2, -2).trimEnd()).join("");
      assert.ok(body.includes(path));
      assert.ok([...screen].filter(character => character === "界").length < 150);
      assert.match(screen, /…\s+39ms/);
      assert.doesNotMatch(screen, /\{"command"|path truncated|\.\.\.|…\//);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
    }
    const expanded = plain(component(true).render(10000));
    for (const line of code.split("\n")) assert.ok(expanded.includes(line));
    for (const call of calls) assert.ok(expanded.includes(call.args));
  }
});

test("host arguments cut after a complete command do not duplicate the source row", () => {
  const command = "node --import tsx --test tests/core/preview.test.ts && " +
    "node --import tsx --test --test-name-pattern='bash command' tests/core/renderer.test.ts";
  const code = "tools.bash(" + JSON.stringify({command, timeout: 120}) + ")";
  const args = JSON.stringify({command, timeout: 120});
  for (const cut of [args.indexOf(',"timeout"') + 1, args.length - 2]) {
    const screen = plain(renderer().renderResult!(
      {content: [], details: {calls: [
        {name: "bash", args: args.slice(0, cut) + "...", status: "ok", durationMs: 39},
      ]}} as never, {expanded: false, isPartial: false}, theme(),
      context({args: {code}}),
    ).render(120));
    assert.equal(screen.split("\n").filter(line => /\bbash\b/.test(line)).length, 1);
    assert.match(screen, /✓ bash/);
    assert.match(screen, /39ms/);
    assert.doesNotMatch(screen, /\{"command"/);
  }
});

test("ambiguous truncated argument prefixes do not assign status to a source call", () => {
  const paths = ["/Users/kenbanks/shared/first.ts", "/Users/kenbanks/shared/second.ts"];
  const code = paths.map(path => "tools.read(" + JSON.stringify({path}) + ");").join("\n");
  const screen = plain(renderer().renderResult!(
    {content: [], details: {calls: [
      {name: "read", args: '{"path":"/Users/kenbanks/shared/...', status: "ok", durationMs: 5},
    ]}} as never, {expanded: false, isPartial: false},
    theme(), context({args: {code}}),
  ).render(160));
  assert.doesNotMatch(screen, /✓ read \/Users/);
  assert.match(screen, /✓ read … \(path truncated\)/);
  for (const path of paths) assert.ok(screen.includes(path));
});

test("unknown tools use compact calls with status and preserve expanded source", () => {
  for (const prefix of ["", "/* large */".repeat(5000) + "\n", "try {\n"]) {
    const code = prefix + 'text(await tools.skill_search({query: "agents", limit: 1}));';
    const result = { content: [], details: { calls: [
      { name: "skill_search", args: { query: "agents", limit: 1 }, status: "ok", durationMs: 12 },
    ] } };
    const render = (expanded: boolean) => plain(renderer().renderResult!(
      result as never, { expanded, isPartial: false }, theme(),
      context({ args: { code }, expanded }),
    ).render(120));
    const compact = render(false);
    assert.match(compact, /✓ skill_search agents;?\s+12ms/);
    assert.doesNotMatch(compact, /tools\.skill_search|skill_search\(/);
    assert.equal(compact.split("skill_search").length - 1, 1);
    assert.ok(render(true).includes('text(await tools.skill_search({query: "agents", limit: 1}));'));
  }
});

test("default tool metadata survives discovery grouping, indentation, and overlapping names", () => {
  const code = 'searchTools("read");\ndescribeTool("read");\ntools.getToolGuidance({name: "read"});\n' +
    'if (true) { tools.lookup({}); tools.lookupLong({}); }\n' +
    'tools.$lookup({});\ntools.read({unexpected: true});';
  const names = ["lookup", "lookupLong", "$lookup", "read"];
  const calls = names.map((name, index) => ({
    name, args: name === "read" ? { unexpected: true } : {}, status: "ok", durationMs: 11 + index,
  }));
  const screen = plain(renderer().renderResult!(
    { content: [], details: { calls } } as never,
    { expanded: false, isPartial: false }, theme(), context({ args: { code } }),
  ).render(120));
  assert.match(screen, /✓\s+lookup\s+11ms/);
  assert.match(screen, /✓\s+lookupLong\s+12ms/);
  assert.match(screen, /✓ \$lookup\s+13ms/);
  assert.match(screen, /✓ read unexpected: true\s+14ms/);
  assert.equal(screen.split("unexpected").length - 1, 1);
});

test("unrecorded shell commands use width-aware previews without invented status", () => {
  const command = "node --input-type=module <<'JS'\n" +
    "const roots = [" + JSON.stringify("界".repeat(200)) + "];\n" +
    "console.log(roots);\nJS";
  for (const tool of ["bash", "powershell"]) {
    const code = "tools." + tool + "(" + JSON.stringify({ command, timeout: 30 }) + ");";
    for (const calls of [[], [{name: tool, args: {command}, status: "unknown"}]]) {
      const component = (expanded: boolean) => renderer().renderResult!(
        {content: [], details: {calls}} as never, {expanded, isPartial: false},
        theme(), context({args: {code}, expanded}),
      );
      for (const width of [20, 48, 120]) {
        const lines = component(false).render(width);
        const screen = plain(lines);
        assert.equal(screen.split("\n").filter(line => line.includes(tool + " ")).length, 1);
        assert.ok([...screen].filter(character => character === "界").length < 200);
        assert.match(screen, /…/);
        assert.doesNotMatch(screen, /\.\.\./);
        assert.doesNotMatch(screen, /\? |✓ |timeout:/);
        const body = screen.split("\n").filter(line => line.startsWith("│ "))
          .map(line => line.slice(2, -2).trimEnd()).join("");
        assert.ok(!body.includes("console.log(roots)"));
        assert.ok(lines.every(line => visibleWidth(line) <= width));
      }
      assert.ok(plain(component(true).render(10000)).includes(code));
    }
  }
  const screen = plain(renderer().renderResult!(
    {content: [], details: {}} as never, {expanded: false, isPartial: false},
    theme(), context({args: {code: 'tools.read({path: "src/index.ts"})'}}),
  ).render(100));
  assert.match(screen, /read src\/index.ts/);
  assert.doesNotMatch(screen, /\? |✓ /);
});

test("unrecorded default tool calls remain unknown or pending, not successful", () => {
  for (const [partial, symbol] of [[false, ""], [true, "…"]] as const) {
    const screen = plain(renderer().renderResult!(
      { content: [], details: {} } as never, { expanded: false, isPartial: partial },
      theme(), context({ args: { code: 'tools.custom({enabled: true})' } }),
    ).render(100));
    assert.ok(screen.includes((symbol ? symbol + " " : "") + "custom enabled: true"));
    assert.ok(!screen.includes("? custom"));
    assert.ok(!screen.includes("✓"));
  }
});
