import test from 'node:test'
import assert from 'node:assert/strict'

import { router } from '../../../subjectFactory/index.js'

test('prettyTrie prints trie structure', () => {
  const r = router({ tokens: ['a', 'b', 'c', 'd'] })
  function onBD({ ctx }) { }
  function onAXBYCZ({ ctx }) { }
  r.route({ b: 'y', d: 'w' }, { handler: onBD })
   .default({ handler({ ctx }) {} })
  let pretty = r.prettyTrie()
  assert.equal(pretty, [
    'default [leaf:handler]',
    'b=y',
    '  d=w [leaf:onBD]',
  ].join('\n'))

  r.route({ a: 'x', b: 'y', c: 'z' }, { handler: onAXBYCZ })
  pretty = r.prettyTrie()
  assert.equal(pretty, [
    'default [leaf:handler]',
    'a=x',
    '  b=y',
    '    c=z [leaf:onAXBYCZ]',
    'b=y',
    '  d=w [leaf:onBD]',
  ].join('\n'))
})

