import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('hooks receive info with subject, params, and tokens', async () => {
  const r = router({ tokens: ['ns'] })
  const seen = []

  const record = (stage) => ({ info }) => { seen.push({ stage, info }) }
  const handler = ({ info }) => { seen.push({ stage: 'handler', info }); return 'ok' }

  r.route({ ns: 'app' }, {
    tokens: ['kind', 'id'],
    decode: [record('decode')],
    pre: [record('pre')],
    handler,
    post: [record('post')],
  })

  const { info: resultInfo } = await r.request({ subject: 'app.metric.42' })
  const expectedParams = { ns: 'app', kind: 'metric', id: '42' }
  const expectedTokens = ['ns', 'kind', 'id']

  assert.equal(seen.length, 4)
  for (const { info } of seen) {
    assert.equal(info.subject, 'app.metric.42')
    assert.deepEqual(info.params, expectedParams)
    assert.deepEqual(info.tokens, expectedTokens)
    assert.equal(info, resultInfo)
  }
})

test('info is enriched with stage/index/fn for each hook call', async () => {
  const r = router({ tokens: ['ns'] })
  const seen = []

  function decode1({ info }) { seen.push({ name: 'decode1', stage: info.stage, index: info.index, fn: info.fn }) }
  function decode2({ info }) { seen.push({ name: 'decode2', stage: info.stage, index: info.index, fn: info.fn }) }
  function pre1({ info }) { seen.push({ name: 'pre1', stage: info.stage, index: info.index, fn: info.fn }) }
  function handlerFn({ info }) { seen.push({ name: 'handler', stage: info.stage, index: info.index, fn: info.fn }); return 'ok' }
  function post1({ info }) { seen.push({ name: 'post1', stage: info.stage, index: info.index, fn: info.fn }) }

  r.route({ ns: 'app' }, {
    decode: [decode1, decode2],
    pre: [pre1],
    handler: handlerFn,
    post: [post1],
  })

  await r.request({ subject: 'app' })

  assert.deepEqual(
    seen.map(({ name, stage, index }) => ({ name, stage, index })),
    [
      { name: 'decode1', stage: 'decode', index: 0 },
      { name: 'decode2', stage: 'decode', index: 1 },
      { name: 'pre1', stage: 'pre', index: 0 },
      { name: 'handler', stage: 'handler', index: 0 },
      { name: 'post1', stage: 'post', index: 0 },
    ]
  )
  for (const entry of seen) {
    assert.equal(typeof entry.fn, 'string')
    assert.ok(entry.fn.includes(entry.name))
  }
})

test('error hooks see failing hook metadata in info', async () => {
  const r = router({ tokens: ['a'] })
  let seen = null

  function badPre() { throw new Error('boom-pre') }
  function onPreError({ info }) { seen = { stage: info.stage, index: info.index, fn: info.fn } }

  r.route({ a: 'x' }, {
    pre: [badPre],
    handler() { return 'ok' },
    onPreError: [onPreError],
  })

  await r.request({ subject: 'x' })

  assert.deepEqual({ stage: seen.stage, index: seen.index }, { stage: 'pre', index: 0 })
  assert.equal(typeof seen.fn, 'string')
  assert.ok(seen.fn.includes('badPre'))
})
