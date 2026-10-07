import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { OutputController } from "./output/controller.ts";
import { createCodemodeRenderers, createToolSearchRenderers } from "./ui/renderers.ts";

/** Display only: execution, messages, and session records remain owned by Pi. */
export default function extension(pi: ExtensionAPI): void {
  const output = new OutputController();
  const renderers = createCodemodeRenderers(output);
  const searchRenderers = createToolSearchRenderers(output);
  pi.on("session_start", (_event, ctx) => output.start(ctx));
  pi.on("session_shutdown", () => output.clear());
  pi.registerShortcut("ctrl+alt+o", {
    description: "View latest codemode or tool_search output",
    handler: (ctx) => output.open(undefined, ctx),
  });
  pi.registerToolRenderer((name, next) =>
    name === "codemode" ? renderers : name === "tool_search" ? searchRenderers : next(),
  );
}
