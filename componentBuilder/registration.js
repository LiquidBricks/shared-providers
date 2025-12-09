export function buildRegistration({ name, nodes, hash }) {
  const importNodes = serializeImports(nodes.imports);
  const dataNodes = serializeNodes(nodes.data);
  const taskNodes = serializeNodes(nodes.tasks);

  return {
    name,
    hash,
    imports: importNodes,
    data: dataNodes,
    tasks: taskNodes,
  }
}

function serializeImports(map = new Map()) {
  return Array.from(map.entries())
    .map(([n, { hash, inject = {}, codeRef }]) => ({
      name: n,
      hash,
      inject,
      codeRef,
    }));
}

function serializeNodes(map = new Map()) {
  return Array.from(map.entries())
    .map(([n, { deps = [], inject = [], fnc, codeRef }]) => ({
      name: n,
      deps: Array.from(deps),
      inject: Array.from(inject),
      fnc: fnc === undefined ? undefined : String(fnc),
      codeRef
    }));
}
