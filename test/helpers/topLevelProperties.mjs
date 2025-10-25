import test from 'node:test'
import assert from 'node:assert/strict'

function createCaptures() {
  const entries = []
  const ts = 1111111111111
  const natsContext = {
    publish: (_subject, json) => {
      try { entries.push(JSON.parse(json)) } catch { /* ignore */ }
      return Promise.resolve()
    }
  }
  const now = () => ts
  return { entries, extras: { natsContext, now }, ts }
}

export function testLoggerTopLevel({ title, mod, factoryName, makeOptions = () => ({}) }) {
  test(title, () => {
    assert.ok(mod && typeof mod === 'object', 'module not loaded')
    assert.equal(typeof mod[factoryName], 'function', `missing factory ${factoryName}`)
    assert.equal(mod.default, mod[factoryName], 'default export should equal factory')

    const { entries, extras, ts } = createCaptures()
    // Capture global console output for console logger
    const orig = { error: console.error, warn: console.warn, info: console.info, debug: console.debug }
    console.error = (e) => entries.push(e)
    console.warn = (e) => entries.push(e)
    console.info = (e) => entries.push(e)
    console.debug = (e) => entries.push(e)
    const instance = mod[factoryName]({ ...makeOptions(), ...extras })

    for (const k of ['error', 'warn', 'info', 'debug']) {
      assert.equal(typeof instance[k], 'function', `logger missing method: ${k}`)
    }

    // Emit one entry per level and validate top-level properties
    const attrsByLevel = { error: { which: 'error' }, warn: { which: 'warn' }, info: { which: 'info' }, debug: { which: 'debug' } }
    try {
      for (const level of Object.keys(attrsByLevel)) {
        instance[level](attrsByLevel[level])
      }

      // Validate that each level produced a structured entry with top-level properties
      for (const level of Object.keys(attrsByLevel)) {
        const entry = entries.find(e => e && e.level === level)
        assert.ok(entry, `expected emitted entry for level ${level}`)
        assert.equal(typeof entry.ts, 'number', 'missing ts')
        assert.equal(entry.ts, ts, 'ts should come from now()')
        assert.equal(entry.kind, 'log', 'kind should be log')
        assert.deepEqual(entry.attributes, attrsByLevel[level], 'attributes should be preserved')
      }
    } finally {
      console.error = orig.error; console.warn = orig.warn; console.info = orig.info; console.debug = orig.debug
    }
  })
}

export function testMetricsTopLevel({ title, mod, factoryName, makeOptions = () => ({}) }) {
  test(title, () => {
    assert.ok(mod && typeof mod === 'object', 'module not loaded')
    assert.equal(typeof mod[factoryName], 'function', `missing factory ${factoryName}`)
    assert.equal(mod.default, mod[factoryName], 'default export should equal factory')

    const { entries, extras, ts } = createCaptures()
    const orig = { info: console.info }
    console.info = (e) => entries.push(e)
    const instance = mod[factoryName]({ ...makeOptions(), ...extras })

    for (const k of ['count', 'timing']) {
      assert.equal(typeof instance[k], 'function', `metrics missing method: ${k}`)
    }

    try {
      instance.count('C1', 2, { a: 1 })
      instance.timing('boot', 42, { b: 2 })

      const countEntry = entries.find(e => e && e.type === 'count' && e.code === 'C1')
      assert.ok(countEntry, 'expected count entry')
      assert.equal(typeof countEntry.ts, 'number', 'missing ts on count')
      assert.equal(countEntry.ts, ts)
      assert.equal(countEntry.kind, 'metric', 'kind should be metric on count')
      assert.equal(countEntry.type, 'count')
      assert.equal(countEntry.n, 2)
      assert.deepEqual(countEntry.attributes, { a: 1 })

      const timingEntry = entries.find(e => e && e.type === 'timing' && e.name === 'boot')
      assert.ok(timingEntry, 'expected timing entry')
      assert.equal(typeof timingEntry.ts, 'number', 'missing ts on timing')
      assert.equal(timingEntry.ts, ts)
      assert.equal(timingEntry.kind, 'metric', 'kind should be metric on timing')
      assert.equal(timingEntry.type, 'timing')
      assert.equal(timingEntry.ms, 42)
      assert.deepEqual(timingEntry.attributes, { b: 2 })
    } finally {
      console.info = orig.info
    }
  })
}
