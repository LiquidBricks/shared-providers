import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('explain returns best route and competing lower matches without executing', () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  function ppre({ info }) { calls.push('ppre:' + info.params.a + (info.params.b || '')) }
  function ppost({ info }) { calls.push('ppost:' + info.params.a + (info.params.b || '')) }
  function cpre({ info }) { calls.push('cpre:' + info.params.a + info.params.b) }
  function cpost({ info }) { calls.push('cpost:' + info.params.a + info.params.b) }
  function childHandler({ info }) { calls.push('handler:' + info.params.a + info.params.b); return 'HC' }
  function bOnly({ info }) { calls.push('b:' + info.params.b); return 'B' }

  r.route({ a: 'x' }, {
    pre: [ppre],
    post: [ppost],
    children: [[
      { a: 'x', b: 'y' }, { pre: [cpre], handler: childHandler, post: [cpost] }
    ]]
  })
  r.route({ b: 'y' }, { handler: bOnly })

  const info = r.explain('x.y')
  assert.deepEqual(calls, [])
  assert.equal(info.best.score, 2)
  assert.equal(info.best.handlerName, 'childHandler')
  assert.deepEqual(info.best.preNames, ['ppre', 'cpre'])
  assert.deepEqual(info.best.postNames, ['cpost', 'ppost'])
  assert.deepEqual(info.best.values, { a: 'x', b: 'y' })
  assert.equal(info.competing.length, 1)
  assert.equal(info.competing[0].score, 1)
  assert.equal(info.competing[0].handlerName, 'bOnly')
})

test('explain shows default as best when no route matches', () => {
  const r = router({ tokens: ['a'] })
  function dpre() {}
  function dpost() {}
  function dhandler() { return 'D' }
  r.default({ pre: [dpre], handler: dhandler, post: [dpost] })

  const info = r.explain('z')
  assert.equal(info.best.kind, 'default')
  assert.equal(info.best.handlerName, 'dhandler')
  assert.deepEqual(info.best.preNames, ['dpre'])
  assert.deepEqual(info.best.postNames, ['dpost'])
  assert.equal(info.competing.length, 0)
})
