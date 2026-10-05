# Pi codemode UI

A [Pi](https://github.com/earendil-works/pi) extension that shows codemode in a compact panel with pseudocode, call status, and errors. Opens a separate viewer for formatted output.

## Install

```sh
pi install npm:@npm-ken/pi-codemode-ui
```

## Use

Use codemode in Pi as usual. The extension formats its results automatically.

- **Ctrl+Alt+O**: open the latest run's formatted output.
- In fullscreen mode, click a run's **output** button to open its output.
- In the output viewer, use **↑/↓** or **j/k** to scroll, **Ctrl+U/Ctrl+D** for half a screen, **gg/G** for the top/bottom, and **Esc** to close.
- **Ctrl+O** (Pi's default tool expansion key): show code, call details, and raw output.


## Pseudocode layout

Compact view uses parsed JavaScript structure to format nested arrays, objects,
calls, and callback blocks. It hides variable declaration prefixes and standalone
`store()` and `load()` calls. Calls whose results are used remain visible.
It shows `try` / `catch` / `finally` on separate lines. Long calls, method chains,
operators, and conditional expressions wrap at syntax boundaries as the panel
width changes.

This is a display-only layout. It does not execute or rewrite the script.
Incomplete, unsupported, and very large scripts use the existing token-based
fallback. Expanded view keeps the original code.

## Compact tool calls

Every direct `tools.name(...)` call has a default compact format:

```text
skill_search agents · limit: 1
custom enabled: true · count: 3
```

The default keeps argument labels and dynamic expressions. It shows up to three
arguments, fields, or array items, and marks omitted content with `…`. Long
values are retained until display; deeply nested values are shortened. Calls with no arguments show only
the tool name.

Small overrides keep file paths, shell commands, and search patterns concise.
Compact primary calls hide read offsets, result limits, and shell timeouts.
These fields remain in expanded code and recorded arguments.
Shell commands use one available row with `…` for omitted content. Status and
execution time are included in the width budget. File paths use one row and keep
up to three trailing path segments. Leading segments are replaced with `…`, and
more content is removed from the start if needed. Expanded view keeps full paths.
`preview(width, content, maxLines)` handles text wrapping and truncation in one
place. It counts terminal cells, supports ANSI styles, and accepts `Infinity`
for complete content. Output text previews use eight terminal rows.
Truncated host arguments are matched to full source targets only when the match
is unique, so recorded status and duration stay on the source call row.
The same formatter handles complete calls in large or incomplete scripts.
Expanded view keeps the full original code and recorded arguments.


Shared field-selection overrides put the main target first for skill and tool
search, documentation lookup, memory operations, web search and content retrieval,
tasks, and goals. Other supplied options keep their labels. The same three-item
limit applies; omitted fields are marked with `…` and remain in expanded view.
Question calls show question text and count instead of the choice payloads.

Examples:

```text
query_docs "/vercel/next.js" · "server actions"
todo update #3 · status: "completed"
fetch_content "https://example.com" · mode: "raw"
```

Tools without a verified override continue to use the default formatter.

Single-word string targets omit quotation marks; multi-word targets keep them.

## Development

Run `npm run check` for type checking, tests, a build, and package-load checks.

See [Code layout](docs/code-layout.md) for the folder map, file responsibilities,
functions, and change rules.

- `src/run/` parses results and owns normalized data.
- `src/tools/` owns shared tool display rules.
- `src/pseudocode/` formats source and tracks tool-call positions.
- `src/terminal/` handles safe text, width, and border style.
- `src/output/` formats output and owns its viewer and session retention.
- `src/ui/` adapts Pi renderers and draws the run panel.
- `tests/` groups checks by responsibility; `tests/support/` shares setup.
- `scripts/` contains preview, capture, replay, and package-load tools.

Execution and session records remain owned by Pi.
