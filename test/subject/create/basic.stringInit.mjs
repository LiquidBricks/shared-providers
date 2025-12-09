import test from 'node:test'
import assert from 'node:assert/strict'

import { create } from '../../../subjectFactory/create/basic.js'

// Fully qualified subject string order:
// env.ns.tenant.context.channel.entity.action.version.id

test('accepts fully qualified string init and populates tokens', () => {
  const fullyQualified = 'prod.components.acme.api.cmd.component.register.v1.42'
  const s = create(fullyQualified)

  // Builds back to the same string
  assert.equal(s.build(), fullyQualified)

  // Parts reflect each token in order
  assert.deepEqual(s.parts(), [
    'prod', 'components', 'acme', 'api', 'cmd', 'component', 'register', 'v1', '42'
  ])

  // Internal value map is populated correctly
  assert.deepEqual(s.value, {
    env: 'prod',
    ns: 'components',
    tenant: 'acme',
    context: 'api',
    channel: 'cmd',
    entity: 'component',
    action: 'register',
    version: 'v1',
    id: '42',
  })
})

test('missing tokens in string init throws', () => {
  // Only 8 tokens (missing id)
  const missing = 'prod.components.acme.api.cmd.component.register.v1'
  assert.throws(() => create(missing))
})

