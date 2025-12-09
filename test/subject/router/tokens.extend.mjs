import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'
import { s } from '../../../subjectFactory/router/index.js'

test('route can extend tokens per-branch and match subjects', async () => {
  const r = router({ tokens: ['telemetryNS', 'channel'] })

  const calls = []
  const onCounter = ({ info }) => { calls.push('counter:' + info.subject); return 'COUNTER' }
  const onHistogram = ({ info }) => { calls.push('histogram:' + info.subject); return 'HIST' }
  const onLog = ({ info }) => { calls.push('log:' + info.subject); return 'LOG' }

  r
    .route({ channel: 'metric' }, {
      tokens: ['entity', 'version'],
      children: [
        [{ entity: 'counter' }, { handler: onCounter }],
        [{ entity: 'histogram' }, { handler: onHistogram }],
      ],
    })
    .route({ channel: 'log' }, {
      tokens: ['version'],
      handler: onLog,
    })

  // tele.log.v1
  let res = await r.request({ subject: 'tele.log.v1' })
  assert.equal(res.scope[s.scope.result], 'LOG')
  assert.deepEqual(res.info.params, {
    telemetryNS: 'tele',
    channel: 'log',
    version: 'v1',
  })

  // tele.metric.counter.v1
  res = await r.request({ subject: 'tele.metric.counter.v1' })
  assert.equal(res.scope[s.scope.result], 'COUNTER')
  assert.deepEqual(res.info.params, {
    telemetryNS: 'tele',
    channel: 'metric',
    entity: 'counter',
    version: 'v1',
  })

  // tele.metric.histogram.v1
  res = await r.request({ subject: 'tele.metric.histogram.v1' })
  assert.equal(res.scope[s.scope.result], 'HIST')
  assert.deepEqual(res.info.params, {
    telemetryNS: 'tele',
    channel: 'metric',
    entity: 'histogram',
    version: 'v1',
  })
})
