import assert from "node:assert";
import { ERRORS } from "./errors.js";

const defaultDataDeps = ({ deferred: { deferred } }) => { }

export function checkDataDefinition(definition) {
  const options = definition === undefined ? {} : definition;
  assert(options && typeof options === 'object', ERRORS.requiresOptionsObject);
  const isEmptyDefinition = definition !== undefined && Object.keys(options).length === 0;
  const deps = options.deps === undefined
    ? ((definition === undefined || isEmptyDefinition) ? defaultDataDeps : [])
    : options.deps;
  const fnc = options.fnc;
  if (fnc !== undefined) {
    assert(typeof fnc === 'function', ERRORS.fncMustBeFunction);
  }
  const inject = options.inject;
  if (inject !== undefined) {
    assert(typeof inject === 'function', ERRORS.injectMustBeFunction);
  }
  return { deps, fnc, inject };
}

export function checkTaskDefinition(definition) {
  assert(definition && typeof definition === 'object', ERRORS.requiresOptionsObject);
  const { deps = [], fnc = () => { }, inject } = definition;
  assert(typeof fnc === 'function', ERRORS.fncMustBeFunction);
  if (inject !== undefined) {
    assert(typeof inject === 'function', ERRORS.injectMustBeFunction);
  }
  return { deps, fnc, inject };
}

export function checkImportDefinition(definition) {
  assert(definition && typeof definition === 'object', ERRORS.requiresOptionsObject);
  const { hash, inject } = definition;
  assert(typeof hash === 'string' && hash.trim() !== '', ERRORS.importHashMustBeString);
  if (inject !== undefined) {
    assert(typeof inject === 'function', ERRORS.injectMustBeFunction);
  }
  return { hash: hash.trim(), inject };
}

export function normalizeNames(nameOrNames, label = 'name') {
  assert(nameOrNames !== undefined, ERRORS.requiresLabelOrList(label));
  const list = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  assert(list.length > 0, ERRORS.requiresAtLeastOne(label));
  const normalized = list.map(n => {
    assert(typeof n === 'string', ERRORS.labelsMustBeStrings(label));
    const t = n.trim();
    assert(t !== '', ERRORS.labelsMustBeNonEmpty(label));
    return t;
  });
  const seen = new Set();
  for (const n of normalized) {
    assert(!seen.has(n), ERRORS.duplicateLabel(label, n));
    seen.add(n);
  }
  return normalized;
}

export function ensureNew(names, existing, label = 'name') {
  for (const n of names) {
    if (typeof existing.has === 'function') {
      assert(!existing.has(n), ERRORS.existingLabel(label, n));
    } else {
      assert(!existing[n], ERRORS.existingLabel(label, n));
    }
  }
}
