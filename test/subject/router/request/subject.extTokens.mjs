import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../../subjectFactory/index.js'

test('subject longer than tokens: extra parts ignored', async () => {
  // Base has 1 token; route extends with 1 ext token
  const r = router({ tokens: ['a'] })
  r.route({ a: 'x' }, { tokens: ['b'], handler: () => 'H' })

  // Provide two extra parts; only the first should map to ext token 'b'
  const { info } = await r.request({ subject: 'x.y.z' })
  assert.deepEqual(info.params, { a: 'x', b: 'y' })
  assert.deepEqual(info.tokens, ['a', 'b'])
})

test('subject shorter than tokens: missing tokens undefined', async () => {
  // Base has 1 token; route extends with 2 ext tokens
  const r = router({ tokens: ['a'] })
  r.route({ a: 'x' }, { tokens: ['b', 'c'], handler: () => 'H' })

  // Subject provides only base part; both ext tokens should be undefined
  const { info } = await r.request({ subject: 'x' })
  assert.deepEqual(info.params, { a: 'x', b: undefined, c: undefined })
  assert.deepEqual(info.tokens, ['a', 'b', 'c'])
})

