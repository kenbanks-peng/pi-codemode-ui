import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { preview } from "../../src/terminal/preview.ts";

test("preview uses available width and marks only omitted content", () => {
  assert.deepEqual(preview(5, "abc", 1), ["abc"]);
  assert.deepEqual(preview(5, "abcdef", 1), ["abcd…"]);
  assert.deepEqual(preview(10, "abcdef", 1), ["abcdef"]);
  assert.deepEqual(preview(5, "abc\ndef", 1), ["abc…"]);
  assert.deepEqual(preview(5, "abc\ndef\nghi", 2), ["abc", "def…"]);
  assert.deepEqual(preview(5, "abc\ndef", Infinity), ["abc", "def"]);
});

test("preview handles ANSI, wide characters, and small widths", () => {
  for (const width of [1, 2, 3, 8, 20]) {
    const rows = preview(width, "\x1b[31m" + "界".repeat(30) + "\x1b[39m", 2);
    assert.ok(rows.length <= 2);
    assert.ok(rows.every((row) => visibleWidth(row) <= width));
    assert.ok(rows.at(-1)?.endsWith("…"));
  }
  assert.deepEqual(preview(0, "abc", 1), []);
  assert.deepEqual(preview(5, "abc", 0), []);
});
