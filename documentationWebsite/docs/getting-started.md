---
id: getting-started
title: Getting Started
---

Install the package in your service:

```bash
npm install @liquid-bricks/shared-providers
```

Basic usage example:

```js
// ESM imports
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';
import { telemetry, basic, router } from '@liquid-bricks/shared-providers/subject';
import codes from '@liquid-bricks/shared-providers/codes';
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';

// Create or inject a NATS connection first, then:
const ncx = await createNatsContext({ servers: 'nats://localhost:4222' });

// Basic 9-part subject builder via barrel or subpath
const subj = basic.create({ context: 'users' }).action('created');
await ncx.publish(subj.toString(), { id: '123', name: 'Ada' });

diagnostics.info('User created event published', { subject: subj.toString() });
```

Notes

- This package is ESM-only (`type: module`). Use `import` in Node 18+.
- See the specific guides for deeper usage and patterns.

## Canonical Examples

All common imports and subject-builder variations in one place.

```js
// Subpath imports
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';
import { telemetry, basic, router } from '@liquid-bricks/shared-providers/subject';
import { router as makeRouter } from '@liquid-bricks/shared-providers/subject/router';
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';
import { createConsoleMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/console';
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';
import codes from '@liquid-bricks/shared-providers/codes';

// Subject builder: from empty, from object, from string
const s1 = basic.create()
  .env('dev').ns('core').tenant('t1').context('_')
  .channel('events').entity('user').action('created').version('v1').id('123')
  .toString();

const s2 = basic.create({ env: 'prod', ns: 'core', entity: 'invoice', action: 'paid' })
  .version('v1').id('abc').toString();

// From fully-qualified string (must be 9 tokens)
const s3 = basic.create('dev.core.t1._.events.user.created.v1.123').toString();

// Multi-setter; unknown/override errors
const sb = buildSubject().set({ env: 'dev', entity: 'user' });
try { sb.set({ foo: 'bar' }); } catch (e) { console.log(e.code === codes.SUBJECT_TOKEN_UNKNOWN); }
try { sb.entity('order'); } catch (e) { console.log(e.code === codes.SUBJECT_TOKEN_OVERRIDE); }

// Normalization: missing parts become '_'; get parts
const parts = buildSubject({ env: 'dev' }).version('v1').parts();
// -> ['dev','_','_','_','_','_','_','v1','_']

// Router alias import and usage
const r = makeRouter({ tokens: ['entity','action'] });
r.route({ entity: 'user', action: 'created' }, { handler: () => 'ok' });
await r.request({ subject: 'user.created' });

// Diagnostics with console and NATS metrics
const ncx = createNatsContext({ servers: 'nats://localhost:4222' });
const dConsole = diagnostics({ metrics: createConsoleMetrics() });
const dNats = diagnostics({ metrics: createNatsMetrics({ natsContext: ncx }) });
dConsole.info('hello');
dNats.warn(false, 'DEMO_WARN', 'something to notice');

// Custom metrics subject function (optional)
const dNatsCustom = diagnostics({
  metrics: createNatsMetrics({
    natsContext: ncx,
    subject: (kind) => `my.app.metrics.${kind}` // kind: 'count' | 'timing'
  })
})
dNatsCustom.info('using custom metrics subjects')
```
