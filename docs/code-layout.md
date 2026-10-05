# Code layout

## Review and changes

Before this change, all 14 source files were in `src/`. Most tests were in
`tests/core/`. The folders `src/formatters/` and `tests/formatters/` were empty.

The main mixed responsibilities were:
- `pseudocode.ts`: tool-call formatting, token fallback, parsed layout, shell
  batches, and source-call positions.
- `screen.ts`: panel controls, source-call matching, discovery grouping, and
  compact command rendering.
- `model.ts`: value guards, terminal text safety, output decoding, result
  parsing, and data types.
- `output.ts`: viewer input and session result retention.

These responsibilities now have separate files. The empty folders are removed.
Tests use the same responsibility groups as the source. The old 850-line
renderer test file is split, with shared setup in `tests/support/render.ts`.

The extension entry point remains `src/index.ts`. Rendering, shortcuts, and
session behavior remain unchanged. Internal paths and names changed without
forwarding files. Recorded JSON fixtures retain their original content.

## Folder map

```text
src/
  index.ts       Extension registration
  run/           Normalized run data and defensive decoding
  tools/         Shared tool display rules
  pseudocode/    Display-only source summaries
  terminal/      Text safety, width handling, and border style
  output/        Formatted output, scrolling, and session retention
  ui/            Pi renderers and the compact run panel
tests/
  integration/   Pi host, replay, and output actions
  run/           Result parsing and output decoding
  pseudocode/    Syntax layout, tool calls, and shell batches
  terminal/      Width-aware text previews
  output/        Output viewer and path trees
  ui/            Panel, status, source matching, and command layout
  support/       Shared host and renderer setup
  fixtures/      Recorded codemode results
scripts/         Preview, capture, replay, and package-load checks
docs/            Maintenance guides
dist/            Generated build output; not source
```

## Source file and function map

Paths below are relative to `src/`. The tables list top-level functions,
classes, and types. Helper closures stay with the function that uses them.

### Registration and run data

| File | Functions or types | Responsibility |
| --- | --- | --- |
| `index.ts` | `extension` | Register rendering, lifecycle handlers, and the output shortcut. |
| `run/types.ts` | `RunModel`, `ToolCall`, `OutputCard` | Define normalized data. No rendering or decoding. |
| `run/value.ts` | `isRecord`, `asString` | Check untrusted values. |
| `run/decode-output.ts` | `decodeOutput`, `isDiscovery`, `decodePartialDiscovery` | Decode safe output and recover intact discovery entries. Keep ambiguous or lossy JSON as text. |
| `run/error-output.ts` | `isErrorOutput` | Recognize error results in output values. |
| `run/parse-result.ts` | `parseRunResult`; internal `mutationConfirmation` | Build a run model from Pi results. Cards and call records stay independent. |
| `tools/display.ts` | `ToolDisplay`, `toolDisplay`, `targetField`, `preferredFields`, `isPrimaryTool`, `isShellTool` | Own target fields, hidden options, field order, and redaction rules. |

### Pseudocode

| File | Functions or types | Responsibility |
| --- | --- | --- |
| `pseudocode/summary.ts` | `ToolSummary`, `summarize`, `pseudocode` | Expose source summaries and retain each call's display position and target. |
| `pseudocode/ast-layout.ts` | `renderAstLayout` | Format parsed syntax within depth and work limits. Use token layout when parsing or layout fails. |
| `pseudocode/token-layout.ts` | `renderTokenLayout` | Format incomplete, unsupported, and large scripts without changing strings or comments. |
| `pseudocode/tool-call.ts` | `formatToolCall` | Apply the same compact tool-call rules in parsed and fallback paths. |
| `pseudocode/shell-batch.ts` | `findShellBatches` | Recognize only safe literal parallel shell batches. |
| `pseudocode/syntax.ts` | `sourceText`, `propertyKey`, `staticString`, `directToolName` | Read source text and tool identity from syntax nodes. |
| `pseudocode/helpers.ts` | `MarkTool`, `codemodeHelpers` | Share the call-marker type and known codemode globals. |

### Terminal and output

| File | Functions or classes | Responsibility |
| --- | --- | --- |
| `terminal/safe-text.ts` | `safeText` | Escape unsafe terminal control characters. |
| `terminal/preview.ts` | `preview` | Wrap and shorten text by terminal-cell width. |
| `terminal/border.ts` | `mutedBorder` | Share panel border styling. |
| `output/path-tree.ts` | `formatPathTree` | Recognize and format conservative relative path lists. |
| `output/format-value.ts` | `renderOutputValue`; internal `scalar`, `label`, `simple` | Format values, fields, tables, discovery lists, and text. No panel controls. |
| `output/formatted-output.ts` | `FormattedOutput`: constructor, `invalidate`, `render` | Format all output blocks for one run. |
| `output/viewer.ts` | `OutputViewer`: constructor, `invalidate`, `render`, `handleInput`, `handleMouse` | Own scrolling and close controls. |
| `output/controller.ts` | `OutputController`: `start`, `clear`, `retain`, `isLatest`, `open` | Retain session results and open the selected output overlay. |

### Run UI

| File | Functions or classes | Responsibility |
| --- | --- | --- |
| `ui/renderers.ts` | `createCodemodeRenderers`, `codemodeRenderers` | Adapt Pi rendering hooks to the run panel and output controller. |
| `ui/run-panel.ts` | `RunPanel`: constructor, `invalidate`, `handleMouse`, `render` | Own panel borders, headings, expanded sections, and the output action. |
| `ui/compact-code.ts` | `renderCompactCode`; internal `targetPrefixMatches` | Match source calls to recorded calls, group discovery rows, and attach status. |
| `ui/compact-command.ts` | `renderCompactCommand`; internal `fileCommand` and `CommandOptions` | Budget command, path, status, and duration width. |
| `ui/call-appearance.ts` | `callAppearance`, `formatDuration` | Share call symbols, colors, and duration text. |

## Development files

| File | Functions or execution | Purpose |
| --- | --- | --- |
| `tests/support/host.ts` | `createToolShell`, `registeredRenderers`, `loadFixture`, `plainLines`, `renderedText` | Share real Pi shell setup and fixture captures. |
| `tests/support/render.ts` | `context`, `theme`, `render` | Share renderer context and theme setup. |
| `scripts/preview.ts` | Top-level runner | Print a fixture at the requested width. |
| `scripts/capture-ui.ts` | Top-level runner | Write a readable UI capture from recorded fixtures. |
| `scripts/capture-codemode.ts` | Top-level runner; `ctx.executeTool` | Generate fixtures with real local tools and QuickJS. This script executes tools. |
| `scripts/tui-fixture.ts` | Top-level runner; `message`, `text` | Write a replay session with recorded and synthetic results. |
| `scripts/smoke.ts` | Top-level runner | Check that Pi can load both source and built entry points. |

`package.json` owns package metadata and quality commands. `tsconfig.json`
checks source, tests, and scripts. `tsconfig.build.json` extends it and emits
only source into `dist/`. The build removes stale output before it runs.

## Change rules

- Add tool-specific display rules in `tools/display.ts`, not in panel code.
- Change source formatting in `pseudocode/`. Never execute source there.
- Change untrusted result handling in `run/`. Keep it independent of UI code.
- Change output value formatting in `output/`, not in `ui/run-panel.ts`.
- Keep terminal width and control-character handling in `terminal/`.
- Keep tests with the responsibility they check. Use `integration/` for checks
  that require Pi registration or its real tool shell.
- Do not edit generated `dist/` files or add empty placeholder folders.

Run `npm run check` after changes. It runs type checking, all tests, the build,
and package-load checks for both entry points.
