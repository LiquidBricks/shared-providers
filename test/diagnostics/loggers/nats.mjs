import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { createNatsLogger } from '../../../diagnostics/loggers/nats.js'

test('publishes log levels with default subjects', async () => {
  const calls = []
  const natsContext = {
    publish: (subject, json) => {
      calls.push({ subject, json })
      return Promise.resolve()
    }
  }

  const logger = createNatsLogger({ natsContext })

  const base = { ts: Date.now(), msg: 'm', meta: { a: 1 } }
  logger.error({ ...base, level: 'error' })
  logger.warn({ ...base, level: 'warn' })
  logger.info({ ...base, level: 'info' })
  logger.debug({ ...base, level: 'debug' })

  await delay(0)

  assert.equal(calls.length, 4)
  assert.equal(calls[0].subject, 'logs.error')
  assert.equal(calls[1].subject, 'logs.warn')
  assert.equal(calls[2].subject, 'logs.info')
  assert.equal(calls[3].subject, 'logs.debug')

  const e = JSON.parse(calls[0].json)
  assert.equal(e.kind, 'log')
  assert.equal(typeof e.ts, 'number')
  assert.equal(e.level, 'error')
  assert.equal(e.attributes.msg, 'm')
  assert.deepEqual(e.attributes.meta, { a: 1 })
})

test('uses custom subject function for log levels', async () => {
  const calls = []
  const natsContext = {
    publish: (subject, json) => {
      calls.push({ subject, json })
      return Promise.resolve()
    }
  }

  const logger = createNatsLogger({
    natsContext,
    subject: (level) => `svc.logs.${level}`,
  })

  logger.info({ ts: Date.now(), level: 'info', msg: 'ok' })
  logger.warn({ ts: Date.now(), level: 'warn', msg: 'w' })

  await delay(0)

  assert.equal(calls.length, 2)
  assert.equal(calls[0].subject, 'svc.logs.info')
  assert.equal(calls[1].subject, 'svc.logs.warn')
})

test('swallows publish errors without unhandled rejection', async () => {
  const attempts = []
  let i = 0
  const natsContext = {
    publish: (subject, json) => {
      attempts.push({ subject, json })
      i++
      if (i === 1) return Promise.reject(new Error('reject'))
      throw new Error('sync')
    }
  }

  const logger = createNatsLogger({ natsContext })

  let unhandled = null
  const onUnhandled = (r) => { unhandled = r }
  process.once('unhandledRejection', onUnhandled)

  logger.error({ level: 'error', ts: Date.now(), msg: 'e' })
  logger.info({ level: 'info', ts: Date.now(), msg: 'i' })

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
    const logger = createNatsLogger({ natsContext, subjectRoot: 'logs', debug: true, now: () => 1700000000000 })

    logger.info({ msg: 'ok' })
    // Also exercise skip when attributes are missing
    logger.debug()

    await delay(0)

    const tags = logs
      .filter(a => Array.isArray(a) && a[0] === '[diagnostics][nats:logger]')
      .map(a => a[1])

    // init and default subject resolution
    assert.ok(tags.includes('init'))
    assert.ok(tags.includes('subject:default'))
    // publish lifecycle + composition
    assert.ok(tags.includes('compose'))
    assert.ok(tags.includes('publish:start'))
    assert.ok(tags.includes('publish:json'))
    assert.ok(tags.includes('publish:ok'))
    // empty attributes skip
    assert.ok(tags.includes('skip:empty-attributes'))
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
    const logger = createNatsLogger({
      natsContext,
      debug: true,
      subject: (level) => `svc.logs.${level}`,
    })

    logger.warn({ msg: 'warn' })
    await delay(0)

    const tags = logs
      .filter(a => Array.isArray(a) && a[0] === '[diagnostics][nats:logger]')
      .map(a => a[1])

    assert.ok(tags.includes('subject:custom'))
  } finally {
    console.log = orig
  }
})
