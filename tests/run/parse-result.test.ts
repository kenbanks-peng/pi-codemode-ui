import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeOutput, decodePartialDiscovery, isDiscovery } from "../../src/run/decode-output.ts";
import { parseRunResult } from "../../src/run/parse-result.ts";

test("output decoding preserves unsafe or ambiguous JSON without data loss", () => {
  for (const raw of [
    '{"name":1,"name":2}',
    '{"name":1,"\\u006eame":2}',
    "9007199254740992",
    "-0",
    "1e999",
    "[".repeat(9) + "0" + "]".repeat(9),
    "not JSON",
    JSON.stringify("x".repeat(16384)),
  ])
    assert.equal(decodeOutput(raw), raw);
  assert.deepEqual(decodeOutput('{"name":"sample","count":2}'), { name: "sample", count: 2 });
});

test("discovery decoding requires exact tool records", () => {
  const tools = [{ name: "read", description: "Read files." }];
  assert.equal(isDiscovery(tools), true);
  assert.equal(isDiscovery([]), false);
  assert.equal(isDiscovery([{ ...tools[0], extra: true }]), false);
  assert.deepEqual(
    decodeOutput(JSON.stringify([{ name: "read", description: "x".repeat(17000) }])),
    [{ name: "read", description: "x".repeat(17000) }],
  );
});

test("partial discovery keeps only complete entries before the host marker", () => {
  const prefix =
    "Warning: truncated output (original token count: 100)\nTotal output lines: 20\n\n[";
  const entry = { name: "read", description: "Read files." };
  const raw = prefix + JSON.stringify(entry) + ',{"name":"cut…50 tokens truncated…"}]';
  assert.deepEqual(decodePartialDiscovery(raw), [entry]);
  assert.equal(
    decodePartialDiscovery("[" + JSON.stringify(entry) + "…50 tokens truncated…]"),
    undefined,
  );
});

test("run parsing keeps cards and call records independent and does not mutate input", () => {
  const result = {
    content: [
      { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      {
        type: "text",
        text: '{"title":"Receipt","result":"Successfully wrote 2 bytes to file.ts"}',
      },
      { type: "image", mimeType: "image/png", data: "unused" },
    ],
    details: {
      calls: [
        { name: "write", args: { path: "file.ts", content: "ok" }, status: "ok", durationMs: 5 },
      ],
    },
  };
  const before = structuredClone(result);
  const data = parseRunResult(result, false);
  assert.equal(data.cards[0]?.mutationConfirmation, "write");
  assert.equal(data.calls[0]?.target, "file.ts");
  assert.equal(data.calls[0]?.duration, 5);
  assert.deepEqual(data.images, ["image/png"]);
  assert.deepEqual(result, before);
});

test("malformed run data yields empty collections and rejects invalid timing and cost", () => {
  assert.deepEqual(parseRunResult(null, true), {
    cards: [],
    raw: [],
    calls: [],
    images: [],
    failed: true,
    error: "",
    elapsed: "",
    path: "",
  });
  const data = parseRunResult(
    {
      details: {
        calls: [{ name: "read", args: { path: "file.ts" }, durationMs: -1, cost: Infinity }],
      },
    },
    false,
  );
  assert.equal(data.calls[0]?.duration, undefined);
  assert.equal(data.calls[0]?.cost, undefined);
  assert.equal(data.calls[0]?.status, "unknown");
});
