import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router.js'

test('route rejects unknown tokens', () => {
  const r = router({ tokens: ['a', 'b', 'c', 'd'] })
  assert.throws(() => r.route({ z: 'nope' }), (e) => e && e.code === 'ROUTER_TOKEN_UNKNOWN')
})

test('route handler attaches a leaf and prettyTrie marks it', () => {
  const r = router({ tokens: ['a', 'b', 'c'] })
  function onABC({ ctx }) { }
  function onAB({ ctx }) { }
  r.route({ a: 'x', b: 'y', c: 'z' }, { handler: onABC })
  r.route({ a: 'x', b: 'y' }, { handler: onAB })
   .default({ handler() {} })

  const pretty = r.prettyTrie()
  assert.equal(pretty, [
    'default [leaf:handler]',
    'a=x',
    '  b=y [leaf:onAB]',
    '    c=z [leaf:onABC]',
  ].join('\n'))
})

test('route requires handler when no children', () => {
  const r = router({ tokens: ['a', 'b'] })
  assert.throws(() => r.route({ a: 'x' }), (e) => e && e.code === 'ROUTER_ROUTE_HANDLER_REQUIRED')
})

test('route forbids handler when children exist', () => {
  const r = router({ tokens: ['a', 'b', 'c'] })
  const children = [[{ b: 'y' }, { handler() { } }]]
  assert.throws(() => r.route({ a: 'x' }, { handler() { }, children }), (e) => e && e.code === 'ROUTER_ROUTE_HANDLER_FORBIDDEN')
})

test('children are additive and cannot override parent tokens', () => {
  const r = router({ tokens: ['a', 'b', 'c'] })
  function onXYZ({ info }) { }
  r.route({ a: 'x' }, { children: [[{ a: 'x', b: 'y' }, { handler: onXYZ }]] })
  const pretty = r.prettyTrie()
  assert.equal(pretty, [
    'a=x',
    '  b=y [leaf:onXYZ]',
  ].join('\n'))

  assert.throws(() => r.route({ a: 'x' }, { children: [[{ a: 'z' }, { handler() { } }]] }), (e) => e && e.code === 'ROUTER_SUBROUTE_OVERRIDE')
})

test('pre/post run order around handler', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const pre1 = ({ info }) => calls.push('pre1:' + info.params.a)
  const pre2 = ({ info }) => calls.push('pre2:' + info.params.a)
  const post1 = ({ info }) => calls.push('post1:' + info.params.a)
  const handler = ({ info }) => { calls.push('handler:' + info.params.a); return 'H' }
  r.route({ a: 'x' }, { pre: [pre1, pre2], handler, post: [post1] })

  const { info, scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['pre1:x', 'pre2:x', 'handler:x', 'post1:x'])
  assert.equal(scope[s.scope.result], 'H')
})

test('async pre/handler/post execute in order', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const pre1 = async ({ info }) => { await Promise.resolve(); calls.push('pre1:' + info.params.a) }
  const pre2 = async ({ info }) => { await new Promise(r => setTimeout(r, 0)); calls.push('pre2:' + info.params.a) }
  const post1 = async ({ info }) => { await Promise.resolve(); calls.push('post1:' + info.params.a) }
  const handler = async ({ info }) => { calls.push('handler:' + info.params.a); return 'HA' }
  r.route({ a: 'x' }, { pre: [pre1, pre2], handler, post: [post1] })

  const { info, scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['pre1:x', 'pre2:x', 'handler:x', 'post1:x'])
  assert.equal(scope[s.scope.result], 'HA')
})

test('pre/post aggregate from parent to children', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  const ppre = ({ info }) => calls.push('ppre:' + info.params.a + (info.params.b || ''))
  const ppost = ({ info }) => calls.push('ppost:' + info.params.a + (info.params.b || ''))
  const cpre = ({ info }) => calls.push('cpre:' + info.params.a + info.params.b)
  const cpost = ({ info }) => calls.push('cpost:' + info.params.a + info.params.b)
  const handler = ({ info }) => { calls.push('handler:' + info.params.a + info.params.b); return 'HC' }

  r.route({ a: 'x' }, {
    pre: [ppre],
    post: [ppost],
    children: [[
      { a: 'x', b: 'y' }, { pre: [cpre], handler, post: [cpost] }
    ]]
  })

  const { info, scope } = await r.request({ subject: 'x.y' })
  assert.deepEqual(calls, ['ppre:xy', 'cpre:xy', 'handler:xy', 'cpost:xy', 'ppost:xy'])
  assert.equal(scope[s.scope.result], 'HC')
})
