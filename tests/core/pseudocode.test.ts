import assert from "node:assert/strict";
import { test } from "node:test";
import { pseudocode, summarize } from "../../src/pseudocode.ts";

test("nested callbacks retain assignments and expand try/catch blocks", () => {
  const code = 'const calls = [["read", {path: "a.ts"}], ["find", {pattern: "renderer"}]]; ' +
    'await Promise.all(calls.map(async ([name, args]) => {try {const value = await tools[name](args); ' +
    'store(name, value); const results = load("results"); results[name] = "called"; text({name, value});}' +
    'catch (error) {text({name, error: String(error)});}}));';
  const output = pseudocode(code);
  assert.match(output, /calls ←/);
  assert.match(output, /try\n\s+value ← tools\[name\]\(args\)/);
  assert.match(output, /store\(name, value\)/);
  assert.match(output, /results ← load\("results"\)/);
  assert.match(output, /catch error\n/);
  assert.doesNotMatch(output, /try\{|catch\(/);
});

test("generic layouts adapt arrays, objects, chains, and operators to width", () => {
  const code = 'const jobs = [["scan", {path: "src/renderer.ts", limit: 3}], ' +
    '["check", {pattern: "export", path: "src/model.ts"}]]; ' +
    'const dir = load("bash").output.trim().split("\\n").pop(); ' +
    'const accepted = firstCondition && secondCondition;';
  const narrow = pseudocode(code, 40);
  const wide = pseudocode(code, 160);
  assert.match(narrow, /jobs ← \[\n/);
  assert.match(narrow, /\n\s+\.split\("\\n"\)/);
  assert.match(narrow, /\n\s+and secondCondition/);
  assert.match(wide, /load\("bash"\).output.trim\(\).split\("\\n"\).pop\(\)/);
  assert.ok(narrow.split("\n").length > wide.split("\n").length);
  assert.doesNotMatch(narrow, /…/);
});

test("wrapped expressions retain every tool identity and conditional branch", () => {
  const code = 'const outputs = [tools.alpha({query: "界"}), tools.beta({}), tools.alpha({})]; ' +
    'const message = ready ? buildSuccess(first, second, third, fourth) : buildFailure(reason); ' +
    'try {store("value", outputs);} catch {text("failed");} finally {exit();}';
  for (const width of [30, 80, 160]) {
    const summary = summarize(code, width);
    assert.deepEqual(summary.calls.map(call => call.name), ["alpha", "beta", "alpha"]);
    for (const call of summary.calls)
      assert.equal(summary.text.split("\n")[call.line]!.slice(call.column,
        call.column + call.name.length), call.name);
    assert.match(summary.text, /fourth/);
    assert.match(summary.text, /finally\n\s+exit\(\)/);
  }
  assert.match(pseudocode(code, 30), /\n\s+else buildFailure/);
});

test("default tool calls keep labels, values, and expressions without call syntax", () => {
  const cases = [
    ['tools.custom({enabled: true, count: 3})', 'custom enabled: true · count: 3'],
    ['tools.custom({})', 'custom'],
    ['tools.custom()', 'custom'],
    ['tools.custom(options)', 'custom options'],
    ['tools.custom({query, ...options})', 'custom query · ...options'],
    ['tools.custom({query: buildQuery(input), limit: max + 1})',
      'custom query: buildQuery(input) · limit: max + 1'],
    ['tools.custom("agents", 1, false, null)', 'custom "agents" · 1 · false · …'],
    ['tools.custom({a: 1, b: 2, c: 3, d: 4})', 'custom a: 1 · b: 2 · c: 3 · …'],
    ['tools.custom({items: [1, 2, 3, 4]})', 'custom items: [1, 2, 3, …]'],
    ['tools.custom({nested: {enabled: true}})', 'custom nested: {enabled: true}'],
    ['tools.read({unexpected: true})', 'read unexpected: true'],
    [String.raw`tools.custom({query: "a\nb"})`, String.raw`custom query: "a\nb"`],
  ];
  for (const [code, expected] of cases) {
    assert.equal(pseudocode(code!), expected);
    assert.equal(pseudocode("try {\n" + code), "try {\n" + expected);
    assert.ok(pseudocode("/* large */".repeat(5000) + "\n" + code).endsWith("\n" + expected));
  }
});

test("shell command summaries retain content and target identity for width-aware rendering", () => {
  for (const name of ["bash", "powershell"]) {
    const command = "node " + "x".repeat(200);
    const code = "tools." + name + "(" + JSON.stringify({command}) + ")";
    for (const source of [code, "try {\n" + code]) {
      const summary = summarize(source);
      assert.ok(summary.text.includes(name + " " + command));
      assert.equal(summary.calls[0]?.target, command);
    }
  }
});

test("default tool summaries retain long values for width-aware rendering", () => {
  const code = 'tools.custom({query: "' + "x".repeat(200) + '"})';
  assert.equal(pseudocode(code), 'custom query: "' + "x".repeat(200) + '"');
});

test("tool metadata follows display positions, not name-like strings or other objects", () => {
  const code = 'text("custom"); other.custom(); tools.custom({query: "custom"});\n' +
    'if (true) { await tools.$lookup({}); }';
  const summary = summarize(code);
  assert.deepEqual(summary.calls.map(call => call.name), ["custom", "$lookup"]);
  const lines = summary.text.split("\n");
  for (const call of summary.calls)
    assert.equal(lines[call.line]!.slice(call.column, call.column + call.name.length), call.name);
  assert.ok(summary.text.includes("other.custom()"));
  assert.ok(summary.text.includes('"custom"'));
  assert.ok(!summary.text.includes("\u0000"));
});

test("shared target overrides work in parsed and syntax fallback paths", () => {
  for (const [name, key] of [["read", "path"], ["bash", "command"], ["find", "pattern"]]) {
    const code = 'tools.' + name + '({' + key + ': "target"})';
    assert.equal(pseudocode(code), name + " target");
    assert.equal(pseudocode("try {\n" + code), "try {\n" + name + " target");
  }
});

test("primary target identity is separate from display options in every render path", () => {
  const code = 'tools.read({path: "src/index.ts", limit: 120, offset: 2});';
  for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
    const summary = summarize(prefix + code);
    assert.deepEqual(summary.calls.map(call => ({
      name: call.name, command: call.command, target: call.target,
    })), [{name: "read", command: true, target: "src/index.ts"}]);
    assert.doesNotMatch(summary.text, /limit:|offset:/);
    const call = summary.calls[0]!;
    assert.equal(summary.text.split("\n")[call.line]!.slice(call.column,
      call.column + call.name.length), "read");
  }
});

test("display overrides retain options and hide only selected fields", () => {
  const cases = [
    ['tools.read({limit: 100, path: "src/index.ts", offset: 2})',
      'read src/index.ts'],
    ['tools.grep({pattern: "renderCall", limit: 20})', 'grep renderCall'],
    ['tools.find({pattern: "renderer", limit: 3})', 'find renderer'],
    ['tools.ls({path: "src", limit: 10})', 'ls src'],
    ['tools.bash({command: "npm test", timeout: 60})', 'bash npm test'],
    ['tools.powershell({command: "Get-ChildItem", timeout: 60})',
      'powershell Get-ChildItem'],
    ['tools.write({content: "large payload", path: "file.txt", mode: "append"})',
      'write file.txt · mode: "append"'],
    ['tools.edit({path: "file.txt", oldText: "old", newText: "new", edits: []})',
      'edit file.txt'],
    ['tools.skill_search({limit: 1, query: "code-review", extra: true})',
      'skill_search code-review · extra: true'],
    ['tools.skill_search({limit: 1})', 'skill_search'],
  ];
  for (const [code, expected] of cases) {
    assert.equal(pseudocode(code!), expected);
    assert.equal(pseudocode("try {\n" + code), "try {\n" + expected);
    assert.ok(pseudocode("/* large */".repeat(5000) + "\n" + code).endsWith("\n" + expected));
  }
  assert.deepEqual(summarize('tools.skill_search({query: "code-review", limit: 1})').calls,
    [{ name: "skill_search", line: 0, column: 0 }]);
});

test("escaped source text cannot create tool metadata", () => {
  const summary = summarize(String.raw`tools.read({path: "\u0000tool0\u0000custom"}); tools.custom({});`);
  assert.deepEqual(summary.calls.map(call => call.name), ["read", "custom"]);
});

test("semantic overrides prioritize targets and keep supplied options", () => {
  const cases = [
    ['tools.skill_search({limit: 1, query: "tdd"})', 'skill_search tdd'],
    ['tools.query_docs({query: "server actions", libraryId: "/vercel/next.js"})',
      'query_docs "/vercel/next.js" · "server actions"'],
    ['tools.todo({status: "completed", id: 3, action: "update"})',
      'todo update #3 · status: "completed"'],
    ['tools.fetch_content({mode: "raw", url: "https://example.com"})',
      'fetch_content "https://example.com" · mode: "raw"'],
    ['tools.web_search({provider: "brave", queries: ["one", "two"], numResults: 5})',
      'web_search ["one", "two"] · provider: "brave" · numResults: 5'],
    ['tools.skill_search({unexpected: true})', 'skill_search unexpected: true'],
  ];
  for (const [code, expected] of cases) {
    assert.equal(pseudocode(code!), expected);
    assert.equal(pseudocode("try {\n" + code), "try {\n" + expected);
    assert.ok(pseudocode("/* large */".repeat(5000) + "\n" + code).endsWith("\n" + expected));
  }
});

test("all semantic target maps share formatting and metadata", () => {
  const cases = [
    ["tool_search", { limit: 2, query: "read" }, 'read · limit: 2'],
    ["resolve_library_id", { query: "hooks", libraryName: "React" }, 'React · hooks'],
    ["mnemosyne_recall", { top_k: 2, query: "preferences" }, 'preferences · top_k: 2'],
    ["mnemosyne_remember", { source: "pi", content: "Use TypeScript", importance: 0.8 },
      '"Use TypeScript" · source: "pi" · importance: 0.8'],
    ["mnemosyne_forget", { id: "abc" }, 'abc'],
    ["source_check", { provider: "brave", claim: "A claim", queries: ["evidence"] },
      '"A claim" · provider: "brave" · queries: ["evidence"]'],
    ["get_search_content", { offset: 20, url: "https://example.com", responseId: "abc", limit: 100 },
      'abc · "https://example.com" · offset: 20 · …'],
    ["create_goal", { mode: "regular", objective: "Ship it", token_budget: 1000 },
      '"Ship it" · mode: "regular" · token_budget: 1000'],
    ["get_goal", { cursor: "next", task_id: "t1", section: "tasks" }, 'tasks · t1 · cursor: "next"'],
    ["fetch_content", { urls: ["https://a.example", "https://b.example"], mode: "answer", prompt: "Summarize" },
      '["https://a.example", "https://b.example"] · mode: "answer" · prompt: "Summarize"'],
    ["todo", { action: "create", subject: "Write tests", owner: "me" }, 'create "Write tests" · owner: "me"'],
  ] as const;
  for (const [name, args, expected] of cases) {
    const code = "tools." + name + "(" + JSON.stringify(args) + ")";
    assert.equal(pseudocode(code), name + " " + expected);
    assert.equal(pseudocode("try {\n" + code), "try {\n" + name + " " + expected);
    assert.deepEqual(summarize(code).calls.map(call => call.name), [name]);
  }
});

test("question overrides show question text and count instead of option payloads", () => {
  const args = { questions: [
    { header: "Method", question: "Which method?", options: [{ label: "A", description: "Method A" }] },
    { header: "Scope", question: "Which scope?", options: [{ label: "B", description: "Scope B" }] },
  ] };
  const code = "tools.ask_user_question(" + JSON.stringify(args) + ")";
  assert.equal(pseudocode(code), 'ask_user_question "Which method?" · "Which scope?" · 2 questions');
  assert.equal(pseudocode("try {\n" + code), 'try {\nask_user_question "Which method?" · "Which scope?" · 2 questions');
});

test("semantic overrides do not infer targets through spreads or duplicate fields", () => {
  for (const code of [
    'tools.skill_search({query: "one", ...options})',
    'tools.skill_search({query: "one", query: "two"})',
    'tools.skill_search({[key]: "one", query: "two"})',
  ]) assert.ok(pseudocode(code).includes('query:'));
  assert.equal(pseudocode('tools.todo({id: 3, status: "completed"})'), 'todo #3 · status: "completed"');
  assert.equal(pseudocode('tools.skill_search({query: queryExpression, limit: count})'),
    'skill_search queryExpression');
});

test("semantic string targets omit quotes for single words only", () => {
  assert.equal(pseudocode('tools.skill_search({query: "agents", limit: 1})'),
    'skill_search agents');
  assert.equal(pseudocode('tools.skill_search({query: "code review"})'),
    'skill_search "code review"');
  assert.equal(pseudocode('tools.custom({query: "agents"})'), 'custom query: "agents"');
});

test("compact summaries hide spinner and proxy fields and redact authentication", () => {
  const cases = [
    ['tools.todo({action: "update", id: 3, activeForm: "working", status: "completed"})',
      'todo update #3 · status: "completed"'],
    ['tools.web_search({query: "docs", proxy: "https://user:secret@proxy"})', 'web_search docs'],
    ['tools.source_check({claim: "A claim", proxy: "secret"})', 'source_check "A claim"'],
    ['tools.fetch_content({url: "https://example.com", proxy: "secret", auth: "token"})',
      'fetch_content "https://example.com" · auth: [redacted]'],
    ['tools.fetch_content({url: "https://example.com", auth: true})',
      'fetch_content "https://example.com" · auth: true'],
    ['tools.fetch_content({auth: token, ...options})',
      'fetch_content auth: [redacted] · ...options'],
    ['tools.fetch_content({auth: "first", auth: "second", proxy: "secret"})',
      'fetch_content auth: [redacted] · auth: [redacted]'],
  ];
  for (const [code, expected] of cases) {
    for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"])
      assert.ok(pseudocode(prefix + code).endsWith(expected!), pseudocode(prefix + code));
  }
});

test("graph and resource targets come before options in every summary path", () => {
  const cases = [
    ["mcp__gitnexus__query", { limit: 5, repo: "app", search_query: "auth" }, 'auth · limit: 5 · repo: "app"'],
    ["mcp__gitnexus__context", { repo: "app", uid: "s1" }, 's1 · repo: "app"'],
    ["mcp__gitnexus__impact", { repo: "app", limit: 5, target: "run", direction: "upstream", mode: "pdg" },
      'run · direction: "upstream" · mode: "pdg" · …'],
    ["mcp__gitnexus__rename", { repo: "app", symbol_name: "old", new_name: "next", dry_run: false },
      'old · next · dry_run: false · …'],
    ["mcp__gitnexus__trace", { repo: "app", from: "start", to: "end" }, 'start · end · repo: "app"'],
    ["mcp__gitnexus__cypher", { repo: "app", statement: "MATCH (n) RETURN n" },
      '"MATCH (n) RETURN n" · repo: "app"'],
    ["mcp__gitnexus__explain", { limit: 5, target: "run" }, 'run · limit: 5'],
    ["mcp__gitnexus__pdg_query", { limit: 5, target: "run", mode: "flows" }, 'run · mode: "flows" · limit: 5'],
    ["mcp__gitnexus__route_map", { repo: "app", route: "/api/users" }, '"/api/users" · repo: "app"'],
    ["mcp__gitnexus__shape_check", { repo: "app", route: "/api/users" }, '"/api/users" · repo: "app"'],
    ["mcp__gitnexus__api_impact", { repo: "app", file: "src/api.ts", method: "GET" },
      '"src/api.ts" · method: "GET" · repo: "app"'],
    ["read_mcp_resource", { server: "gitnexus", uri: "gitnexus://repo/app" },
      '"gitnexus://repo/app" · gitnexus'],
    ["get_search_content", { offset: 20, responseId: "r1", findText: "needle", limit: 100 },
      'r1 · needle · offset: 20 · …'],
  ] as const;
  for (const [name, args, expected] of cases) {
    const code = "tools." + name + "(" + JSON.stringify(args) + ")";
    for (const prefix of ["", "try {\n", "/* large */".repeat(5000) + "\n"]) {
      const summary = summarize(prefix + code);
      assert.ok(summary.text.endsWith(name + " " + expected), summary.text);
      assert.deepEqual(summary.calls.map(call => call.name), [name]);
    }
  }
});

test("tool guidance shares its override in complete, incomplete, and large scripts", () => {
  const call = 'tools.getToolGuidance({name: "edit"});';
  assert.equal(pseudocode(call), "getToolGuidance edit");
  assert.equal(pseudocode("try {\n" + call), "try {\ngetToolGuidance edit;");
  assert.ok(pseudocode("/* large */".repeat(5000) + "\n" + call)
    .endsWith("\ngetToolGuidance edit;"));
});
