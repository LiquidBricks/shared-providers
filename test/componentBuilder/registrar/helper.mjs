import test from 'node:test'
import assert from 'node:assert/strict'

import { captureDepsAccesses } from '../../../componentBuilder/registrar/helper.js'

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
