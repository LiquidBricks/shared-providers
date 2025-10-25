---
id: subject-router
title: Subject Router
---

Token-aware routing over dot-separated subjects. The router builds a trie across named tokens (e.g., `a`, `b`, `c`) and executes the most specific matching leaf.

## Factory: router(config)

Create a router bound to a fixed ordered token list. Requires `tokens`.
Optionally pass a `context` object which will be provided to all `pre`/`handler`/`post` calls as `rootCtx`. If omitted, `context` defaults to `{}`.

```js
import { router } from '@liquid-bricks/shared-providers/subject';

const r = router({ tokens: ['a', 'b', 'c'], context: { userId: 'u1' } });
```

Expected

- Missing `tokens` throws `ROUTER_CONFIG_TOKENS_REQUIRED`.

## Method: route(values, config)

Define a route at a partial token path. Values must use known tokens; either provide a `handler` or `children` (not both).

```js
const r = router({ tokens: ['a', 'b', 'c'] });

// Unknown token key -> ROUTER_TOKEN_UNKNOWN
try { r.route({ z: 'nope' }, { handler(){} }); } catch (e) { console.log(e.code); }

// Handler required when no children -> ROUTER_ROUTE_HANDLER_REQUIRED
try { r.route({ a: 'x' }); } catch (e) { console.log(e.code); }

// Handler forbidden with children -> ROUTER_ROUTE_HANDLER_FORBIDDEN
try {
  r.route({ a: 'x' }, { handler() {}, children: [[{ a: 'x', b: 'y' }, { handler() {} }]] });
} catch (e) { console.log(e.code); }

// Children are additive; cannot override parent values -> ROUTER_SUBROUTE_OVERRIDE
r.route({ a: 'x' }, { children: [[{ a: 'x', b: 'y' }, { handler(){ return 'ok'; } }]] });
try { r.route({ a: 'x' }, { children: [[{ a: 'z' }, { handler() {} }]] }); } catch (e) { console.log(e.code); }
```

### Hooks

Route definitions can include hooks that run during request execution. Hooks are configured on routes (or the default), and executed in a well-defined order when `request` runs the matching leaf.

#### Decode hooks

Use `decode` hooks to transform or validate the incoming `message` (or enrich `scope`) before `pre` hooks run. Typical use cases are parsing JSON strings, validating shapes, or extracting typed values. Decode hooks aggregate the same way as `pre`/`post` across parent/child routes.

- Configure on any route or on the default handler via `decode: [fn, ...]`.
- Each hook receives `{ rootCtx, info, message, scope }` and may return an object to merge into `scope`.
- Errors thrown in `decode` are routed to `onDecodeError` first, then `onError` (see Error Handling).

Example

```js
const r = router({ tokens: ['a'] });

const parseJson = ({ message }) => {
  if (typeof message === 'string') return { body: JSON.parse(message) };
};

r.route({ a: 'x' }, {
  decode: [parseJson],
  handler: ({ scope }) => ({ ok: true, name: scope.body?.name })
});

const { scope } = await r.request({ subject: 'x', message: '{"name":"Ada"}' });
// scope.body = { name: 'Ada' }; scope.result = { ok: true, name: 'Ada' }
```

#### Hook arguments

Every `decode`, `pre`, `handler`, and `post` is called with a single object containing:

- `rootCtx`: the router-level context object from `router({ context })`.
- `info`: execution metadata for this request
  - `subject`: the dot-separated subject string passed to `request`.
  - `params`: an object mapping each configured token name to its string value (or `undefined` when missing).
  - `tokens`: the array of configured token names in order.
- `message`: the value provided via `request({ subject, message })` (transparent passthrough).
- `scope`: a shared, per-request object across `decode` → `pre` → `handler` → `post`
  - If a hook/handler returns an object, its properties are merged into `scope`.
  - The handler’s return value is assigned under an internal symbol key on `scope` (see router internals export `s.scope.result`).

Example

```js
const r = router({ tokens: ['a', 'b'], context: { requestId: 'r-123' } });

const pre = ({ rootCtx, info, message, scope }) => {
  console.log(rootCtx.requestId, info.subject, info.params.a, message);
  return { startedAt: Date.now() }; // merged into scope
};

const handler = ({ scope }) => ({ handled: true }); // merged; also scope.result is set

const post = ({ scope }) => { scope.finished = true };

r.route({ a: 'x' }, { pre: [pre], handler, post: [post] });
const { scope } = await r.request({ subject: 'x.y', message: { hello: 'world' } });
// scope: { startedAt: <ts>, handled: true, finished: true, result: { handled: true } }
```

#### Hook order and aggregation

```js
const r = router({ tokens: ['a', 'b'] });
const calls = [];
const pdecode = ({ info }) => calls.push('pdecode:' + info.params.a + (info.params.b || ''));
const ppre = ({ info }) => calls.push('ppre:' + info.params.a + (info.params.b || ''));
const ppost = ({ info }) => calls.push('ppost:' + info.params.a + (info.params.b || ''));
const cdecode = ({ info }) => calls.push('cdecode:' + info.params.a + info.params.b);
const cpre = ({ info }) => calls.push('cpre:' + info.params.a + info.params.b);
const cpost = ({ info }) => calls.push('cpost:' + info.params.a + info.params.b);
const handler = ({ info }) => { calls.push('handler:' + info.params.a + info.params.b); return 'HC'; };

r.route({ a: 'x' }, {
  decode: [pdecode],
  pre: [ppre],
  post: [ppost],
  children: [[{ a: 'x', b: 'y' }, { decode: [cdecode], pre: [cpre], handler, post: [cpost] }]]
});

const { info } = await r.request({ subject: 'x.y' });
```

Expected

- Order is parent decode -> child decode -> parent pre -> child pre -> handler -> child post -> parent post.
- calls -> `['pdecode:xy', 'cdecode:xy', 'ppre:xy', 'cpre:xy', 'handler:xy', 'cpost:xy', 'ppost:xy']`; `scope.result` -> `'HC'`

#### Async hooks preserve order

```js
const ra = router({ tokens: ['a'] });
const order = [];
const pre1 = async ({ info }) => { await Promise.resolve(); order.push('pre1:' + info.params.a); };
const pre2 = async ({ info }) => { await new Promise(r => setTimeout(r, 0)); order.push('pre2:' + info.params.a); };
const post1 = async ({ info }) => { await Promise.resolve(); order.push('post1:' + info.params.a); };
const h = async ({ info }) => { order.push('handler:' + info.params.a); return 'HA'; };
ra.route({ a: 'x' }, { pre: [pre1, pre2], handler: h, post: [post1] });
await ra.request({ subject: 'x' });
```

Expected

- order -> `['pre1:x', 'pre2:x', 'handler:x', 'post1:x']`

## Method: default(config)

Register a fallback handler for when no route matches. Must provide `handler`; no `children` allowed.

```js
const r = router({ tokens: ['a'] });
r.default({ handler: ({ info }) => `default:${info.subject}` });
```

Expected

- If no route matches, default runs.

## Method: request(`{ subject, message }`)

Parse subject into tokens, pick the highest-score match, and execute the route’s hooks and handler. The `rootCtx` used by hooks/handlers comes from `router({ context })`.

### Subject mapping

```js
const r = router({ tokens: ['a', 'b', 'c'], context: {} });

let res;
res = await r.request({ subject: 'x.y.z' });
res = await r.request({ subject: 'one.two.three.four' });
res = await r.request({ subject: 'x' });
```

Expected

- For 'x.y.z' → `{ a: 'x', b: 'y', c: 'z' }`
- For 'one.two.three.four' → `{ a: 'one', b: 'two', c: 'three' }` (extra parts ignored)
- For 'x' → `{ a: 'x', b: undefined, c: undefined }` (missing tokens are undefined)

### Matching specificity

```js
const r = router({ tokens: ['a', 'b'] });
const calls = [];
function onA({ info }) { calls.push('A:' + info.params.a); return 'A'; }
function onAB({ info }) { calls.push('AB:' + info.params.a + info.params.b); return 'AB'; }
r.route({ a: 'x' }, { handler: onA });
r.route({ a: 'x', b: 'y' }, { handler: onAB });

const { info } = await r.request({ subject: 'x.y' });
```

Expected

- Only the most specific route executes; calls -> `['AB:xy']`; `scope.result` -> `'AB'`

 

### Default fallback

```js
const r = router({ tokens: ['a'] });
const calls = [];
const onA = ({ info }) => { calls.push('onA'); return 'A'; };
const ddef = ({ info }) => { calls.push('dhandler'); return 'D'; };
r.route({ a: 'x' }, { handler: onA });
r.default({ handler: ddef });

let { info } = await r.request({ subject: 'z' });
calls.length = 0;
({ info } = await r.request({ subject: 'x' }));
```

Expected

- No match -> default runs and returns `'D'`; route match -> default not invoked.

## Error Handling

Define error handlers at the same places you define hooks/handlers: per route or default.

- `onDecodeError`: handles errors thrown by `decode` hooks.
- `onPreError`: handles errors thrown by `pre` hooks.
- `onHandlerError`: handles errors thrown by the `handler`.
- `onPostError`: handles errors thrown by `post` hooks.
- `onError`: generic error handler (runs after the specific one for the stage).

Rules

- Order: stage-specific first (pre/handler/post), then generic (`onError`).
- Scope locality: handlers run LIFO by scope (child before parent).
- Cascading: only proceeds to the next handler if the current one throws; otherwise exactly one handler runs and the pipeline stops.
- Return values: if an error handler returns an object, it is merged into `scope`; the original error is exposed as `scope.error`.

```js
const calls = [];
const r = router({ tokens: ['a'] });

const pdecode = () => { calls.push('pdecode'); throw new Error('E0'); };
const ppre = () => { calls.push('ppre'); throw new Error('E1'); };

// Parent route with generic onError
r.route({ a: 'x' }, {
  decode: [pdecode],
  pre: [ppre],
  onError: [({ error, stage }) => { calls.push('parent:onError:' + stage + ':' + error.message); throw error; }],
  children: [[
    // Child adds a stage-specific handler that handles and stops (decode stage)
    { a: 'x' }, { onDecodeError: [({ error }) => { calls.push('child:onDecodeError:' + error.message); return { result: 'ERR' }; }] }
  ]]
});

const { scope } = await r.request({ subject: 'x' });
// calls -> ['pdecode', 'child:onDecodeError:E0']
// scope.result === 'ERR'; scope.error is Error('E0'); parent:onError not reached.
```

## Method: explain(subject)

Compute best match and competitors without executing any hooks or handlers.

```js
const r = router({ tokens: ['a', 'b'] });
function bOnly() { return 'B'; }
function childHandler() { return 'HC'; }
r.route({ b: 'y' }, { handler: bOnly });
r.route({ a: 'x' }, { children: [[{ a: 'x', b: 'y' }, { handler: childHandler }]] });

const exp = r.explain('x.y');
```

Expected

- `exp.best.handlerName` -> `'childHandler'`; `exp.best.score` -> `2`
- `exp.competing` includes the lower-score `bOnly` route.
- When no route matches, `best.kind` is `'default'` (if set).

## Abort Flow

The router provides a per-request AbortController exposed on `scope` via a symbol, and a router-level abort handler.

- `s.scope.ac` (symbol): imported as `s` from `@liquid-bricks/shared-providers/subject/router` and used to access the controller on `scope[s.scope.ac]`.
- `router().abort(fn)`: register a single abort handler. Runs when the request’s AbortController is aborted.
- Pipeline checks `signal.aborted` before each `decode`, before each `pre`, before the `handler`, and before each `post`. If aborted, processing stops immediately and the abort handler runs.
- If the abort handler returns an object, it is merged into `scope`. No error handlers run on abort.
  - Abort handler signature: `({ reason, signal, stage, index, fn, rootCtx, info, message, scope })`.

Example: abort in a pre hook

```js
import { router } from '@liquid-bricks/shared-providers/subject';
import { s } from '@liquid-bricks/shared-providers/subject/router';

const r = router({ tokens: ['a'] })

r.abort(({ reason, stage, scope }) => {
  // reason carries the value passed to abort(reason)
  return { status: `aborted-${stage}`, reason }
})

r.route({ a: 'x' }, {
  pre: [({ scope }) => {
    const ac = scope[s.scope.ac]
    ac.abort('cut')
  }],
  handler() { /* never reached */ },
  post: [() => {}] // never reached
})

const { scope } = await r.request({ subject: 'x' })
// scope.status === 'aborted-pre'
// scope.reason === 'cut'
```

Example: abort in post, preserving handler result

```js
import { s } from '@liquid-bricks/shared-providers/subject/router';

const r = router({ tokens: ['a'] })
r.abort(() => ({ status: 'post-aborted' }))

r.route({ a: 'x' }, {
  handler: () => 'H',
  post: [({ scope }) => scope[s.scope.ac].abort('stop'), () => {/* not reached */}]
})

const { scope } = await r.request({ subject: 'x' })
// scope[s.scope.result] === 'H' (handler result preserved)
// scope.status === 'post-aborted'
```

## Method: prettyTrie()

Return a text view of the trie and mark leaf nodes with handler names.

```js
const r = router({ tokens: ['a', 'b', 'c', 'd'] });
function onBD() {}
function onAXBYCZ() {}
r.route({ b: 'y', d: 'w' }, { handler: onBD }).default({ handler(){} });
r.route({ a: 'x', b: 'y', c: 'z' }, { handler: onAXBYCZ });

console.log(r.prettyTrie());
```

Output

```
default [leaf:handler]
a=x
  b=y
    c=z [leaf:onAXBYCZ]
b=y
  d=w [leaf:onBD]
```

## Canonical Examples

A complete set covering configuration, routes, hooks, defaults, errors, matching, explain, and trie output.

```js
import { router } from '@liquid-bricks/shared-providers/subject';

// 1) Configure router with context
const ctx = { requestId: 'r1' };
const r = router({ tokens: ['a','b','c'], context: ctx });

// 2) Define routes: parent with hooks, child handler
const calls = [];
const ppre = ({ info }) => calls.push('ppre:' + info.params.a + (info.params.b||''));
const ppost = ({ info }) => calls.push('ppost:' + info.params.a + (info.params.b||''));
const cpre = ({ info }) => calls.push('cpre:' + info.params.a + info.params.b);
const cpost = ({ info }) => calls.push('cpost:' + info.params.a + info.params.b);
function onAXBY() { calls.push('handler:xy'); return 'H1'; }

r.route({ a: 'x' }, {
  pre: [ppre],
  post: [ppost],
  children: [[{ a: 'x', b: 'y' }, { pre: [cpre], handler: onAXBY, post: [cpost] }]]
});

// 3) Additional specific route competing on lower score
function onBOnly() { calls.push('handler:By'); return 'HB'; }
r.route({ b: 'y' }, { handler: onBOnly });

// 4) Default fallback
function onDefault() { calls.push('handler:default'); return 'HD'; }
r.default({ handler: onDefault });

// 5) Request matching
let res;
res = await r.request({ subject: 'x.y' }); // best: onAXBY
res = await r.request({ subject: '_.y' }); // best: onBOnly (default ignored)
res = await r.request({ subject: 'no.match' }); // best: default

// 6) Hook order preserves async
const ra = router({ tokens: ['a'] });
const order = [];
const pre1 = async ({ info }) => { await Promise.resolve(); order.push('pre1:' + info.params.a); };
const pre2 = async ({ info }) => { await new Promise(r => setTimeout(r, 0)); order.push('pre2:' + info.params.a); };
const post1 = async ({ info }) => { await Promise.resolve(); order.push('post1:' + info.params.a); };
const h = async ({ info }) => { order.push('handler:' + info.params.a); return 'HA'; };
ra.route({ a: 'x' }, { pre: [pre1, pre2], handler: h, post: [post1] });
await ra.request({ subject: 'x' });

// 7) Explain competing routes
const exp = r.explain('x.y');
console.log(exp.best.handlerName); // 'onAXBY'
console.log(exp.competing.map(c => c.handlerName)); // ['onBOnly']

// 8) Pretty trie
console.log(r.prettyTrie());

// 9) Errors and safeguards
try { router({}); } catch (e) { console.log(e.code === 'ROUTER_CONFIG_TOKENS_REQUIRED'); }
try { router({ tokens: [] }); } catch (e) { console.log(e.code === 'ROUTER_TOKENS_REQUIRED'); }
try { r.route({ z: 'nope' }, { handler(){} }); } catch (e) { console.log(e.code === 'ROUTER_TOKEN_UNKNOWN'); }
try { r.route({ a: 'x' }); } catch (e) { console.log(e.code === 'ROUTER_ROUTE_HANDLER_REQUIRED'); }
try { r.route({ a: 'x' }, { handler() {}, children: [[{ a: 'x', b: 'y' }, { handler() {} }]] }); } catch (e) { console.log(e.code === 'ROUTER_ROUTE_HANDLER_FORBIDDEN'); }
try { r.route({ a: 'x' }, { children: [[{ a: 'z' }, { handler(){} }]] }); } catch (e) { console.log(e.code === 'ROUTER_SUBROUTE_OVERRIDE'); }
try { r.route({ a: 'x' }, { children: [[{ a: 'x' }]] }); } catch (e) { console.log(e.code === 'ROUTER_CHILDREN_SHAPE_INVALID'); }
try { await r.request(null); } catch (e) { console.log(e.code === 'ROUTER_SUBJECT_REQUIRED'); }
```

Additional “competing” example showcasing two different best-vs-lower-score branches.

```js
const r2 = router({ tokens: ['a','b'] });
function onA() { return 'A'; }
function onAB() { return 'AB'; }
function onB() { return 'B'; }
r2.route({ a: 'x' }, { handler: onA });
r2.route({ a: 'x', b: 'y' }, { handler: onAB });
r2.route({ b: 'y' }, { handler: onB });

const e1 = r2.explain('x.y');
// best: onAB (score 2), competing: onA (score 1), onB (score 1)
console.log(e1.best.handlerName, e1.best.score);        // 'onAB', 2
console.log(e1.competing.map(c => [c.handlerName, c.score]));
```
