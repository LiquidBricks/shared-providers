// Console metrics adapter implementing { count, timing }
// Usage:
//   import { createConsoleMetrics } from './metrics/console.js'
//   const metrics = createConsoleMetrics({ logger: console, prefix: 'app' })
//   metrics.count('ERR_DB_CONNECT', 1, { host: 'db' })
//   metrics.timing('startup', 123, { pid: process.pid })

export function createConsoleMetrics({ logger = console, prefix = 'metrics' } = {}) {
  const safeLog = (entry) => {
    try { logger?.info?.(entry); } catch { /* ignore */ }
  };
  const base = () => ({ ts: Date.now(), source: prefix });
  return {
    count(code, n = 1, meta) {
      if (!code) return; // ignore invalid
      safeLog({ ...base(), type: 'count', code, n, meta });
    },
    timing(name, ms, meta) {
      if (!name || typeof ms !== 'number') return; // ignore invalid
      safeLog({ ...base(), type: 'timing', name, ms, meta });
    },
  };
}

export default createConsoleMetrics;

