---
id: diagnostics
title: Diagnostics
---

`diagnostics(options)` produces a small, composable diagnostic utility with levels, error helpers, timers, and rate limiting.

API

- `invariant(cond, code, msg, meta)` → throw on invariant violation
- `require(cond, code, msg, meta)` → throw on precondition failure
- `error(code, msg, meta, opts)` → throw operational error
- `warn(cond, code, msg, meta)` → emit warn if cond is false
- `info(msg, meta)` / `debug(msg, meta)` → log entries
- `timer(name, baseMeta)` → returns `{ stop(extraMeta) }`
- `warnOnce(code, msg, meta)` → single-shot warn by code
- `child(scopeMeta)` / `withContext(ctx)` → contextualize

Options

- `logger` (default `console`) must expose `info|warn|error|debug`
- `metrics` optional: `{ count(code, n, meta), timing(name, ms, meta) }`
- `sample(code, level, meta)` boolean predicate for sampling
- `rateLimit(code, level)` token-bucket rate limit (default provided)
- `redact(meta)` scrubber applied before emission
- `now()` and `context()` hooks for timestamps and ambient context

Example

```js
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';

const d = diagnostics({
  context: () => ({ service: 'users', env: 'dev' })
});

const t = d.timer('db.query');
// ... do work
const ms = t.stop({ rows: 3 });

d.info('Query finished', { ms });
```

## Canonical Examples

Full surface area in one sequence: asserts, signals, timers, context, sampling, rate limiting, redaction, and metrics (console and NATS).

```js
import diagnostics from '@liquid-bricks/shared-providers/diagnostics';
import { createConsoleMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/console';
import { createNatsMetrics } from '@liquid-bricks/shared-providers/diagnostics/metrics/nats';
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';

const ncx = createNatsContext({ servers: 'nats://localhost:4222' });

// Custom logger with levels
const logger = console;

// Sampling: drop debug by default, keep errors
const sample = (code, level) => (level === 'debug' ? false : true);

// Redact secrets from meta
const redact = (m) => ({ ...m, secret: m?.secret ? '[REDACTED]' : undefined });

// Console metrics
const consoleMetrics = createConsoleMetrics();
// NATS metrics
const natsMetrics = createNatsMetrics({ natsContext: ncx, subjectRoot: 'metrics.shared' });

const d = diagnostics({
  logger,
  metrics: consoleMetrics,
  sample,
  redact,
  now: () => Date.now(),
  context: () => ({ service: 'users', env: 'dev', requestId: 'r-1' }),
});

// Switch to NATS metrics in a child context
const dMetricsNats = d.child({ component: 'publisher' });
dMetricsNats.child({}).info('using console metrics');
const dNats = diagnostics({ logger, metrics: natsMetrics, context: () => ({ component: 'publisher' }) });

// Asserts
try { d.require(false, 'REQ_FAIL', 'input required', { field: 'id' }); } catch (e) {}
try { d.invariant(1 === 2, 'INV_FAIL', 'math is off'); } catch (e) {}

// Operational error
try { d.error('OP_FAIL', 'something went wrong', { secret: 's3cr3t' }); } catch (e) {}

// Signals
d.warn(false, 'WARN_CODE', 'risky default', { threshold: 5 });
d.warnOnce('DEPRECATED_API', 'old method used');
d.info('started');
d.debug('this will be sampled out');

// Timer + metrics
const t = d.timer('db.query', { table: 'users' });
// ... work ...
const elapsed = t.stop({ rows: 2 });

// Child and withContext
const reqD = d.child({ requestId: 'r-2' });
reqD.info('child logger in request');

const scoped = d.withContext({ jobId: 'j-1' });
scoped.info('scoped context');

// Using NATS-backed metrics
const d2 = diagnostics({ logger, metrics: natsMetrics, context: () => ({ service: 'users' }) });
d2.info('published timing/count to NATS');

// Custom NATS metrics subjects
const natsMetricsCustom = createNatsMetrics({
  natsContext: ncx,
  subject: (kind) => `svc.metrics.${kind}` // 'count' | 'timing'
});
```
