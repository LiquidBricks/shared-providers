import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics } from '../../diagnostics/diagnostics.js'
import * as diagnosticsMod from '../../diagnostics/diagnostics.js'
import { DiagnosticError } from '../../diagnostics/DiagnosticError.js'
import pkg from '../../package.json' with { type: 'json' }

function createCapturingLogger() {
  const calls = []
  const make = (level) => (entry) => calls.push([level, entry])
  return { calls, logger: { error: make('error'), warn: make('warn'), info: make('info'), debug: make('debug') } }
}

test('exports and API surface', () => {
  assert.ok(diagnosticsMod && typeof diagnosticsMod === 'object')
  assert.ok(typeof diagnosticsMod.diagnostics === 'function', 'expected named export diagnostics()')
  assert.equal('default' in diagnosticsMod, false, 'unexpected default export on diagnostics module')

  const noop = () => { }
  const d = diagnosticsMod.diagnostics({
    logger: { error: noop, warn: noop, info: noop, debug: noop },
    rateLimit: () => true,
    sample: () => true,
  })

  const expectedKeys = [
    'invariant', 'require', 'error', 'warn', 'info', 'debug',
    'once', 'warnOnce', 'timer', 'child', 'withContext', 'DiagnosticError'
  ]
  for (const k of expectedKeys) {
    assert.ok(k in d, `missing diagnostics property: ${k}`)
  }
  assert.equal(typeof d.invariant, 'function')
  assert.equal(typeof d.require, 'function')
  assert.equal(typeof d.error, 'function')
  assert.equal(typeof d.warn, 'function')
  assert.equal(typeof d.info, 'function')
  assert.equal(typeof d.debug, 'function')
  assert.equal(typeof d.once, 'function')
  assert.equal(typeof d.warnOnce, 'function')
  assert.equal(typeof d.timer, 'function')
  assert.equal(typeof d.child, 'function')
  assert.equal(typeof d.withContext, 'function')
  assert.equal(typeof d.DiagnosticError, 'function')
})

test('emits structured logs, redacts meta, and counts warn/error', () => {
  const { calls, logger } = createCapturingLogger()
  const counts = {}
  const metrics = {
    count: (code, n) => { counts[code] = (counts[code] || 0) + n },
    timing: () => { }
  }

  const diag = diagnostics({
    logger,
    metrics,
    sample: () => true,
    rateLimit: () => true,
    redact: (m) => ({ ...m, secret: undefined }),
    now: () => 1111111111111,
    context: () => ({ requestId: 'r-1', component: 'svc' })
  })

  diag.info('hello', { secret: 'x', vis: 1 })
  diag.warn(false, 'W1', 'be careful', { secret: 'x', vis: 2 })

  // error() throws; capture and inspect DiagnosticError
  let caught
  const cause = new Error('boom cause')
  try {
    diag.error('E1', 'boom', { secret: 'x', more: true }, { cause })
  } catch (e) {
    caught = e
  }

  // Logs: info, warn, error (from error())
  assert.equal(calls.length, 3)

  // Validate info entry
  const [l0, e0] = calls[0]
  assert.equal(l0, 'info')
  // level is implied by the logger method (l0)
  assert.equal(e0.msg, 'hello')
  assert.equal(e0.component, 'svc')
  assert.equal(e0.requestId, 'r-1')
  assert.deepEqual(e0.meta, { secret: undefined, vis: 1 })

  // Validate warn entry and metrics count for code
  const [l1, e1] = calls[1]
  assert.equal(l1, 'warn')
  // level is implied by the logger method (l1)
  assert.equal(e1.code, 'W1')
  assert.equal(e1.msg, 'be careful')
  assert.deepEqual(e1.meta, { secret: undefined, vis: 2 })
  assert.equal(counts.W1, 1)

  // Validate error entry and metrics count
  const [l2, e2] = calls[2]
  assert.equal(l2, 'error')
  // level is implied by the logger method (l2)
  assert.equal(e2.code, 'E1')
  assert.equal(e2.msg, 'boom')
  assert.deepEqual(e2.meta, { secret: undefined, more: true })
  assert.equal(counts.E1, 1)

  // DiagnosticError shape
  assert.ok(caught)
  assert.equal(caught.name, 'DiagnosticError')
  assert.equal(caught.type, 'Operational')
  assert.equal(caught.code, 'E1')
  assert.equal(caught.message, 'boom')
  // meta includes redacted meta plus context
  assert.deepEqual(caught.meta, { requestId: 'r-1', component: 'svc', secret: undefined, more: true })
  assert.ok(caught.cause instanceof Error)
  const safe = caught.toJSON()
  assert.deepEqual(safe.cause, { name: 'Error', message: 'boom cause' })
})

test('invariant and require throw DiagnosticError with types', () => {
  const { logger } = createCapturingLogger()
  const diag = diagnostics({ logger, rateLimit: () => true, sample: () => true })

  try { diag.invariant(false, 'INV', 'broken') } catch (e) {
    assert.equal(e.name, 'DiagnosticError'); assert.equal(e.type, 'Invariant'); assert.equal(e.code, 'INV')
  }
  try { diag.require(false, 'REQ', 'need it') } catch (e) {
    assert.equal(e.name, 'DiagnosticError'); assert.equal(e.type, 'Precondition'); assert.equal(e.code, 'REQ')
  }
})

test('respects provided rate limiter', () => {
  const { calls, logger } = createCapturingLogger()
  const counts = {}
  const metrics = { count: (code, n) => { counts[code] = (counts[code] || 0) + n }, timing: () => { } }

  // Allow only first 2 events per (code,level)
  const seen = new Map()
  const rateLimit = (code = 'NO_CODE', level = 'info') => {
    const key = `${level}:${code}`
    const n = seen.get(key) || 0
    if (n < 2) { seen.set(key, n + 1); return true }
    return false
  }

  const diag = diagnostics({ logger, metrics, rateLimit, sample: () => true })

  diag.warn(false, 'RL', 'one')
  diag.warn(false, 'RL', 'two')
  diag.warn(false, 'RL', 'three') // dropped

  assert.equal(calls.filter(([lvl]) => lvl === 'warn').length, 2)
  assert.equal(counts.RL, 2)
})

test('timer emits info, records timing, and returns duration', () => {
  const { calls, logger } = createCapturingLogger()
  const timings = []
  const metrics = { count: () => { }, timing: (name, ms, meta) => timings.push({ name, ms, meta }) }

  let tick = 1000
  const now = () => (tick += 10)

  const diag = diagnostics({ logger, metrics, now, rateLimit: () => true, sample: () => true })

  const t = diag.timer('LOAD', { base: 1 })
  const ms = t.stop({ extra: 2 })

  assert.equal(ms, 10)
  assert.equal(timings.length, 1)
  assert.equal(timings[0].name, 'LOAD')
  assert.equal(timings[0].ms, 10)
  assert.deepEqual(timings[0].meta, { base: 1, extra: 2, duration_ms: 10 })

  // An info entry with code TIMER_LOAD and msg 'timer.stop' is emitted
  const infoEntries = calls.filter(([lvl, e]) => lvl === 'info' && e.code === 'TIMER_LOAD')
  assert.equal(infoEntries.length, 1)
  assert.equal(infoEntries[0][1].msg, 'timer.stop')
  assert.deepEqual(infoEntries[0][1].meta, { base: 1, extra: 2, duration_ms: 10 })
})

test('child and withContext compose context; warnOnce only logs once per code', () => {
  const { calls, logger } = createCapturingLogger()
  const root = diagnostics({ logger, rateLimit: () => true, sample: () => true, context: () => ({ a: 1 }) })

  const child = root.child({ b: 2 })
  child.info('m', { x: 1 })

  const ctx = root.withContext({ runId: 'r-42' })
  ctx.debug('d')

  // Top-level entries include context fields
  const info = calls.find(([lvl]) => lvl === 'info')[1]
  assert.equal(info.a, 1); assert.equal(info.b, 2)
  const debug = calls.find(([lvl]) => lvl === 'debug')[1]
  assert.equal(debug.a, 1); assert.equal(debug.runId, 'r-42')

  const uniq = `ONCE_${Date.now()}_${Math.random().toString(36).slice(2)}`
  root.warnOnce(uniq, 'only once')
  root.warnOnce(uniq, 'only once again')

  const warnCount = calls.filter(([lvl, e]) => lvl === 'warn' && e.code === uniq).length
  assert.equal(warnCount, 1)
})

test('diagnostic errors are instanceof the shared DiagnosticError export', () => {
  const { logger } = createCapturingLogger()
  const diag = diagnostics({ logger, rateLimit: () => true, sample: () => true })

  let caught
  try {
    diag.error('INSTANCE', 'boom')
  } catch (err) {
    caught = err
  }

  assert.ok(caught instanceof DiagnosticError, 'expected thrown DiagnosticError to match exported class')
  assert.equal(diag.DiagnosticError, DiagnosticError, 'diagnostics factory should surface the shared DiagnosticError')
})

