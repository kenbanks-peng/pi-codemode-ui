import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Recorded research results plus synthetic edge cases. Replay executes no tools.
// No extension installation, credentials, or user settings are needed.
const directory = await mkdtemp(join(tmpdir(), "pi-ui-visual-"));
const timestamp = new Date().toISOString();
const entries: unknown[] = [
  { type: "session", version: 3, id: randomUUID(), timestamp, cwd: process.cwd() },
];
let parentId: string | null = null;
function message(value: object) {
  const id = randomUUID().slice(0, 8);
  entries.push({
    type: "message",
    id,
    parentId,
    timestamp,
    message: { ...value, timestamp: Date.now() },
  });
  parentId = id;
}
const text = (value: string) => ({ type: "text", text: value });
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
message({
  role: "user",
  content:
    "Recorded codemode results and synthetic edge cases. Replay executes no tools or models.",
});
const cases = [
  {
    code: 'text({query:"missing",tools:[]});',
    content: [text('{"query":"missing","tools":[]}')],
    details: { calls: [] },
  },
  {
    code: 'text("declarations");',
    content: [text("```ts\nexport interface Item { name: string; }\n```")],
    details: { calls: [] },
  },
  {
    code: 'throw new Error("fixture failure");',
    content: [text("partial raw output\n".repeat(8) + "Script error:\nfixture failure")],
    details: {
      calls: [{ id: "fixture/1", name: "read", args: "{}", status: "cancelled", durationMs: 25 }],
    },
    isError: true,
  },
  {
    code: 'text("truncated fixture");',
    content: [text("Warning: truncated output\nstart … end")],
    details: { calls: [], fullOutputPath: join(directory, "full-output.txt") },
  },
  {
    code: 'image(picture); text("mixed raw");',
    content: [
      {
        type: "image",
        mimeType: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=",
      },
      text("mixed raw output"),
    ],
    details: { future: true },
  },
  {
    code: 'return [{name:"界👩‍💻é",count:1},{name:"other",count:2}];',
    content: [text('  [{"name":"界👩‍💻é","count":1e0},{"name":"other","count":2}]  ')],
    details: { calls: [] },
  },
];
for (const name of ["discovery", "example"]) {
  const sample = JSON.parse(
    await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), "utf8"),
  );
  cases.push({ code: sample.code, ...sample.result });
}
for (const [index, fixture] of cases.entries()) {
  const id = `fixture-${index}`;
  message({
    role: "assistant",
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage,
    stopReason: "toolUse",
    content: [{ type: "toolCall", id, name: "codemode", arguments: { code: fixture.code } }],
  });
  message({
    role: "toolResult",
    toolName: "codemode",
    toolCallId: id,
    content: fixture.content,
    details: fixture.details,
    isError: fixture.isError ?? false,
  });
}
await writeFile(join(directory, "full-output.txt"), "Synthetic upstream full output\n");
const session = join(directory, "session.jsonl");
await writeFile(session, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
console.log(session);
