import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainLines as plain, registeredRenderers as renderer } from "../support/host.ts";
import { context, render, theme } from "../support/render.ts";

test("edit confirmations become success color and remain in expanded raw output", () => {
  const code = 'await tools.edit({path: "file.ts", edits: [{oldText: "old", newText: "new"}]});';
  const receipt = "Successfully replaced 1 block(s) in file.ts.";
  const currentTheme = theme();
  const result = { content: [{ type: "text", text: receipt }], details: {} };
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      result as never,
      { expanded, isPartial: false },
      currentTheme,
      context({ args: { code }, expanded }),
    );
  const lines = component(false).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("success", "edit")));
  assert.doesNotMatch(plain(lines), /Successfully replaced|Output 1|No text output/);
  assert.ok(plain(component(true).render(200)).includes(receipt));
});

test("pseudocode merges per-call status and right-aligned execution times", () => {
  const code =
    'await tools.edit({path: "first.ts", edits: []});\nawait tools.edit({path: "second.ts", edits: []});';
  const screen = plain(
    renderer().renderResult!(
      {
        content: [],
        details: {
          calls: [
            { name: "edit", args: '{"path":"first.ts"}', status: "ok", durationMs: 12 },
            {
              name: "edit",
              args: '{"path":"second.ts"}',
              status: "error",
              durationMs: 8624,
              error: "denied",
            },
          ],
        },
      } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(100),
  );
  assert.match(screen, /✓ edit first\.ts +12ms/);
  assert.match(screen, /✗ edit second\.ts +8\.6s/);
  assert.match(screen, /denied/);
  assert.doesNotMatch(screen, /CALLS/);
});

test("tool search stays hidden until output is opened or expanded", () => {
  const tools = [
    ...["find", "bash", "edit", "grep", "write", "skill_search"].map((name) => ({
      name,
      description: "Search file paths. Full declaration follows.\nSchema",
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
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify([
          {
            name: "界👩‍💻long_tool_name",
            description: "Search file paths with a very long description that must not wrap.",
          },
          {
            name: "read",
            description: "Read file contents with a very long description that must not wrap.",
          },
        ]),
      },
    ],
    details: {},
  };
  const screen = plain(render(result, 48));
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Search file/);
  assert.ok(render(result, 48).every((line) => visibleWidth(line) <= 48));
});

test("unknown tools use compact calls with status and preserve expanded source", () => {
  for (const prefix of ["", "/* large */".repeat(5000) + "\n", "try {\n"]) {
    const code = prefix + 'text(await tools.skill_search({query: "agents", limit: 1}));';
    const result = {
      content: [],
      details: {
        calls: [
          {
            name: "skill_search",
            args: { query: "agents", limit: 1 },
            status: "ok",
            durationMs: 12,
          },
        ],
      },
    };
    const render = (expanded: boolean) =>
      plain(
        renderer().renderResult!(
          result as never,
          { expanded, isPartial: false },
          theme(),
          context({ args: { code }, expanded }),
        ).render(120),
      );
    const compact = render(false);
    assert.match(compact, /✓ skill_search agents;?\s+12ms/);
    assert.doesNotMatch(compact, /tools\.skill_search|skill_search\(/);
    assert.equal(compact.split("skill_search").length - 1, 1);
    assert.ok(
      render(true).includes('text(await tools.skill_search({query: "agents", limit: 1}));'),
    );
  }
});

test("default tool metadata survives discovery grouping, indentation, and overlapping names", () => {
  const code =
    'searchTools("read");\ndescribeTool("read");\ntools.getToolGuidance({name: "read"});\n' +
    "if (true) { tools.lookup({}); tools.lookupLong({}); }\n" +
    "tools.$lookup({});\ntools.read({unexpected: true});";
  const names = ["lookup", "lookupLong", "$lookup", "read"];
  const calls = names.map((name, index) => ({
    name,
    args: name === "read" ? { unexpected: true } : {},
    status: "ok",
    durationMs: 11 + index,
  }));
  const screen = plain(
    renderer().renderResult!(
      { content: [], details: { calls } } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(120),
  );
  assert.match(screen, /✓\s+lookup\s+11ms/);
  assert.match(screen, /✓\s+lookupLong\s+12ms/);
  assert.match(screen, /✓ \$lookup\s+13ms/);
  assert.match(screen, /✓ read unexpected: true\s+14ms/);
  assert.equal(screen.split("unexpected").length - 1, 1);
});

test("unrecorded default tool calls remain unknown or pending, not successful", () => {
  for (const [partial, symbol] of [
    [false, ""],
    [true, "…"],
  ] as const) {
    const screen = plain(
      renderer().renderResult!(
        { content: [], details: {} } as never,
        { expanded: false, isPartial: partial },
        theme(),
        context({ args: { code: "tools.custom({enabled: true})" } }),
      ).render(100),
    );
    assert.ok(screen.includes((symbol ? symbol + " " : "") + "custom enabled: true"));
    assert.ok(!screen.includes("? custom"));
    assert.ok(!screen.includes("✓"));
  }
});
