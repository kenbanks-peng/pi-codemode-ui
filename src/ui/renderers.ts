import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { OutputController } from "../output/controller.ts";
import { parseRunResult } from "../run/parse-result.ts";
import { asString, isRecord } from "../run/value.ts";
import { RunPanel } from "./run-panel.ts";

export function createCodemodeRenderers(output?: OutputController): ToolRenderers {
  return {
    // Own the border spacing; Pi still owns message separation and images.
    renderShell: "self",
    renderCall: (_args, theme, context) => ({
      render: (width) =>
        context.isPartial && !context.state.hasResult
          ? new RunPanel(
              parseRunResult({ content: [] }, false),
              "",
              false,
              true,
              theme,
              undefined,
              true,
            )
              .render(width)
              .map((line) => theme.bg("toolPendingBg", line))
          : [],
      invalidate() {},
    }),
    renderResult: (result, options, theme, context) => {
      context.state.hasResult = true;
      const data = parseRunResult(result, context.isError);
      output?.retain(context.toolCallId, data);
      const screen = new RunPanel(
        data,
        isRecord(context.args) ? asString(context.args.code) : "",
        options.expanded,
        options.isPartial,
        theme,
        () => {
          void output?.open(context.toolCallId);
        },
        false,
        () => output?.isLatest(context.toolCallId) ?? false,
      );
      const background = options.isPartial
        ? "toolPendingBg"
        : context.isError
          ? "toolErrorBg"
          : "toolSuccessBg";
      return {
        render: (width) => screen.render(width).map((line) => theme.bg(background, line)),
        invalidate: () => screen.invalidate(),
        handleMouse: (event) => screen.handleMouse(event),
      };
    },
  };
}

export const codemodeRenderers = createCodemodeRenderers();
