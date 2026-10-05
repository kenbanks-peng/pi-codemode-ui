/** Conservative relative path list; never infer a tree from arbitrary prose. */
export function formatPathTree(value: unknown): string[] | undefined {
  const paths =
    typeof value === "string"
      ? value.trim().split("\n")
      : Array.isArray(value) && value.every((x) => typeof x === "string")
        ? value
        : [];
  if (
    paths.length < 2 ||
    paths.length > 100 ||
    paths.join("").length > 16384 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (p) => p.split("/").length > 32 || paths.some((other) => other.startsWith(p + "/")),
    ) ||
    !paths.every((p) => /^(?:[\w.@ -]+\/)+[\w.@ -]+$/.test(p))
  )
    return;
  interface Node {
    children: Map<string, Node>;
  }
  const root: Node = { children: new Map() };
  for (const path of paths) {
    let node = root;
    for (const part of path.split("/")) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
  }
  const lines: string[] = [];
  function walk(node: Node, prefix: string, top: boolean) {
    const entries = [...node.children];
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1;
      lines.push(
        prefix + (top ? "" : last ? "└─ " : "├─ ") + name + (child.children.size ? "/" : ""),
      );
      walk(child, prefix + (top ? "" : last ? "   " : "│  "), false);
    });
  }
  walk(root, "", true);
  return lines;
}
