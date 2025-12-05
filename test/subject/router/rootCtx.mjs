import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

test('pre/handler/post receive rootCtx and message', async () => {
  const reqCtx = { requestId: 'r-123', user: 'alice' }
  const r = router({ tokens: ['a'], context: reqCtx })

  const seen = { pre: null, handler: null, post: null, msg: [] }

  const pre = ({ rootCtx, message }) => { seen.pre = rootCtx; seen.msg.push(message) }
  const handler = ({ rootCtx, message }) => { seen.handler = rootCtx; seen.msg.push(message); return 'ok' }
  const post = ({ rootCtx, message }) => { seen.post = rootCtx; seen.msg.push(message) }

  r.route({ a: 'x' }, { pre: [pre], handler, post: [post] })

  const message = { hello: 'world' }
  const { info, scope } = await r.request({ subject: 'x', message })
  assert.equal(scope[s.scope.result], 'ok')
  assert.equal(seen.pre, reqCtx)
  assert.equal(seen.handler, reqCtx)
  assert.equal(seen.post, reqCtx)
  assert.deepEqual(seen.msg, [message, message, message])
})
