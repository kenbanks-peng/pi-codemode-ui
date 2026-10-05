# Pi codemode UI

A [Pi](https://github.com/earendil-works/pi) extension that shows codemode runs
in a compact panel with pseudocode, call status, and errors. Open a separate
viewer for formatted output. It changes the display, not code execution.

## Install

Requires Pi and Node.js 22.19 or later.

```sh
pi install git:https://github.com/kenbanks-peng/pi-codemode-ui.git
```

Restart Pi or run `/reload` to load the extension.

## Use

Use codemode in Pi as usual. The extension formats its results automatically.

- **Ctrl+Alt+O**: open the latest run's formatted output.
- In fullscreen mode, click a run's **output** button to open its output.
- In the output viewer, use **↑/↓** or **j/k** to scroll, **Ctrl+U/Ctrl+D**
  for half a screen, **gg/G** for the top/bottom, and **Esc** to close.
- **Ctrl+O** (Pi's default tool expansion key): show code, call details,
  and raw output.
