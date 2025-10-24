import test from 'node:test'
import assert from 'node:assert/strict'

import { createConsoleLogger } from '../diagnostics/loggers/console.js'

test('logs to provided logger with prefix', async () => {
  const calls = []
  const logger = {
    error: (e) => calls.push(['error', e]),
    warn:  (e) => calls.push(['warn',  e]),
    info:  (e) => calls.push(['info',  e]),
    debug: (e) => calls.push(['debug', e]),
  }

  const cl = createConsoleLogger({ logger, prefix: 'app' })
  const base = { ts: Date.now(), msg: 'msg', meta: { k: 1 } }

  cl.error({ ...base, level: 'error' })
  cl.warn({ ...base, level: 'warn' })
  cl.info({ ...base, level: 'info' })
  cl.debug({ ...base, level: 'debug' })

  assert.equal(calls.length, 4)
  assert.equal(calls[0][0], 'error')
  assert.equal(calls[1][0], 'warn')
  assert.equal(calls[2][0], 'info')
  assert.equal(calls[3][0], 'debug')

  const e = calls[2][1]
  assert.equal(e.level, 'info')
  assert.equal(e.msg, 'msg')
  assert.deepEqual(e.meta, { k: 1 })
  assert.equal(e.source, 'app')
})

test('swallows logger errors and ignores missing entries', async () => {
  const logger = {
    error: () => { throw new Error('boom') },
    warn:  () => { throw new Error('boom') },
  }
  const cl = createConsoleLogger({ logger })
  // Should not throw
  cl.error({ level: 'error', ts: Date.now(), msg: 'e' })
  cl.warn({ level: 'warn', ts: Date.now(), msg: 'w' })
  cl.info(null)
  cl.debug(undefined)
})

