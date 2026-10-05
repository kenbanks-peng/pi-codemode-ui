import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodemodeRenderers } from "./renderer.ts";
import { OutputController } from "./output.ts";

/** Display only: execution, messages, and session records remain owned by Pi. */
export default function extension(pi: ExtensionAPI): void {
  const output = new OutputController();
  const renderers = createCodemodeRenderers(output);
  pi.on("session_start", (_event, ctx) => output.start(ctx));
  pi.on("session_shutdown", () => output.clear());
  pi.registerShortcut("ctrl+alt+o", {
    description: "View latest codemode output",
    handler: (ctx) => output.open(undefined, ctx),
  });
  pi.registerToolRenderer((name, next) =>
    name === "codemode" ? renderers : next(),
  );
}
