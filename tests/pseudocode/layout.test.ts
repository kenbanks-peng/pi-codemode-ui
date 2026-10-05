import assert from "node:assert/strict";
import { test } from "node:test";
import { pseudocode, summarize } from "../../src/pseudocode/summary.ts";

test("variable declaration prefixes are hidden in all compact render paths", () => {
  for (const declaration of [
    'const variable = await tools.read({path: "file.ts"});',
    'let variable = await tools.read({path: "file.ts"});',
    'var variable = await tools.read({path: "file.ts"});',
    'const {output} = await tools.read({path: "file.ts"});',
    'const [output] = await tools.read({path: "file.ts"});',
  ]) {
    for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
      const summary = summarize(prefix + declaration);
      assert.doesNotMatch(summary.text, /variable|output|←/);
      assert.ok(summary.text.includes("read file.ts"));
      assert.equal(summary.calls.length, 1);
    }
  }
});

test("nested callbacks hide declarations and expand try/catch blocks", () => {
  const code =
    'const calls = [["read", {path: "a.ts"}], ["find", {pattern: "renderer"}]]; ' +
    "await Promise.all(calls.map(async ([name, args]) => {try {const value = await tools[name](args); " +
    'store(name, value); const results = load("results"); results[name] = "called"; text({name, value});}' +
    "catch (error) {text({name, error: String(error)});}}));";
  const output = pseudocode(code);
  assert.doesNotMatch(output, /calls ←|value ←|results ←/);
  assert.match(output, /try\n\s+tools\[name\]\(args\)/);
  assert.doesNotMatch(output, /store\(name, value\)/);
  assert.match(output, /load\("results"\)/);
  assert.match(output, /catch error\n/);
  assert.doesNotMatch(output, /try\{|catch\(/);
});

test("standalone storage calls are hidden but used results remain visible", () => {
  const code =
    'store("key", value); load("key"); const result = load("key"); ' +
    'text(load("key")); other.store("key", value);';
  const output = pseudocode(code, 160);
  assert.equal(output, 'load("key")\nload("key")\nother.store("key", value)');
});

test("generic layouts adapt arrays, objects, chains, and operators to width", () => {
  const code =
    'const jobs = [["scan", {path: "src/ui/renderers.ts", limit: 3}], ' +
    '["check", {pattern: "export", path: "src/run/parse-result.ts"}]]; ' +
    'const dir = load("bash").output.trim().split("\\n").pop(); ' +
    "const accepted = firstCondition && secondCondition;";
  const narrow = pseudocode(code, 40);
  const wide = pseudocode(code, 160);
  assert.match(narrow, /\[\n/);
  assert.match(narrow, /\n\s+\.split\("\\n"\)/);
  assert.match(narrow, /firstCondition and secondCondition/);
  assert.match(wide, /load\("bash"\).output.trim\(\).split\("\\n"\).pop\(\)/);
  assert.ok(narrow.split("\n").length > wide.split("\n").length);
  assert.doesNotMatch(narrow, /…/);
});

test("shell command summaries retain content and target identity for width-aware rendering", () => {
  for (const name of ["bash", "powershell"]) {
    const command = "node " + "x".repeat(200);
    const code = "tools." + name + "(" + JSON.stringify({ command }) + ")";
    for (const source of [code, "try {\n" + code]) {
      const summary = summarize(source);
      assert.ok(summary.text.includes(name + " " + command));
      assert.equal(summary.calls[0]?.target, command);
    }
  }
});

test("primary target identity is separate from display options in every render path", () => {
  const code = 'tools.read({path: "src/index.ts", limit: 120, offset: 2});';
  for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
    const summary = summarize(prefix + code);
    assert.deepEqual(
      summary.calls.map((call) => ({
        name: call.name,
        command: call.command,
        target: call.target,
      })),
      [{ name: "read", command: true, target: "src/index.ts" }],
    );
    assert.doesNotMatch(summary.text, /limit:|offset:/);
    const call = summary.calls[0]!;
    assert.equal(
      summary.text.split("\n")[call.line]!.slice(call.column, call.column + call.name.length),
      "read",
    );
  }
});
