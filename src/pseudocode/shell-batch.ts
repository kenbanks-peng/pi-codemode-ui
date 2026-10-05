import type { Node, Program } from "estree";
import { directToolName, staticString } from "./syntax.ts";

export function findShellBatches(program: Program) {
  // Only compress an adjacent, immutable literal array and a simple shell
  // mapper. Dynamic arrays and callbacks with extra work keep the full layout.
  const batches = new Map<
    Node,
    { binding: string; commands: string[]; tool: string; params: string[]; output: Node }
  >();
  const batchDeclarations = new Map<Node, number>();
  for (let i = 1; i < program.body.length; i++) {
    const declaration = program.body[i - 1];
    const statement = program.body[i];
    if (
      declaration?.type !== "VariableDeclaration" ||
      declaration.kind !== "const" ||
      declaration.declarations.length !== 1 ||
      statement?.type !== "ExpressionStatement"
    )
      continue;
    const entry = declaration.declarations[0]!;
    if (
      entry.id.type !== "Identifier" ||
      entry.init?.type !== "ArrayExpression" ||
      !entry.init.elements.length
    )
      continue;
    const commands = entry.init.elements.map((element) =>
      element ? staticString(element) : undefined,
    );
    if (!commands.every((command): command is string => command !== undefined)) continue;
    const expression =
      statement.expression.type === "AwaitExpression"
        ? statement.expression.argument
        : statement.expression;
    if (
      expression.type !== "CallExpression" ||
      expression.optional ||
      expression.callee.type !== "MemberExpression" ||
      expression.callee.computed ||
      expression.callee.optional ||
      expression.callee.object.type !== "Identifier" ||
      expression.callee.object.name !== "Promise" ||
      expression.callee.property.type !== "Identifier" ||
      expression.callee.property.name !== "all" ||
      expression.arguments.length !== 1
    )
      continue;
    const mapper = expression.arguments[0];
    if (
      mapper?.type !== "CallExpression" ||
      mapper.optional ||
      mapper.callee.type !== "MemberExpression" ||
      mapper.callee.computed ||
      mapper.callee.optional ||
      mapper.callee.object.type !== "Identifier" ||
      mapper.callee.object.name !== entry.id.name ||
      mapper.callee.property.type !== "Identifier" ||
      mapper.callee.property.name !== "map" ||
      mapper.arguments.length !== 1
    )
      continue;
    const callback = mapper.arguments[0];
    if (
      callback?.type !== "ArrowFunctionExpression" ||
      !callback.async ||
      !callback.params.length ||
      callback.params.length > 2 ||
      !callback.params.every((param) => param.type === "Identifier") ||
      callback.body.type !== "BlockStatement" ||
      callback.body.body.length !== 2
    )
      continue;
    const [result, output] = callback.body.body;
    if (
      result?.type !== "VariableDeclaration" ||
      result.declarations.length !== 1 ||
      result.declarations[0]?.id.type !== "Identifier" ||
      result.declarations[0].init?.type !== "AwaitExpression" ||
      output?.type !== "ExpressionStatement" ||
      output.expression.type !== "CallExpression" ||
      output.expression.callee.type !== "Identifier" ||
      output.expression.callee.name !== "text"
    )
      continue;
    const call = result.declarations[0].init.argument;
    if (call.type !== "CallExpression") continue;
    const tool = directToolName(call);
    if (
      !tool ||
      !["bash", "powershell"].includes(tool) ||
      call.arguments.length !== 1 ||
      call.arguments[0]?.type !== "ObjectExpression"
    )
      continue;
    const properties = call.arguments[0].properties;
    const keys = properties.map((property) =>
      property.type === "Property" &&
      !property.computed &&
      !property.method &&
      property.kind === "init" &&
      property.key.type === "Identifier"
        ? property.key.name
        : undefined,
    );
    if (
      keys.some((key) => key === undefined || !["command", "timeout"].includes(key)) ||
      new Set(keys).size !== keys.length
    )
      continue;
    const command = properties[keys.indexOf("command")];
    if (
      command?.type !== "Property" ||
      command.value.type !== "Identifier" ||
      command.value.name !== callback.params[0]!.name
    )
      continue;
    // Options and output must not contain hidden calls or other side effects.
    const timeout = properties[keys.indexOf("timeout")];
    if (timeout && (timeout.type !== "Property" || timeout.value.type !== "Literal")) continue;
    const pureOutput = (node: Node): boolean => {
      switch (node.type) {
        case "Identifier":
        case "Literal":
          return true;
        case "ObjectExpression":
          return node.properties.every(pureOutput);
        case "Property":
          return (
            !node.computed &&
            !node.method &&
            node.kind === "init" &&
            pureOutput(node.key) &&
            pureOutput(node.value)
          );
        case "SpreadElement":
          return pureOutput(node.argument);
        case "BinaryExpression":
          return pureOutput(node.left) && pureOutput(node.right);
        default:
          return false;
      }
    };
    if (!output.expression.arguments.every(pureOutput)) continue;
    batches.set(statement.expression, {
      binding: entry.id.name,
      commands,
      tool,
      params: callback.params.map((param) => param.name),
      output,
    });
    batchDeclarations.set(entry, commands.length);
  }
  return { batches, batchDeclarations };
}
