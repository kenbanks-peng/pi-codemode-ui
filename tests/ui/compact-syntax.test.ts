import assert from "node:assert/strict";
import { test } from "node:test";
import { plainLines as plain, registeredRenderers as renderer } from "../support/host.ts";
import { context, theme } from "../support/render.ts";

test("all scripts show uncapped pseudocode, including syntax outside the main converter", () => {
  const code =
    "const message = `hello ${name}`;\n" +
    Array.from({ length: 12 }, (_, i) => `text("line-${i}");`).join("\n");
  const result = { content: [], details: {} };
  const screen = plain(
    renderer().renderResult!(
      result as never,
      { expanded: false, isPartial: false },
      theme(),
      context({ args: { code } }),
    ).render(100),
  );
  assert.doesNotMatch(screen, /Pseudocode/);
  assert.match(screen, /line-11/);
  assert.match(screen, /`hello \$\{name\}`/);
  assert.doesNotMatch(screen, /message ←/);
});

test("pseudocode fallback keeps all lines for complex, large, and incomplete scripts", () => {
  const tail = Array.from({ length: 12 }, (_, i) => `text("tail-${i}");`).join("\n");
  for (const prefix of [
    'try { await tools.read({path: "test"}); } catch (error) { text(error); }',
    "for (let i = 0; i < 2; i++) { text(i); }",
    'text("large");\n'.repeat(1700),
    "const broken = ;",
  ]) {
    const code = prefix + "\n" + tail;
    const options = { expanded: false, isPartial: false };
    const result = { content: [], details: {} };
    const component = renderer().renderResult!(
      result as never,
      options,
      theme(),
      context({ args: { code } }),
    );
    const screen = plain(component.render(100));
    assert.doesNotMatch(screen, /Pseudocode/);
    assert.match(screen, /tail-11/);
    assert.doesNotMatch(screen, /await tools\.read/);
    const expanded = plain(
      renderer().renderResult!(
        result as never,
        { ...options, expanded: true },
        theme(),
        context({ args: { code }, expanded: true }),
      ).render(100000),
    );
    assert.ok(expanded.includes(code.split("\n")[0]!));
  }
});

test("pseudocode shows text arguments without the output wrapper", () => {
  for (const code of [
    'text(await tools.read({path: "file"}));',
    'try { text(await tools.read({path: "file"})); } catch (error) { text(error); }',
  ]) {
    const result = { content: [], details: {} };
    const screen = plain(
      renderer().renderResult!(
        result as never,
        { expanded: false, isPartial: false },
        theme(),
        context({ args: { code } }),
      ).render(100),
    );
    assert.match(screen, /\bread file\b/);
    assert.doesNotMatch(screen, /text\(/);
    const expanded = plain(
      renderer().renderResult!(
        result as never,
        { expanded: true, isPartial: false },
        theme(),
        context({ args: { code }, expanded: true }),
      ).render(1000),
    );
    assert.ok(expanded.includes(code));
  }
});

test("pseudocode keeps helper calls and hides text wrappers in parsed and fallback layouts", () => {
  for (const prefix of ["", "try {} catch (error) {}\n", "/* large */".repeat(5000) + "\n"]) {
    const code =
      prefix +
      'const matches = await searchTools("read");\ntext(matches);\ntext(searchTools("edit"));';
    const screen = plain(
      renderer().renderResult!(
        { content: [], details: {} } as never,
        { expanded: false, isPartial: false },
        theme(),
        context({ args: { code } }),
      ).render(100),
    );
    if (prefix.length > 50000) {
      assert.match(screen, /searchTools\("read"\)/);
      assert.match(screen, /searchTools\("edit"\)/);
      assert.doesNotMatch(screen, /\bmatches\b/);
    } else {
      assert.match(screen, /searchTools read/);
      assert.match(screen, /searchTools edit/);
      assert.doesNotMatch(screen, /\bmatches\b/);
    }
    assert.doesNotMatch(screen, /\bconst\b|text\(/);
  }
});

test("pseudocode keeps codemode helpers visible inside text wrappers", () => {
  for (const prefix of ["", "try {} catch (error) {}\n", "/* large */".repeat(5000)]) {
    const code =
      prefix +
      "text(ALL_TOOLS);\ntext(searchTools);\ntext(describeTool);\ntext(describeNamespace);\ntext(value);";
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        { content: [], details: {} } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code }, expanded }),
      );
    const screen = plain(component(false).render(100));
    for (const helper of ["ALL_TOOLS", "searchTools", "describeTool", "describeNamespace"])
      assert.ok(screen.includes(helper), helper);
    assert.doesNotMatch(screen, /text\(|value/);
    assert.ok(plain(component(true).render(100000)).includes("text(ALL_TOOLS);"));
  }
});

test("pseudocode uses compact lowercase tool names without changing other names or target text", () => {
  for (const prefix of ["", "try {", "/* large */".repeat(5000) + "\n"]) {
    const code =
      prefix +
      'text(await tools.read({path: "tools.read"}));\n' +
      'await tools.edit({path: "file"});\nawait tools.bash({command: "pwd"});\n' +
      "await tools.write({}); await tools.grep({}); await tools.find({}); await tools.ls({});\n" +
      "await tools.powershell({}); await tools.custom({}); other.read();" +
      (prefix === "try {" ? "} catch (error) {}" : "");
    const screen = plain(
      renderer().renderResult!(
        { content: [], details: {} } as never,
        { expanded: false, isPartial: false },
        theme(),
        context({ args: { code } }),
      ).render(100),
    );
    assert.match(screen, /\bread tools\.read\b/);
    assert.match(screen, /\bedit file\b/);
    assert.match(screen, /\bbash pwd\b/);
    for (const name of ["write", "grep", "find", "ls", "powershell"])
      assert.match(screen, new RegExp("\\b" + name + "\\b"), name);
    assert.doesNotMatch(screen, /\b(?:READ|EDIT|BASH|WRITE|GREP|FIND|LS|POWERSHELL)\b/);
    assert.match(screen, /custom/);
    assert.doesNotMatch(screen, /tools\.custom/);
    assert.match(screen, /other\.read\(\)/);
  }
});

test("pseudocode primary tool names use theme syntaxFunction", () => {
  const currentTheme = theme();
  const lines = renderer().renderResult!(
    { content: [], details: {} } as never,
    { expanded: false, isPartial: false },
    currentTheme,
    context({ args: { code: 'await tools.read({path: "file"}); await tools.edit({});' } }),
  ).render(100);
  assert.ok(lines.join("\n").includes(currentTheme.fg("syntaxFunction", "read")));
  assert.ok(lines.join("\n").includes(currentTheme.fg("syntaxFunction", "edit")));
});

test("pseudocode hides multiline write content while expanded code keeps it complete", () => {
  const code =
    'await tools.write({path: "script.mjs", content: `#!/usr/bin/env node\nimport { readFileSync } from "node:fs";\nconst hidden = 1;\nconst tail = 2;`});';
  const component = (expanded: boolean) =>
    renderer().renderResult!(
      { content: [], details: {} } as never,
      { expanded, isPartial: false },
      theme(),
      context({ args: { code }, expanded }),
    );
  const screen = plain(component(false).render(200));
  assert.match(screen, /\bwrite script\.mjs\b/);
  assert.doesNotMatch(
    screen,
    /write\(|#!\/usr\/bin\/env node|readFileSync|const hidden|const tail/,
  );
  const expanded = plain(component(true).render(200));
  for (const line of code.split("\n")) assert.ok(expanded.includes(line));
});

test("pseudocode shows only edit and path while expanded code keeps edits", () => {
  for (const edits of [
    '[{oldText: "old", newText: "new"}]',
    "[{oldText: `old first\nold hidden`, newText: `new first\nnew hidden`}]",
  ]) {
    const code = 'await tools.edit({path: "src/ui/run-panel.ts", edits: ' + edits + "});";
    const component = (expanded: boolean) =>
      renderer().renderResult!(
        { content: [], details: {} } as never,
        { expanded, isPartial: false },
        theme(),
        context({ args: { code }, expanded }),
      );
    const screen = plain(component(false).render(100));
    assert.ok(screen.includes("edit src/ui/run-panel.ts"));
    assert.doesNotMatch(screen, /oldText|newText|old hidden|new hidden|edit\(/);
    const expanded = plain(component(true).render(200));
    assert.match(expanded, /oldText|newText/);
  }
});
