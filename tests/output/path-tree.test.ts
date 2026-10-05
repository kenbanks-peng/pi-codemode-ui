import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPathTree } from "../../src/output/path-tree.ts";

test("path trees accept only unambiguous relative path lists", () => {
  assert.deepEqual(formatPathTree(["src/index.ts", "src/ui/run-panel.ts"]), [
    "src/",
    "├─ index.ts",
    "└─ ui/",
    "   └─ run-panel.ts",
  ]);
  assert.deepEqual(
    formatPathTree("src/index.ts\nsrc/ui/run-panel.ts"),
    formatPathTree(["src/index.ts", "src/ui/run-panel.ts"]),
  );
  for (const value of [
    "ordinary prose",
    ["src/index.ts"],
    ["src/a.ts", "src/a.ts"],
    ["src/a.ts", "src/a.ts/child"],
    ["/src/a.ts", "/src/b.ts"],
    ["a/".repeat(33) + "x.ts", "b/y.ts"],
  ])
    assert.equal(formatPathTree(value), undefined);
});
