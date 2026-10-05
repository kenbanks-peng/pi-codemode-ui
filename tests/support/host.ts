import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import {
  ToolExecutionComponent,
  type ExtensionAPI,
  type ToolRenderers,
  type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import extension from "../../src/index.ts";
import { codemodeRenderers } from "../../src/renderer.ts";
export { theme as hostTheme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

interface ShellOptions {
  id?: string;
  showImages?: boolean;
  /** Explicit undefined selects the native host renderer. */
  renderers?: ToolRenderers;
}

export function createToolShell(code = "text(value);", options: ShellOptions = {}) {
  return new ToolExecutionComponent(
    "codemode",
    options.id ?? "test",
    { code },
    { showImages: options.showImages ?? false },
    Object.hasOwn(options, "renderers") ? options.renderers : codemodeRenderers,
    { requestRender() {} } as TUI,
    process.cwd(),
  );
}

/** Exercise extension registration, rather than bypassing it in renderer tests. */
export function registeredRenderers(): ToolRenderers {
  let resolver: ToolRendererResolver | undefined;
  extension({
    on() {
      return () => {};
    },
    registerShortcut() {},
    registerToolRenderer(value: ToolRendererResolver) {
      resolver = value;
    },
  } as unknown as ExtensionAPI);
  assert.ok(resolver);
  const renderers = resolver("codemode", () => undefined);
  assert.ok(renderers);
  return renderers;
}

type HostResult = Parameters<ToolExecutionComponent["updateResult"]>[0];
interface Fixture {
  code: string;
  updates: HostResult[];
  result: HostResult;
}

export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}

export const plainLines = (lines: string[]) => stripVTControlCharacters(lines.join("\n"));
export const renderedText = (component: Component, width = 80) =>
  plainLines(component.render(width));
