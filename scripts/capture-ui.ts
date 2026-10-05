import { writeFileSync } from "node:fs";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createToolShell, loadFixture, renderedText } from "../tests/support/host.ts";

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
  const sample = loadFixture(capture.name);
  const shell = createToolShell(sample.code, { id: "capture" });
  shell.updateResult(
    capture.partial ? sample.updates[2]! : sample.result,
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
      renderedText(shell, capture.width).trim() +
      "\n```\n",
  );
}
writeFileSync(new URL("../UI-CAPTURE.md", import.meta.url), sections.join("\n"));
console.log("Wrote UI-CAPTURE.md");
