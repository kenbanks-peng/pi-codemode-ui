# Actual Pi host rendering

Generated with `node --import tsx scripts/capture-ui.ts`. These are text captures from Pi 1.0.2 ToolExecutionComponent, not mockups. ANSI colors are removed. Fixture paths, Git status, and times are historical data.

## example · 80 columns

```text
╭─ CODEMODE ───────────────────────────────────────────────────────────────────╮
│ ✓ Complete                                               2 tool calls · 0.1s │
│                                                                              │
│ Read package metadata                                                        │
│ ──────────────────────────────────────────────────────────────────────────── │
│ Name         @kenbanks/pi-ui                                                 │
│ Version      0.1.0                                                           │
│ Description  Display-only compact codemode rendering for Pi                  │
│ Module       ESM                                                             │
│ Keywords     pi-package                                                      │
│ Files        src · dist · README.md                                          │
│ Extension    ./src/index.ts                                                  │
│ … 4 more fields in raw output                                                │
│                                                                              │
│ Check Git branch and changes                                                 │
│ ──────────────────────────────────────────────────────────────────────────── │
│ Exit 0                                                                    0s │
│ ## main                                                                      │
│  D PLAN.md                                                                   │
│ ?? example1.md                                                               │
│ ?? output1.md                                                                │
│ ?? scripts/capture-codemode.ts                                               │
│                                                                              │
│ Find test files                                                              │
│ ──────────────────────────────────────────────────────────────────────────── │
│ tests/                                                                       │
│ ├─ core/                                                                     │
│ │  ├─ host.test.ts                                                           │
│ │  └─ renderer.test.ts                                                       │
│ └─ formatters/                                                               │
│    └─ index.test.ts                                                          │
│                                                                              │
│ JavaScript data query                                                        │
│ ──────────────────────────────────────────────────────────────────────────── │
│ value   squared                                                              │
│ 6       36                                                                   │
│ 8       64                                                                   │
├─ CALLS ──────────────────────────────────────────────────────────────────────┤
│ ✓ read  package.json                                                     4ms │
│ ✓ bash  git status --short --branch                                     14ms │
╰──────────────────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output · expand
```

## example · 38 columns

```text
╭─ CODEMODE ─────────────────────────╮
│ ✓ Complete     2 tool calls · 0.1s │
│                                    │
│ Read package metadata              │
│ ────────────────────────────────── │
│ Name                               │
│   @kenbanks/pi-ui                  │
│ Version                            │
│   0.1.0                            │
│ Description                        │
│   Display-only compact codemode    │
│   rendering for Pi                 │
│ Module                             │
│   ESM                              │
│ Keywords                           │
│   pi-package                       │
│ Files                              │
│   src · dist · README.md           │
│ Extension                          │
│   ./src/index.ts                   │
│ … 4 more fields in raw output      │
│                                    │
│ Check Git branch and changes       │
│ ────────────────────────────────── │
│ Exit 0                          0s │
│ ## main                            │
│  D PLAN.md                         │
│ ?? example1.md                     │
│ ?? output1.md                      │
│ ?? scripts/capture-codemode.ts     │
│                                    │
│ Find test files                    │
│ ────────────────────────────────── │
│ tests/                             │
│ ├─ core/                           │
│ │  ├─ host.test.ts                 │
│ │  └─ renderer.test.ts             │
│ └─ formatters/                     │
│    └─ index.test.ts                │
│                                    │
│ JavaScript data query              │
│ ────────────────────────────────── │
│ value   squared                    │
│ 6       36                         │
│ 8       64                         │
├─ CALLS ────────────────────────────┤
│ ✓ read                         4ms │
│   package.json                     │
│ ✓ bash                        14ms │
│   git status --short --branch      │
╰────────────────────────────────────╯
  ▸ Code and raw output · expand
```

## example · 72 columns · running

```text
╭─ CODEMODE ───────────────────────────────────────────────────────────╮
│ … Running                                                   1 active │
├─ CALLS ──────────────────────────────────────────────────────────────┤
│ … bash  git status --short --branch                                  │
│ ✓ read  package.json                                             4ms │
╰──────────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output · expand
```

## failure · 72 columns

```text
╭─ CODEMODE ───────────────────────────────────────────────────────────╮
│ ✗ Script failed                                                 0.1s │
│                                                                      │
│ Error                                                                │
│ ──────────────────────────────────────────────────────────────────── │
│ Script error:                                                        │
│ Error: research failure                                              │
│     at <anonymous> (codemode.js:1:68)                                │
│                                                                      │
│ No tool calls were made.                                             │
│                                                                      │
│ Output before failure                                                │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ Output 1                                                             │
│ ──────────────────────────────────────────────────────────────────── │
│ kept before failure                                                  │
╰──────────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output · expand
```

## discovery · 80 columns

```text
╭─ CODEMODE ───────────────────────────────────────────────────────────────────╮
│ ✓ Complete                                                              0.1s │
│                                                                              │
│ Tool search                                                                  │
│ ──────────────────────────────────────────────────────────────────────────── │
│ Available tools                                                    2 matches │
│ read                                                                         │
│ Read the contents of a file.                                                 │
│ bash                                                                         │
│ Execute a bash command in the current working directory.                     │
│ Full descriptions and declarations in raw output                             │
│                                                                              │
│ Output 2                                                                     │
│ ──────────────────────────────────────────────────────────────────────────── │
│ Read the contents of a file. Supports text files and images (jpg, png, gif,  │
│ webp, bmp). Images are sent as attachments. For text files, output is        │
│ truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit   │
│ for large files. When you need the full file, continue with offset until     │
│ complete.                                                                    │
│                                                                              │
│ codemode tool declaration:                                                   │
│ ```ts                                                                        │
│ declare const tools: { read(args: {                                          │
│   // Maximum number of lines to read                                         │
│   limit?: number;                                                            │
│   // Line number to start reading from (1-indexed)                           │
│ … 5 more lines in raw output                                                 │
╰──────────────────────────────────────────────────────────────────────────────╯
  ▸ Code and raw output · expand
```

## values · 80 columns · expanded

```text
╭─ CODEMODE ───────────────────────────────────────────────────────────────────╮
│ ✓ Complete                                                              0.1s │
│                                                                              │
│ Code                                                                         │
│ ──────────────────────────────────────────────────────────────────────────── │
│ text("plain text"); text({name:"sample",count:2}); console.log("two",        │
│ {items:[1,2]}); return [{name:"a",count:1},{name:"b",count:2}];              │
├─ Calls ──────────────────────────────────────────────────────────────────────┤
│ No nested tool calls                                                         │
│                                                                              │
│ Raw output                                                                   │
│ ──────────────────────────────────────────────────────────────────────────── │
│ Script completed                                                             │
│ Wall time 0.1 seconds                                                        │
│ Output:                                                                      │
│                                                                              │
│                                                                              │
│ plain text                                                                   │
│                                                                              │
│ {"name":"sample","count":2}                                                  │
│                                                                              │
│ two {"items":[1,2]}                                                          │
│                                                                              │
│ [{"name":"a","count":1},{"name":"b","count":2}]                              │
╰──────────────────────────────────────────────────────────────────────────────╯
  ▾ Code and raw output · collapse
```
