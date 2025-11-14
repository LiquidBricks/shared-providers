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
  debug = false,
} = {}) {
  // Optional debug helper
  const dbg = (...args) => { if (debug) { try { console.log('[diagnostics][nats:metrics]', ...args) } catch {} } }

  dbg('init', { hasNats: !!natsContext, subjectRoot, hasSubjectFn: typeof subjectFor === 'function' })

  // Resolve subject based on kind ('count' | 'timing')
  const subject = (kind) => {
    try {
      if (typeof subjectFor === 'function') {
        const s = subjectFor(kind)
        dbg('subject:custom', { kind, subject: s })
        return s
      }
    } catch { /* ignore bad subject function */ }
    const s = `${subjectRoot}.${kind}`
    dbg('subject:default', { kind, subject: s })
    return s
  }

  const safePublish = (subj, entry) => {
    try {
      dbg('publish:start', { subject: subj, entry })
      const json = JSON.stringify(entry)
      dbg('publish:json', { subject: subj, bytes: json?.length })
      const p = natsContext?.publish?.(subj, json)
      if (!p) dbg('publish:noop', { subject: subj })
      // Avoid unhandled rejections; at least log the error
      if (p && typeof p.then === 'function') {
        if (debug) p.then(
          () => { dbg('publish:ok', { subject: subj }) },
          (err) => { dbg('publish:promise-error', { subject: subj, error: String(err && err.message || err) }) }
        )
        p.catch((err) => {
          try { console.log('[diagnostics][nats:metrics] publish error:', err) } catch {}
        })
      }
    } catch (err) {
      dbg('publish:throw', { subject: subj, error: String(err && err.message || err) })
      try { console.log('[diagnostics][nats:metrics] publish error:', err) } catch {}
    }
  }

  const envelope = () => ({ ts: now(), kind: 'metric' })

  return {
    count(code, n = 1, attributes) {
      if (!code) { dbg('skip:invalid-count', { code, n }); return } // ignore invalid
      const entry = { ...envelope(), type: 'count', code, n, attributes }
      const subj = subject('count')
      dbg('compose', { kind: 'count', subject: subj })
      safePublish(subj, entry)
    },
    timing(name, ms, attributes) {
      if (!name || typeof ms !== 'number') { dbg('skip:invalid-timing', { name, ms }); return } // ignore invalid
      const entry = { ...envelope(), type: 'timing', name, ms, attributes }
      const subj = subject('timing')
      dbg('compose', { kind: 'timing', subject: subj })
      safePublish(subj, entry)
    },
  }
}

export default createNatsMetrics
