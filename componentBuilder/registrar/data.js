import assert from "node:assert";
import { getCodeLocation, s } from "../help.js";
import { captureDepsAccesses } from "./helper.js";
import { checkDataDefinition, ensureNew, normalizeNames } from "../validation.js";
import { ERRORS } from "../errors.js";

const defaultDataFunction = () => { };

function ensureValidDeferredDeps(deps = [], fnc) {
  const hasDeferredDep = deps.some(dep => String(dep).split('.').shift() === 'deferred');
  if (!hasDeferredDep) return false;
  assert(deps.length === 1, ERRORS.deferredDepsExclusive);
  assert(fnc === undefined, ERRORS.deferredDepsNoFunction);
  return true;
}

export function makeDataRegistrar(monad) {
  return function data(name, definition) {
    const { deps, fnc, inject } = checkDataDefinition(definition);
    const [n] = normalizeNames(name, 'data');
    ensureNew([n], monad[s.INTERNALS].nodes.data, 'data');

    const capturedDeps = captureDepsAccesses(deps);
    const capturedInjects = captureDepsAccesses(inject);
    const hasDeferredDep = ensureValidDeferredDeps(capturedDeps, fnc);
    const finalFnc = fnc ?? (hasDeferredDep ? undefined : defaultDataFunction);

    monad[s.INTERNALS].nodes.data.set(n, {
      deps: capturedDeps,
      inject: capturedInjects,
      fnc: finalFnc,
      codeRef: getCodeLocation(3)
    });
    return monad;
  }
}
