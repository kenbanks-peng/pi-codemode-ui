import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainLines as plain, registeredRenderers as renderer } from "../support/host.ts";
import { context, theme } from "../support/render.ts";

test("bash command previews use one available row and hide control fields", () => {
  const code =
    'await tools.bash({command: "npm run check --workspace=' +
    "界".repeat(100) +
    '\\nnext", timeout: 120});';
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded, isPartial: false },
      theme(),
      context({ args: { code }, expanded }),
    );
  for (const width of [20, 48, 72, 120]) {
    const lines = component(false).render(width);
    const screen = plain(lines);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.equal(screen.split("\n").filter((line) => line.includes("bash ")).length, 1);
    assert.ok([...screen].filter((character) => character === "界").length < 100);
    assert.match(screen, /…/);
    assert.doesNotMatch(screen, /next|timeout/);
  }
  assert.ok(plain(component(true).render(1000)).includes(code));
});

test("shell preview grows with panel width and reserves status and duration", () => {
  const command = "echo " + "x".repeat(300);
  const code = "tools.bash(" + JSON.stringify({ command }) + ")";
  const component = renderer().renderResult!(
    {
      content: [],
      details: { calls: [{ name: "bash", args: { command }, status: "ok", durationMs: 12 }] },
    } as never,
    { expanded: false, isPartial: false },
    theme(),
    context({ args: { code } }),
  );
  let previous = 0;
  for (const width of [32, 72, 120]) {
    const lines = component.render(width);
    const commandRow = plain(lines)
      .split("\n")
      .find((line) => line.includes("bash "))!;
    assert.match(commandRow, /✓ bash echo x+…\s+12ms/);
    const retained = [...commandRow].filter((character) => character === "x").length;
    assert.ok(retained > previous);
    previous = retained;
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
});

test("file paths keep trailing segments on one row and preserve expanded code", () => {
  const path =
    "/Users/kenbanks/Software/ToolChain/node_modules/.pnpm/very-long-package/node_modules/pi-coding-agent/docs/codemode.md";
  for (const tool of ["read", "edit", "write", "ls"]) {
    const code = `await tools.${tool}({path: ${JSON.stringify(path)}});`;
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        {
          content: [],
          details: {
            calls: [{ name: tool, args: JSON.stringify({ path }), status: "ok", durationMs: 12 }],
          },
        } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code }, expanded }),
      );
    for (const width of [32, 72, 160]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      const body = screen
        .split("\n")
        .filter((line) => line.startsWith("│ "))
        .map((line) => line.slice(2, -2).trimEnd())
        .join("");
      assert.ok(body.includes("codemode.md"));
      assert.match(screen, /…\//);
      assert.doesNotMatch(screen, /Users\/kenbanks|\.\.\./);
      const commandRows = screen.split("\n").filter((line) => line.includes("✓ " + tool + " "));
      assert.equal(commandRows.length, 1);
      assert.match(commandRows[0]!, /codemode\.md +12ms/);
      if (width === 160) assert.ok(commandRows[0]!.includes("…/pi-coding-agent/docs/codemode.md"));
    }
    assert.ok(plain(component(true).render(1000)).includes(code));
  }
});

test("recorded read calls shorten paths when pseudocode has no matching call", () => {
  const path = "/Users/kenbanks/Software/ToolChain/node_modules/pi-coding-agent/docs/codemode.md";
  for (const args of [
    JSON.stringify({ path }),
    JSON.stringify({ path, limit: 100 }).slice(0, -2),
  ]) {
    const code = "text(value);";
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        {
          content: [],
          details: { calls: [{ name: "read", args, status: "ok", durationMs: 12 }] },
        } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code }, expanded }),
      );
    for (const width of [32, 72, 160]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      const body = screen
        .split("\n")
        .filter((line) => line.startsWith("│ "))
        .map((line) => line.slice(2, -2).trimEnd())
        .join("");
      assert.ok(body.includes("codemode.md"));
      assert.match(screen, /✓ read …\//);
      assert.doesNotMatch(screen, /Users\/kenbanks|\{"path"/);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      assert.match(screen, /12ms/);
    }
    assert.ok(plain(component(true).render(1000)).includes(args));
  }
});

test("read arguments cut inside a path do not display a JSON fragment as a filename", () => {
  const args = '{"path":"/Users/kenbanks/Software/ToolChain/node_modules/.pnpm/package...';
  const screen = plain(
    renderer().renderResult!(
      { content: [], details: { calls: [{ name: "read", args, status: "ok" }] } } as never,
      { expanded: false, isPartial: false },
      theme(),
      context(),
    ).render(100),
  );
  assert.match(screen, /✓ read … \(path truncated\)/);
  assert.doesNotMatch(screen, /\{"path"|Users\/kenbanks|package/);
});

test("wrapped bash commands do not reset the host background", () => {
  const lines = renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded: false, isPartial: false },
    theme(),
    context({
      args: { code: 'await tools.bash({command: "' + "x".repeat(200) + '", timeout: 120});' },
    }),
  ).render(72);
  const command = lines.find((line) => plain([line]).includes("bash "))!;
  const screen = plain(lines);
  assert.ok([...screen].filter((character) => character === "x").length < 200);
  assert.match(screen, /…/);
  assert.doesNotMatch(screen, /\.\.\.|timeout/);
  const content = command.replace(/^\x1b\[48;[0-9;]*m/, "").replace(/\x1b\[49m$/, "");
  assert.doesNotMatch(content, /\x1b\[(?:0)?m|\x1b\[49m|\x1b\[4[0-8]m|\x1b\[48[;:]/);
});

test("primary calls hide control fields and match each recorded status once", () => {
  const code =
    'tools.read({path: "src/pseudocode/summary.ts", offset: 300, limit: 35});\n' +
    'tools.read({path: "src/index.ts", limit: 120});\n' +
    'tools.bash({command: "git status --short; pwd", timeout: 30});';
  const calls = [
    {
      name: "read",
      args: { path: "src/index.ts", limit: 120 },
      status: "cancelled",
      durationMs: 9,
    },
    {
      name: "read",
      args: { path: "src/pseudocode/summary.ts", offset: 300, limit: 35 },
      status: "ok",
      durationMs: 2,
    },
    {
      name: "bash",
      args: { command: "git status --short; pwd", timeout: 30 },
      status: "ok",
      durationMs: 13,
    },
  ];
  for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        { content: [], details: { calls } } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code: prefix + code }, expanded }),
      );
    const screen = plain(component(false).render(120));
    assert.match(screen, /✓ read src\/pseudocode\/summary.ts;?\s+2ms/);
    assert.match(screen, /– read src\/index.ts;?\s+9ms/);
    assert.match(screen, /✓ bash git status --short; pwd;?\s+13ms/);
    assert.equal(screen.split("src/pseudocode/summary.ts").length - 1, 1);
    assert.equal(screen.split("src/index.ts").length - 1, 1);
    assert.doesNotMatch(screen, /offset:|limit:|timeout:/);
    const expanded = plain(component(true).render(1000));
    for (const line of code.split("\n")) assert.ok(expanded.includes(line));
  }
});

test("truncated host arguments attach status to one complete source command", () => {
  const command =
    "node --input-type=module <<'JS'\n" +
    "console.log(" +
    JSON.stringify("界".repeat(150)) +
    ");\nJS";
  const path = "/Users/kenbanks/Software/ToolChain/node_modules/pi-coding-agent/docs/packages.md";
  const code =
    "tools.bash(" +
    JSON.stringify({ command, timeout: 30 }) +
    ");\n" +
    "tools.read(" +
    JSON.stringify({ path, limit: 100 }) +
    ");";
  for (const suffix of ["", "...", "…"]) {
    const calls = [
      {
        name: "bash",
        args: JSON.stringify({ command, timeout: 30 }).slice(0, 80) + suffix,
        status: "ok",
        durationMs: 39,
      },
      {
        name: "read",
        args: JSON.stringify({ path, limit: 100 }).slice(0, 45) + suffix,
        status: "ok",
        durationMs: 9,
      },
    ];
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        { content: [], details: { calls } } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code }, expanded }),
      );
    for (const width of [48, 120]) {
      const lines = component(false).render(width);
      const screen = plain(lines);
      assert.equal(screen.split("\n").filter((line) => line.includes("bash ")).length, 1);
      assert.equal(screen.split("\n").filter((line) => line.includes("read ")).length, 1);
      assert.match(screen, /✓ bash/);
      assert.match(screen, /✓ read/);
      assert.match(screen, /39ms/);
      assert.match(screen, /9ms/);
      const body = screen
        .split("\n")
        .filter((line) => line.startsWith("│ "))
        .map((line) => line.slice(2, -2).trimEnd())
        .join("");
      assert.ok(body.includes("packages.md"));
      assert.match(screen, /✓ read …\//);
      assert.ok([...screen].filter((character) => character === "界").length < 150);
      assert.match(screen, /…\s+39ms/);
      assert.doesNotMatch(screen, /\{"command"|path truncated|\.\.\./);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
    }
    const expanded = plain(component(true).render(10000));
    for (const line of code.split("\n")) assert.ok(expanded.includes(line));
    for (const call of calls) assert.ok(expanded.includes(call.args));
  }
});

test("host arguments cut after a complete command do not duplicate the source row", () => {
  const command =
    "node --import tsx --test tests/terminal/preview.test.ts && " +
    "node --import tsx --test --test-name-pattern='bash command' tests/ui/compact-command.test.ts";
  const code = "tools.bash(" + JSON.stringify({ command, timeout: 120 }) + ")";
  const args = JSON.stringify({ command, timeout: 120 });
  for (const cut of [args.indexOf(',"timeout"') + 1, args.length - 2]) {
    const screen = plain(
      renderer().renderResult!(
        {
          content: [],
          details: {
            calls: [
              { name: "bash", args: args.slice(0, cut) + "...", status: "ok", durationMs: 39 },
            ],
          },
        } as never,
        { expanded: false, isPartial: false },
        theme(),
        context({ args: { code } }),
      ).render(120),
    );
    assert.equal(screen.split("\n").filter((line) => /\bbash\b/.test(line)).length, 1);
    assert.match(screen, /✓ bash/);
    assert.match(screen, /39ms/);
    assert.doesNotMatch(screen, /\{"command"/);
  }
});

test("ambiguous truncated argument prefixes do not assign status to a source call", () => {
  const paths = ["/Users/kenbanks/shared/first.ts", "/Users/kenbanks/shared/second.ts"];
  const code = paths.map((path) => "tools.read(" + JSON.stringify({ path }) + ");").join("\n");
  const screen = plain(
    renderer().renderResult!(
      {
        content: [],
        details: {
          calls: [
            {
              name: "read",
              args: '{"path":"/Users/kenbanks/shared/...',
              status: "ok",
              durationMs: 5,
            },
          ],
        },
      } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(160),
  );
  assert.doesNotMatch(screen, /✓ read \/Users/);
  assert.match(screen, /✓ read … \(path truncated\)/);
  for (const name of ["first.ts", "second.ts"])
    assert.ok(screen.includes("…/kenbanks/shared/" + name));
});

test("unrecorded shell commands use width-aware previews without invented status", () => {
  const command =
    "node --input-type=module <<'JS'\n" +
    "const roots = [" +
    JSON.stringify("界".repeat(200)) +
    "];\n" +
    "console.log(roots);\nJS";
  for (const tool of ["bash", "powershell"]) {
    const code = "tools." + tool + "(" + JSON.stringify({ command, timeout: 30 }) + ");";
    for (const calls of [[], [{ name: tool, args: { command }, status: "unknown" }]]) {
      const component = (expanded: boolean) =>
        renderer().renderResult!(
          { content: [], details: { calls } } as never,
          { expanded, isPartial: false },
          theme(),
          context({ args: { code }, expanded }),
        );
      for (const width of [20, 48, 120]) {
        const lines = component(false).render(width);
        const screen = plain(lines);
        assert.equal(screen.split("\n").filter((line) => line.includes(tool + " ")).length, 1);
        assert.ok([...screen].filter((character) => character === "界").length < 200);
        assert.match(screen, /…/);
        assert.doesNotMatch(screen, /\.\.\./);
        assert.doesNotMatch(screen, /\? |✓ |timeout:/);
        const body = screen
          .split("\n")
          .filter((line) => line.startsWith("│ "))
          .map((line) => line.slice(2, -2).trimEnd())
          .join("");
        assert.ok(!body.includes("console.log(roots)"));
        assert.ok(lines.every((line) => visibleWidth(line) <= width));
      }
      assert.ok(plain(component(true).render(10000)).includes(code));
    }
  }
  const screen = plain(
    renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code: 'tools.read({path: "src/index.ts"})' } }),
    ).render(100),
  );
  assert.match(screen, /read src\/index.ts/);
  assert.doesNotMatch(screen, /\? |✓ /);
});

test("unmatched long shell calls keep duration on the command row", () => {
  for (const name of ["bash", "powershell"]) {
    const command = "printf " + "界".repeat(200);
    const component = renderer().renderResult!(
      {
        content: [],
        details: { calls: [{ name, args: { command }, status: "ok", durationMs: 25 }] },
      } as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code: "text(value);" } }),
    );
    for (const width of [32, 72, 120]) {
      const lines = component.render(width);
      const commandRow = plain(lines)
        .split("\n")
        .find((line) => line.includes(name + " "))!;
      assert.match(commandRow, /…\s+25ms/);
      assert.equal(
        plain(lines)
          .split("\n")
          .filter((line) => line.includes("25ms")).length,
        1,
      );
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
    }
  }
});

test("parallel shell batches show headings and each recorded duration once", () => {
  const commands = [
    "printf '\\n=== Repository summary ===\\n'; " + "pwd; ".repeat(40),
    "printf '\\n=== Source file sizes ===\\n'; " + "wc -l src/index.ts; ".repeat(40),
  ];
  const code =
    "const commands = " +
    JSON.stringify(commands) +
    ";\n" +
    "await Promise.all(commands.map(async (command, index) => { " +
    "const result = await tools.bash({command, timeout: 20}); text({command: index + 1, ...result}); }));";
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      {
        content: [],
        details: {
          calls: commands.map((command, index) => ({
            name: "bash",
            args: { command },
            status: "ok",
            durationMs: 25 + index,
          })),
        },
      } as never,
      { expanded, isPartial: false },
      theme(),
      context({ args: { code }, expanded }),
    );
  for (const width of [48, 72, 120]) {
    const lines = component(false).render(width);
    const screen = plain(lines);
    assert.match(screen, /\[2 shell commands\]/);
    assert.match(screen, /parallel commands.map\(command, index\)/);
    assert.match(screen, /✓\s+bash · Repository summary\s+25ms/);
    assert.match(screen, /✓\s+bash · Source file sizes\s+26ms/);
    assert.equal(screen.split("\n").filter((line) => line.includes("bash ")).length, 2);
    assert.doesNotMatch(screen, /printf|Promise|timeout/);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
  for (const command of commands) assert.ok(plain(component(true).render(4000)).includes(command));
});
