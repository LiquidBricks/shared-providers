// Console logger adapter implementing { error, warn, info, debug }
// Usage:
//   import { createConsoleLogger } from './loggers/console.js'
//   const logger = createConsoleLogger({ logger: console })
//   logger.info({ ts: Date.now(), level: 'info', msg: 'started' })
//
// With diagnostics():
//   import { diagnostics } from '../diagnostics.js'
//   const logger = createConsoleLogger()
//   const d = diagnostics({ logger })
//   d.warn(false, 'CFG_DEFAULT', 'Using defaults')

export function createConsoleLogger({ logger = console, now = () => Date.now() } = {}) {
  const envelope = () => ({ ts: now(), kind: 'log' })
  const safeLog = (level, attributes) => {
    try {
      const payload = { ...envelope(), level, attributes }
      logger[level](payload)
    } catch { /* ignore */ }
  }
  return {
    error(attributes) { if (attributes) safeLog('error', attributes) },
    warn(attributes) { if (attributes) safeLog('warn', attributes) },
    info(attributes) { if (attributes) safeLog('info', attributes) },
    debug(attributes) { if (attributes) safeLog('debug', attributes) },
  }
}

export default createConsoleLogger
