import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  loadFixture,
  plainLines as plain,
  registeredRenderers as renderer,
} from "../support/host.ts";
import { context, render, theme } from "../support/render.ts";

test("receiving script keeps the panel border and padding", () => {
  const component = renderer().renderCall!(
    {},
    theme(),
    context({ isPartial: true, argsComplete: false }),
  );
  for (const width of [20, 72, 100]) {
    const lines = component.render(width).map(stripVTControlCharacters);
    assert.match(lines[0]!, /^╭─ CODEMODE .*╮$/);
    assert.equal(lines[1], "│ " + " ".repeat(width - 4) + " │");
    assert.match(lines[2]!, /^│ Receiving/);
    assert.match(lines.join("\n"), /script…/);
    assert.equal(lines.at(-2), lines[1]);
    assert.match(lines.at(-1)!, /^╰─+╯$/);
    assert.ok(lines.every((line) => visibleWidth(line) === width));
  }
});

test("truncation notice stays out of compact view without changing raw output", () => {
  const sample = loadFixture("truncated");
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
  const sample = loadFixture("example");
  const before = structuredClone(sample.result);
  const lines = render(sample.result);
  const screen = plain(lines);
  assert.ok(stripVTControlCharacters(lines[0]!).startsWith("╭─ CODEMODE "));
  assert.match(stripVTControlCharacters(lines[0]!), /CODEMODE ─+ 100ms ╮$/);
  assert.match(
    stripVTControlCharacters(lines.at(-1)!),
    /^╰─ (?:ctrl\+o )?expand · ctrl\+alt\+o output ↗ ─+╯$/,
  );
  assert.equal((screen.match(/CODEMODE/g) ?? []).length, 1);
  assert.doesNotMatch(screen, /Pseudocode/);
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Read package metadata|Version\s+0.1.0|value\s+.*squared/);
  assert.doesNotMatch(screen, /CALLS/);
  assert.match(screen, /ctrl\+o expand|expand/);
  assert.doesNotMatch(screen, /Script completed|Wall time|\\\\n|\\\\"|0 running|0 error/);
  assert.deepEqual(sample.result, before);
});

test("successful durations are muted and failed command rows are error-colored", () => {
  const currentTheme = theme();
  const result = {
    content: [],
    details: {
      calls: [
        { name: "edit", args: '{"path":"first.ts"}', status: "ok", durationMs: 12 },
        { name: "edit", args: '{"path":"second.ts"}', status: "error", durationMs: 8624 },
      ],
    },
  };
  const code =
    'await tools.edit({path: "first.ts", edits: []});\nawait tools.edit({path: "second.ts", edits: []});';
  for (const width of [20, 100]) {
    const styled = renderer().renderResult!(
      result as never,
      { expanded: false, isPartial: false },
      currentTheme,
      context({ args: { code } }),
    )
      .render(width)
      .join("\n");
    assert.ok(styled.includes(currentTheme.fg("muted", "12ms")));
    const failedRow = stripVTControlCharacters(styled)
      .split("\n")
      .find((line) => line.includes("8.6s"))!;
    assert.ok(styled.includes(currentTheme.fg("error", failedRow.slice(2, -2))));
  }
});

test("code does not make a second panel during execution", () => {
  const component = renderer().renderCall!({ code: "const x=1;\ntext(x);" }, theme(), context());
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
