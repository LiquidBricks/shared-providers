---
id: intro
title: Introduction
slug: /
---

Shared Providers is a small set of utilities for diagnostics and NATS context handling shared across Liquid Bricks services.

- Package: `@liquid-bricks/shared-providers`
- Exports: NATS context helpers, subject factory, diagnostics utilities, and error/status codes.

What you’ll find here:

- Quick install and usage examples
- Guides for NATS context and diagnostics
- Export map reference for consumers

## Canonical Examples

End-to-end usage showing how the pieces fit together: diagnostics, NATS context, subject builder, and router.

```js
// Imports
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';
import { telemetry, basic, router } from '@liquid-bricks/shared-providers/subject';
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';

// NATS context (lazy connect on first use)
const ncx = createNatsContext({ servers: 'nats://localhost:4222' });

// Diagnostics with NATS-backed metrics + ambient context
const d = diagnostics({
  context: () => ({ service: 'users', env: 'dev' }),
  metrics: createNatsMetrics({ natsContext: ncx, subjectRoot: 'metrics.shared' }),
});

// Subject builder for a 9-part subject (basic)
const subj = basic.create()
  .env('dev').ns('core').tenant('t1').context('_')
  .channel('events').entity('user').action('created')
  .version('v1').id('123');

// Router over (entity, action) with parent/child hooks
const r = router({ tokens: ['entity', 'action'], context: { diagnostics: d, ncx } });

r.route({ entity: 'user' }, {
  pre: [({ info, rootCtx }) => rootCtx.diagnostics.debug('enter:user', info)],
  post: [({ info, rootCtx }) => rootCtx.diagnostics.debug('exit:user', info)],
  children: [[
    { entity: 'user', action: 'created' },
    { handler: async ({ info, rootCtx }) => {
        const payload = { id: '123', name: 'Ada' };
        await rootCtx.ncx.publish(subj.toString(), JSON.stringify(payload));
        const bucket = await (await rootCtx.ncx.Kvm()) && await rootCtx.ncx.bucket('users');
        await bucket.put('123', new TextEncoder().encode(JSON.stringify(payload)));
        rootCtx.diagnostics.info('published user.created', { subject: info.subject });
        return 'ok';
      }
    }
  ]]
});

// Drive the router with a subject string (extra tokens ignored)
await r.request({ subject: 'user.created.extra' });

// Pretty print the trie and explain a request
console.log('\nTrie\n' + r.prettyTrie());
console.log('\nExplain', r.explain('user.created'));

await ncx.close();
```

## Custom Metrics Subjects

When publishing metrics over NATS, you can customize the subject fully by supplying a function that receives the kind of metric ('count' or 'timing') and returns the fully-qualified subject string.

```js
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';

const d = diagnostics({
  metrics: createNatsMetrics({
    natsContext: ncx,
    subject: (kind) => `my.app.metrics.${kind}`,
  })
});
```
