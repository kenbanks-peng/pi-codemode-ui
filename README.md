# Pi codemode UI

A display-only Pi extension. It shows codemode results in one bordered panel.

- Pseudocode with embedded call status, target, duration, and supplied cost.
- An **output** button replaces the compact Output sections. In fullscreen
  mode, click it to open formatted fields, tables, file trees, and tool search
  results for that run in a bordered, padded, scrollable overlay.
  Only the latest run's bottom button shows the **Ctrl+Alt+O** hint.
  **Ctrl+Alt+O** opens the latest rendered codemode run in regular or fullscreen
  mode. Use **↑/↓** or **k/j** for one line, **Ctrl+U/Ctrl+D** for half a
  screen, **gg** for the top, and **G** for the bottom. Mouse wheel scrolling
  also works. Page Up/Down and Home/End are not used.
  **Esc** closes the viewer. There are no previous/next output controls.
- Errors before retained output; full-output recovery paths stay visible.
- The default page shows all pseudocode lines with lowercase keywords, generated
  from parsed JavaScript without executing it. Names keep their original case.
  Syntax outside the main converter uses a token-based simplification, with no
  line limit. Invalid scripts retain any unparsed remainder. Pi's tool expansion
  action shows the full **Code**,
  **Calls**, and **Raw output**. The default binding is Ctrl+O.
- Narrow layouts, active theme colors, and native Pi images.

It does not execute code, replace tools, change messages, or write session data.
Call records are separate from output blocks. The renderer does not guess which
call produced an output block.

## Load

From this checkout:

```sh
npm install
pi -e ./src/index.ts
```

To install the local package:

```sh
pi install .
```

The manifest loads TypeScript source. After `npm run build`, you can also load
`dist/index.js`. Tested with Pi 1.0.2 and Node 22 or later.

## Inspect the UI

[UI-CAPTURE.md](UI-CAPTURE.md) contains actual Pi host text captures.
[UI-PROTOTYPE.md](UI-PROTOTYPE.md) contains the approved design.
[RESEARCH.md](RESEARCH.md) records the input shapes, limits, and test results.

```sh
node --import tsx scripts/preview.ts example 80
node --import tsx scripts/preview.ts example 38
node --import tsx scripts/preview.ts values 80 --expanded
node --import tsx scripts/capture-ui.ts
```

Captured fixture times, paths, and Git status are historical data.

## Verify

```sh
npm run check
```

This runs type checks, renderer and host tests, a clean build, and Pi loader
checks for both entry points. Tests include real codemode replay, image bytes,
theme changes, errors, expansion, control characters, and widths from 0 to 100.

To repeat the local executor probes:

```sh
node --import tsx scripts/capture-codemode.ts
```

This runs read and bash through Pi's real codemode sandbox. It changes the
recorded fixtures. It makes no model or network request.

## Display limits

Normal output blocks do not appear in the compact view. The output viewer
shows formatted output in order, in a bounded scroll area. Ctrl+O remains the
raw-output view. Errors and recovery
paths remain visible in the compact view. Native images stay owned by Pi.

JSON decoding is bounded. Invalid, duplicate-key, excessively nested, and
unsafe-integer JSON stays text. Raw expansion retains all supplied text,
including the original host header. Terminal controls are shown as escapes;
tabs become spaces. It cannot recover text removed by upstream truncation.

## Source

- `src/model.ts`: bounded decoding and separate result/call records.
- `src/screen.ts`: responsive panel and result layouts.
- `src/pseudocode.ts`: bounded, parser-based script summaries.
- `src/renderer.ts`: Pi renderer adapter.
- `src/output.ts`: output viewer and per-run UI state.
- `src/index.ts`: display-only registration and output shortcut.
