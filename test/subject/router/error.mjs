import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('onPreError handles pre error and stops; no generic run', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const pre1 = () => { calls.push('pre1'); throw new Error('boom-pre') }
  const handler = () => { calls.push('handler'); return 'H' }
  r.route({ a: 'x' }, {
    pre: [pre1],
    handler,
    onPreError: [({ error, stage }) => { calls.push('onPreError:' + stage + ':' + error.message); return { result: 'ERR' } }],
    onError: [() => { calls.push('onError'); }]
  })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['pre1', 'onPreError:pre:boom-pre'])
  assert.equal(scope.result, 'ERR')
  assert.ok(scope.error instanceof Error)
})

test('cascade when stage-specific rethrows; generic handles', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const pre1 = () => { calls.push('pre1'); throw new Error('boom-pre') }
  r.route({ a: 'x' }, {
    pre: [pre1],
    handler() { calls.push('handler'); },
    onPreError: [() => { calls.push('onPreError'); throw new Error('rethrow') }],
    onError: [({ error }) => { calls.push('onError:' + error.message); return { handled: true } }]
  })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['pre1', 'onPreError', 'onError:rethrow'])
  assert.ok(scope.error instanceof Error)
  assert.equal(scope.handled, true)
})

test('scope locality LIFO: child stage-specific runs before parent generic', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const ppre = () => { calls.push('ppre'); throw new Error('E1') }
  r.route({ a: 'x' }, {
    pre: [ppre],
    onError: [({ error, stage }) => { calls.push('parent:onError:' + stage + ':' + error.message); throw error }],
    children: [[
      { a: 'x' }, {
        onPreError: [({ error }) => { calls.push('child:onPreError:' + error.message); return { result: 'ERR' } }],
        handler() { calls.push('child:handler') }
      }]
    ]
  })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['ppre', 'child:onPreError:E1'])
  assert.equal(scope.result, 'ERR')
  assert.ok(scope.error instanceof Error)
})

test('onHandlerError handles handler throw and prevents post', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const handler = () => { calls.push('handler'); throw new Error('boom-handler') }
  const post1 = () => { calls.push('post1') }
  r.route({ a: 'x' }, {
    handler,
    post: [post1],
    onHandlerError: [({ error }) => { calls.push('onHandlerError:' + error.message); return { status: 'handled' } }]
  })
  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['handler', 'onHandlerError:boom-handler'])
  assert.ok(scope.error instanceof Error)
  assert.equal(scope.status, 'handled')
})

test('onPostError handles post throw; preserves prior result', async () => {
  const r = router({ tokens: ['a'] })
  const calls = []
  const handler = () => { calls.push('handler'); return 'H' }
  const post1 = () => { calls.push('post1'); throw new Error('boom-post') }
  const post2 = () => { calls.push('post2') }
  r.route({ a: 'x' }, {
    handler, post: [post1, post2],
    onPostError: [({ error }) => { calls.push('onPostError:' + error.message); return { tagged: true } }]
  })

  const { scope } = await r.request({ subject: 'x' })
  assert.deepEqual(calls, ['handler', 'post1', 'onPostError:boom-post'])
  assert.equal(scope.result, 'H')
  assert.ok(scope.error instanceof Error)
  assert.equal(scope.tagged, true)
})
