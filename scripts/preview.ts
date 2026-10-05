import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { codemodeRenderers } from "../src/renderer.ts";

const name = process.argv[2] ?? "example";
const width = Number(process.argv[3] ?? 90);
const fixture = JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}.json`, import.meta.url), "utf8"));
initTheme("dark", false);
const shell = new ToolExecutionComponent("codemode", "preview", { code: fixture.code }, { showImages: false }, codemodeRenderers, { requestRender() {} } as TUI, process.cwd());
shell.updateResult(fixture.result, false);
if (process.argv.includes("--expanded")) shell.setExpanded(true);
console.log(stripVTControlCharacters(shell.render(width).join("\n")));
