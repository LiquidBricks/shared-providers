import test from 'node:test'
import assert from 'node:assert/strict'

import { createConsoleLogger } from '../../../diagnostics/loggers/console.js'

function patchConsole(calls) {
  const orig = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  }
  console.error = (e) => calls.push(['error', e])
  console.warn = (e) => calls.push(['warn', e])
  console.info = (e) => calls.push(['info', e])
  console.debug = (e) => calls.push(['debug', e])
  return () => {
    console.error = orig.error
    console.warn = orig.warn
    console.info = orig.info
    console.debug = orig.debug
  }
}

test('logs via global console with envelope', async () => {
  const calls = []
  const restore = patchConsole(calls)
  try {
    const cl = createConsoleLogger()
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
    assert.equal(e.kind, 'log')
    assert.equal(typeof e.ts, 'number')
    assert.equal(e.level, 'info')
    assert.equal(e.attributes.msg, 'msg')
    assert.deepEqual(e.attributes.meta, { k: 1 })
  } finally {
    restore()
  }
})

test('swallows console errors and ignores missing entries', async () => {
  const orig = { error: console.error, warn: console.warn }
  console.error = () => { throw new Error('boom') }
  console.warn = () => { throw new Error('boom') }
  try {
    const cl = createConsoleLogger()
    // Should not throw
    cl.error({ level: 'error', ts: Date.now(), msg: 'e' })
    cl.warn({ level: 'warn', ts: Date.now(), msg: 'w' })
    cl.info(null)
    cl.debug(undefined)
  } finally {
    console.error = orig.error
    console.warn = orig.warn
  }
})
