import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../../subjectFactory/index.js'
import { s } from '../../../../subjectFactory/router/index.js'

test('request executes only highest-score matching leaf', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const calls = []
  function onA({ info }) { calls.push(['onA', info.params.a]); return 'A' }
  function onAB({ info }) { calls.push(['onAB', info.params.a + info.params.b]); return 'AB' }
  r.route({ a: 'x' }, { handler: onA })
  r.route({ a: 'x', b: 'y' }, { handler: onAB })

  const { info, scope } = await r.request({ subject: 'x.y' })
  assert.deepEqual(calls, [['onAB', 'xy']])
  assert.equal(scope[s.scope.result], 'AB')
})
