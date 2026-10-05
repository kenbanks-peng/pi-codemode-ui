import type { CallExpression, Node } from "estree";

export function sourceText(node: Node, code: string): string {
  const range = node as Node & { start: number; end: number };
  return code.slice(range.start, range.end);
}

export function propertyKey(node: Node): string | undefined {
  if (node.type !== "Property" || node.computed || node.method || node.kind !== "init")
    return undefined;
  if (node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal" && typeof node.key.value === "string") return node.key.value;
  return undefined;
}

export function staticString(node: Node): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && !node.expressions.length)
    return node.quasis.map((part) => part.value.cooked ?? part.value.raw).join("");
  return undefined;
}

export function directToolName(node: CallExpression): string | undefined {
  const member = node.callee;
  return node.type === "CallExpression" &&
    !node.optional &&
    member.type === "MemberExpression" &&
    !member.optional &&
    !member.computed &&
    member.object.type === "Identifier" &&
    member.object.name === "tools" &&
    member.property.type === "Identifier"
    ? member.property.name
    : undefined;
}
