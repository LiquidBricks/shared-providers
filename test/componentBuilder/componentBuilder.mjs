import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { component } from '../../componentBuilder/index.js'
import { s, isAComponent } from '../../componentBuilder/help.js'

const thisTestFile = fileURLToPath(import.meta.url)
const asRegistration = (componentInstance) => JSON.parse(JSON.stringify(componentInstance))
const findNodeByName = (registration, collection, nodeName) =>
  registration[collection].find(({ name }) => name === nodeName)

test('component basics', async (t) => {
  await t.test('uses "component" as default name when missing', () => {
    const comp = component()
    assert.ok(isAComponent(comp))

    const registration = asRegistration(comp)
    assert.equal(registration.name, 'component')
    assert.equal(typeof registration.hash, 'string')
  })

  await t.test('throws when component name is empty', () => {
    assert.throws(() => component(''), /components must be non-empty/i)
  })

  await t.test('serializes registration through toJSON and JSON.stringify', () => {
    const comp = component('json-comp')
      .data('value', { fnc: () => 1 })
      .task('double', {
        deps: ({ data: { value } }) => value,
        fnc: ({ deps: { data: { value } } }) => value * 2,
      })

    const registration = comp[s.INTERNALS].registration()
    const json = comp.toJSON()

    assert.deepEqual(json, registration)
    assert.deepEqual(asRegistration(comp), registration)
  })
})

test('data registration', async (t) => {
  await t.test('requires a name', () => {
    const comp = component('my-comp')
    assert.throws(() => comp.data(), /requires a data or list of datas/i)
  })

  await t.test('rejects non-function inject', () => {
    const comp = component('my-comp')
    assert.throws(() => comp.data('bad-inject', { inject: [] }), /inject must be a function/i)
  })

  await t.test('captures default deferred dependency when no definition is provided', () => {
    const comp = component('my-comp').data('defaults')
    const registration = asRegistration(comp)
    const node = findNodeByName(registration, 'data', 'defaults')
    assert(node, 'expected data node "defaults" to be registered')
    assert.deepEqual(node.deps, ['deferred.deferred'])
    assert.equal(node.fnc, undefined)
  })

  await t.test('captures default deferred dependency when definition is an empty object', () => {
    const comp = component('my-comp').data('defaults', {})
    const registration = asRegistration(comp)
    const node = findNodeByName(registration, 'data', 'defaults')
    assert(node, 'expected data node "defaults" to be registered')
    assert.deepEqual(node.deps, ['deferred.deferred'])
    assert.equal(node.fnc, undefined)
  })

  await t.test('defaults fnc to noop when omitted', () => {
    const comp = component('my-comp').data('with-default-fnc', { deps: ({ data: { seed } }) => seed })
    const registration = asRegistration(comp)
    const node = findNodeByName(registration, 'data', 'with-default-fnc')
    assert(node, 'expected data node "with-default-fnc" to be registered')
    assert.equal(node.fnc, '() => { }')
  })

  await t.test('rejects additional deps when using deferred dependency', () => {
    const comp = component('my-comp')
    assert.throws(
      () => comp.data('bad-deps', {
        deps: ({ deferred: { ready }, data: { other } }) => { ready; other },
      }),
      /deferred.*may not declare other dependencies/i
    )
  })

  await t.test('rejects fnc when using deferred dependency', () => {
    const comp = component('my-comp')
    assert.throws(
      () => comp.data('bad-fnc', {
        deps: ({ deferred: { ready } }) => ready,
        fnc: () => true,
      }),
      /deferred.*may not provide a fnc/i
    )
  })

  await t.test('defaults deps to empty when only fnc is provided', () => {
    const comp = component('my-comp').data('with-fnc', { fnc: () => 42 })
    const registration = asRegistration(comp)
    const node = findNodeByName(registration, 'data', 'with-fnc')
    assert(node, 'expected data node "with-fnc" to be registered')
    assert.deepEqual(node.deps, [])
  })
})

test('import registration', async (t) => {
  await t.test('requires a name', () => {
    const comp = component('my-comp')
    assert.throws(() => comp.import('', { hash: 'abc' }), /imports must be non-empty/i)
  })

  await t.test('requires an options object with a hash string', () => {
    const comp = component('my-comp')
    assert.throws(() => comp.import('shared'), /requires an options object/i)
    assert.throws(() => comp.import('shared', {}), /hash must be a non-empty string/i)
  })

  await t.test('rejects non-function inject', () => {
    const comp = component('my-comp')
    assert.throws(() => comp.import('shared', { hash: 'abc', inject: [] }), /inject must be a function/i)
  })

  await t.test('accepts a component instance as the hash source', () => {
    const external = component('external-lib')
      .data('value', { fnc: () => 7 })
      .task('double', {
        deps: ({ data: { value } }) => value,
        fnc: ({ deps: { data: { value } } }) => value * 2,
      })

    const consumer = component('consumer').import('shared', { hash: external })

    const externalReg = asRegistration(external)
    const consumerReg = asRegistration(consumer)
    const imported = findNodeByName(consumerReg, 'imports', 'shared')

    assert(imported, 'expected import "shared" to be registered')
    assert.equal(imported.hash, externalReg.hash)
  })

  await t.test('stores hash and codeRef for imported component', () => {
    const comp = component('consumer').import('shared', { hash: 'abc123' })
    const registration = asRegistration(comp)
    const imported = findNodeByName(registration, 'imports', 'shared')

    assert(imported, 'expected import "shared" to be registered')
    assert.equal(imported.hash, 'abc123')
    assert.deepEqual(imported.inject, {})
    assert.equal(path.resolve(imported.codeRef.file), path.resolve(thisTestFile))
    assert.equal(typeof imported.codeRef.line, 'number')
    assert.equal(typeof imported.codeRef.column, 'number')
  })

  await t.test('captures inject mappings from callable dependency paths', () => {
    const comp = component('consumer').import('words', {
      hash: 'abc123',
      inject: _ => [
        _.words2.data.a(_.words.task.you),
        _.dbwork.task.a(_.words.sub1.data.a),
        _.data.a(_.words.task.you),
      ]
    })
    const registration = asRegistration(comp)
    const imported = findNodeByName(registration, 'imports', 'words')

    assert.deepEqual(imported.inject, {
      'words.task.you': ['words2.data.a', 'data.a'],
      'words.sub1.data.a': ['dbwork.task.a'],
    })
  })
})

test('task registration and dependency capture', async (t) => {
  await t.test('rejects non-function inject', () => {
    const comp = component('provision-server')
    assert.throws(() => comp.task('bad-inject', { inject: [], fnc: () => true }), /inject must be a function/i)
  })

  await t.test('registers data and tasks with their dependency paths', () => {
    const comp = component('provision-server')
      .data('book-type', {
        deps: ({ deferred: { ready } }) => ready,
      })
      .data('x', {
        deps: ({ deferred: { seed } }) => seed,
      })
      .data('y', {
        deps: ({ data: { x } }) => x,
        fnc: ({ deps: { data: { x } } }) => x + 3,
      })
      .task('sum', {
        deps: ({ data: { x, y } }) => { x; y },
        fnc: ({ deps: { data: { x, y } } }) => x + y,
      })
      .task('info', {
        deps: ({ data: { y }, task: { sum } }) => { sum; y },
        fnc: ({ deps: { data: { y }, task: { sum } } }) => ({ y, sum }),
      })

    assert.ok(isAComponent(comp))
    assert.equal(comp[s.IDENTITY.COMPONENT], true)

    const registration = asRegistration(comp)

    assert.equal(registration.name, 'provision-server')
    assert.equal(typeof registration.hash, 'string')
    assert.equal(registration.hash.length, 64)

    assert.deepEqual(registration.data.map(({ name, deps }) => ({ name, deps })), [
      { name: 'book-type', deps: ['deferred.ready'] },
      { name: 'x', deps: ['deferred.seed'] },
      { name: 'y', deps: ['data.x'] },
    ])

    assert.deepEqual(registration.tasks.map(({ name, deps }) => ({ name, deps })), [
      { name: 'sum', deps: ['data.x', 'data.y'] },
      { name: 'info', deps: ['data.y', 'task.sum'] },
    ])

    for (const node of [...registration.data, ...registration.tasks]) {
      assert.equal(path.resolve(node.codeRef.file), path.resolve(thisTestFile))
      assert.equal(typeof node.codeRef.line, 'number')
      assert.ok(node.codeRef.line > 0)
      assert.equal(typeof node.codeRef.column, 'number')
      assert.ok(node.codeRef.column > 0)
    }
  })
})

test('hashing', async (t) => {
  await t.test('changes hash when imports differ', () => {
    const withA = component('consumer').import('shared', { hash: 'aaaa' })
    const withB = component('consumer').import('shared', { hash: 'bbbb' })

    const regA = asRegistration(withA)
    const regB = asRegistration(withB)

    assert.notEqual(regA.hash, regB.hash)
  })

  await t.test('changes hash when import inject mappings differ', () => {
    const withInjectA = component('consumer').import('shared', {
      hash: 'aaaa',
      inject: _ => [_.alpha.value(_.beta.path)]
    })
    const withInjectB = component('consumer').import('shared', {
      hash: 'aaaa',
      inject: _ => [_.alpha.other(_.beta.path)]
    })

    const regA = asRegistration(withInjectA)
    const regB = asRegistration(withInjectB)

    assert.notEqual(regA.hash, regB.hash)
  })

  await t.test('is deterministic for the same component shape', () => {
    const depsForSum = ({ data: { first, second } }) => { first; second }
    const sum = ({ deps: { data: { first, second } } }) => first + second
    const first = () => 1
    const second = ({ deps: { data: { first } } }) => first + 1
    const depsForSecond = ({ data: { first } }) => first

    const compA = component('calc')
      .data('first', { fnc: first })
      .data('second', { deps: depsForSecond, fnc: second })
      .task('sum', { deps: depsForSum, fnc: sum })

    const compB = component('calc')
      .task('sum', { deps: depsForSum, fnc: sum })
      .data('second', { deps: depsForSecond, fnc: second })
      .data('first', { fnc: first })

    const registrationA = asRegistration(compA)
    const registrationB = asRegistration(compB)

    assert.equal(registrationA.hash, registrationB.hash)
  })
})

test('full registration payload snapshot', () => {
  const doubleSeed = ({ deps: { data: { seed } } }) => seed * 2
  const increment = ({ deps: { data: { doubled } } }) => doubled + 1
  const summarize = ({ deps: { data: { doubled }, task: { increment } } }) => ({ doubled, increment })
  const injectDeferredReady = _ => [_.words.deferred.ready]
  const injectDoubled = _ => [_.words.data.doubled]
  const injectSummary = _ => [_.words.data.doubled, _.words.task.increment]

  const comp = component('full-registration-payload')
    .import('shared-lib', { hash: 'abc123' })
    .data('seed', { deps: ({ deferred: { ready } }) => ready, inject: injectDeferredReady })
    .data('doubled', { deps: ({ data: { seed } }) => seed, inject: injectDoubled, fnc: doubleSeed })
    .task('increment', { deps: ({ data: { doubled } }) => doubled, inject: injectDoubled, fnc: increment })
    .task('summary', { deps: ({ data: { doubled }, task: { increment } }) => { doubled; increment }, inject: injectSummary, fnc: summarize })

  const registration = asRegistration(comp)
  assert.match(registration.hash, /^[a-f0-9]{64}$/)

  const relFromTestRoot = (file) => path.relative(path.resolve(import.meta.dirname, '..', '..'), file)
  const stripCodeRef = ({ file, line, column }) => ({ file: relFromTestRoot(file), line, column })
  const sanitize = (reg) => ({
    name: reg.name,
    hash: reg.hash,
    imports: reg.imports.map(({ name, hash, inject, codeRef }) => ({
      name,
      hash,
      inject,
      codeRef: stripCodeRef(codeRef),
    })),
    data: reg.data.map(({ name, deps, inject, fnc, codeRef }) => ({
      name,
      deps,
      inject,
      fnc,
      codeRef: stripCodeRef(codeRef),
    })),
    tasks: reg.tasks.map(({ name, deps, inject, fnc, codeRef }) => ({
      name,
      deps,
      inject,
      fnc,
      codeRef: stripCodeRef(codeRef),
    })),
  })

  const sanitized = sanitize(registration)
  const codeRefFor = (collection, name) => sanitized[collection].find((node) => node.name === name)?.codeRef

  const expected = {
    name: 'full-registration-payload',
    hash: registration.hash,
    imports: [
      {
        name: 'shared-lib',
        hash: 'abc123',
        inject: {},
        codeRef: codeRefFor('imports', 'shared-lib'),
      },
    ],
    data: [
      {
        name: 'seed',
        deps: ['deferred.ready'],
        inject: ['words.deferred.ready'],
        fnc: undefined,
        codeRef: codeRefFor('data', 'seed'),
      },
      {
        name: 'doubled',
        deps: ['data.seed'],
        inject: ['words.data.doubled'],
        fnc: String(doubleSeed),
        codeRef: codeRefFor('data', 'doubled'),
      },
    ],
    tasks: [
      {
        name: 'increment',
        deps: ['data.doubled'],
        inject: ['words.data.doubled'],
        fnc: String(increment),
        codeRef: codeRefFor('tasks', 'increment'),
      },
      {
        name: 'summary',
        deps: ['data.doubled', 'task.increment'],
        inject: ['words.data.doubled', 'words.task.increment'],
        fnc: String(summarize),
        codeRef: codeRefFor('tasks', 'summary'),
      },
    ],
  }

  assert.deepEqual(sanitized, expected)
})
