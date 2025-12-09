---
id: nats-context
title: NATS Context
---

`createNatsContext(config)` creates a lazy, memoized wrapper providing:

- `connection()` → underlying NATS connection
- `jetstream()` → JetStream client
- `jetstreamManager()` → JetStream manager
- `Kvm()` → Key/Value manager
- `bucket(name)` → lazily-created KV bucket handle
- `publish(subject, data)` → convenience publish via JetStream
- `close()` → close the underlying connection

Example:

```js
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';

const ncx = createNatsContext({ servers: 'nats://localhost:4222' });

// Lazily connects on first use
const js = await ncx.jetstream();
await js.publish('dev.core._._.events.user.created.v1.123', Uint8Array.from([1,2,3]));

// KV bucket
const users = await ncx.bucket('users');
await users.put('123', new TextEncoder().encode('Ada'));

await ncx.close();
```

Notes

- All getters are async factories and cache their results per process.
- Buckets are memoized per name on first access.

## Canonical Examples

All variations of accessors and common publish patterns.

```js
import createNatsContext from '@liquid-bricks/shared-providers/nats-context';

const ncx = createNatsContext({ servers: 'nats://localhost:4222' });

// 1) Lazy connection; reuse memoized instances
const conn1 = await ncx.connection();
const conn2 = await ncx.connection(); // same instance
console.log(conn1 === conn2); // true

// 2) JetStream client and manager
const js = await ncx.jetstream();
const jsm = await ncx.jetstreamManager();

// 3) Publish helpers
await ncx.publish('dev.core._._.events.user.created.v1.123', Uint8Array.from([1, 2, 3]));
await ncx.publish('dev.core._._.events.user.updated.v1.123', JSON.stringify({ id: '123', name: 'Ada' }));

// 4) KV access: manager + bucket (memoized per name)
const kvm = await ncx.Kvm();
const usersA = await ncx.bucket('users');
const usersB = await ncx.bucket('users');
console.log(usersA === usersB); // true
await usersA.put('123', new TextEncoder().encode('Ada'));

// 5) Error preconditions (bucket name must be non-empty string)
try { await ncx.bucket(''); } catch (e) { console.log('bucket name required'); }

// 6) Clean shutdown
await ncx.close();
```
