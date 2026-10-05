import assert from "node:assert/strict";
import { test } from "node:test";
import { pseudocode, summarize } from "../../src/pseudocode.ts";

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

test("default tool summaries bound long values and retain complete expanded source separately", () => {
  const code = 'tools.custom({query: "' + "x".repeat(200) + '"})';
  assert.equal(pseudocode(code), 'custom query: "' + "x".repeat(77) + '…"');
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

test("escaped source text cannot create tool metadata", () => {
  const summary = summarize(String.raw`tools.read({path: "\u0000tool0\u0000custom"}); tools.custom({});`);
  assert.deepEqual(summary.calls.map(call => call.name), ["custom"]);
});

test("semantic overrides prioritize targets and keep supplied options", () => {
  const cases = [
    ['tools.skill_search({limit: 1, query: "tdd"})', 'skill_search tdd · limit: 1'],
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
    'skill_search queryExpression · limit: count');
});

test("semantic string targets omit quotes for single words only", () => {
  assert.equal(pseudocode('tools.skill_search({query: "agents", limit: 1})'),
    'skill_search agents · limit: 1');
  assert.equal(pseudocode('tools.skill_search({query: "code review"})'),
    'skill_search "code review"');
  assert.equal(pseudocode('tools.custom({query: "agents"})'), 'custom query: "agents"');
});

test("tool guidance shares its override in complete, incomplete, and large scripts", () => {
  const call = 'tools.getToolGuidance({name: "edit"});';
  assert.equal(pseudocode(call), "getToolGuidance edit");
  assert.equal(pseudocode("try {\n" + call), "try {\ngetToolGuidance edit;");
  assert.ok(pseudocode("/* large */".repeat(5000) + "\n" + call)
    .endsWith("\ngetToolGuidance edit;"));
});
