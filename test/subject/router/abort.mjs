import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

test('abort in pre stops pipeline and runs router abort handler', async () => {
  assert.equal(typeof s.scope.ac, 'symbol')

  const r = router({ tokens: ['a'] })
  const calls = []

  r.abort(({ reason, stage }) => {
    calls.push('abort:' + stage + ':' + String(reason))
    return { status: 'aborted-pre' }
  })

  const pre1 = ({ scope }) => {
    calls.push('pre1')
    const ac = scope[s.scope.ac]
    assert.ok(ac && typeof ac.abort === 'function' && ac.signal)
    ac.abort('cut')
  }
  const pre2 = () => { calls.push('pre2') }
  const handler = () => { calls.push('handler') }
  const post1 = () => { calls.push('post1') }

  r.route({ a: 'x' }, { pre: [pre1, pre2], handler, post: [post1] })

  const { scope } = await r.request({ subject: 'x' })

  assert.deepEqual(calls, ['pre1', 'abort:pre:cut'])
  assert.equal(scope.status, 'aborted-pre')
  assert.equal(scope[s.scope.result], undefined)
  assert.equal(scope.error, undefined)
  const ac = scope[s.scope.ac]
  assert.ok(ac?.signal?.aborted)
  assert.equal(String(ac.signal.reason), 'cut')
})

test('abort in post stops remaining post hooks; preserves handler result', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []

  r.abort(({ reason, stage }) => {
    calls.push('abort:' + stage + ':' + String(reason))
    return { status: 'aborted-post' }
  })

  const handler = () => { calls.push('handler'); return 'H' }
  const post1 = ({ scope }) => {
    calls.push('post1')
    const ac = scope[s.scope.ac]
    ac.abort('stop')
  }
  const post2 = () => { calls.push('post2') }

  r.route({ a: 'x' }, { handler, post: [post1, post2] })

  const { scope } = await r.request({ subject: 'x' })

  assert.deepEqual(calls, ['handler', 'post1', 'abort:post:stop'])
  assert.equal(scope[s.scope.result], 'H')
  assert.equal(scope.status, 'aborted-post')
  assert.equal(scope.error, undefined)
  const ac = scope[s.scope.ac]
  assert.ok(ac?.signal?.aborted)
  assert.equal(String(ac.signal.reason), 'stop')
})
