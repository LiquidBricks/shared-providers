// NATS metrics adapter implementing { count, timing }
// Publishes JSON payloads over JetStream via natsContext.publish
// Default subjects:
//   {subjectRoot}.count
//   {subjectRoot}.timing
// Usage:
//   import { createNatsMetrics } from './metrics/nats.js'
//   const metrics = createNatsMetrics({ natsContext, subjectRoot: 'metrics' })
//   metrics.count('ERR_DB_CONNECT', 1, { host: 'db' })
//   metrics.timing('startup', 123, { pid: process.pid })


export function createNatsMetrics({ natsContext, subjectRoot = 'metrics' } = {}) {

  const publishJson = async (subject, obj) => {
    try {
      await natsContext.publish(subject, JSON.stringify(obj));
    } catch {
      // intentionally ignore metrics publish failures
    }
  };

  const base = () => ({ ts: Date.now() });

  return {
    count(code, n = 1, meta) {
      if (!code) return;
      const subject = `${subjectRoot}.count`;
      // Fire-and-forget; do not throw
      publishJson(subject, { ...base(), type: 'count', code, n, meta });
    },
    timing(name, ms, meta) {
      if (!name || typeof ms !== 'number') return;
      const subject = `${subjectRoot}.timing`;
      // Fire-and-forget; do not throw
      publishJson(subject, { ...base(), type: 'timing', name, ms, meta });
    },
  };
}

export default createNatsMetrics;