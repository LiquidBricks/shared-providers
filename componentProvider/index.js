import { AckPolicy, DeliverPolicy } from "@nats-io/jetstream";
import { getComponents } from "./componentOperations.js";
import { Codes } from './codes.js'
import { s } from '@liquid-bricks/shared-providers/component/builder/helper';
import { create as createSubject } from '@liquid-bricks/shared-providers/subject/create/basic'
import { createExecutionRouter } from './router/index.js'

export async function componentProviderConsumer({
  streamName,
  consumerName,
  natsContext,
  directories,
  diagnostics: d,
}) {
  const diagnostics = d.child({ consumerName })

  diagnostics.require(streamName, Codes.PRECONDITION_REQUIRED, 'streamName is required', { field: 'streamName' });
  diagnostics.require(natsContext, Codes.PRECONDITION_REQUIRED, 'connection is required', { field: 'natsContext' });
  diagnostics.require(directories, Codes.PRECONDITION_REQUIRED, 'directories is required', { field: 'directories' });
  diagnostics.require(Array.isArray(directories), Codes.PRECONDITION_INVALID, 'directories must be an array', { field: 'directories' });

  const client = await natsContext.connection();
  const jetstream = await natsContext.jetstream();
  const jetstreamManager = await natsContext.jetstreamManager()

  // publish registration for each loaded component over NATS
  const components = await getComponents(directories, diagnostics);
  diagnostics.require(components.size > 0, Codes.PRECONDITION_REQUIRED, 'No components found in directories: ' + directories.join(', '), { directories });
  for (const [, comp] of components) {
    const subject = createSubject()
      .env('prod')
      .ns('component-service')

      .entity('component')
      .channel('cmd')
      .action('register')
      .version('v1')

    client.publish(
      subject.build(),
      JSON.stringify({
        data: await comp[s.INTERNALS].registration()
      })
    );
  }

  // delete existing consumer (if any) before adding a fresh one
  try {
    await jetstreamManager.consumers.delete(streamName, consumerName)
  } catch (err) {
    // ignore if consumer does not exist or deletion fails non-fatally
  }

  await jetstreamManager.consumers.add(streamName, {
    durable_name: consumerName,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subjects: [
      'prod.component-service.*.*.exec.component.compute_result.v1.>',
    ]
  });
  const c = await jetstream.consumers.get(streamName, consumerName);
  const iter = await c.consume();

  const r = createExecutionRouter({ natsContext, diagnostics, components })

  new Promise(async () => {
    for await (const m of iter) {
      await r.request({ subject: m.subject, message: m })
    }
  })
}
