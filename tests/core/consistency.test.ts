import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createToolShell, hostTheme } from "../support/host.ts";

test("search statuses attach to patterns rather than the shared search path", () => {
  initTheme("dark", false);
  const shell = createToolShell(
    'tools.grep({path: "src", pattern: "first"});\n' +
      'tools.grep({path: "src", pattern: "second"});',
  );
  shell.updateResult(
    {
      content: [],
      details: {
        calls: [
          {
            name: "grep",
            args: { path: "src", pattern: "second" },
            status: "error",
            durationMs: 20,
          },
          { name: "grep", args: { path: "src", pattern: "first" }, status: "ok", durationMs: 10 },
        ],
      },
      isError: false,
    },
    false,
  );
  const rows = shell.render(100).map(stripVTControlCharacters);
  assert.equal(rows.filter((line) => /[✓✗] grep /.test(line)).length, 2);
  assert.ok(rows.some((line) => /✓ grep first .*10ms/.test(line)));
  assert.ok(rows.some((line) => /✗ grep second .*20ms/.test(line)));
});

test("recorded errors override an ok status in compact and expanded call rows", () => {
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    for (const code of ["tools.custom({});", "text(value);"]) {
      const shell = createToolShell(code);
      shell.updateResult(
        {
          content: [],
          details: {
            calls: [
              {
                name: "custom",
                args: {},
                status: "ok",
                error: "permission denied",
                durationMs: 12,
              },
            ],
          },
          isError: false,
        },
        false,
      );
      for (const expanded of [false, true]) {
        shell.setExpanded(expanded);
        const row = shell
          .render(80)
          .find(
            (line) => stripVTControlCharacters(line).includes("custom") && line.includes("12ms"),
          )!;
        assert.match(stripVTControlCharacters(row), /✗ custom/);
        assert.ok(row.includes(hostTheme.getFgAnsi("error")));
        assert.doesNotMatch(stripVTControlCharacters(row), /✓ custom/);
      }
    }
  }
});

test("recorded statuses use the same symbols with and without source matches", () => {
  initTheme("dark", false);
  for (const [status, symbol] of [
    ["ok", "✓"],
    ["error", "✗"],
    ["running", "…"],
    ["cancelled", "–"],
    ["unknown", ""],
  ]) {
    for (const code of ["tools.custom({});", "text(value);"]) {
      const shell = createToolShell(code);
      shell.updateResult(
        {
          content: [],
          details: { calls: [{ name: "custom", args: {}, status, durationMs: 12 }] },
          isError: false,
        },
        false,
      );
      for (const expanded of [false, true]) {
        shell.setExpanded(expanded);
        const row = shell
          .render(80)
          .map(stripVTControlCharacters)
          .find((line) => line.includes("custom") && line.includes("12ms"))!;
        assert.ok(row, code + " / " + status);
        assert.equal(row.slice(2, row.indexOf("custom")).trim(), symbol);
      }
    }
  }
});
