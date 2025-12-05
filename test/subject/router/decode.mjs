import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

test('decode runs before pre/handler/post', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const decode1 = ({ info }) => calls.push('decode1:' + info.params.a)
  const pre1 = ({ info }) => calls.push('pre1:' + info.params.a)
  const post1 = ({ info }) => calls.push('post1:' + info.params.a)
  const handler = ({ info }) => { calls.push('handler:' + info.params.a); return 'H' }

  r.route({ a: 'x' }, { decode: [decode1], pre: [pre1], handler, post: [post1] })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['decode1:x', 'pre1:x', 'handler:x', 'post1:x'])
  assert.equal(scope[s.scope.result], 'H')
})

test('decode aggregates from parent to children', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  const pdec = ({ info }) => calls.push('pdec:' + info.params.a + (info.params.b || ''))
  const ppre = ({ info }) => calls.push('ppre:' + info.params.a + (info.params.b || ''))
  const ppost = ({ info }) => calls.push('ppost:' + info.params.a + (info.params.b || ''))
  const cdec = ({ info }) => calls.push('cdec:' + info.params.a + info.params.b)
  const cpre = ({ info }) => calls.push('cpre:' + info.params.a + info.params.b)
  const cpost = ({ info }) => calls.push('cpost:' + info.params.a + info.params.b)
  const handler = ({ info }) => { calls.push('handler:' + info.params.a + info.params.b); return 'HC' }

  r.route({ a: 'x' }, {
    decode: [pdec],
    pre: [ppre],
    post: [ppost],
    children: [[
      { a: 'x', b: 'y' }, { decode: [cdec], pre: [cpre], handler, post: [cpost] }
    ]]
  })

  const { scope } = await r.request({ subject: 'x.y' })
  assert.deepEqual(calls, ['pdec:xy', 'cdec:xy', 'ppre:xy', 'cpre:xy', 'handler:xy', 'cpost:xy', 'ppost:xy'])
  assert.equal(scope[s.scope.result], 'HC')
})
