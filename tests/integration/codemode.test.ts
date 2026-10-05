import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { isDiscovery } from "../../src/run/decode-output.ts";
import { parseRunResult } from "../../src/run/parse-result.ts";
import {
  createToolShell,
  loadFixture as fixture,
  registeredRenderers,
  renderedText,
} from "../support/host.ts";

function host(code = "text(value);") {
  initTheme("dark", false);
  return createToolShell(code, { renderers: registeredRenderers() });
}
const plain = (shell: ReturnType<typeof host>, width = 100) => renderedText(shell, width);
const result = (texts: string[], details: unknown = {}) => ({
  content: texts.map((text) => ({ type: "text" as const, text })),
  details,
  isError: false,
});

for (const name of ["example", "discovery", "values", "failure", "empty", "truncated"]) {
  test("real codemode replay: " + name, () => {
    const sample = fixture(name);
    const before = structuredClone(sample);
    const shell = host(sample.code);
    for (const update of sample.updates) {
      shell.updateResult(update, true);
      const screen = plain(shell);
      assert.match(screen, /CODEMODE/);
      assert.doesNotMatch(screen, /Complete|Script failed|Running/);
      assert.doesNotMatch(screen, /✓ Complete|No text output/);
    }
    shell.updateResult(sample.result, false);
    const collapsed = plain(shell);
    assert.equal((collapsed.match(/CODEMODE/g) ?? []).length, 1);
    // Pi’s default shell needs room for its two padding columns.
    for (const width of [3, 5, 20, 38, 72, 100]) {
      assert.ok(
        shell.render(width).every((line) => visibleWidth(line) <= width),
        name + " width " + width,
      );
    }
    shell.setExpanded(true);
    const expanded = plain(shell, 200000);
    assert.match(expanded, /Code/);
    assert.match(expanded, /Calls/);
    assert.match(expanded, /Raw output/);
    for (const block of sample.result.content) {
      if (block.type === "text" && typeof block.text === "string")
        for (const line of block.text.split("\n"))
          assert.ok(expanded.includes(line), "raw text missing: " + line.slice(0, 80));
    }
    for (const line of sample.code.split("\n")) assert.ok(expanded.includes(line));
    shell.setExpanded(false);
    assert.equal(plain(shell), collapsed);
    assert.deepEqual(sample, before);
  });
}

test("compact syntax layouts follow panel width and retain expanded source", () => {
  const code =
    "const accepted = firstCondition && secondCondition; " +
    'try {const value = await tools.custom({query: "docs"}); text(value);} ' +
    "catch (error) {text(String(error));}";
  const shell = host(code);
  shell.updateResult(result(["ok"]), false);
  const narrow = plain(shell, 40);
  assert.match(narrow, /│   and secondCondition\)/);
  assert.match(narrow, /catch error/);
  assert.doesNotMatch(narrow, /try \{/);
  const wide = plain(shell, 120);
  assert.match(wide, /\(firstCondition and secondCondition\)/);
  assert.equal(plain(shell, 40), narrow);
  for (const width of [20, 40, 120])
    assert.ok(shell.render(width).every((line) => visibleWidth(line) <= width));
  shell.setExpanded(true);
  assert.ok(plain(shell, 200).includes(code));
});

test("failure keeps error and output action compact; expansion retains recovery path", () => {
  const shell = host();
  const path = "/tmp/" + "long-directory/".repeat(8) + "complete-output.txt";
  shell.updateResult(
    {
      ...result(
        [
          "Script failed\nWall time 0.1 seconds\nOutput:\n",
          "retained sentinel",
          "Script error: permission denied",
        ],
        { fullOutputPath: path },
      ),
      isError: true,
    },
    false,
  );
  const text = plain(shell);
  assert.ok(text.includes("permission denied") && !text.includes("retained sentinel"));
  const narrow = plain(shell, 20).replace(/[│\s]/g, "");
  assert.ok(!narrow.includes(path));
  assert.match(text, /output/);
  shell.setExpanded(true);
  assert.ok(plain(shell, 200).includes(path));
});

test("headers are removed only when they are the exact first independent block", () => {
  const shell = host();
  for (const blocks of [
    ["prefix", "Script completed\nWall time 1 seconds\nOutput:\n"],
    ["Script completed\nWall time 1 seconds\nOutput:\nuser text"],
    ["{", '"name":"do not join"', "}"],
  ]) {
    shell.updateResult(result(blocks), false);
    assert.deepEqual(parseRunResult(result(blocks), false).raw, blocks);
    assert.match(plain(shell), /output/);
  }
});

test("unsafe JSON stays raw; labelled wrappers with extra fields lose no metadata", () => {
  const shell = host();
  for (const raw of [
    '{"x":1,"x":2}',
    '{"x":9007199254740993}',
    '{"x":-0}',
    '{"x":1e999}',
    "{broken",
  ]) {
    shell.updateResult(result([raw]), false);
    assert.deepEqual(parseRunResult(result([raw]), false).cards[0]?.value, raw);
    shell.setExpanded(true);
    assert.ok(plain(shell).includes(raw));
    shell.setExpanded(false);
  }
  shell.updateResult(result(['{"label":"Name","result":"body","extra":"KEEP ME"}']), false);
  shell.setExpanded(true);
  assert.match(plain(shell), /KEEP ME/);
});

test("unlinked calls, cancelled calls, cost, and malformed metadata remain readable", () => {
  const shell = host();
  shell.updateResult(
    result(["result from second call"], {
      calls: [
        null,
        {
          name: "first",
          args: '{"path":"first.ts"}',
          status: "cancelled",
          durationMs: 12,
          cost: 0.002,
        },
        {
          name: "second",
          args: "truncated {",
          status: "error",
          error: "tool denied",
        },
      ],
    }),
    false,
  );
  const text = plain(shell);
  assert.doesNotMatch(text, /result from second call/);
  assert.match(text, /output/);
  assert.doesNotMatch(text, /CALLS/);
  assert.match(text, /cancelled/);
  assert.match(text, /Cost: \$0.002/);
  assert.match(text, /tool denied/);
  shell.updateResult(result(["ok"], { calls: "bad" }), false);
  assert.match(plain(shell), /output/);
  shell.setExpanded(true);
  assert.match(plain(shell), /ok/);
});

test("MCP errors show a semantic failure and retain their text", () => {
  const shell = host();
  shell.updateResult(
    result([
      JSON.stringify({
        isError: true,
        content: [{ type: "text", text: "MCP permission denied" }],
      }),
    ]),
    false,
  );
  assert.match(plain(shell), /✗ Tool result failed/);
  assert.match(plain(shell), /MCP permission denied/);
});

test("large single lines stay out of compact view and retain exact expansion", () => {
  const shell = host();
  const raw = "x".repeat(20000) + "END";
  shell.updateResult(result([raw]), false);
  assert.ok(shell.render(40).length < 80);
  assert.match(plain(shell), /output/);
  assert.doesNotMatch(plain(shell), /END/);
  shell.setExpanded(true);
  assert.ok(plain(shell, 30000).includes(raw));
});

test("truncated discovery hides recovery path in compact view and keeps expanded raw output", () => {
  const shell = host('text(await searchTools("tools"));');
  const entry = JSON.stringify({
    name: "find",
    description: "Find files.\n\ncodemode tool declaration:\n" + "x".repeat(1500),
  });
  const raw =
    "Warning: truncated output (original token count: 11579)\nTotal output lines: 1\n\n[" +
    entry +
    ',{"name":"cut","description":"unfinished…1579 tokens truncated…tail}]' +
    "\n\n[Full output: /tmp/full.txt (read with offset/limit)]";
  shell.updateResult(result([raw], { fullOutputPath: "/tmp/full.txt" }), false);
  const screen = plain(shell);
  assert.match(screen, /output/);
  assert.doesNotMatch(screen, /Tool search|Partial tool list|find\s+Find files/);
  assert.doesNotMatch(screen, /codemode tool declaration/);
  assert.doesNotMatch(screen, /\/tmp\/full\.txt|Warning: truncated output|Full output:/);
  shell.setExpanded(true);
  const expanded = plain(shell, 20000);
  for (const line of raw.split("\n")) assert.ok(expanded.includes(line));
});

test("partial discovery never repairs cut entries or unrelated JSON", () => {
  const header = "Warning: truncated output (original token count: 100)\nTotal output lines: 1\n\n";
  const entry = JSON.stringify({ name: "find", description: 'Find {"quoted"} files.' });
  const marker = "…10 tokens truncated…";
  for (const text of [
    header + '[{"name":"find","description":"cut' + marker + 'tail"}]',
    header + '[{"name":"find","description":"ok","extra":true},' + marker + "]",
    header + '[{"name":"find","name":"other","description":"ok"},' + marker + "]",
    "[" + entry + "," + marker + "]",
    header + "[" + entry + ",invalid]",
  ]) {
    const data = parseRunResult(result([text]), false);
    assert.equal(isDiscovery(data.cards[0]?.value), false);
    assert.deepEqual(data.raw, [text]);
  }
  const data = parseRunResult(result([header + "[" + entry + "," + marker + "]"]), false);
  assert.equal(isDiscovery(data.cards[0]?.value), true);
  assert.equal(data.cards[0]?.decodePartialDiscovery, true);
});

test("package metadata is hidden in compact view and retained in raw expansion", () => {
  const shell = host();
  shell.updateResult(fixture("example").result, false);
  assert.match(plain(shell), /output/);
  assert.doesNotMatch(plain(shell), /Module\s+ESM/);
  shell.setExpanded(true);
  assert.match(plain(shell, 20000), /module/);
  assert.match(plain(shell, 20000), /\.\/src\/index.ts/);
});
