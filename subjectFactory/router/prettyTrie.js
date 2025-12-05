export function prettyTrie(trie, tokens) {
  const out = []
  const indent = (n) => '  '.repeat(n)
  const pickHandler = (val) => {
    if (Array.isArray(val)) {
      for (const fn of val) if (typeof fn === 'function') return fn
      return null
    }
    return typeof val === 'function' ? val : null
  }
  const emit = (node, startIndex, level) => {
    const handler = pickHandler(node.$handlers ?? node.$handler)
    if (startIndex === 0 && level === 0 && typeof handler === 'function') {
      const fn = handler
      const fnName = typeof fn === 'function' && fn.name ? fn.name : ''
      const leafLabel = fnName ? ` [leaf:${fnName}]` : ' [leaf]'
      out.push(`default${leafLabel}`)
    }
    for (let i = startIndex; i < tokens.length; i++) {
      const t = tokens[i]
      const bucket = node[t]
      if (!bucket) continue
      const vals = Object.keys(bucket).sort()
      for (const val of vals) {
        const child = bucket[val]
        const fn = pickHandler(child?.$handlers ?? child?.$handler)
        const fnName = typeof fn === 'function' && fn.name ? fn.name : ''
        let hasLower = false
        for (let j = i + 1; j < tokens.length && !hasLower; j++) {
          const lowerBucket = child && child[tokens[j]]
          if (lowerBucket && Object.keys(lowerBucket).length > 0) hasLower = true
        }
        if (fn || hasLower) {
          const leafLabel = fn ? (fnName ? ` [leaf:${fnName}]` : ' [leaf]') : ''
          out.push(`${indent(level)}${t}=${val}${leafLabel}`)
        }
        emit(child, i + 1, level + 1)
      }
    }
  }
  emit(trie, 0, 0)
  return out.join('\n')
}
