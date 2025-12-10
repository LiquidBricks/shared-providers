import { decodeData, ackMessage, acknowledgeReceipt } from '../middleware.js'
import { create as createSubject } from '../../../subjectFactory/create/basic.js'
import { Codes } from '../../../componentAgent/codes.js'
import { s } from '../../../componentBuilder/help.js'

export const path = { channel: 'exec', entity: 'component', action: 'compute_result' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'deps', 'componentHash', 'name', 'type']),
  ],
  pre: [
    validateExecutionRequest,
  ],
  handler: executeNode,
  post: [
    publishComputedResult,
  ],
}

function validateExecutionRequest({ scope, rootCtx: { diagnostics, components }, message }) {
  const { instanceId, type, componentHash, name } = scope;
  diagnostics.require(typeof instanceId === 'string' && instanceId.length, Codes.PRECONDITION_REQUIRED, 'instanceId is required', { field: 'instanceId' });
  diagnostics.require(typeof componentHash === 'string' && componentHash.length, Codes.PRECONDITION_REQUIRED, 'componentHash is required', { field: 'componentHash' });
  diagnostics.require(typeof name === 'string' && name.length, Codes.PRECONDITION_REQUIRED, `${type} name is required`, { field: 'name' });

  const component = components.get(componentHash);
  diagnostics.require(component, Codes.PRECONDITION_INVALID, 'component not found for execution', { componentHash });

  const nodeType = {
    'data': 'data',
    'task': 'tasks',
  }[type]
  const node = component[s.INTERNALS].nodes[nodeType].get(name);
  diagnostics.require(node, Codes.PRECONDITION_INVALID, `${type} node not found on component`, { componentHash, name });
  console.log('RUN: ', instanceId, `${type}:${name}`, scope.deps)
  return { component, node };
}


async function executeNode({ rootCtx: { diagnostics }, scope: { node, instanceId, name, deps } }) {

  const result = await node.fnc({ deps });
  return { result };
}


async function publishComputedResult({ scope, rootCtx: { publish, diagnostics } }) {
  const { instanceId, result, type, name } = scope;
  const subject = createSubject()
    .env('prod')
    .ns('component-service')
    .context('component-agent')
    .entity('component')
    .channel('evt')
    .action(`result_computed`)
    .version('v1');

  console.log(instanceId, `${type}:${name}`, result)
  await publish(
    subject.build(),
    { instanceId, name, type, result }
  );
}
