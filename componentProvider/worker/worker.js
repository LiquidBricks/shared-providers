import { parentPort, workerData } from "node:worker_threads"
import { natsContext as createNatsContext } from '@liquid-bricks/shared-providers/nats-context'
import { diagnostics as createDiagnostics } from '@liquid-bricks/shared-providers/diagnostics'
import { componentProviderConsumer } from "../index.js";

const {
  workerIndex,
  NATS_IP,
  directories,
  streamName,
} = workerData;

parentPort.on('message', async (message) => {
  console.log(`worker(${workerIndex}).js: got message, `, { message })
  // parentPort.postMessage({ taskID, result });
});

const natsContext = createNatsContext({ servers: NATS_IP })

const diagnostics = createDiagnostics({
  context: () => ({ service: 'my-bricks', system: 'component-provider' }),
})
await componentProviderConsumer({
  streamName,
  natsContext,
  directories,
  diagnostics,
})
