import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

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
    .default({ handler() { } })

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

test('hooks accept single function definitions', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const decode = ({ info }) => calls.push('decode:' + info.params.a)
  const pre = ({ info }) => calls.push('pre:' + info.params.a)
  const post = ({ info }) => calls.push('post:' + info.params.a)
  const handler = ({ info }) => { calls.push('handler:' + info.params.a); return 'HS' }

  r.route({ a: 'x' }, { decode, pre, handler, post })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['decode:x', 'pre:x', 'handler:x', 'post:x'])
  assert.equal(scope[s.scope.result], 'HS')
})

test('handler can be provided as an array', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const h1 = ({ info }) => calls.push('h1:' + info.params.a)
  const h2 = ({ info }) => { calls.push('h2:' + info.params.a); return 'H2' }

  r.route({ a: 'x' }, { handler: [h1, h2] })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['h1:x', 'h2:x'])
  assert.equal(scope[s.scope.result], 'H2')
})

test('hooks accept nested arrays', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const decode = [
    ({ info }) => calls.push('decode1:' + info.params.a),
    [
      ({ info }) => calls.push('decode2:' + info.params.a),
      [
        ({ info }) => calls.push('decode3:' + info.params.a),
        ({ info }) => calls.push('decode4:' + info.params.a)
      ]
    ],
  ]
  const pre = [
    ({ info }) => calls.push('pre1:' + info.params.a),
    [({ info }) => calls.push('pre2:' + info.params.a)],
    ({ info }) => calls.push('pre3:' + info.params.a),
  ]
  const post = [
    ({ info }) => calls.push('post1:' + info.params.a),
    [({ info }) => calls.push('post2:' + info.params.a), [({ info }) => calls.push('post3:' + info.params.a)]],
  ]
  const handler = ({ info }) => { calls.push('handler:' + info.params.a); return 'HN' }

  r.route({ a: 'x' }, { decode, pre, handler, post })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, [
    'decode1:x',
    'decode2:x',
    'decode3:x',
    'decode4:x',
    'pre1:x',
    'pre2:x',
    'pre3:x',
    'handler:x',
    'post1:x',
    'post2:x',
    'post3:x',
  ])
  assert.equal(scope[s.scope.result], 'HN')
})

test('error hooks accept nested arrays', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const handler = () => { calls.push('handler'); throw new Error('H') }
  const onHandlerError = [
    ({ error }) => { calls.push('onHandlerErr1'); throw error },
    [({ error }) => { calls.push('onHandlerErr2'); throw error }],
  ]
  const onError = [
    ({ error }) => { calls.push('onErr1'); throw error },
    [({ error }) => { calls.push('onErr2'); return { handled: true } }],
  ]

  r.route({ a: 'x' }, { handler, onHandlerError, onError })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['handler', 'onHandlerErr1', 'onHandlerErr2', 'onErr1', 'onErr2'])
  assert.equal(scope.error?.message, 'H')
})

test('hook objects run in parallel and arrays stay sequential', { timeout: 2000 }, async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const pre = {
    a: async ({ info }) => { calls.push('a1:' + info.params.a); await gate; calls.push('a2:' + info.params.a) },
    b: async ({ info }) => { calls.push('b:' + info.params.a); release() },
    c: [
      ({ info }) => calls.push('c1:' + info.params.a),
      ({ info }) => calls.push('c2:' + info.params.a),
      [
        ({ info }) => calls.push('c3:' + info.params.a),
        { a: ({ info }) => calls.push('cA:' + info.params.a), b: [({ info }) => calls.push('cB:' + info.params.a)] }
      ]
    ]
  }
  const handler = ({ info }) => { calls.push('handler:' + info.params.a); return 'HP' }

  r.route({ a: 'x' }, { pre, handler })

  const { scope } = await r.request({ subject: 'x' })
  const idx = (label) => calls.indexOf(label)

  for (const label of ['a1:x', 'a2:x', 'b:x', 'c1:x', 'c2:x', 'c3:x', 'cA:x', 'cB:x', 'handler:x']) {
    assert.notEqual(idx(label), -1)
  }

  assert(idx('a2:x') > idx('b:x'))
  assert(idx('c2:x') > idx('c1:x'))
  assert(idx('c3:x') > idx('c2:x'))
  assert(idx('cA:x') > idx('c3:x'))
  assert(idx('cB:x') > idx('c3:x'))
  assert(idx('handler:x') > Math.max(idx('a2:x'), idx('cB:x')))
  assert.equal(scope[s.scope.result], 'HP')
})
