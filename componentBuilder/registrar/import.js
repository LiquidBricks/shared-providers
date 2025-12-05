import { getCodeLocation, s } from "../help.js";
import { checkImportDefinition, ensureNew, normalizeNames } from "../validation.js";

export function makeImportRegistrar(monad) {
  return function importComponent(name, definition) {
    const { hash } = checkImportDefinition(definition);
    const [n] = normalizeNames(name, 'import');
    ensureNew([n], monad[s.INTERNALS].nodes.imports, 'import');

    monad[s.INTERNALS].nodes.imports.set(n, { hash, codeRef: getCodeLocation(3) });
    return monad;
  }
}
