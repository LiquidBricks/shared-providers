import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { createNatsMetrics } from '../../../diagnostics/metrics/nats.js'

test('publishes count and timing with default subjects', async () => {
  const calls = []
  const natsContext = {
    publish: (subject, json) => {
      calls.push({ subject, json })
      return Promise.resolve()
    }
  }

  const now = Date.now()
  const metrics = createNatsMetrics({ natsContext })

  metrics.count('ERR_DB_CONNECT', 2, { host: 'db' })
  metrics.timing('startup', 123, { pid: 1 })

  // Allow the fire-and-forget async publish to run
  await delay(0)

  assert.equal(calls.length, 2)

  // Validate count publish
  assert.equal(calls[0].subject, 'metrics.count')
  const c0 = JSON.parse(calls[0].json)
  assert.equal(c0.type, 'count')
  assert.equal(c0.kind, 'metric')
  assert.equal(c0.code, 'ERR_DB_CONNECT')
  assert.equal(c0.n, 2)
  assert.deepEqual(c0.attributes, { host: 'db' })
  assert.equal(typeof c0.ts, 'number')
  assert.ok(c0.ts >= now - 5000 && c0.ts <= Date.now() + 5000)

  // Validate timing publish
  assert.equal(calls[1].subject, 'metrics.timing')
  const c1 = JSON.parse(calls[1].json)
  assert.equal(c1.type, 'timing')
  assert.equal(c1.kind, 'metric')
  assert.equal(c1.name, 'startup')
  assert.equal(c1.ms, 123)
  assert.deepEqual(c1.attributes, { pid: 1 })
  assert.equal(typeof c1.ts, 'number')
  assert.ok(c1.ts >= now - 5000 && c1.ts <= Date.now() + 5000)
})

test('uses custom subject root and ignores invalid inputs', async () => {
  const calls = []
  const natsContext = {
    publish: (subject, json) => {
      calls.push({ subject, json })
      return Promise.resolve()
    }
  }

  const metrics = createNatsMetrics({ natsContext, subjectRoot: 'my.app.metrics' })

  // Invalid inputs should be no-ops
  metrics.count('', 1)
  metrics.timing('valid', 'oops')

  // Valid
  metrics.count('OK')
  metrics.timing('load', 5)

  await delay(0)

  assert.equal(calls.length, 2)
  assert.equal(calls[0].subject, 'my.app.metrics.count')
  assert.equal(calls[1].subject, 'my.app.metrics.timing')
})

test('swallows publish errors (reject and throw) without unhandled rejection', async () => {
  const attempts = []
  // First call: reject; second call: throw synchronously
  let callIndex = 0
  const natsContext = {
    publish: (subject, json) => {
      attempts.push({ subject, json })
      callIndex++
      if (callIndex === 1) return Promise.reject(new Error('reject boom'))
      throw new Error('sync boom')
    }
  }

  const metrics = createNatsMetrics({ natsContext })

  // Capture unhandled rejections if any occur
  let unhandled = null
  const onUnhandled = (reason) => { unhandled = reason }
  process.once('unhandledRejection', onUnhandled)

  metrics.count('ERR')
  metrics.timing('t', 1)

  await delay(10)

  assert.equal(attempts.length, 2)
  assert.equal(unhandled, null)
})

test('emits debug traces when enabled (default subject)', async () => {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args)
  try {
    const natsContext = { publish: (_subject, _json) => Promise.resolve() }
    const metrics = createNatsMetrics({ natsContext, subjectRoot: 'metrics', debug: true, now: () => 1700000000000 })

    metrics.count('C1', 2, { a: 1 })
    metrics.timing('T1', 5, { b: 2 })
    // invalids to exercise skip paths
    metrics.count('', 1)
    metrics.timing('X', 'nope')

    await delay(0)

    const tags = logs
      .filter(a => Array.isArray(a) && a[0] === '[diagnostics][nats:metrics]')
      .map(a => a[1])

    // init and default subject resolution
    assert.ok(tags.includes('init'))
    assert.ok(tags.includes('subject:default'))
    // publish lifecycle + composition
    assert.ok(tags.includes('compose'))
    assert.ok(tags.includes('publish:start'))
    assert.ok(tags.includes('publish:json'))
    assert.ok(tags.includes('publish:ok'))
    // skipped invalids
    assert.ok(tags.includes('skip:invalid-count'))
    assert.ok(tags.includes('skip:invalid-timing'))
  } finally {
    console.log = orig
  }
})

test('emits debug traces for custom subject function', async () => {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args)
  try {
    const natsContext = { publish: (_subject, _json) => Promise.resolve() }
    const metrics = createNatsMetrics({
      natsContext,
      debug: true,
      subject: (kind) => `svc.metrics.${kind}`,
    })

    metrics.count('OK')
    await delay(0)

    const tags = logs
      .filter(a => Array.isArray(a) && a[0] === '[diagnostics][nats:metrics]')
      .map(a => a[1])

    assert.ok(tags.includes('subject:custom'))
  } finally {
    console.log = orig
  }
})
