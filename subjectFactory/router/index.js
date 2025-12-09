import { validateRouterConfig } from './config.js'
import { explainSubject } from './explain.js'
import { prettyTrie } from './prettyTrie.js'
import { registerDefault, registerRoute } from './routeBuilder.js'
import { handleRequest } from './request.js'
import { createRouterState } from './state.js'
import { s } from './symbols.js'

export { s }

export function router(config = {}) {
  const { tokens, context, config: normalizedConfig } = validateRouterConfig(config)
  const state = createRouterState({ config: normalizedConfig, tokens, context })

  const api = {
    get config() { return normalizedConfig },
    get tokens() { return state.tokens.slice() },
    get routes() { return state.routes.slice() },
    get middlewares() { return state.middlewares.slice() },
    get trie() { return JSON.parse(JSON.stringify(state.trie)) },
    get context() { return state.context },

    on(criteria, handler, opts = {}) { state.routes.push({ criteria: criteria || {}, handler, opts }); return api },
    use(fn) { if (typeof fn === 'function') state.middlewares.push(fn); return api },

    error(fn) { state.hooks.onError = typeof fn === 'function' ? fn : null; return api },
    abort(fn) { state.hooks.onAbort = typeof fn === 'function' ? fn : null; return api },
    before(fn) { state.hooks.before = typeof fn === 'function' ? fn : null; return api },
    after(fn) { state.hooks.after = typeof fn === 'function' ? fn : null; return api },
    beforeEach(fn) { state.hooks.beforeEach = typeof fn === 'function' ? fn : null; return api },
    afterEach(fn) { state.hooks.afterEach = typeof fn === 'function' ? fn : null; return api },

    route(values = {}, routeConfig = {}) { registerRoute(state, values, routeConfig); return api },
    default(routeConfig = {}) { registerDefault(state, routeConfig); return api },

    prettyTrie() { return prettyTrie(state.trie, state.tokens) },

    request(arg = {}) {
      return handleRequest(arg, state)
    },

    explain(subject) {
      return explainSubject(subject, state)
    },
  }

  return api
}

export default router
