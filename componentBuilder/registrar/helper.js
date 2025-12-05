export function captureDepsAccesses(depsFn) {
  if (typeof depsFn !== 'function') return [];
  const accesses = [];
  depsFn(createLoggingProxy(accesses));
  keepOnlyLeafPaths(accesses);
  return accesses;
}

function createLoggingProxy(pathCollector = [], currentPath = []) {
  const collector = Array.isArray(pathCollector) ? pathCollector : [];
  return new Proxy({}, {
    get(_, prop) {
      const key = String(prop);
      const nextPath = [...currentPath, key];
      const joined = nextPath.join('.');
      collector.push(joined);
      return createLoggingProxy(collector, nextPath);
    }
  });
}

function keepOnlyLeafPaths(paths) {
  if (!Array.isArray(paths)) return;
  const unique = Array.from(new Set(paths));
  const leaves = unique.filter(p => !unique.some(o => o !== p && o.startsWith(p + '.')));
  paths.splice(0, paths.length, ...leaves);
}
