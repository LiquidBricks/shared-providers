import { getCodeLocation, s } from "../help.js";
import { captureDepsAccesses } from "./helper.js";
import { checkTaskDefinition, ensureNew, normalizeNames } from "../validation.js";

export function makeTaskRegistrar(monad) {
  return function task(name, definition) {
    const { deps, fnc, inject } = checkTaskDefinition(definition);
    const [n] = normalizeNames(name, 'task');
    ensureNew([n], monad[s.INTERNALS].nodes.tasks, 'task');

    monad[s.INTERNALS].nodes.tasks.set(n, {
      deps: captureDepsAccesses(deps),
      inject: captureDepsAccesses(inject),
      fnc,
      codeRef: getCodeLocation(3)
    });
    return monad;
  }
}
