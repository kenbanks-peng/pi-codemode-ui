# Pi codemode UI

A [Pi](https://github.com/earendil-works/pi) extension that makes codemode runs and tool searches easier to read.

## Install

```sh
pi install npm:@npm-ken/pi-codemode-ui
```

## What it does

Use codemode and tool_search in Pi as usual. The extension automatically:

- Shows compact pseudocode and tool calls.
- Skins tool_search with the same panel style, showing the query and loaded tools.
- Shows call status, execution time, and errors.
- Opens formatted output in a separate viewer.
- Keeps the original code, call details, and raw output in the expanded view.

Press **Ctrl+Alt+O** to open the latest run or search output, or click a panel's **output** button in fullscreen mode. Press **Esc** to close the viewer. Use **Ctrl+O** to expand tool details.

This extension changes the display only. Pi still controls execution and session records.
