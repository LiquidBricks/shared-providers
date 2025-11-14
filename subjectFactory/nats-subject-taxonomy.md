# NATS Subject Taxonomy for `componentService`

> A practical, exhaustive guide to naming, routing, and isolating NATS/JetStream subjects across environments, tenants, and tests — optimized for left‑to‑right matching and non‑overlapping streams.

---

## 0) Why a taxonomy?

* **No stream overlap errors:** JetStream requires that a subject belongs to exactly one stream. Clear, disjoint patterns prevent `subjects overlap with an existing stream`.
* **Fast routing:** NATS subjects are matched left‑to‑right. Put the highest‑entropy discriminators first for cheap matching.
* **Observability & scale:** Channels (cmd/evt/qry/log/dlq) map cleanly to retention, replay, and analytics.
* **Tenancy & tests:** One seam (namespace) yields isolation without sprinkling prefixes everywhere.

---

## 1) Core schema (recommended)

```
<env>.<ns>.<tenant>.<context>.<channel>.<entity>.<action>.<version>.<id?>
```

### Tokens

* **env**: lifecycle boundary. `dev | stage | prod | test` (extend with region if needed).
* **ns**: namespace/org/app. Default to your product root (e.g., `sb` for Skillburst). Use a **test namespace** in tests (e.g., `test.<runId>`).
* **tenant**: multi‑tenant discriminator. Use `t.<slug>`; `_` for non‑MT or systemwide.
* **context**: bounded context or service area: `componentService | workflow | billing | auth`.
* **channel**: message kind: `cmd | evt | qry | snap | log | dlq | audit`.
* **entity**: domain entity: `componentInstance | spec | task | session | user | invoice`.
* **action**: verb (cmd) or event name (evt). `create | start | stopped | updated | completed`.
* **version**: protocol/schema version. `v1 | v2`. Enables parallel rollouts.
* **id (optional)**: stable identifier at the tail for targeted routing and grepability.

> **Rule:** Streams must be **disjoint**. Don’t assign `a.>` to one stream and `a.b.>` to another.

---

## 2) Level‑by‑level guidance (with examples)

### 2.1 env

* **Purpose:** Hard boundary for retention, replay, and auth. Prevents cross‑env leaks.
* **Values:** `dev | stage | prod | test` (extend with `prod.us-east`, `prod.eu-west` if regional).
* **Good:** `prod.cs._.componentService.evt.componentInstance.started.v1.01HF...`
* **Wildcarding:** `prod.*` grabs all prod namespaces; `prod.>` grabs **everything** prod — use with care.

### 2.2 ns (namespace)

* **Purpose:** Org/app root. Enables **test isolation** without touching other tokens.
* **Values:** `cs` (for componentService), or `sb` (platform root). In tests, `test.<ulid>`.
* **Good:** `prod.cs._.componentService.cmd.componentInstance.start.v1`
* **Test:** `prod.test.01HF...._.componentService.cmd.componentInstance.start.v1`
* **Anti‑pattern:** Baking `test` deeper (e.g., before `entity`) — harder to filter.

### 2.3 tenant

* **Purpose:** Multi‑tenant isolation.
* **Values:** `t.<slug>` or `_` (systemwide). Example: `t.acme`, `t.01HF…`.
* **Good:** `prod.cs.t.acme.componentService.evt.task.completed.v1.45XY`
* **Filtering:** `*.cs.t.acme.componentService.evt.>`

### 2.4 context

* **Purpose:** Bounded context / service area for stream partitioning and consumer ownership.
* **Values:** `componentService | workflow | billing | auth | document`.
* **Good:** `prod.cs._.componentService.evt.componentInstance.stopped.v1.01HF…`

### 2.5 channel

* **Purpose:** Semantics + retention/tuning per message class.
* **Values:**

  * `cmd` – durable commands (JS). Retain until executed/ack’d.
  * `evt` – facts/events (JS). Retain per business window, often longer.
  * `qry` – **core NATS req/reply** (non‑JS). No retention.
  * `snap` – snapshots state (JS). Optional.
  * `log` – structured logs (JS). Short retention.
  * `dlq` – dead‑letter queue (JS). Manual/automated reprocessing.
  * `audit` – compliance.
* **Good (per‑channel):** `*.cs._.componentService.cmd.>`, `*.cs._.componentService.evt.>`
* **Anti‑pattern:** Catch‑all `componentService.>` alongside `componentService.cmd.>` in another stream (overlap).

### 2.6 entity

* **Purpose:** Domain entity for consumer routing and ownership.
* **Values:** `componentInstance | spec | task | session | edge | flow | user`.
* **Good:** `prod.cs._.componentService.evt.componentInstance.started.v1.<instanceId>`

### 2.7 action

* **Purpose:** Intent or occurred fact.
* **Cmd examples:** `create | start | stop | cancel | retry | delete`.
* **Evt examples:** `created | started | stopped | canceled | retried | deleted | updated | completed | failed`.
* **Good:** `prod.cs._.componentService.cmd.componentInstance.start.v1`

### 2.8 version

* **Purpose:** Protocol/schema version. Keep parallel `v1` & `v2` during migrations.
* **Good:** `…start.v1` and `…start.v2` consumed by different durables.
* **Header alternative:** If you dislike subject bloat, move schema version to headers (tradeoff: harder filtering by subject alone).

### 2.9 id (tail, optional)

* **Purpose:** Address a single aggregate or shard.
* **Good:** `…evt.componentInstance.started.v1.01HF…`
* **Note:** Keep ID **last** to preserve upstream selectivity and enable `…v1.<id>` filtering.

---

## 3) End‑to‑end examples (componentService)

### Commands (JetStream)

```
prod.cs._.componentService.cmd.componentInstance.create.v1
prod.cs._.componentService.cmd.componentInstance.start.v1
prod.cs.t.acme.componentService.cmd.task.retry.v1
prod.cs.t.01HFF2F6.componentService.cmd.spec.create.v1
```

### Events (JetStream)

```
prod.cs._.componentService.evt.componentInstance.created.v1.01HF…
prod.cs._.componentService.evt.componentInstance.started.v1.01HF…
prod.cs.t.acme.componentService.evt.task.completed.v1.45XY…
prod.cs._.componentService.evt.spec.created.v1.77AB…
```

### Queries (Core NATS req/reply)

```
prod.cs._.componentService.qry.componentInstance.get.v1
prod.cs._.componentService.qry.task.status.v1
```

### Logs & DLQ (JetStream)

```
prod.cs._.componentService.log.error.v1
prod.cs._.componentService.log.warn.v1
prod.cs._.componentService.dlq.componentInstance.v1
prod.cs._.componentService.dlq.task.v1
```

### Snapshots (optional)

```
prod.cs._.componentService.snap.componentInstance.state.v1.01HF…
```

---

## 4) Stream designs (no‑overlap patterns)

Choose one; all are safe if you keep them disjoint.

### A) Per‑channel (recommended)

* **CS_CMD** → `subjects: ["*.cs.*.componentService.cmd.>"]`
* **CS_EVT** → `subjects: ["*.cs.*.componentService.evt.>"]`
* **CS_LOG** → `subjects: ["*.cs.*.componentService.log.>"]`
* **CS_DLQ** → `subjects: ["*.cs.*.componentService.dlq.>"]`

**Why:** Different retention and consumer behaviors per class; simple mental model.

### B) Per context

* **CS_ALL** → `subjects: ["*.cs.*.componentService.>"]`

**Why:** Small deployments; consumers do the slicing with `filter_subject`.

### C) Per tenant (only if truly massive)

* **CS_EVT_TENANT** → `subjects: ["*.cs.t.*.componentService.evt.>"]`

**Why:** Hard isolation by tenant at storage layer (operationally heavier).

> **Overlap trap:** Don’t combine `*.cs.*.componentService.>` with `*.cs.*.componentService.evt.>` in separate streams. The former is a superset of the latter.

---

## 5) Consumer filters & delivery examples

### Filter by channel

```js
await jsm.consumers.add('CS_EVT', {
  durable_name: 'cs-evt-v1',
  filter_subject: 'prod.cs._.componentService.evt.>' ,
  ack_policy: 'explicit',
});
```

### Filter by tenant + entity

```js
await jsm.consumers.add('CS_EVT', {
  durable_name: 'cs-evt-acme-ci',
  filter_subject: 'prod.cs.t.acme.componentService.evt.componentInstance.>'
});
```

### Filter a single aggregate

```js
await jsm.consumers.add('CS_EVT', {
  durable_name: 'ci-01HF-listener',
  filter_subject: 'prod.cs._.componentService.evt.componentInstance.>.01HFABCDE',
});
```

### Parallel test isolation via namespace

```js
const ns = `test.${ulid()}`;
await jsm.consumers.add('CS_EVT', {
  durable_name: `evt-${ns}`,
  filter_subject: `prod.${ns}._.componentService.evt.>`
});
```

---

## 6) Testing & tenancy strategies

### Option 1 — **Namespace seam** (same server, no code sprawl)

* Prod: `ns = 'cs'` (or empty if you prefer)
* Tests: `ns = 'test.<runId>'`
* Streams subscribe to `*.cs.*.componentService.<channel>.>` and `*.test.*.*` **does not collide**.
* Publishers in tests can use a shim that prefixes `ns` automatically.

### Option 2 — Separate **account** or **ephemeral server**

* Fully isolated JetStream state, same subjects. Zero risk of overlap.

### Reuse a single TEST stream

* `TEST` → `subjects: ['test.>']`
* Each test uses `filter_subject: 'test.<run>.componentService.>'`

---

## 7) Versioning & migrations

* Run `v1` & `v2` in parallel: create separate durables and gradually shift publishers.
* Subjects:

  * `…cmd.componentInstance.start.v1`
  * `…cmd.componentInstance.start.v2`
* Consumers:

  * `durable: cs-cmd-v1`, `filter_subject: …start.v1`
  * `durable: cs-cmd-v2`, `filter_subject: …start.v2`
* Decommission: stop publishing `v1`, retain for replay window, then drop the durable.

---

## 8) Failure handling & DLQ

### DLQ shape mirrors source channel

* From `cmd` → `dlq.componentInstance.v1`
* From `evt` → `dlq.componentInstance.v1`

### Example consumer with max deliveries & backoff

```js
await jsm.consumers.add('CS_CMD', {
  durable_name: 'cs-cmd-ci-v1',
  filter_subject: 'prod.cs._.componentService.cmd.componentInstance.v1',
  ack_policy: 'explicit',
  max_deliver: 5,
  backoff: [1000, 5000, 10000], // ms
});
```

### Requeue to DLQ on failure

* On final NAK, publish to: `prod.cs._.componentService.dlq.componentInstance.v1`
* Include headers: `error_code`, `error_reason`, `correlation_id`, `original_subject`.

---

## 9) Tracing & headers (recommended)

Use NATS message headers for:

* `ce_id` – unique message id (CloudEvents style)
* `ce_source` – origin service
* `ce_type` – event type (mirrors subject slice)
* `ce_time` – ISO timestamp
* `correlation_id` – request/command id
* `causation_id` – parent event id
* `schema_version` – if you omit `v1` in subjects

This keeps subjects stable while enabling deep tracing.

---

## 10) Code utilities (Node.js)

### 10.1 Subject factory (single seam)

```js
// subjects.js
export function makeSubjects({ env = 'prod', ns = 'cs', tenant = '_' } = {}) {
  const base = [env, ns, tenant, 'componentService'];
  const j = (...parts) => [...base, ...parts.filter(Boolean)].join('.');
  return {
    cmd: (entity, action, v = 'v1') => j('cmd', entity, action, v),
    evt: (entity, action, v = 'v1', id) => j('evt', entity, action, v, id),
    qry: (entity, action, v = 'v1') => j('qry', entity, action, v), // core NATS
    log: (level = 'error', v = 'v1') => j('log', level, v),
    dlq: (entity, v = 'v1') => j('dlq', entity, v),
    filter: {
      channel: (ch) => j(ch, '>'),
      entity: (ch, entity) => j(ch, entity, '>'),
      tenant: () => [env, ns, tenant, 'componentService', '>'].join('.'),
      all: () => j('>'),
    }
  };
}
```

### 10.2 Namespace publish shim (no call‑site changes)

```js
// nsPublish.js
export const nsPublish = (nc, ns) => ({
  publish: (subj, data, opts) => nc.publish(ns ? `${subj.replace(/^([^.]+)/, `$1.${ns}`)}` : subj, data, opts)
});
// or simpler if ns is positioned after env:
export const withNs = (nc, ns) => ({
  publish: (subj, data, opts) => nc.publish(ns ? subj.replace(/^(\w+)\./, `$1.${ns}.`) : subj, data, opts)
});
```

### 10.3 Minimal consumer wiring

```js
import { connect, StringCodec } from 'nats';
import { makeSubjects } from './subjects.js';

const sc = StringCodec();
const nc = await connect({ servers: process.env.NATS_URL });
const js = nc.jetstream();
const jsm = await nc.jetstreamManager();

const s = makeSubjects({ env: 'prod', ns: 'cs', tenant: '_' });

await jsm.streams.add({ name: 'CS_CMD', subjects: ['*.cs.*.componentService.cmd.>'] }).catch(()=>{});
await jsm.consumers.add('CS_CMD', {
  durable_name: 'cs-cmd-ci-v1',
  filter_subject: s.filter.entity('cmd','componentInstance'),
  ack_policy: 'explicit',
});

// subscribe
const sub = await js.pullSubscribe(s.filter.entity('cmd','componentInstance'), { durable: 'cs-cmd-ci-v1' });
for await (const m of sub) {
  try {
    const body = sc.decode(m.data);
    // handle command
    m.ack();
  } catch (e) {
    m.nak();
  }
}
```

### 10.4 Test harness with namespace isolation

```js
import { ulid } from 'ulid';
import { makeSubjects } from './subjects.js';

const ns = `test.${ulid()}`;
const s = makeSubjects({ env: 'prod', ns, tenant: '_' });

await jsm.consumers.add('CS_EVT', {
  durable_name: `evt-${ns}`,
  filter_subject: s.filter.channel('evt'),
});

await js.publish(s.cmd('componentInstance','start'), sc.encode(JSON.stringify({ instanceId: 'X' })));
```

### 10.5 Subject validator (optional)

```js
const RE = /^(dev|stage|prod|test)\.(\w[\w.-]*)\.(?:t\.[\w.-]+|_)\.(\w+)\.(cmd|evt|qry|snap|log|dlq|audit)\.(\w+)\.(\w+)\.(v\d+)(?:\.(.+))?$/;
export function validateSubject(subj) {
  const m = subj.match(RE);
  if (!m) throw new Error(`Invalid subject: ${subj}`);
  return {
    env: m[1], ns: m[2], tenant: m[3], context: m[4], channel: m[5], entity: m[6], action: m[7], version: m[8], id: m[9]
  };
}
```

---

## 11) Migration mapping (example)

| Old                           | New                                                         |
| ----------------------------- | ----------------------------------------------------------- |
| `componentService.command`    | `prod.cs._.componentService.cmd.componentInstance.start.v1` |
| `componentService.event.*`    | `prod.cs._.componentService.evt.<entity>.<event>.v1.<id>`   |
| `log.error`                   | `prod.cs._.componentService.log.error.v1`                   |
| `query.componentInstance.get` | `prod.cs._.componentService.qry.componentInstance.get.v1`   |

> Do migrations per channel. Start by moving `log` first (lowest risk), then `qry`, then `evt`, then `cmd`.

---

## 12) Operational tips

* **Retention:** EVT streams long; CMD shorter; LOG shortest; DLQ until processed.
* **Consumers:** Prefer **durable pull** for backpressure; use queue groups for horizontal scale.
* **Backoff:** Use exponential backoff arrays in consumer config.
* **Replay:** EVT streams enable time‑travel debugging; don’t over‑prune.
* **Sharding:** If needed, insert region after env: `prod.us-east.cs…` for locality.
* **Auth:** Consider separate accounts per env/region; least‑privilege per client.

---

## 13) Do & Don’t

**Do**

* Put discriminators early: `env → ns → tenant → context → channel …`
* Keep streams disjoint; validate with a script before deploy.
* Use `filter_subject` to carve along tenant/entity/version.
* Version either in subject or headers; be consistent.

**Don’t**

* Mix `a.>` with `a.b.>` across streams.
* Hide test prefixes deep in the subject; keep them right after `env` as `ns`.
* Couple publishers to concrete stream names; bind by subject only.

---

## 14) Quick cheat‑sheet

```
# Command
{env}.{ns}.{tenant}.componentService.cmd.{entity}.{action}.{v}

# Event
{env}.{ns}.{tenant}.componentService.evt.{entity}.{event}.{v}.{id}

# Query (core NATS)
{env}.{ns}.{tenant}.componentService.qry.{entity}.{action}.{v}

# Log & DLQ
{env}.{ns}.{tenant}.componentService.log.{level}.{v}
{env}.{ns}.{tenant}.componentService.dlq.{entity}.{v}
```

**Filters**

```
# by channel
{env}.{ns}.{tenant}.componentService.{channel}.>
# by entity
{env}.{ns}.{tenant}.componentService.{channel}.{entity}.>
# by tenant
{env}.{ns}.{tenant}.componentService.>
```

---

## 15) "What is" vs "What could be"

* **What is (baseline you can adopt now):** the 9‑token schema, per‑channel streams, namespace seam for tests, and subject factory.
* **What could be (optional later):** regional token after env, audit channel, moving version to headers, per‑tenant streams for very large data volumes.

---

## 16) Coverage & deviations

* **Coverage:** This taxonomy cleanly handles ~90% of routing, replay, multi‑tenancy, and testing needs in NATS/JetStream setups.
* **Deviations you might choose:** If you rarely use `qry`, you can omit it and keep synchronous reads over a GraphQL service. If you never replay events, shorten EVT retention and rely on snapshots.

---

## 17) Sanity checklist (pre‑deploy)

* [ ] No stream subject overlaps (script‑checked)
* [ ] Commands/events/logs routed to correct streams
* [ ] Consumers configured with explicit `filter_subject`
* [ ] Namespace seam wired for tests
* [ ] Version policy decided (subject vs headers)
* [ ] DLQ story implemented and monitored
* [ ] Tracing headers (correlation/causation) added where needed
