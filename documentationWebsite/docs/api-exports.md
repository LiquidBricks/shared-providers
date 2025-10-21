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
- `@liquid-bricks/shared-providers/subject/create` → `subjectFactory/create.js`
- `@liquid-bricks/shared-providers/subject/router` → `subjectFactory/router.js`
- `@liquid-bricks/shared-providers/codes` → `codes.js`
- `@liquid-bricks/shared-providers/diagnostics` → `diagnostics/diagnostics.js`
- `@liquid-bricks/shared-providers/diagnostics/metrics/nats` → `diagnostics/metrics/nats.js`
- `@liquid-bricks/shared-providers/diagnostics/metrics/console` → `diagnostics/metrics/console.js`

Example imports:

```js
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';
import { createSubject, router } from '@liquid-bricks/shared-providers/subject';
import { SUBJECT_TOKEN_COUNT } from '@liquid-bricks/shared-providers/codes';
```

## Canonical Examples

Comprehensive import map and minimal usages to verify resolution.

```js
// Primary (empty) entry – useful for side-effect-free presence checks
import '@liquid-bricks/shared-providers';

// NATS context
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';

// Subject factory (index exports both create and router)
import { createSubject, router } from '@liquid-bricks/shared-providers/subject';
// Direct subpaths
import { createSubject as createSubjectDirect } from '@liquid-bricks/shared-providers/subject/create';
import { router as routerDirect } from '@liquid-bricks/shared-providers/subject/router';

// Diagnostics and metrics adapters
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';
import { createConsoleMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/console';
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';

// Codes
import * as CODES from '@liquid-bricks/shared-providers/codes';

// Quick sanity use
const ncx = createNatsContext({ servers: 'nats://localhost:4222' });
const subj = createSubject().entity('user').action('created').toString();
const r = router({ tokens: ['entity','action'] });
const d = diagnostics({ metrics: createConsoleMetrics() });
r.route({ entity: 'user', action: 'created' }, { handler: () => d.info('ok') });
await r.request({ subject: 'user.created' });
```
