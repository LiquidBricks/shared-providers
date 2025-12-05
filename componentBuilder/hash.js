import { createHash } from 'node:crypto'

export function computeComponentHash(name, nodes = {}) {
  const data = normalizeNodeDefinitions(nodes.data);
  const tasks = normalizeNodeDefinitions(nodes.tasks);
  const imports = normalizeImportDefinitions(nodes.imports);

  const descriptor = {
    name,
    imports,
    data,
    tasks,
  };
  const json = JSON.stringify(descriptor);
  return createHash('sha256').update(json).digest('hex');
}

function normalizeImportDefinitions(importMap = new Map()) {
  return Array.from(importMap.entries())
    .map(([name, { hash }]) => ({
      name,
      hash: String(hash).trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeNodeDefinitions(nodeMap = new Map()) {
  return Array.from(nodeMap.entries())
    .map(([nodeName, { deps, inject, fnc }]) => ({
      name: nodeName,
      deps: [...(deps ?? [])].sort(),
      inject: [...(inject ?? [])].sort(),
      fnc: String(fnc).trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
