import assert from 'node:assert/strict'
import test from 'node:test'

import { createTelemetry } from '../../../subjectFactory/index.js'

test('builds telemetry subjects per rigid rules', () => {
  assert.equal(createTelemetry().trace().entity('span').version('v1').build(), 'tele.trace.span.v1')
  assert.equal(createTelemetry().metric().entity('counter').version('v1').build(), 'tele.metric.counter.v1')
  assert.equal(createTelemetry().metric().entity('histogram').version('v1').build(), 'tele.metric.histogram.v1')
  assert.equal(createTelemetry().log().version('v1').build(), 'tele.log.v1')
})

test('channel(alias) works same as fluent helpers', () => {
  assert.equal(createTelemetry().channel('trace').entity('span').version('v1').build(), 'tele.trace.span.v1')
  assert.equal(createTelemetry().channel('metric').entity('counter').version('v1').build(), 'tele.metric.counter.v1')
  assert.equal(createTelemetry().channel('log').version('v1').build(), 'tele.log.v1')
})

test('defaults version similar to basic ("_" when missing)', () => {
  assert.equal(createTelemetry().log().build(), 'tele.log._')
})

test('rejects invalid channels and entities', () => {
  assert.throws(() => createTelemetry().channel('bad').build(), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
  assert.throws(() => createTelemetry().metric().entity('span'), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
  assert.throws(() => createTelemetry().trace().entity('counter'), (err) => err && err.code === 'SUBJECT_TOKEN_UNKNOWN')
})
