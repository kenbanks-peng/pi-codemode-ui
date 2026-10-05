import { createBashTool, createReadTool } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Research harness: real QuickJS and local read/bash tools; no model or network.
// The private import is confined to this version-pinned development script.
const { executeCodemode } = await import(
  pathToFileURL(
    resolve("node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/execute.js"),
  ).href
);
const tools = [createReadTool(process.cwd()), createBashTool(process.cwd())];
let sequence = 0;
const ctx = {
  tools,
  sessionManager: { getBranch: () => [] },
  async executeTool(name: string, args: never, options: { signal: AbortSignal }) {
    const tool = tools.find((tool) => tool.name === name)!;
    const id = `probe/${++sequence}`;
    try {
      const result = await tool.execute(id, args, options.signal);
      return { toolCall: { id, name, arguments: args }, result, isError: false };
    } catch (error) {
      return {
        toolCall: { id, name, arguments: args },
        result: { content: [{ type: "text", text: String(error) }] },
        isError: true,
      };
    }
  },
};
const samples = [
  {
    name: "example",
    code: `await Promise.all([
    (async () => text({demo:"Read package metadata",result:await tools.read({path:"package.json",limit:60})}))(),
    (async () => text({demo:"Check Git branch and changes",result:await tools.bash({command:"git status --short --branch",timeout:10})}))()
  ]);
  text({demo:"Find test files",result:"tests/integration/host.test.ts\\ntests/ui/run-panel.test.ts\\ntests/pseudocode/tool-call.test.ts"});
  text({demo:"JavaScript data query",result:[2,4,6,8].filter(n=>n>4).map(n=>({value:n,squared:n*n}))});`,
  },
  {
    name: "discovery",
    code: 'text(await searchTools("read bash")); text(await describeTool("read"));',
  },
  {
    name: "values",
    code: 'text("plain text"); text({name:"sample",count:2}); console.log("two", {items:[1,2]}); return [{name:"a",count:1},{name:"b",count:2}];',
  },
  { name: "failure", code: 'text("kept before failure"); throw new Error("research failure");' },
  { name: "empty", code: "const value = 1;" },
  {
    name: "truncated",
    code: '// @options: {"max_output_tokens": 40}\ntext("0123456789".repeat(100));',
  },
];
await mkdir("tests/fixtures", { recursive: true });
for (const sample of samples) {
  const updates: unknown[] = [];
  const result = await executeCodemode(
    "probe",
    { code: sample.code },
    undefined,
    (update: unknown) => updates.push(structuredClone(update)),
    ctx,
  );
  await writeFile(
    `tests/fixtures/${sample.name}.json`,
    JSON.stringify({ ...sample, updates, result }, null, 2) + "\n",
  );
  console.log(
    sample.name,
    JSON.stringify({
      blocks: result.content.map((b: { type: string }) => b.type),
      calls: result.details.calls.length,
      updates: updates.length,
      isError: result.isError ?? false,
    }),
  );
}
