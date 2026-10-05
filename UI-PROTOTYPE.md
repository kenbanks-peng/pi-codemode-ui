# Codemode UI prototype

## Current design — output viewer

Keep the existing pseudocode and its embedded results. Replace normal output
sections with one button:

```text
╭─ CODEMODE ─────────────────────────────────────╮
│ ✓ Complete                                    │
│                                               │
│ Pseudocode                        View output │
│ …existing steps and results…                  │
╰───────────────────────────────────────────────╯
```

The button opens formatted fields, tables, file trees, and tool search results
for that run in one bordered, padded, scrollable overlay.
There are no previous/next controls. Esc closes the overlay without changing
the compact view. Click in fullscreen mode; Ctrl+Alt+O opens the latest rendered
run in either terminal mode. Existing Ctrl+O expansion remains available.
Errors, recovery paths, and native Pi images remain visible.

## Earlier prototypes

The examples below record the previous design.

## Default view — example1.md

```text
╭─ CODEMODE ─────────────────────────────────────────────────────────╮
│  ✓ 3 tool calls complete                                           │
│                                                                   │
│  Find test files                                          3 files │
│  ───────────────────────────────────────────────────────────────  │
│  tests/                                                           │
│  ├─ core/                                                         │
│  │  ├─ host.test.ts                                               │
│  │  └─ renderer.test.ts                                           │
│  └─ formatters/                                                   │
│     └─ index.test.ts                                              │
│                                                                   │
│  Read package metadata                                            │
│  ───────────────────────────────────────────────────────────────  │
│  Name         @kenbanks/pi-ui                                      │
│  Version      0.1.0                                                │
│  Description  Display-only compact codemode rendering for Pi       │
│  Module       ESM                                                  │
│  Keywords     pi-package                                           │
│  Files        src · dist · README.md                               │
│  Extension    ./src/index.ts                                       │
│                                                                   │
│  Source preview ends here; other results are not shown.            │
│                                                                   │
├─ CALLS ────────────────────────────────────────────────────────────┤
│  ✓ find  tests/**/*.ts                                         2ms │
│  ✓ read  package.json                                          6ms │
│  ✓ bash  git status --short --branch                           14ms │
╰───────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output                                 ctrl+o expand
```

Only data visible in example1.md is used. The missing Git result and calculated
values are not fabricated. Call status is separate from output: codemode does
not supply a reliable call-to-output link.

## Narrow view — same input

```text
╭─ CODEMODE ─────────────────────────╮
│ ✓ 3 tool calls complete            │
│                                   │
│ Find test files           3 files │
│ ───────────────────────────────── │
│ tests/                            │
│ ├─ core/                          │
│ │  ├─ host.test.ts                │
│ │  └─ renderer.test.ts            │
│ └─ formatters/                    │
│    └─ index.test.ts               │
│                                   │
│ Read package metadata             │
│ ───────────────────────────────── │
│ Name                              │
│   @kenbanks/pi-ui                 │
│ Version                           │
│   0.1.0                           │
│ Description                       │
│   Display-only compact codemode   │
│   rendering for Pi                │
│ Module                            │
│   ESM                             │
│ Keywords                          │
│   pi-package                      │
│ Files                             │
│   src · dist · README.md          │
│ Extension                         │
│   ./src/index.ts                  │
│                                   │
│ Source preview ends here.         │
├─ CALLS ────────────────────────────┤
│ ✓ find                        2ms │
│   tests/**/*.ts                   │
│ ✓ read                        6ms │
│   package.json                    │
│ ✓ bash                       14ms │
│   git status --short --branch     │
╰───────────────────────────────────╯
  ▸ Code and raw output
  ctrl+o expand
```

## Other states — illustrative data

These examples define the display, not evidence of executed tools.

### Discovery

```text
╭─ CODEMODE ─────────────────────────────────────────────────────────╮
│  Tool search                                            2 matches │
│                                                                   │
│  read   Read file contents and images.                             │
│  bash   Run a shell command.                                       │
│                                                                   │
│  ▸ Full descriptions and declarations                             │
╰───────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output                                 ctrl+o expand
```

### Running

```text
╭─ CODEMODE ─────────────────────────────────────────────────────────╮
│  … Running                                      1 done · 1 active │
│                                                                   │
│  ✓ read  package.json                                          6ms │
│  … bash  git status --short --branch                               │
╰───────────────────────────────────────────────────────────────────╯
  ▸ Code                                                ctrl+o expand
```

### Failure

```text
╭─ CODEMODE ─────────────────────────────────────────────────────────╮
│  ✗ Script failed                                                  │
│                                                                   │
│  Error                                                            │
│  Permission denied: package.json                                  │
│                                                                   │
│  Output before failure                                            │
│  Found 3 test files.                                              │
├─ CALLS ────────────────────────────────────────────────────────────┤
│  ✗ read  package.json                                          6ms │
╰───────────────────────────────────────────────────────────────────╯
  ▸ Code, stack trace and raw output                     ctrl+o expand
```

## Visual contract

- One panel, one title, one expansion hint. No duplicate Pi framing.
- Results are the main content. Completed call records are secondary.
- Clear headings, aligned labels, and deliberate spacing. No escaped JSON dump.
- One understated accent for headings. Green means success, amber means running
  or incomplete output, and red means failure. Symbols also identify each state.
- Use the active Pi theme. Body text stays readable in light and dark modes.
- Wrap values inside the panel. Never clip recovery paths or error messages.
- Collapse ordinary long results after a complete logical unit, not a random
  number of wrapped lines. Give the hidden-content count when known.
- Expansion shows separate Code, Calls, and Raw output sections. It does not
  replace the display with an unlabelled wall of text.
- Keep source data unchanged. No model calls for titles or summaries.

## Approval gate

This is a new screen design, not a rendering of the current extension.
No extension source was read or changed for this proposal.
After approval, implement the layout from this contract. Compare actual Pi
captures with the approved prototype before calling the UI complete.
