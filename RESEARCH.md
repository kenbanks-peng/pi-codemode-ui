# Codemode output research

> Status: the approved single-panel design is implemented. The rejected renderer
> and its formatter modules were replaced, not used as a design reference.
> Actual host output is in UI-CAPTURE.md. Automated checks do not establish
> human visual acceptance or native image pixel quality.

## Scope and method

Tested against Pi 1.0.2. Research used the
installed documentation, the shipped implementation, and real QuickJS runs.
No external search service or model was needed.

Sources in `@earendil-works/pi-coding-agent`:

- `docs/codemode.md`: scripts, output, discovery, failures, and limits.
- `docs/extensions.md`, `docs/tui.md`, `docs/themes.md`, and
  `docs/packages.md`: renderer registration, layout, themes, and package loading.
- `dist/extensions/codemode/execute.js`: output blocks, updates, truncation,
  and nested-call records.
- `dist/extensions/codemode/tool.d.ts`: the exact details schema.
- `dist/extensions/codemode/renderer.js`: the built-in display.
- `dist/modes/interactive/components/tool-execution.js`: expansion, error
  state, renderer context, and independent native image rendering.

The source inspection used local text search. The source paths refer to the
installed package, not extension dependencies that the renderer imports.

## Reproducible probes

Run:

```sh
node --import tsx scripts/capture-codemode.ts
```

This development script runs Pi's real codemode executor and QuickJS sandbox.
A small context adapter dispatches actual built-in read and bash tools.
It reads this checkout's package.json and runs `git status --short --branch`.
It makes no model or network request. It writes six JSON fixtures under
`tests/fixtures/`; the truncation probe also creates a Pi temporary output file.

The adapter does not test permission hooks or the full agent execution pipeline.
The renderer does not change either of these. The file-list item is a literal
sample emitted by QuickJS, not evidence that a find tool ran.

| Probe | Result blocks | Nested calls | Update snapshots |
| --- | --- | --- | --- |
| example: read + bash, file list, calculated values | 5 text | 2 | 4 |
| discovery: searchTools + describeTool | 3 text | 0 | 0 |
| strings, object, console output, returned table | 5 text | 0 | 0 |
| output followed by a thrown error | 3 text | 0 | 0 |
| script with no output | 1 text | 0 | 0 |
| output above a 40-token budget | 2 text | 0 | 0 |

Fixtures retain measured durations and output from the capture run. Git status
and temporary paths are historical data, not current state. Regeneration changes
these values.

## What codemode actually supplies

### Call arguments

The model can send raw JavaScript, but the renderer receives `{ code: string }`.
The source can include an options comment. Do not execute or rewrite the source
to derive display data.

### Final results

The result has separate `content` blocks and `details`. Its first text block is:

```text
Script completed
Wall time 0.1 seconds
Output:
```

The failed form starts with `Script failed`. The actual block ends with a newline.
A successful renderer can replace this exact first block with a short status and
wall time. A similar sentence inside user output is not a script header.

Each `text()` call produces its own block. Strings remain strings; other values
become JSON text. A returned value is another output block. Multiple console
arguments can form mixed prose and JSON in one block. These are not safe to
split into independent JSON records.

A common script pattern is:

```js
text({ demo: "Read package metadata", result: await tools.read(args) });
```

The result is JSON containing a second, escaped string. Reading the outer JSON
as a raw line is the main source of the poor UI in example1.md. A bounded parse
can show the label and decode the result. If the decoded result is a complete
JSON document, it can become fields or a table.

### Nested tools

`details.calls` contains:

```ts
{
  id: string;
  name: string;
  args: string; // compact JSON; can already be truncated
  status: "running" | "ok" | "error" | "cancelled";
  durationMs?: number;
  error?: string;
  cost?: number;
}
```

These records contain no nested result payload and no output-block ID.
Parallel calls appear in start order; emitted output follows the script's output
order. These orders can differ. It is not safe to attach an output block to a
call by position, label, or guessed script semantics.

Updates in the probe had `content: []` and snapshots of `details.calls`.
The UI must show running status without inventing output or reporting completion.
Call IDs can still contain `/?` while execution is running.

### Discovery

`searchTools()` returns an array of `{ name, description }`. Descriptions contain
both prose and TypeScript declarations. A typical result is not a small flat
table and can exceed 16 KiB.

`describeTool()` returns prose followed by a fenced declaration.
Discovery helpers are sandbox globals, not nested tool calls. They do not create
call status or duration records. A display must not invent those records.

### Tool result values

- read normally resolves to text.
- bash resolves to structured data: `output`, `exit_code`, `truncated`,
  `wall_time_seconds`, and optional `full_output_path`.
- MCP tools can return an envelope with `content`, `isError`, and
  `structuredContent`.
- A script may transform, combine, or discard these values before printing them.
  The extension sees only the printed values.

### Failures, truncation, and images

A failed script retains output and appends a `Script error:` block. Error state
also reaches the renderer through its context.

Upstream truncation can combine text into one head/tail preview. The result
provides `details.fullOutputPath` when saving the full output succeeds.
Expansion cannot reconstruct bytes removed upstream. The file path must stay
visible. A failed save has an inline notice instead.

Pi renders image bytes independently of the custom text renderer, including
when `renderShell: "self"` is used. The new renderer uses this mode to avoid
duplicate framing. Host tests check the original Kitty image payload with
images enabled, and its absence when images are disabled.

## Implemented display

The design source is UI-PROTOTYPE.md, approved before implementation.

- One muted border, CODEMODE title, and expansion hint outside the panel.
- Results precede completed call records. Labelled wrappers become headings.
- Package fields, conservative relative-path trees, flat-record tables, shell
  results, MCP text/error envelopes, and discovery arrays have readable views.
- Narrow fields stack with indented values. Call targets wrap below call names.
- Running updates show supplied call states, not invented results.
- Script errors precede retained output. Recovery paths are never clipped.
- Expanded mode has Code, Calls, and Raw output sections.
- Active theme colors and symbols identify success, running, and failure.
- No output-to-call matching, source execution, generated summaries, or mutation.

Only an exact independent first host text block is condensed. Expansion includes
that original block. Two-field demo/title/label + result wrappers are decoded;
extra wrapper fields remain generic fields instead of being discarded.

The normal JSON cap is 16,384 UTF-16 code units. Discovery arrays can use up to
131,072. Nesting is limited to eight containers. Duplicate keys, unsafe integers,
non-finite values, and negative zero fall back to raw text. Complete documents
are parsed, never clipped prefixes.

Collapsed output shows eight blocks, eight calls, eight fields/records/items,
and sixteen tree entries. Plain text shows eight source lines, with a
1,000-code-unit limit for each unusually long line. Hidden counts refer to the
supplied data, not to unknown upstream output. Calls with non-success states
take priority when the call preview is full. Expansion includes all call
arguments, supplied cost, errors, source, and raw text.

Terminal controls and directional override characters are escaped before theme
ANSI is added. Tabs become spaces. The renderer does not alter source objects
or image bytes.

## Verification of this implementation

The initial test fixture was fixed to use Pi's initialized theme. The old
renderer then failed the approved panel and empty-call-component assertions.
The replacement passed those tests.

`npm run check` passes 17 tests, type checks, a clean build, and real Pi loader
smoke tests for source and compiled entry points. The agreed test interfaces
are the registered renderer and Pi's ToolExecutionComponent. Tests cover:

- Six real codemode fixtures, update snapshots, final results, and replay.
- One panel, results-first order, tables, fields, trees, and package metadata.
- Raw/source expansion, unchanged inputs, exact header recognition.
- Errors, MCP errors, cancellation, costs, malformed metadata, recovery paths.
- Native image bytes, image visibility, theme invalidation, terminal controls.
- Widths 0, 1, 2, 5, 20, 38, 72, and 100; bounded long-line previews.

`scripts/capture-ui.ts` generates UI-CAPTURE.md from the actual host component.
Compared with the approved prototype, it has the same panel hierarchy, field
layout, separate calls, and expansion sections. Recorded results remain in
emission order; unlike the incomplete pasted example, the real fixture includes
Git output and the calculated table. These values are not fabricated.

Actual Pi PTY replay passed:
- Source entry, regular mode, dark theme, 45 rows.
- Compiled entry, fullscreen mode, light theme, 100 rows.
- Both accepted Ctrl+O, resized from 100 to 40 columns, and collapsed again.

The PTY used an isolated agent directory and the recorded session generated by
`scripts/tui-fixture.ts`. No model request was made. The first PTY harness
attempt timed out during cleanup. A nonblocking harness with bounded cleanup
passed. A 45-row fullscreen title assertion was outside the visible viewport;
the 100-row check made the title and expansion sections visible.

Text and ANSI captures do not certify native image pixels or human visual
quality. Inspect UI-CAPTURE.md and the UI in the user's terminal for final
visual acceptance.
