import assert from 'node:assert/strict'
import test from 'node:test'

import { telemetry } from '../../../subjectFactory/index.js'

test('builds telemetry subjects per rigid rules', () => {
  assert.equal(telemetry.create().trace().entity('span').version('v1').build(), 'tele.trace.span.v1')
  assert.equal(telemetry.create().metric().entity('counter').version('v1').build(), 'tele.metric.counter.v1')
  assert.equal(telemetry.create().metric().entity('histogram').version('v1').build(), 'tele.metric.histogram.v1')
  assert.equal(telemetry.create().log().version('v1').build(), 'tele.log.v1')
})

test('channel(alias) works same as fluent helpers', () => {
  assert.equal(telemetry.create().channel('trace').entity('span').version('v1').build(), 'tele.trace.span.v1')
  assert.equal(telemetry.create().channel('metric').entity('counter').version('v1').build(), 'tele.metric.counter.v1')
  assert.equal(telemetry.create().channel('log').version('v1').build(), 'tele.log.v1')
})

test('defaults version similar to basic ("_" when missing)', () => {
  assert.equal(telemetry.create().log().build(), 'tele.log._')
})

test('rejects invalid channels and entities', () => {
  assert.throws(() => telemetry.create().channel('bad').build(), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
  assert.throws(() => telemetry.create().metric().entity('span'), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
  assert.throws(() => telemetry.create().trace().entity('counter'), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
})
