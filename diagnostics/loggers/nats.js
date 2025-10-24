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
} = {}) {
  // Resolve subject based on level ('error' | 'warn' | 'info' | 'debug')
  const subject = (level) => {
    try {
      if (typeof subjectFor === 'function') return subjectFor(level)
    } catch { /* ignore bad subject function */ }
    return `${subjectRoot}.${level}`
  }

  const safePublish = (subj, entry) => {
    try {
      const json = JSON.stringify(entry)
      const p = natsContext?.publish?.(subj, json)
      // Avoid unhandled rejections
      if (p && typeof p.then === 'function') p.catch(() => {})
    } catch { /* ignore sync publish errors */ }
  }

  const publish = (level, entry) => {
    if (!entry) return
    safePublish(subject(level), entry)
  }

  return {
    error(entry) { publish('error', entry) },
    warn(entry) { publish('warn', entry) },
    info(entry) { publish('info', entry) },
    debug(entry) { publish('debug', entry) },
  }
}

export default createNatsLogger

