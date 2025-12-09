---
id: api-exports
title: Export Map
---

This package is ESM-only and ships an export map for clean subpath imports.

Primary entry:

- `@liquid-bricks/shared-providers` → `index.js` (empty side-effect-free module)

Subpath exports:

- `@liquid-bricks/shared-providers/nats-context` → `natsContext.js`
- `@liquid-bricks/shared-providers/subject` → `subjectFactory/index.js`
- `@liquid-bricks/shared-providers/subject/create/basic` → `subjectFactory/create/basic.js`
- `@liquid-bricks/shared-providers/subject/router` → `subjectFactory/router/index.js`
- `@liquid-bricks/shared-providers/codes` → `codes.js`
- `@liquid-bricks/shared-providers/diagnostics` → `diagnostics/diagnostics.js`
- `@liquid-bricks/shared-providers/diagnostics/metrics/nats` → `diagnostics/metrics/nats.js`
- `@liquid-bricks/shared-providers/diagnostics/metrics/console` → `diagnostics/metrics/console.js`

Example imports:

```js
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';
import { telemetry, router } from '@liquid-bricks/shared-providers/subject';
// Router internals (symbols for AbortController and result access)
import { s } from '@liquid-bricks/shared-providers/subject/router';
import { SUBJECT_TOKEN_COUNT } from '@liquid-bricks/shared-providers/codes';
```

## Canonical Examples

Comprehensive import map and minimal usages to verify resolution.

```js
// Primary (empty) entry – useful for side-effect-free presence checks
import '@liquid-bricks/shared-providers';

// NATS context
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';

// Subject factory barrel: namespaced builders + router
import { telemetry, basic, router } from '@liquid-bricks/shared-providers/subject';
// Direct subpaths for specific builders
import { create as createBasic } from '@liquid-bricks/shared-providers/subject/create/basic';
import { create as createTelemetry } from '@liquid-bricks/shared-providers/subject/create/telemetry';

// Diagnostics and metrics adapters
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';
import { createConsoleMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/console';
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';

// Codes
import * as CODES from '@liquid-bricks/shared-providers/codes';

// Quick sanity use
const ncx = createNatsContext({ servers: 'nats://localhost:4222' });
const tele = telemetry.create().log().version('v1').toString();
const subj = basic.create().entity('user').action('created').toString();
const r = router({ tokens: ['entity','action'] });
const d = diagnostics({ metrics: createConsoleMetrics() });
r.route({ entity: 'user', action: 'created' }, { handler: () => d.info('ok') });
await r.request({ subject: 'user.created' });

// NATS metrics with custom subject function
const dNats = diagnostics({
  metrics: createNatsMetrics({
    natsContext: ncx,
    subject: (kind) => `svc.metrics.${kind}`
  })
})
```
