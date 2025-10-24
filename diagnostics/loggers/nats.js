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
} = {}) {
  // Resolve subject based on level ('error' | 'warn' | 'info' | 'debug')
  const subject = (level) => {
    try {
      if (typeof subjectFor === 'function') return subjectFor(level)
    } catch { /* ignore bad subject function */ }
    return `${subjectRoot}.${level}`
  }

  const safePublish = (subj, payload) => {
    try {
      const json = JSON.stringify(payload)
      const p = natsContext?.publish?.(subj, json)
      // Avoid unhandled rejections
      if (p && typeof p.then === 'function') p.catch(() => { })
    } catch { /* ignore sync publish errors */ }
  }

  const envelope = () => ({ ts: now(), kind: 'log' })
  const publish = (level, attributes) => {
    if (!attributes) return
    // Always include the log level; nest attributes as attributes
    const payload = { ...envelope(), level, attributes }
    safePublish(subject(level), payload)
  }

  return {
    error(attributes) { publish('error', attributes) },
    warn(attributes) { publish('warn', attributes) },
    info(attributes) { publish('info', attributes) },
    debug(attributes) { publish('debug', attributes) },
  }
}

export default createNatsLogger
