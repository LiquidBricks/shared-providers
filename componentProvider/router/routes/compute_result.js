import { decodeData, ackMessage, acknowledgeReceipt } from '../middleware.js'
import { create as createSubject } from '@liquid-bricks/shared-providers/subject/create/basic'
import { Codes } from '../../codes.js'
import { s } from '@liquid-bricks/shared-providers/component/builder/helper'

export const path = { channel: 'exec', entity: 'component', action: 'compute_result' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'deps', 'componentHash', 'name', 'type']),
  ],
  pre: [
    acknowledgeReceipt,
    validateExecutionRequest,
  ],
  handler: executeNode,
  post: [
    publishComputedResult,
    ackMessage,
  ],
}

function validateExecutionRequest({ scope, rootCtx: { diagnostics, components } }) {
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

  return { component, node };
}


async function executeNode({ rootCtx: { diagnostics }, scope: { node, instanceId, name, deps } }) {
  const result = await node.fnc({ deps });
  return { result };
}


async function publishComputedResult({ scope, rootCtx: { natsContext, diagnostics } }) {
  const { instanceId, result, type, name } = scope;
  const subject = createSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action(`result_computed`)
    .version('v1');

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, name, type, result } })
  );
}
