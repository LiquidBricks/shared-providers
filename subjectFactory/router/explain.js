import { parseSubject } from './subject.js'

export function explainSubject(subject, state) {
  const tokens = state.tokens
  const trie = state.trie
  const { params, extParts } = parseSubject(subject, tokens)
  const baseLen = tokens.length

  const matches = []
  const fnName = (fn) => (typeof fn === 'function' && fn.name ? fn.name : 'handler')
  const normalizeHandlers = (val) => {
    if (Array.isArray(val)) return val.filter(fn => typeof fn === 'function')
    return typeof val === 'function' ? [val] : []
  }

  const traverse = (node, baseStartIndex, matchedCount, matchedValues, extSeq, extIdx) => {
    if (!node) return
    const handlers = normalizeHandlers(node.$handlers ?? node.$handler)
    if (handlers.length > 0) {
      const pre = Array.isArray(node.$pre) ? node.$pre.slice() : []
      const post = Array.isArray(node.$post) ? node.$post.slice() : []
      matches.push({
        score: matchedCount,
        values: { ...matchedValues },
        handler: handlers[0],
        handlers,
        handlerName: fnName(handlers[0]),
        handlerNames: handlers.map(fnName),
        pre,
        preNames: pre.map(fnName),
        post,
        postNames: post.map(fnName),
        kind: matchedCount === 0 ? 'default' : 'route',
      })
    }
    for (let i = baseStartIndex; i < tokens.length; i++) {
      const t = tokens[i]
      const bucket = node[t]
      if (!bucket) continue
      const val = String(params[t])
      if (Object.prototype.hasOwnProperty.call(bucket, val)) {
        traverse(bucket[val], i + 1, matchedCount + 1, { ...matchedValues, [t]: val }, extSeq, extIdx)
      }
    }
    if (baseStartIndex >= tokens.length) {
      const seq = Array.isArray(node.$tokensExt) && node.$tokensExt.length > 0
        ? (extSeq && extSeq.length > 0 ? extSeq.concat(node.$tokensExt) : node.$tokensExt.slice())
        : (extSeq || [])
      if (seq.length > 0) {
        const nextIdx = (extIdx >>> 0)
        if (nextIdx < seq.length) {
          const t = seq[nextIdx]
          const v = extParts[nextIdx]
          const bucket = node[t]
          if (bucket && Object.prototype.hasOwnProperty.call(bucket, String(v))) {
            const child = bucket[String(v)]
            traverse(child, tokens.length, matchedCount + 1, { ...matchedValues, [t]: String(v) }, seq, nextIdx + 1)
          }
        }
      }
    }
  }
  traverse(trie, 0, 0, {}, [], 0)

  let best = null
  for (const m of matches) if (!best || m.score > best.score) best = m
  const competing = best ? matches.filter(m => m !== best && m.score < best.score).sort((a, b) => b.score - a.score) : []

  const info = {
    subject,
    params,
    tokens: tokens.slice(),
    summary: {
      matchedLeaves: matches.length,
      bestScore: best ? best.score : -1,
      hasDefault: normalizeHandlers(trie.$handlers ?? trie.$handler).length > 0,
    },
    best: best || null,
    competing,
    allMatches: matches.sort((a, b) => b.score - a.score),
  }

  return Object.freeze(info)
}
