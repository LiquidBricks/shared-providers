import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getCodeLocation } from '../../debug/getCodeLocation.js'

const thisFile = fileURLToPath(import.meta.url)

test('captures caller information with default depth', () => {
  const loc = (function callSite() {
    return getCodeLocation()
  })()

  assert.equal(path.resolve(loc.file), path.resolve(thisFile))
  assert.equal(loc.functionName, 'callSite')
  assert.equal(typeof loc.line, 'number')
  assert.ok(loc.line > 0)
  assert.equal(typeof loc.column, 'number')
  assert.ok(loc.column > 0)
  assert.equal(typeof loc.stack, 'string')
  assert.ok(loc.stack.includes('callSite'))
  assert.equal(loc.file.startsWith('file://'), false, 'file should be normalized, not a file:// URL')
})

test('selects deeper caller when depth increases', () => {
  function levelOne() {
    return levelTwo()
  }

  function levelTwo() {
    const depthTwo = getCodeLocation()      // points at levelTwo
    const depthThree = getCodeLocation(3)   // points at levelOne
    return { depthTwo, depthThree }
  }

  const { depthTwo, depthThree } = levelOne()

  assert.equal(depthTwo.functionName, 'levelTwo')
  assert.equal(depthThree.functionName, 'levelOne')
  assert.equal(path.resolve(depthThree.file), path.resolve(thisFile))
  assert.ok(depthThree.line && depthTwo.line && depthThree.line < depthTwo.line, 'higher depth should refer to an earlier frame')
})
