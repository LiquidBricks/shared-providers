// Console logger adapter implementing { error, warn, info, debug }
// Usage:
//   import { createConsoleLogger } from './loggers/console.js'
//   const logger = createConsoleLogger({ logger: console, prefix: 'app' })
//   logger.info({ ts: Date.now(), level: 'info', msg: 'started' })
//
// With diagnostics():
//   import { diagnostics } from '../diagnostics.js'
//   const logger = createConsoleLogger({ prefix: 'svc' })
//   const d = diagnostics({ logger })
//   d.warn(false, 'CFG_DEFAULT', 'Using defaults')

export function createConsoleLogger({ logger = console, prefix = 'logs' } = {}) {
  const base = () => ({ source: prefix })
  const safeLog = (level, entry) => {
    try { logger?.[level]?.({ ...base(), ...entry }); } catch { /* ignore */ }
  }
  return {
    error(entry) { if (entry) safeLog('error', entry) },
    warn(entry) { if (entry) safeLog('warn', entry) },
    info(entry) { if (entry) safeLog('info', entry) },
    debug(entry) { if (entry) safeLog('debug', entry) },
  }
}

export default createConsoleLogger

