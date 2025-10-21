import test from 'node:test'
import assert from 'node:assert/strict'

import { createSubject } from '../subjectFactory/index.js'

test('builds all underscores when empty', () => {
  const subj = createSubject().build()
  assert.equal(subj, '_._._._._._._._._')
})

test('order-agnostic partial application with defaults', () => {
  const subj = createSubject()
    .ns('component-service')
    .env('prod')
    .channel('cmd')
    .entity('component')
    .action('register')
    .version('v1')
    .tenant('_')
    .context('_')
    .id('')
    .build()

  assert.equal(subj, 'prod.component-service._._.cmd.component.register.v1._')
})

test('override throws; same value allowed', () => {
  const s = createSubject({ env: 'prod' })
  // Same value is a no-op
  assert.doesNotThrow(() => s.env('prod'))
  // Different value throws
  assert.throws(() => s.env('dev'), (err) => err && err.code === 'SUBJECT_TOKEN_OVERRIDE')
})

test('multi-set works and respects override rules', () => {
  const s = createSubject().set({ env: 'prod', ns: 'cs' })
  assert.equal(s.build(), 'prod.cs._._._._._._._')

  // Setting same values is fine
  assert.doesNotThrow(() => s.set({ env: 'prod' }))
  // Attempt override with different value should throw
  assert.throws(() => s.set({ ns: 'other' }), (err) => err && err.code === 'SUBJECT_TOKEN_OVERRIDE')
})

test('parts() returns normalized tokens', () => {
  const p = createSubject({ env: 'prod', ns: 'cs' }).parts()
  assert.equal(Array.isArray(p), true)
  assert.equal(p.length, 9)
  assert.deepEqual(p, ['prod', 'cs', '_', '_', '_', '_', '_', '_', '_'])
})

test('unknown token in set throws', () => {
  const s = createSubject()
  assert.throws(() => s.set({ foo: 'bar' }), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
})

test('toString matches build', () => {
  const s = createSubject({ env: 'prod', ns: 'cs' })
  assert.equal(String(s), s.build())
})
