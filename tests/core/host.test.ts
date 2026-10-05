import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";
import {
  initTheme,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilities,
  type TUI,
} from "@earendil-works/pi-tui";
import { codemodeRenderers } from "../../src/renderer.ts";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

test("Pi's real tool shell still renders image bytes and handles expansion/replay", () => {
  initTheme("dark", false);
  const previous = getCapabilities();
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  try {
    const data =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=";
    const result = {
      content: [
        { type: "text", text: '[{"name":"界👩‍💻é","count":1}]' },
        { type: "image", mimeType: "image/png", data },
        { type: "text", text: "raw output\n".repeat(10) + "tail sentinel" },
      ],
      details: { calls: [] },
      isError: false,
    };
    const before = structuredClone(result);
    const shell = new ToolExecutionComponent(
      "codemode",
      "replay-1",
      { code: "image(picture);" },
      { showImages: true },
      codemodeRenderers,
      { requestRender() {} } as TUI,
      process.cwd(),
    );
    shell.updateResult(result, false);
    assert.ok(
      shell.render(80).join("\n").includes(data),
      "native image payload must be preserved",
    );
    assert.ok(shell.render(80).join("\n").includes("output"));
    assert.ok(!shell.render(80).join("\n").includes("tail sentinel"));
    shell.setExpanded(true);
    assert.ok(
      shell.render(80).join("\n").includes('[{"name":"界👩‍💻é","count":1}]'),
    );
    assert.ok(shell.render(80).join("\n").includes("tail sentinel"));
    shell.setShowImages(false);
    assert.ok(!shell.render(80).join("\n").includes(data));
    assert.ok(shell.render(80).join("\n").includes("image/png"));
    shell.setExpanded(false);
    const dark = shell.render(80);
    initTheme("light", false);
    shell.invalidate();
    assert.notDeepEqual(shell.render(80), dark);
    shell.render(20);
    assert.deepEqual(result, before);
  } finally {
    setCapabilities(previous);
  }
});

test("output action uses the panel background without a separate button fill", () => {
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    for (const [isPartial, isError, bg] of [
      [true, false, "toolPendingBg"],
      [false, false, "toolSuccessBg"],
      [false, true, "toolErrorBg"],
    ] as const) {
      const shell = new ToolExecutionComponent("codemode", "button", {code: "text(value);"}, {},
        codemodeRenderers, {requestRender() {}} as TUI, process.cwd());
      shell.updateResult({content: [{type: "text", text: "output"}], isError}, isPartial);
      for (const width of [20, 80]) {
        const button = shell.render(width).find(line => line.includes("output"))!;
        assert.ok(button);
        assert.ok(button.includes(theme.fg("muted", " output ↗ ")));
        const backgrounds = [...button.matchAll(/\u001b\[48;2;[0-9;]+m/g)].map(match => match[0]);
        assert.ok(backgrounds.length > 0);
        assert.ok(backgrounds.every(color => color === theme.getBgAnsi(bg)));
      }
    }
  }
});

test("codemode keeps Pi's pending, success, and error backgrounds", () => {
  const backgrounds = (shell: ToolExecutionComponent) =>
    [...new Set(shell.render(80).filter(line => !line.includes("output")).join("\n").match(/\u001b\[(?:48;[0-9;]+|4[0-7]|10[0-7])m/g) ?? [])].sort();
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    const create = (custom: boolean) =>
      new ToolExecutionComponent(
        "codemode",
        "status",
        { code: 'text("output");' },
        {},
        custom ? codemodeRenderers : undefined,
        { requestRender() {} } as TUI,
        process.cwd(),
      );
    const native = create(false);
    const custom = create(true);
    const check = () => {
      const expected = backgrounds(native);
      assert.ok(expected.length > 0, "native status background must be present");
      assert.deepEqual(backgrounds(custom), expected);
    };
    check();
    for (const [isPartial, isError] of [[true, false], [false, false], [false, true]]) {
      const result = {
        content: [{ type: "text", text: "output" }],
        isError: isError!,
      };
      native.updateResult(result, isPartial);
      custom.updateResult(result, isPartial);
      for (const expanded of [false, true]) {
        native.setExpanded(expanded);
        custom.setExpanded(expanded);
        check();
      }
    }
  }
});

test("CODEMODE has no outer box spacing and pads the tool rows inside its border", () => {
  initTheme("dark", false);
  const shell = new ToolExecutionComponent(
    "codemode", "spacing", { code: 'await tools.read({path: "file.ts"});' },
    {}, codemodeRenderers, { requestRender() {} } as TUI, process.cwd(),
  );
  shell.updateResult({ content: [{ type: "text", text: "output" }], isError: false }, false);
  for (const width of [40, 80, 120]) {
    const lines = shell.render(width).map(stripVTControlCharacters);
    // Pi owns the single message separator, not the panel.
    assert.equal(lines[0], "");
    assert.ok(lines[1]!.startsWith("╭"));
    assert.equal(lines[1]!.length, width);
    assert.match(lines[2]!, /^│ +│$/);
    assert.match(lines[3]!, /read file.ts/);
    assert.match(lines[4]!, /^│ +│$/);
    assert.ok(lines[5]!.startsWith("╰"));
    assert.equal(lines.length, 6);
  }
});

test("header status is color only for pending, success, and error runs", () => {
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    for (const [isPartial, isError, color] of [
      [true, false, "warning"], [false, false, "success"], [false, true, "error"],
    ] as const) {
      const shell = new ToolExecutionComponent(
        "codemode", "color-status", { code: 'text("output");' }, {},
        codemodeRenderers, { requestRender() {} } as TUI, process.cwd(),
      );
      shell.markExecutionStarted();
      assert.doesNotMatch(stripVTControlCharacters(shell.render(80).join("\n")), /Running/);
      shell.updateResult({ content: [{type: "text", text: "output"}], isError }, isPartial);
      for (const width of [20, 80]) {
        const lines = shell.render(width);
        const header = lines.find(line => stripVTControlCharacters(line).includes("CODEMODE"))!;
        assert.ok(header.includes(theme.fg(color, "CODEMODE")));
        assert.doesNotMatch(stripVTControlCharacters(header), /\d+ (?:calls?|active)/);
        assert.doesNotMatch(stripVTControlCharacters(lines.join("\n")), /Complete|Script failed|Running/);
      }
    }
  }
});

test("duration and footer controls use the original muted hint color", () => {
  for (const themeName of ["dark", "light"]) {
    initTheme(themeName, false);
    const shell = new ToolExecutionComponent(
      "codemode", "matching-colors", {code: 'text("output");'}, {},
      codemodeRenderers, {requestRender() {}} as TUI, process.cwd(),
    );
    shell.updateResult({
      content: [{type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n"}, {type: "text", text: "output"}],
      isError: false,
    }, false);
    for (const width of [20, 80]) {
      const rendered = shell.render(width).join("\n");
      assert.ok(rendered.includes(theme.fg("muted", "100ms")));
      assert.ok(rendered.includes(theme.fg("muted", "ctrl+o expand")));
      assert.ok(rendered.includes(theme.fg("muted", " output ↗ ")));
    }
  }
});

test("nested tool durations are muted for success and failure in compact and expanded views", () => {
  initTheme("dark", false);
  for (const name of ["read", "bash", "custom"]) {
    const args = name === "read" ? {path: "file.ts"} : {command: "echo test"};
    const shell = new ToolExecutionComponent(
      "codemode", "muted-times", {code: `await tools.${name}(${JSON.stringify(args)});`},
      {}, codemodeRenderers, {requestRender() {}} as TUI, process.cwd(),
    );
    for (const status of ["ok", "error"]) {
      shell.updateResult({
        content: [], details: {calls: [{name, args, status, durationMs: 12}]},
        isError: status === "error",
      }, false);
      for (const expanded of [false, true]) {
        shell.setExpanded(expanded);
        const timed = shell.render(80).filter(line => stripVTControlCharacters(line).includes("12ms"));
        assert.ok(timed.length > 0);
        assert.ok(timed.every(line => line.includes(theme.fg("muted", "12ms"))));
      }
    }
  }
});

test("header duration uses milliseconds below one second and seconds otherwise", () => {
  initTheme("dark", false);
  for (const [seconds, expected] of [["0", "<50ms"], ["0.0", "<50ms"], ["0.001", "1ms"], ["0.1", "100ms"], ["0.999", "999ms"], ["1", "1.0s"], ["1.25", "1.3s"]]) {
    const shell = new ToolExecutionComponent(
      "codemode", "duration-units", {code: 'text("output");'}, {},
      codemodeRenderers, {requestRender() {}} as TUI, process.cwd(),
    );
    shell.updateResult({
      content: [
        {type: "text", text: `Script completed\nWall time ${seconds} seconds\nOutput:\n`},
        {type: "text", text: "output"},
      ],
      isError: false,
    }, false);
    const header = shell.render(80).find(line => stripVTControlCharacters(line).includes("CODEMODE"))!;
    assert.ok(header.includes(theme.fg("muted", expected!)));
    assert.ok(stripVTControlCharacters(header).endsWith(expected + " ╮"));
  }
});

test("an 11ms nested call does not turn rounded total time into a false 0ms", () => {
  initTheme("dark", false);
  const shell = new ToolExecutionComponent(
    "codemode", "rounded-wall-time", {code: 'await tools.read({path: "file.ts"});'},
    {}, codemodeRenderers, {requestRender() {}} as TUI, process.cwd(),
  );
  shell.updateResult({
    content: [{type: "text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n"}],
    details: {calls: [{name: "read", args: {path: "file.ts"}, status: "ok", durationMs: 11}]},
    isError: false,
  }, false);
  const lines = shell.render(80).map(stripVTControlCharacters);
  assert.ok(lines[1]!.endsWith("<50ms ╮"));
  assert.ok(lines.some(line => /read file.ts +11ms/.test(line)));
});
