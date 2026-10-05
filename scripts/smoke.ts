import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import type { TUI } from "@earendil-works/pi-tui";

// Set PI_UI_HOST to a Pi package directory to verify a separately installed host.
const host = process.env.PI_UI_HOST;
const { discoverAndLoadExtensions, initTheme, ToolExecutionComponent } = host
  ? await import(pathToFileURL(resolve(host, "dist/index.js")).href)
  : await import("@earendil-works/pi-coding-agent");
const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "pi-ui-smoke-"));
try {
  for (const entry of [...manifest.pi.extensions, "./dist/index.js"]) {
    const loaded = await discoverAndLoadExtensions(
      [resolve(root, entry)],
      temporary,
      temporary,
    );
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const extension = loaded.extensions[0];
    assert.equal(extension.tools.size, 0, "must not register or replace tools");
    assert.equal(
      extension.handlers.size,
      2,
      "only UI session lifecycle handlers",
    );
    assert.equal(extension.toolRenderers.length, 1);
    const resolveRenderer = extension.toolRenderers[0];
    const renderers = resolveRenderer("codemode", () => undefined);
    assert.ok(renderers?.renderResult);
    assert.equal(renderers.renderShell, "self");
    initTheme("dark", false);
    for (const [raw, label] of [
      ['{"query":"missing","tools":[]}', "Tools"],
      ['[{"name":"界👩‍💻é","count":1e0}]', "count"],
      ["```ts\ninterface Item { name: string; }\n```", "interface Item"],
    ]) {
      const result = {
        content: [{ type: "text", text: raw }],
        details: { calls: [] },
        isError: false,
      };
      const before = structuredClone(result);
      const shell = new ToolExecutionComponent(
        "codemode",
        "smoke",
        { code: "return value;" },
        { showImages: false },
        renderers,
        { requestRender() {} } as TUI,
        root,
      );
      shell.updateResult(result, false);
      assert.ok(
        stripVTControlCharacters(shell.render(200).join("\n")).includes("output"),
      );
      shell.setExpanded(true);
      const expanded = stripVTControlCharacters(shell.render(200).join("\n"));
      for (const line of raw!.split("\n")) assert.ok(expanded.includes(line));
      assert.deepEqual(result, before);
    }
    const sample = JSON.parse(
      await readFile(resolve(root, "tests/fixtures/example.json"), "utf8"),
    );
    const realistic = new ToolExecutionComponent(
      "codemode",
      "real-output",
      { code: sample.code },
      { showImages: false },
      renderers,
      { requestRender() {} } as TUI,
      root,
    );
    for (const update of sample.updates) realistic.updateResult(update, true);
    realistic.updateResult(sample.result, false);
    const screen = stripVTControlCharacters(realistic.render(100).join("\n"));
    assert.ok(!screen.includes("Pseudocode"));
    assert.match(screen, /╰─ ctrl\+o expand · ctrl\+alt\+o output ↗ ─+╯/);
    assert.ok(screen.includes("output"));
    assert.ok(!screen.includes("Name  @kenbanks/pi-ui"));
    assert.ok(!screen.includes("\\\\n"));
    const sentinel = { renderShell: "self" };
    assert.equal(
      resolveRenderer("read", () => sentinel),
      sentinel,
    );
    console.log(
      `PASS Pi package load: ${entry}${host ? ` (host ${host})` : ""}`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
