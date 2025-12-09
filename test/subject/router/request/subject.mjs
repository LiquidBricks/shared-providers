import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../../subjectFactory/index.js'

test('equal length: subject maps 1:1 to tokens', async () => {
  const tokens = ['a', 'b', 'c']
  const subj = 'x.y.z'
  const req = { body: 1 }
  const r = router({ tokens, context: req })
  const { info, ctx } = await r.request({ subject: subj })

  assert.equal(info.subject, subj)
  assert.equal(ctx, req)
  assert.deepEqual(info.params, { a: 'x', b: 'y', c: 'z' })
  assert.deepEqual(info.tokens, tokens)
  assert.deepEqual(r.tokens, tokens)
})

test('subject longer than tokens: extra parts ignored', async () => {
  const r = router({ tokens: ['a', 'b'] })
  const { info } = await r.request({ subject: 'one.two.three' })
  assert.deepEqual(info.params, { a: 'one', b: 'two' })
})

test('subject shorter than tokens: missing tokens undefined', async () => {
  const r = router({ tokens: ['a', 'b', 'c'] })
  const { info } = await r.request({ subject: 'x' })
  assert.deepEqual(info.params, { a: 'x', b: undefined, c: undefined })
  assert.equal(info.subject, 'x')
})
