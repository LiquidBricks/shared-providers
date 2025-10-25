// Console metrics adapter implementing { count, timing }
// Usage:
//   import { createConsoleMetrics } from './metrics/console.js'
//   const metrics = createConsoleMetrics()
//   metrics.count('ERR_DB_CONNECT', 1, { host: 'db' })
//   metrics.timing('startup', 123, { pid: process.pid })

export function createConsoleMetrics({ now = () => Date.now() } = {}) {
  const safeLog = (entry) => {
    try { console.info(entry); } catch { /* ignore */ }
  };
  const envelope = () => ({ ts: now(), kind: 'metric' })
  return {
    count(code, n = 1, attributes) {
      if (!code) return; // ignore invalid
      safeLog({ ...envelope(), type: 'count', code, n, attributes });
    },
    timing(name, ms, attributes) {
      if (!name || typeof ms !== 'number') return; // ignore invalid
      safeLog({ ...envelope(), type: 'timing', name, ms, attributes });
    },
  };
}

export default createConsoleMetrics;
