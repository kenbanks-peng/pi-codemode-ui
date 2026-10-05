import { initTheme } from "@earendil-works/pi-coding-agent";
import { createToolShell, loadFixture, renderedText } from "../tests/support/host.ts";

const name = process.argv[2] ?? "example";
const width = Number(process.argv[3] ?? 90);
const fixture = loadFixture(name);
initTheme("dark", false);
const shell = createToolShell(fixture.code, { id: "preview" });
shell.updateResult(fixture.result, false);
if (process.argv.includes("--expanded")) shell.setExpanded(true);
console.log(renderedText(shell, width));
