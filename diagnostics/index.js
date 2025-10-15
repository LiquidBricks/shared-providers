import { Codes } from './codes.js';
// diagnostics.js
export function diagnostics({
  logger = console,
  metrics = null,                     // { count(code,n,meta), timing(name,ms,meta) }
  sample = () => true,                // (code, level, meta) => boolean
  rateLimit = makeRateLimiter(),      // (code, level) => boolean
  redact = (m) => m ?? {},
  now = () => Date.now(),
  context = () => ({}),               // () => { requestId, runId, subject, component, ... }
} = {}) {

  class DiagnosticError extends Error {
    constructor(type, code, message, meta, opts = {}) {
      super(message, { cause: opts.cause });
      this.name = 'DiagnosticError';
      this.type = type;         // 'Invariant' | 'Precondition' | 'Operational'
      this.code = code;         // 'KV_INVARIANT_V_MISSING'
      this.meta = redact({ ...context(), ...meta });
    }
    toJSON() {
      return {
        name: this.name,
        type: this.type,
        code: this.code,
        message: this.message,
        meta: this.meta,
        cause: this.cause && { name: this.cause.name, message: this.cause.message }
      };
    }
  }

  const emit = (level, payload) => {
    const { code } = payload;
    if (!sample(code, level, payload) || !rateLimit(code, level)) return;

    const entry = { ts: now(), ...context(), ...payload };
    try { logger?.[level]?.(entry); } catch { }
    if (metrics && code && (level === 'error' || level === 'warn')) {
      try { metrics.count(code, 1, entry); } catch { }
    }
  };

  const fail = (type, code, msg, meta, opts) => {
    emit('error', { level: 'error', code, msg, meta: redact(meta) });
    const err = new DiagnosticError(type, code, msg, meta, opts);
    throw err;
  };

  return {
    // asserts
    invariant(cond, code, msg, meta) {
      if (!cond) fail('Invariant', code, msg, meta);
    },
    require(cond, code, msg, meta) {
      if (!cond) fail('Precondition', code, msg, meta);
    },

    // explicit failure (operational)
    error(code, msg, meta, opts) {
      fail('Operational', code, msg, meta, opts);
    },

    // non-throwing signals
    warn(cond, code, msg, meta) {
      if (cond) return;
      emit('warn', { level: 'warn', code, msg, meta: redact(meta) });
    },
    info(msg, meta) {
      emit('info', { level: 'info', msg, meta: redact(meta) });
    },
    debug(msg, meta) {
      emit('debug', { level: 'debug', msg, meta: redact(meta) });
    },

    // utilities
    once(key, fn) {
      const seen = onceCache.get(key);
      if (seen) return;
      onceCache.set(key, true);
      return fn?.();
    },
    warnOnce(code, msg, meta) {
      return this.once(`warn:${code}`, () => this.warn(false, code, msg, meta));
    },
    timer(name, baseMeta) {
      const start = now();
      return {
        stop(extraMeta) {
          const ms = now() - start;
          const meta = { ...baseMeta, ...extraMeta, duration_ms: ms };
          metrics?.timing?.(name, ms, meta);
          emit('info', { level: 'info', code: `TIMER_${name}`, msg: 'timer.stop', meta });
          return ms;
        }
      };
    },
    child(scopeMeta) {
      const parent = this;
      return diagnostics({
        logger,
        metrics,
        sample,
        rateLimit,
        redact,
        now,
        context: () => ({ ...context(), ...scopeMeta }),
      });
    },
    withContext(ctx, fn) {
      // If you use AsyncLocalStorage, bind here.
      // For now, just compose a child.
      return this.child(ctx);
    },

    // surfacing the class is handy for instanceof in tests
    DiagnosticError,
  };
}

// simple token-bucket-ish per (code,level)
function makeRateLimiter({ bucketMs = 1000, burst = 10 } = {}) {
  const buckets = new Map(); // key -> { ts,count }
  return (code = 'NO_CODE', level = 'info') => {
    const key = `${level}:${code}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.ts > bucketMs) {
      buckets.set(key, { ts: now, count: 1 });
      return true;
    }
    if (b.count < burst) { b.count++; return true; }
    return false; // drop
  };
}

const onceCache = new Map();
export { Codes };
export * as metricsProviders from './metrics/index.js'
