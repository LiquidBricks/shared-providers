import assert from "node:assert";
import { getCodeLocation, s } from "./help.js";
import { buildRegistration } from "./registration.js";
import { computeComponentHash } from "./hash.js";
import { ERRORS } from "./errors.js";
import { makeDataRegistrar } from "./registrar/data.js";
import { makeImportRegistrar } from "./registrar/import.js";
import { makeTaskRegistrar } from "./registrar/task.js";
import { makeExplain } from "./explain.js";

export function component(name = 'component') {
  assert(typeof name === 'string', ERRORS.labelsMustBeStrings('component'));
  const componentName = name.trim();
  assert(componentName !== '', ERRORS.labelsMustBeNonEmpty('component'));

  const monad = {
    [s.IDENTITY.COMPONENT]: true,
    [s.INTERNALS]: {
      name: componentName,
      nodes: {
        data: new Map(),
        tasks: new Map(),
        imports: new Map(),
      },
      debugInfo: (({
        file, line, column, functionName
      }) => ({ file, line, column, functionName }))(getCodeLocation(3)),
      init() {
        const { file, line, column } = monad[s.INTERNALS].debugInfo
        const url = `vscode://file/${file.slice(7)}:${line}:${column}`;
      },
      registration() {
        return buildRegistration({
          name: monad[s.INTERNALS].name,
          nodes: monad[s.INTERNALS].nodes,
          hash: monad[s.INTERNALS].hash(),
        })
      },


      hash() {
        return computeComponentHash(monad[s.INTERNALS].name, monad[s.INTERNALS].nodes)
      }
    },
  }

  monad.data = makeDataRegistrar(monad);
  monad.task = makeTaskRegistrar(monad);
  monad.import = makeImportRegistrar(monad);
  monad.explain = makeExplain(monad);
  monad.toJSON = () => monad[s.INTERNALS].registration();

  monad[s.INTERNALS].init()
  return monad
}
