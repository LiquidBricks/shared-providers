// Telemetry subject builder with rigid token rules
// Shapes:
// - tele.log.<version>
// - tele.metric.<entity>.<version>
// - tele.trace.<entity>.<version>
// Where:
//   channel ∈ { log, metric, trace }
//   entity  ∈ { counter, histogram } when channel=metric
//           ∈ { span } when channel=trace
//   version: freeform (defaults to '_', like basic subject normalization)
import { SUBJECT_TOKEN_OVERRIDE, SUBJECT_TOKEN_UNKNOWN } from '../../codes.js'

const isMissing = (v) => v === undefined || v === null || v === ''
const norm = (v) => (isMissing(v) ? '_' : String(v))

const CHANNELS = ['log', 'metric', 'trace']
const ENTITIES = {
  metric: ['counter', 'histogram'],
  trace: ['span'],
}

export function create(init = {}) {
  const state = Object.create(null)

  // Optional initialization from a subject string, e.g. tele.metric.counter.v1
  if (typeof init === 'string') {
    const parts = init.split('.')
    if (parts[0] !== 'tele') {
      const err = new Error(`Telemetry subject must start with 'tele'`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { expected: 'tele', received: parts[0] }
      throw err
    }
    const channel = parts[1]
    if (!CHANNELS.includes(channel)) {
      const err = new Error(`Invalid telemetry channel: ${channel}`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { channel }
      throw err
    }
    state.channel = channel
    if (channel === 'log') {
      state.version = parts[2]
    } else if (channel === 'metric') {
      state.entity = parts[2]
      state.version = parts[3]
    } else if (channel === 'trace') {
      state.entity = parts[2]
      state.version = parts[3]
    }
  } else if (init && typeof init === 'object') {
    const { channel, entity, version } = init
    if (channel !== undefined) ensureChannel(channel)
    if (entity !== undefined) ensureEntity(entity)
    if (version !== undefined) ensureVersion(version)
  }

  function ensureNotOverride(key, value) {
    const cur = state[key]
    const has = cur !== undefined
    if (has && cur !== value) {
      const err = new Error(`Subject token already set: ${key}`)
      err.code = SUBJECT_TOKEN_OVERRIDE
      err.meta = { key, current: cur, attempted: value }
      throw err
    }
    if (!has) state[key] = value
  }

  function ensureChannel(v) {
    if (!CHANNELS.includes(v)) {
      const err = new Error(`Invalid telemetry channel: ${v}`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { channel: v, allowed: CHANNELS.slice() }
      throw err
    }
    ensureNotOverride('channel', v)
  }

  function ensureEntity(v) {
    const ch = state.channel
    if (!ch) {
      const err = new Error(`Entity cannot be set before channel`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { entity: v }
      throw err
    }
    const allowed = ENTITIES[ch]
    if (!allowed) {
      const err = new Error(`Entity not allowed for channel: ${ch}`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { channel: ch, entity: v }
      throw err
    }
    if (!allowed.includes(v)) {
      const err = new Error(`Invalid entity '${v}' for channel '${ch}'`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      err.meta = { channel: ch, entity: v, allowed: allowed.slice() }
      throw err
    }
    ensureNotOverride('entity', v)
  }

  function ensureVersion(v) {
    ensureNotOverride('version', String(v))
  }

  const parts = () => {
    const tokens = ['tele']
    const ch = state.channel
    if (!ch) {
      const err = new Error(`Telemetry channel is required`)
      err.code = SUBJECT_TOKEN_UNKNOWN
      throw err
    }
    tokens.push(ch)
    if (ch === 'log') {
      tokens.push(norm(state.version))
    } else if (ch === 'metric' || ch === 'trace') {
      if (isMissing(state.entity)) {
        const err = new Error(`Telemetry entity required for channel '${ch}'`)
        err.code = SUBJECT_TOKEN_UNKNOWN
        throw err
      }
      tokens.push(state.entity)
      tokens.push(norm(state.version))
    }
    return tokens
  }

  const build = () => parts().join('.')

  const api = {
    // Setters
    channel(v) { ensureChannel(v); return api },
    entity(v) { ensureEntity(v); return api },
    version(v) { ensureVersion(v); return api },

    // Convenience helpers
    log() { ensureChannel('log'); return api },
    metric() { ensureChannel('metric'); return api },
    trace() { ensureChannel('trace'); return api },

    // Materialize
    build,
    toString: build,
    parts,
    // Inspect
    get value() { return { ...state } },
  }

  return api
}
