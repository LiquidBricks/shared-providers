// NATS metrics adapter implementing { count, timing }
// Usage:
//   import { createNatsMetrics } from './metrics/nats.js'
//   const metrics = createNatsMetrics({ natsContext, subjectRoot: 'metrics' })
//   metrics.count('ERR_DB_CONNECT', 1, { host: 'db' })
//   metrics.timing('startup', 123, { pid: process.pid })
//
// Custom subject function:
//   const metrics = createNatsMetrics({
//     natsContext,
//     subject: (kind) => `my.app.metrics.${kind}` // kind is 'count' or 'timing'
//   })

export function createNatsMetrics({
  natsContext,
  subjectRoot = 'metrics',
  subject: subjectFor,
  now = () => Date.now(),
} = {}) {
  // Resolve subject based on kind ('count' | 'timing')
  const subject = (kind) => {
    try {
      if (typeof subjectFor === 'function') return subjectFor(kind)
    } catch { /* ignore bad subject function */ }
    return `${subjectRoot}.${kind}`
  }

  const safePublish = (subj, entry) => {
    try {
      const json = JSON.stringify(entry)
      const p = natsContext?.publish?.(subj, json)
      // Avoid unhandled rejections
      if (p && typeof p.then === 'function') p.catch(() => { })
    } catch { /* ignore sync publish errors */ }
  }

  const envelope = () => ({ ts: now(), kind: 'metric' })

  return {
    count(code, n = 1, attributes) {
      if (!code) return // ignore invalid
      const entry = { ...envelope(), type: 'count', code, n, attributes }
      safePublish(subject('count'), entry)
    },
    timing(name, ms, attributes) {
      if (!name || typeof ms !== 'number') return // ignore invalid
      const entry = { ...envelope(), type: 'timing', name, ms, attributes }
      safePublish(subject('timing'), entry)
    },
  }
}

export default createNatsMetrics
