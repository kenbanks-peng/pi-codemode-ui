import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RunModel } from "../run/types.ts";
import { OutputViewer } from "./viewer.ts";

export class OutputController {
  private context: ExtensionContext | undefined;
  private results = new Map<string, RunModel>();
  private viewing = false;
  start(context: ExtensionContext): void {
    this.context = context;
    this.results.clear();
  }
  clear(): void {
    this.context = undefined;
    this.results.clear();
  }
  retain(id: string, data: RunModel): void {
    this.results.set(id, data);
  }
  isLatest(id: string): boolean {
    return [...this.results.keys()].at(-1) === id;
  }
  async open(id?: string, context = this.context): Promise<void> {
    if (!context?.hasUI || context.mode !== "tui" || this.viewing) return;
    const data = id ? this.results.get(id) : [...this.results.values()].at(-1);
    if (!data) {
      context.ui.notify("No codemode or tool_search output available", "info");
      return;
    }
    this.viewing = true;
    try {
      await context.ui.custom<void>(
        (tui, theme, _keys, done) => new OutputViewer(data, tui, theme, () => done()),
        { overlay: true, overlayOptions: { width: "90%", maxHeight: "90%" } },
      );
    } finally {
      this.viewing = false;
    }
  }
}
