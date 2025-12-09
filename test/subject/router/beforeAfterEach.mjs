import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

test('beforeEach/afterEach wrap every stage hook', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []

  r.beforeEach(({ stage, index }) => { calls.push({ kind: 'before', stage, index }) })
  r.afterEach(({ stage, index, error }) => { calls.push({ kind: 'after', stage, index, error }) })

  function decode1() { calls.push({ kind: 'hook', stage: 'decode', name: 'decode1' }) }
  function decode2() { calls.push({ kind: 'hook', stage: 'decode', name: 'decode2' }) }
  function pre1() { calls.push({ kind: 'hook', stage: 'pre', name: 'pre1' }) }
  function handler() { calls.push({ kind: 'hook', stage: 'handler', name: 'handler' }); return 'H' }
  function post1() { calls.push({ kind: 'hook', stage: 'post', name: 'post1' }) }

  r.route({ a: 'x' }, {
    decode: [decode1, decode2],
    pre: [pre1],
    handler,
    post: [post1],
  })

  const { scope } = await r.request({ subject: 'x' })

  assert.equal(scope[s.scope.result], 'H')
  assert.deepEqual(
    calls.map((c) => c.kind === 'hook'
      ? `${c.kind}:${c.stage}:${c.name}`
      : `${c.kind}:${c.stage}:${c.index}:${c.error ? 'err' : 'ok'}`),
    [
      'before:decode:0:ok',
      'hook:decode:decode1',
      'after:decode:0:ok',
      'before:decode:1:ok',
      'hook:decode:decode2',
      'after:decode:1:ok',
      'before:pre:0:ok',
      'hook:pre:pre1',
      'after:pre:0:ok',
      'before:handler:0:ok',
      'hook:handler:handler',
      'after:handler:0:ok',
      'before:post:0:ok',
      'hook:post:post1',
      'after:post:0:ok',
    ]
  )
})

test('afterEach sees hook errors and runs before error handlers', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []

  r.beforeEach(({ stage }) => { calls.push('before:' + stage) })
  r.afterEach(({ stage, error }) => { calls.push('after:' + stage + ':' + (error ? error.message : 'ok')) })

  function badPre() { calls.push('pre'); throw new Error('boom-pre') }
  function onPreError({ error }) { calls.push('onPreError:' + error.message); return { handled: true } }

  r.route({ a: 'x' }, { pre: [badPre], handler() { calls.push('handler') }, onPreError: [onPreError] })

  const { scope } = await r.request({ subject: 'x' })

  assert.deepEqual(calls, ['before:pre', 'pre', 'after:pre:boom-pre', 'onPreError:boom-pre'])
  assert.equal(scope.handled, true)
  assert.equal(scope[s.scope.result], undefined)
})

test('before/after run once around pipeline and after receives exit metadata', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []

  r.before(({ stage }) => { calls.push({ kind: 'before', stage }) })
  r.after(({ stage, exitStage, error }) => { calls.push({ kind: 'after', stage, exitStage, error }) })

  function decode() { calls.push('decode') }
  function pre() { calls.push('pre') }
  function handler() { calls.push('handler'); return 'H' }
  function post() { calls.push('post') }

  r.route({ a: 'x' }, { decode: [decode], pre: [pre], handler, post: [post] })

  const { scope } = await r.request({ subject: 'x' })

  assert.equal(scope[s.scope.result], 'H')
  assert.deepEqual(calls, [
    { kind: 'before', stage: 'before' },
    'decode',
    'pre',
    'handler',
    'post',
    { kind: 'after', stage: 'after', exitStage: 'after', error: undefined },
  ])
})

test('after runs even when pre error handled and sees error with exit stage', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []

  r.before(() => { calls.push('before') })
  r.after(({ stage, exitStage, error }) => { calls.push(`after:${stage}:${exitStage}:${error?.message ?? 'ok'}`) })

  function badPre() { calls.push('pre'); throw new Error('boom') }
  function onPreError({ error }) { calls.push('onPreError:' + error.message); return { handled: true } }

  r.route({ a: 'x' }, { pre: [badPre], handler() { calls.push('handler') }, onPreError: [onPreError] })

  const { scope } = await r.request({ subject: 'x' })

  assert.deepEqual(calls, ['before', 'pre', 'onPreError:boom', 'after:after:pre:boom'])
  assert.equal(scope.handled, true)
  assert.equal(scope[s.scope.result], undefined)
})
