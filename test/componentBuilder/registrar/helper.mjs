import test from 'node:test'
import assert from 'node:assert/strict'

import { captureDepsAccesses, captureInjectAccesses } from '../../../componentBuilder/registrar/helper.js'

test('captureDepsAccesses', async (t) => {
  await t.test('returns an empty array when depsFn is not a function', () => {
    assert.deepEqual(captureDepsAccesses(), [])
    assert.deepEqual(captureDepsAccesses(null), [])
    assert.deepEqual(captureDepsAccesses({}), [])
  })

  await t.test('collects leaf dependency paths from destructuring', () => {
    const deps = captureDepsAccesses(({ data: { value }, task: { run } }) => { })

    assert.deepEqual(deps, ['data.value', 'task.run'])
  })

  await t.test('deduplicates and keeps only the deepest paths when branches overlap', () => {
    const deps = captureDepsAccesses((root) => [
      root.data.value,
      root.data.value,
      root.data.value.deep.leaf,
      root.task.sum,
      root.task.sum.result,
    ])

    assert.deepEqual(deps, ['data.value.deep.leaf', 'task.sum.result'])
  })

  await t.test('captures paths when destructuring via assignment', () => {
    const deps = captureDepsAccesses(_ => {
      const {
        data: { a, b }
      } = _
    })

    assert.deepEqual(deps, ['data.a', 'data.b'])
  })
})

test('captureInjectAccesses', async (t) => {
  await t.test('returns an empty object when injectFn is not a function', () => {
    assert.deepEqual(captureInjectAccesses(), {})
    assert.deepEqual(captureInjectAccesses(null), {})
    assert.deepEqual(captureInjectAccesses({}), {})
  })

  await t.test('collects caller paths keyed by injected argument path', () => {
    const inject = captureInjectAccesses(_ => [
      _.words2.data.a(_.words.task.you),
      _.dbwork.task.a(_.words.sub1.data.a),
      _.data.a(_.words.task.you),
    ])

    assert.deepEqual(inject, {
      'words.task.you': ['words2.data.a', 'data.a'],
      'words.sub1.data.a': ['dbwork.task.a'],
    })
  })

  await t.test('deduplicates repeat callers for the same injected path', () => {
    const inject = captureInjectAccesses(_ => {
      _.alpha.value(_.beta.path)
      _.alpha.value(_.beta.path)
      _.alpha.value(_.beta.other)
      _.alpha.value(_.beta.other)
    })

    assert.deepEqual(inject, {
      'beta.path': ['alpha.value'],
      'beta.other': ['alpha.value'],
    })
  })
})
