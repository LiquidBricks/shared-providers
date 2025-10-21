import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('async default pre/handler/post execute in order', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const dpre = async ({ info }) => { await Promise.resolve(); calls.push('dpre:' + (info.params.a || '')) }
  const dpost = async ({ info }) => { await Promise.resolve(); calls.push('dpost:' + (info.params.a || '')) }
  const ddef = async ({ info }) => { calls.push('dhandler'); return 'DA' }

  r.default({ pre: [dpre], handler: ddef, post: [dpost] })

  const { info, scope } = await r.request({ subject: 'z' })
  assert.deepEqual(calls, ['dpre:z', 'dhandler', 'dpost:z'])
  assert.equal(scope.result, 'DA')
})

test('default pre/post run only on default match', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const dpre = ({ info }) => calls.push('dpre:' + (info.params.a || ''))
  const dpost = ({ info }) => calls.push('dpost:' + (info.params.a || ''))
  const ddef = ({ info }) => { calls.push('dhandler'); return 'D' }
  const onA = ({ info }) => { calls.push('onA'); return 'A' }

  r.route({ a: 'x' }, { handler: onA })
  r.default({ pre: [dpre], handler: ddef, post: [dpost] })

  let { info: info1, scope: scope1 } = await r.request({ subject: 'z' })
  assert.deepEqual(calls.slice(0), ['dpre:z', 'dhandler', 'dpost:z'])
  assert.equal(scope1.result, 'D')

  calls.length = 0
  const { info: info2, scope: scope2 } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['onA'])
  assert.equal(scope2.result, 'A')
})

test('default handler runs when no route matches', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  function onDefault({ info }) { calls.push(['default', info.subject]); return 'DEFAULT' }
  function onAB({ info }) { calls.push(['onAB', info.params.a + info.params.b]); return 'AB' }
  r.route({ a: 'x', b: 'y' }, { handler: onAB })
  r.default({ handler: onDefault })

  const { info, scope } = await r.request({ subject: 'p.q' })
  assert.deepEqual(calls, [['default', 'p.q']])
  assert.equal(scope.result, 'DEFAULT')
})

test('default handler is not called when a route matches', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  function onDefault({ info }) { calls.push(['default', info.subject]); return 'DEFAULT' }
  function onA({ info }) { calls.push(['onA', info.params.a]); return 'A' }
  r.route({ a: 'x' }, { handler: onA })
  r.default({ handler: onDefault })

  const { info, scope } = await r.request({ subject: 'x.z' })
  assert.deepEqual(calls, [['onA', 'x']])
  assert.equal(scope.result, 'A')
})
