import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('router is a function and requires config.tokens', () => {
  assert.equal(typeof router, 'function')
  assert.throws(() => router(), (err) => err && err.code === 'ROUTER_CONFIG_TOKENS_REQUIRED')
})

