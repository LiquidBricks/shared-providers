import { ROUTER_CONFIG_TOKENS_REQUIRED, ROUTER_TOKENS_REQUIRED } from '../../codes.js'

export function validateRouterConfig(config = {}) {
  const cfg = (config && typeof config === 'object') ? config : {}
  if (!Array.isArray(cfg.tokens)) {
    const err = new Error('router config with `tokens` array is required')
    err.code = ROUTER_CONFIG_TOKENS_REQUIRED
    throw err
  }
  if (cfg.tokens.length === 0) {
    const err = new Error('tokens must be a non-empty array')
    err.code = ROUTER_TOKENS_REQUIRED
    throw err
  }

  return {
    tokens: cfg.tokens,
    context: cfg.context ?? {},
    config: cfg,
  }
}
