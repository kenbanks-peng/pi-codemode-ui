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


## Compact tool calls

Every direct `tools.name(...)` call has a default compact format:

```text
skill_search agents · limit: 1
custom enabled: true · count: 3
```

The default keeps argument labels and dynamic expressions. It shows up to three
arguments, fields, or array items, and marks omitted content with `…`. Long
values and deeply nested values are shortened. Calls with no arguments show only
the tool name.

Small overrides keep file paths, shell commands, and search patterns concise.
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
