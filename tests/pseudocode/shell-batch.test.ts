import assert from "node:assert/strict";
import { test } from "node:test";
import { summarize } from "../../src/pseudocode/summary.ts";

test("parallel shell batches retain literal identities and readable output", () => {
  const code =
    'const commands = [`printf "\\n=== First ===\\n"; pwd`, "echo second"]; ' +
    "await Promise.all(commands.map(async (command, index) => { " +
    "const result = await tools.powershell({command}); text({index, ...result}); }));";
  for (const width of [30, 80, 160]) {
    const summary = summarize(code, width);
    assert.match(summary.text, /\[2 shell commands\]/);
    assert.match(summary.text, /parallel commands.map\(command, index\)/);
    assert.match(summary.text, /powershell · First/);
    assert.match(summary.text, /powershell echo second/);
    assert.match(summary.text, /output \{index, ...result\}/);
    assert.deepEqual(
      summary.calls.map((call) => call.target),
      ['printf "\n=== First ===\n"; pwd', "echo second"],
    );
    for (const call of summary.calls) {
      assert.equal(call.command, true);
      assert.equal(
        summary.text.split("\n")[call.line]!.slice(call.column, call.column + call.name.length),
        "powershell",
      );
    }
  }
});

test("parallel batches do not hide dynamic commands or extra callback work", () => {
  const wrap = (array: string, body: string) =>
    "const commands = " +
    array +
    "; " +
    "await Promise.all(commands.map(async (command, index) => { " +
    body +
    " }));";
  const body = "const result = await tools.bash({command}); text({index, ...result});";
  const cases = [
    wrap('["echo first", buildCommand()]', body),
    wrap('["echo first", `echo ${value}`]', body),
    wrap('["echo first"]', body + ' store("result", result);'),
    wrap('["echo first"]', body.replace("{command}", "{command, ...options}")),
    wrap('["echo first"]', body.replace("{command}", "{command, timeout: getTimeout()}")),
    wrap(
      '["echo first"]',
      body.replace("{index, ...result}", '{index, value: tools.read({path: "a"})}'),
    ),
    wrap('["echo first"]', body.replace("{command}", "{command: transform(command)}")),
  ];
  for (const code of cases) {
    const summary = summarize(code);
    assert.doesNotMatch(summary.text, /shell commands|parallel commands/);
    assert.match(summary.text, /echo first/);
    assert.ok(summary.calls.some((call) => call.name === "bash"));
  }
});
