import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { createNatsMetrics } from '../../../../diagnostics/metrics/nats.js'

test('uses custom subject function for count and timing', async () => {
  const calls = []
  const natsContext = {
    publish: (subject, json) => {
      calls.push({ subject, json })
      return Promise.resolve()
    }
  }

  const metrics = createNatsMetrics({
    natsContext,
    subject: (kind) => `svc.metrics.${kind}`
  })

  metrics.count('CUSTOM_OK', 3)
  metrics.timing('boot', 42)

  await delay(0)

  assert.equal(calls.length, 2)
  assert.equal(calls[0].subject, 'svc.metrics.count')
  assert.equal(calls[1].subject, 'svc.metrics.timing')
})
