export function captureDepsAccesses(depsFn) {
  if (typeof depsFn !== 'function') return [];
  const accesses = [];
  depsFn(createLoggingProxy(accesses));
  keepOnlyLeafPaths(accesses);
  return accesses;
}

export function captureInjectAccesses(injectFn) {
  if (typeof injectFn !== 'function') return {};
  const pathRegistry = new WeakMap();
  const injectionMap = new Map();

  const proxy = createCallableLoggingProxy({
    pathRegistry,
    injectionMap,
  });

  injectFn(proxy);
  return mapInjectionToObject(injectionMap);
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

function createCallableLoggingProxy({ pathRegistry, injectionMap, currentPath = [] }) {
  const target = () => { };
  const proxy = new Proxy(target, {
    get(_, prop) {
      const key = String(prop);
      const nextPath = [...currentPath, key];
      return createCallableLoggingProxy({ pathRegistry, injectionMap, currentPath: nextPath });
    },
    apply(_, __, args = []) {
      recordInjection({ pathRegistry, injectionMap, callerPathParts: currentPath, args });
      return createCallableLoggingProxy({ pathRegistry, injectionMap, currentPath });
    },
  });

  pathRegistry?.set(proxy, currentPath);
  return proxy;
}

function recordInjection({ pathRegistry, injectionMap, callerPathParts, args = [] }) {
  if (!Array.isArray(callerPathParts) || callerPathParts.length === 0) return;
  const callerPath = callerPathParts.join('.');
  if (!callerPath) return;

  for (const arg of args) {
    const argPathParts = pathRegistry?.get(arg);
    if (!Array.isArray(argPathParts) || argPathParts.length === 0) continue;
    const argPath = argPathParts.join('.');
    if (!argPath) continue;

    const callers = injectionMap.get(argPath) ?? new Set();
    callers.add(callerPath);
    injectionMap.set(argPath, callers);
  }
}

function keepOnlyLeafPaths(paths) {
  if (!Array.isArray(paths)) return;
  const unique = Array.from(new Set(paths));
  const leaves = unique.filter(p => !unique.some(o => o !== p && o.startsWith(p + '.')));
  paths.splice(0, paths.length, ...leaves);
}

function mapInjectionToObject(map = new Map()) {
  const result = {};
  for (const [argPath, callers] of map.entries()) {
    result[argPath] = Array.from(callers);
  }
  return result;
}
