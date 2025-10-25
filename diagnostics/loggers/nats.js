// NATS logger adapter implementing { error, warn, info, debug }
// Usage:
//   import { createNatsLogger } from './loggers/nats.js'
//   const logger = createNatsLogger({ natsContext, subjectRoot: 'logs' })
//   logger.info({ ts: Date.now(), level: 'info', msg: 'started' })
//
// With diagnostics():
//   import { diagnostics } from '../diagnostics.js'
//   const logger = createNatsLogger({ natsContext })
//   const d = diagnostics({ logger })
//   d.info('service booting')
//
// Custom subject function:
//   const logger = createNatsLogger({
//     natsContext,
//     subject: (level) => `my.app.logs.${level}` // level is 'error' | 'warn' | 'info' | 'debug'
//   })

export function createNatsLogger({
  natsContext,
  subjectRoot = 'logs',
  subject: subjectFor,
  now = () => Date.now(),
  debug = false,
} = {}) {
  // Optional debug helper
  const dbg = (...args) => { if (debug) { try { console.log('[diagnostics][nats:logger]', ...args) } catch {} } }

  dbg('init', { hasNats: !!natsContext, subjectRoot, hasSubjectFn: typeof subjectFor === 'function' })

  // Resolve subject based on level ('error' | 'warn' | 'info' | 'debug')
  const subject = (level) => {
    try {
      if (typeof subjectFor === 'function') {
        const s = subjectFor(level)
        dbg('subject:custom', { level, subject: s })
        return s
      }
    } catch { /* ignore bad subject function */ }
    const s = `${subjectRoot}.${level}`
    dbg('subject:default', { level, subject: s })
    return s
  }

  const safePublish = (subj, payload) => {
    try {
      dbg('publish:start', { subject: subj, payload })
      const json = JSON.stringify(payload)
      dbg('publish:json', { subject: subj, bytes: json?.length })
      const p = natsContext?.publish?.(subj, json)
      if (!p) dbg('publish:noop', { subject: subj })
      // Avoid unhandled rejections; at least log the error
      if (p && typeof p.then === 'function') {
        if (debug) p.then(
          () => { dbg('publish:ok', { subject: subj }) },
          // Also capture via dbg, in addition to the general catch below
          (err) => { dbg('publish:promise-error', { subject: subj, error: String(err && err.message || err) }) }
        )
        p.catch((err) => {
          try { console.log('[diagnostics][nats:logger] publish error:', err) } catch {}
        })
      }
    } catch (err) {
      dbg('publish:throw', { subject: subj, error: String(err && err.message || err) })
      try { console.log('[diagnostics][nats:logger] publish error:', err) } catch {}
    }
  }

  const envelope = () => ({ ts: now(), kind: 'log' })
  const publish = (level, attributes) => {
    if (!attributes) { dbg('skip:empty-attributes', { level }); return }
    // Always include the log level; nest attributes as attributes
    const payload = { ...envelope(), level, attributes }
    const subj = subject(level)
    dbg('compose', { level, subject: subj })
    safePublish(subj, payload)
  }

  return {
    error(attributes) { publish('error', attributes) },
    warn(attributes) { publish('warn', attributes) },
    info(attributes) { publish('info', attributes) },
    debug(attributes) { publish('debug', attributes) },
  }
}

export default createNatsLogger
