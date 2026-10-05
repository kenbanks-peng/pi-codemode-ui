import assert from "node:assert/strict";
import { test } from "node:test";
import { plainLines as plain, registeredRenderers as renderer } from "../support/host.ts";
import { context, render, theme } from "../support/render.ts";

test("failed tool calls use error color and retain error output", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    {
      content: [{ type: "text", text: "permission denied" }],
      details: {
        calls: [
          { name: "edit", args: '{"path":"file.ts"}', status: "error", error: "permission denied" },
        ],
      },
    } as never,
    { expanded: false, isPartial: false },
    currentTheme,
    context({ args: { code: 'await tools.edit({path: "file.ts", edits: []});' } }),
  ).render(100);
  const failedRow = plain(lines)
    .split("\n")
    .find((line) => line.includes("✗ edit file.ts"))!;
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", failedRow.slice(2, -2))));
  assert.match(plain(lines), /permission denied/);
});

test("script errors before any tool call show only Error until expanded", () => {
  const code = 'text("broken");';
  const raw = "Script error:\nSyntaxError: Unexpected token\n\nNo tool calls were made.";
  const result = { content: [{ type: "text", text: raw }], details: {}, isError: true };
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      result as never,
      { expanded, isPartial: false },
      theme(),
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
  const code =
    'await tools.edit({path: "file.ts", edits: []});\nawait tools.bash({command: "npm run check"});';
  const raw = JSON.stringify({ exit_code: 1, output: "one test failed", wall_time_seconds: 6 });
  const result = {
    isError: true,
    content: [{ type: "text", text: raw }],
    details: {
      calls: [
        { name: "edit", args: '{"path":"file.ts","edits":[]}', status: "ok", durationMs: 3 },
        {
          name: "bash",
          args: '{"command":"npm run check"}',
          status: "error",
          durationMs: 6000,
          error: "one test failed",
        },
      ],
    },
  };
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      result as never,
      { expanded, isPartial: false },
      theme(),
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
  const result = {
    content: [
      { type: "text", text: "Script completed\nWall time 1 seconds\nOutput:\n" },
      { type: "text", text: "before sentinel" },
      { type: "text", text: failure },
      { type: "text", text: "after sentinel" },
    ],
    details: {
      calls: [
        { name: "bash", args: '{"command":"false"}', status: "error", error: "recovered failure" },
      ],
    },
  };
  const screen = plain(
    renderer().renderResult!(
      result as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code: 'await tools.bash({command: "false"});' } }),
    ).render(100),
  );
  assert.doesNotMatch(screen, /Complete|Script failed|Running/);
  assert.doesNotMatch(screen, /Script failed/);
  assert.match(screen, /✗ bash/);
  assert.ok(screen.indexOf("Pseudocode") < screen.indexOf("Error"));
  assert.doesNotMatch(screen, /before sentinel|after sentinel/);
  const expanded = plain(render(result, 1000, true));
  assert.ok(expanded.indexOf("before sentinel") < expanded.indexOf(failure));
  assert.ok(expanded.indexOf(failure) < expanded.indexOf("after sentinel"));
});

test("recovered error output uses theme error text color", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    {
      content: [{ type: "text", text: '{"exit_code":1,"output":"failure sentinel"}' }],
      details: {},
    } as never,
    { expanded: false, isPartial: false },
    currentTheme,
    context(),
  ).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", "Error")));
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", "failure sentinel")));
});

test("failed pseudocode calls color their full command error", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    {
      content: [],
      details: {
        calls: [
          {
            name: "bash",
            args: '{"command":"npm run check","timeout":120}',
            status: "error",
            durationMs: 6000,
          },
        ],
      },
    } as never,
    { expanded: false, isPartial: false },
    currentTheme,
    context({ args: { code: 'await tools.bash({command: "npm run check", timeout: 120});' } }),
  ).render(100);
  const command = "✗ bash npm run check";
  const failedRow = plain(lines)
    .split("\n")
    .find((line) => line.includes(command))!;
  assert.match(failedRow, /✗ bash npm run check +6\.0s/);
  assert.doesNotMatch(failedRow, /timeout/);
  assert.ok(lines.join("\n").includes(currentTheme.fg("error", failedRow.slice(2, -2))));
});
