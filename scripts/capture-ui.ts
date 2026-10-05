import { readFileSync, writeFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import {
  initTheme,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { codemodeRenderers } from "../src/renderer.ts";

const captures = [
  { name: "example", width: 80 },
  { name: "example", width: 38 },
  { name: "example", width: 72, partial: true },
  { name: "failure", width: 72 },
  { name: "discovery", width: 80 },
  { name: "values", width: 80, expanded: true },
];
const sections = [
  "# Actual Pi host rendering\n\nGenerated with `node --import tsx scripts/capture-ui.ts`. These are text captures from Pi 1.0.2 ToolExecutionComponent, not mockups. ANSI colors are removed. Fixture paths, Git status, and times are historical data.\n",
];
initTheme("dark", false);
for (const capture of captures) {
  const sample = JSON.parse(
    readFileSync(
      new URL("../tests/fixtures/" + capture.name + ".json", import.meta.url),
      "utf8",
    ),
  );
  const shell = new ToolExecutionComponent(
    "codemode",
    "capture",
    { code: sample.code },
    { showImages: false },
    codemodeRenderers,
    { requestRender() {} } as TUI,
    process.cwd(),
  );
  shell.updateResult(
    capture.partial ? sample.updates[2] : sample.result,
    capture.partial ?? false,
  );
  shell.setExpanded(capture.expanded ?? false);
  sections.push(
    "## " +
      capture.name +
      " · " +
      capture.width +
      " columns" +
      (capture.partial ? " · running" : capture.expanded ? " · expanded" : "") +
      "\n\n```text\n" +
      stripVTControlCharacters(shell.render(capture.width).join("\n")).trim() +
      "\n```\n",
  );
}
writeFileSync(
  new URL("../UI-CAPTURE.md", import.meta.url),
  sections.join("\n"),
);
console.log("Wrote UI-CAPTURE.md");
