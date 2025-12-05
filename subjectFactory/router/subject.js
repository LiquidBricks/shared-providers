import { ROUTER_SUBJECT_REQUIRED } from '../../codes.js'

export function parseSubject(subject, tokens) {
  if (typeof subject !== 'string') {
    const err = new Error('subject must be a dot-separated string')
    err.code = ROUTER_SUBJECT_REQUIRED
    throw err
  }
  const parts = subject.split('.')
  const params = {}
  const baseLen = tokens.length
  const len = Math.min(baseLen, parts.length)
  for (let i = 0; i < len; i++) params[tokens[i]] = parts[i]
  for (let i = len; i < baseLen; i++) params[tokens[i]] = undefined
  const extParts = parts.slice(baseLen)

  return { parts, params, extParts }
}
