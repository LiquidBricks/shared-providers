# Diagnostics Provider

Lightweight diagnostics utility that emits structured logs, integrates with metrics, supports sampling and rate limiting, and provides convenient assertions and timing. It returns a scoped diagnostics object you can compose across contexts.

## Import

```js
// ESM
import { diagnostics } from './index.js'; // adjust path as needed
```

## Factory: `diagnostics(options)`

- Signature: `diagnostics(options?: DiagnosticsOptions): Diagnostics`
- Parameters:
  - `logger` (default: `console`): Object with optional methods `error|warn|info|debug(entry)`.
  - `metrics` (default: `null`): Optional `{ count(code: string, n: number, meta?: object), timing(name: string, ms: number, meta?: object) }`.
  - `sample` (default: `(code, level, meta) => true`): Predicate to decide whether to emit.
  - `rateLimit` (default: internal token-bucket per `(code,level)`, 10 events/second burst): `(code?: string, level?: string) => boolean`.
  - `redact` (default: identity): `(meta?: object) => object` used to scrub meta fields before emission and error surfaces.
  - `now` (default: `() => Date.now()`): Clock function used for timestamps and timers.
  - `context` (default: `() => ({})`): Function providing ambient context merged into every emission and error meta. Common fields: `requestId`, `runId`, `subject`, `component`, etc.
- Returns: `Diagnostics` object (documented below).

### Basic usage

```js
import { diagnostics } from './index.js';

const diag = diagnostics();
diag.info('service starting');
```

### With custom logger, metrics, sampling, and redaction

```js
import { diagnostics } from './index.js';

const logs = [];
const logger = {
  error: (e) => logs.push(['error', e]),
  warn:  (e) => logs.push(['warn',  e]),
  info:  (e) => logs.push(['info',  e]),
  debug: (e) => logs.push(['debug', e]),
};

const metrics = {
  counts: {}, timings: [],
  count: (code, n, meta) => { metrics.counts[code] = (metrics.counts[code] || 0) + n; },
  timing: (name, ms, meta) => metrics.timings.push({ name, ms }),
};

// Only emit warn/error; drop info/debug
const sample = (code, level) => level === 'warn' || level === 'error';

// Redact PII
const redact = (meta) => ({ ...meta, ssn: undefined, password: undefined });

const diag = diagnostics({ logger, metrics, sample, redact, context: () => ({ component: 'api' }) });

diag.info('boot');                     // sampled out (not emitted)
diag.warn(false, 'CONFIG_MISSING', 'Using defaults', { env: 'dev', ssn: '123-45-6789' });
```

## Diagnostics object API

The object returned by `diagnostics()` exposes the following members.

### `invariant(cond, code, msg, meta)`

- Description: Asserts internal invariants. Throws when `cond` is falsy.
- Parameters: `cond: any`, `code: string`, `msg: string`, `meta?: object`.
- Returns: `void` (throws on failure).
- Errors: Throws `DiagnosticError` with `{ type: 'Invariant', code, message, meta }`.

```js
const diag = diagnostics();

// No throw
diag.invariant(1 + 1 === 2, 'MATH_OK', 'math works');

// Throws
try {
  diag.invariant(false, 'KV_INVARIANT_V_MISSING', 'value missing', { key: 'k' });
} catch (e) {
  if (e instanceof diag.DiagnosticError) {
    console.log('caught invariant', e.code);
  }
}
```

### `require(cond, code, msg, meta)`

- Description: Validates preconditions (inputs/contracts). Throws when `cond` is falsy.
- Parameters/Returns/Errors: Same shape as `invariant`, but `type: 'Precondition'`.

```js
const diag = diagnostics();
const input = null;
diag.require(input != null, 'INPUT_REQUIRED', 'input must be provided');
```

### `error(code, msg, meta, opts)`

- Description: Signals operational failure explicitly by throwing.
- Parameters: `code: string`, `msg: string`, `meta?: object`, `opts?: { cause?: Error }`.
- Returns: never (throws).
- Errors: Throws `DiagnosticError` with `{ type: 'Operational' }`. `opts.cause` is surfaced via `error.cause`.

```js
const diag = diagnostics();

try {
  const cause = new Error('db connect failed');
  diag.error('DB_CONNECT_FAIL', 'database unreachable', { host: 'db:5432' }, { cause });
} catch (e) {
  console.log(e.name, e.type, e.code, !!e.cause);
}
```

### `warn(cond, code, msg, meta)`

- Description: Emits a warning when `cond` is falsy. Does not throw.
- Parameters: `cond: any`, `code: string`, `msg: string`, `meta?: object`.
- Returns: `void`.

```js
const diag = diagnostics();

diag.warn(true, 'CACHE_STALE', 'stale cache');   // no-op
diag.warn(false, 'CACHE_STALE', 'stale cache');  // emits warn
```

### `info(msg, meta)` and `debug(msg, meta)`

- Description: Emits informational and debug entries.
- Parameters: `msg: string`, `meta?: object`.
- Returns: `void`.

```js
const diag = diagnostics();
diag.info('started', { pid: process.pid });
diag.debug('detail', { step: 1 });
```

### `once(key, fn)`

- Description: Ensures `fn` runs at most once per `key` for the process lifetime.
- Parameters: `key: string`, `fn?: () => any`.
- Returns: The return value of `fn` on first call, `undefined` thereafter.

```js
const diag = diagnostics();
let count = 0;
diag.once('init', () => { count++; });
diag.once('init', () => { count++; });
// count === 1
```

### `warnOnce(code, msg, meta)`

- Description: Convenience wrapper to emit a specific warning only once per process.
- Parameters: `code: string`, `msg: string`, `meta?: object`.
- Returns: `void`.

```js
const diag = diagnostics();
diag.warnOnce('DEPRECATED_CONFIG', 'use NEW_VAR instead', { file: '.env' });
diag.warnOnce('DEPRECATED_CONFIG', 'use NEW_VAR instead'); // suppressed
```

### `timer(name, baseMeta)` → `{ stop(extraMeta) -> ms }`

- Description: Measures elapsed time between creation and `stop()`, emits `info` entry and calls `metrics.timing` if provided.
- Parameters: `name: string`, `baseMeta?: object`.
- Returns: An object with `stop(extraMeta?: object): number` where the result is the measured milliseconds.

```js
const timings = [];
const diag = diagnostics({
  metrics: { count() {}, timing: (name, ms, meta) => timings.push({ name, ms }) },
});

const t = diag.timer('LOAD_USERS', { size: 42 });
await new Promise(r => setTimeout(r, 10));
const ms = t.stop({ source: 'db' });
console.log('took', ms, 'ms');
```

### `child(scopeMeta)`

- Description: Creates a new diagnostics object inheriting configuration and adding `scopeMeta` to context for all emissions.
- Parameters: `scopeMeta: object`.
- Returns: `Diagnostics`.

```js
const root = diagnostics({ context: () => ({ requestId: 'r-1' }) });
const svc = root.child({ component: 'user-service' });
svc.info('handling request'); // meta includes requestId + component
```

### `withContext(ctx, fn)`

- Description: Returns a child diagnostics instance with `ctx` merged into context. The `fn` parameter is not invoked by the current implementation (returned child can be used to run code manually within that context).
- Parameters: `ctx: object`, `fn?: any` (ignored).
- Returns: `Diagnostics` (same as `child(ctx)`).

```js
const diag = diagnostics();
const ctx = diag.withContext({ runId: 'run-42' });
ctx.debug('scoped value');
```

### `DiagnosticError`

- Description: Error class used by `invariant`, `require`, and `error`.
- Shape: `{ name: 'DiagnosticError', type: 'Invariant'|'Precondition'|'Operational', code: string, message: string, meta: object, cause?: { name, message } }`.
- Methods: Inherits from `Error`; has `toJSON()` for safe serialization.

```js
const diag = diagnostics();
try { diag.require(false, 'NEED_AUTH', 'auth required'); } catch (e) {
  if (e instanceof diag.DiagnosticError) {
    console.log(JSON.stringify(e));
  }
}
```

## Emission behavior

- Sampling: `sample(code, level, meta)` decides whether to emit; defaults to allow-all.
- Rate limiting: Per `(code,level)` token-bucket with ~10 events per 1000ms by default; excess events are dropped.
- Metrics: On `warn` and `error`, if `metrics` is provided, calls `metrics.count(code, 1, entry)`. `timer.stop()` calls `metrics.timing(name, ms, meta)`.
- Redaction: `meta` is passed through `redact()` before emission and when copied onto `DiagnosticError.meta`.
- Context: Each emission includes `{ ts, ...context(), ...payload }`.

## Common use cases

### 1) Validating inputs, timing, and structured failure

```js
import { diagnostics } from './index.js';

const diag = diagnostics({ context: () => ({ component: 'api' }) });

export async function handle(req) {
  diag.require(req.user, 'NEED_AUTH', 'authentication required', { path: req.path });

  const t = diag.timer('FETCH_USER');
  try {
    const user = await fetchUser(req.user.id);
    diag.invariant(user.active, 'USER_INACTIVE', 'user is inactive', { id: user.id });
    return { ok: true, user };
  } catch (cause) {
    diag.error('USER_FETCH_FAILED', 'could not fetch user', { id: req.user?.id }, { cause });
  } finally {
    t.stop({ path: req.path });
  }
}
```

### 2) One-time deprecation notice

```js
const diag = diagnostics();
diag.warnOnce('DEPRECATED_FLAG', 'Use --new-flag instead', { cmd: 'tool' });
```

### 3) Scoping per request and redacting secrets

```js
const redact = (m) => ({ ...m, token: undefined });
const root = diagnostics({ redact });

function perRequest(requestId) {
  return root.child({ requestId });
}

const d = perRequest('req-123');
d.info('begin', { token: 'secret' }); // token removed
```

### 4) Custom sampling and rate limiting

```js
// Drop debug, sample 10% of info, keep warn/error
const sample = (code, level) => level === 'debug' ? false : level === 'info' ? Math.random() < 0.1 : true;

// Allow only first 2 events per second for any given code+level
function rateLimit(code, level) {
  const key = `${level}:${code}`;
  const now = Date.now();
  rateLimit.b = rateLimit.b || new Map();
  const b = rateLimit.b.get(key);
  if (!b || now - b.ts > 1000) { rateLimit.b.set(key, { ts: now, n: 1 }); return true; }
  if (b.n < 2) { b.n++; return true; }
  return false;
}

const diag = diagnostics({ sample, rateLimit });
diag.info('maybe sampled');
```

## Notes

- The provider writes with `logger[level](entry)` where `entry` includes `ts`, `level`, optional `code`, `msg`, and `meta`.
- When both sampling and rate limiting are present, sampling is evaluated first, then rate limiting.
- `DiagnosticError.toJSON()` includes a safe subset of `cause` (`name`, `message`).

---

## Metrics Adapters

Two ready-to-use metrics adapters implement the `metrics` interface expected by `diagnostics()`:

- `createConsoleMetrics()`
  - Emits metrics as structured `info` logs via the global `console`.
  - Methods: `count(code, n = 1, meta)`, `timing(name, ms, meta)`.

- `createNatsMetrics({ natsContext, subjectRoot = 'metrics' })`
  - Publishes JSON metrics over NATS/JetStream using `natsContext.publish`.
  - Subjects: `${subjectRoot}.count` and `${subjectRoot}.timing`.

### Usage

```js
import { diagnostics } from './index.js';
import { createConsoleMetrics } from './metrics/console.js';
// or: import { createNatsMetrics } from './metrics/nats.js';

const metrics = createConsoleMetrics();
// const metrics = createNatsMetrics({ natsContext, subjectRoot: 'telemetry.metrics' });

const diag = diagnostics({ metrics });

diag.warn(false, 'CONFIG_MISSING', 'Using defaults', { env: 'dev' });
const t = diag.timer('startup');
// ... work ...
t.stop({ phase: 'init' });
```
