// Fluent router factory for token-aware routing
// v1: requires `tokens` (array), supports:
// - request({ subject, message }): parse dot-separated subject into per-call context; uses router-level context; passes `message` to hooks/handlers
// - route(values, config): build a trie across tokens for route definitions
// - prettyTrie(): human-friendly view of the trie

import { ROUTER_CONFIG_TOKENS_REQUIRED, ROUTER_TOKENS_REQUIRED, ROUTER_SUBJECT_REQUIRED, ROUTER_TOKEN_UNKNOWN, ROUTER_ROUTE_HANDLER_REQUIRED, ROUTER_ROUTE_HANDLER_FORBIDDEN, ROUTER_SUBROUTE_OVERRIDE, ROUTER_CHILDREN_SHAPE_INVALID } from '../codes.js'

function assertTokens(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.tokens)) {
    const err = new Error('router config with `tokens` array is required')
    err.code = ROUTER_CONFIG_TOKENS_REQUIRED
    throw err
  }
}

export function router(config = {}) {
  assertTokens(config)

  const tokens = config.tokens
  // Provide a router-level context that is passed to all hooks/handlers
  const routerContext = config.context ?? {}

  if (!tokens || tokens.length === 0) {
    const err = new Error('tokens must be a non-empty array')
    err.code = ROUTER_TOKENS_REQUIRED
    throw err
  }

  const routes = []
  const middlewares = []
  const trie = {}
  // Optional error handler set via api.error(fn)
  let onError = null

  const api = {
    get config() { return config },
    get tokens() { return tokens.slice() },
    get routes() { return routes.slice() },
    get middlewares() { return middlewares.slice() },
    get trie() { return JSON.parse(JSON.stringify(trie)) },
    get context() { return routerContext },

    on(criteria, handler, opts = {}) { routes.push({ criteria: criteria || {}, handler, opts }); return api },
    use(fn) { if (typeof fn === 'function') middlewares.push(fn); return api },

    // Register a router-level error handler invoked when any pre/handler/post throws
    error(fn) { if (typeof fn === 'function') onError = fn; else onError = null; return api },

    route(values = {}, routeConfig = {}) {
      // Internal helper to support pre/post aggregation across nested children
      const defineRoute = (vals = {}, cfg = {}, aggPre = [], aggPost = [], aggOnPreErr = [], aggOnPostErr = [], aggOnHandlerErr = [], aggOnErr = []) => {
        if (vals == null || typeof vals !== 'object') vals = {}
        for (const k of Object.keys(vals)) {
          if (!tokens.includes(k)) {
            const err = new Error(`Unknown token in route: ${k}`)
            err.code = ROUTER_TOKEN_UNKNOWN
            err.meta = { token: k }
            throw err
          }
        }

        // Descend to the node representing provided values
        let node = trie
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i]
          if (vals[t] === undefined) continue
          const v = String(vals[t])
          if (!node[t]) node[t] = {}
          if (!node[t][v]) node[t][v] = {}
          node = node[t][v]
        }

        const children = Array.isArray(cfg?.children) ? cfg.children : undefined
        const hasChildren = Array.isArray(children) && children.length > 0
        const hasHandler = typeof cfg?.handler === 'function'

        // Normalize hooks
        const preHooks = Array.isArray(cfg?.pre) ? cfg.pre.filter(fn => typeof fn === 'function') : []
        const postHooks = Array.isArray(cfg?.post) ? cfg.post.filter(fn => typeof fn === 'function') : []
        // Normalize error hooks (allow arrays or single functions)
        const onPreErrorHooks = Array.isArray(cfg?.onPreError) ? cfg.onPreError.filter(fn => typeof fn === 'function') : (typeof cfg?.onPreError === 'function' ? [cfg.onPreError] : [])
        const onPostErrorHooks = Array.isArray(cfg?.onPostError) ? cfg.onPostError.filter(fn => typeof fn === 'function') : (typeof cfg?.onPostError === 'function' ? [cfg.onPostError] : [])
        const onHandlerErrorHooks = Array.isArray(cfg?.onHandlerError) ? cfg.onHandlerError.filter(fn => typeof fn === 'function') : (typeof cfg?.onHandlerError === 'function' ? [cfg.onHandlerError] : [])
        const onErrorHooks = Array.isArray(cfg?.onError) ? cfg.onError.filter(fn => typeof fn === 'function') : (typeof cfg?.onError === 'function' ? [cfg.onError] : [])
        // Aggregate pre in parent→child order; post in child→parent order
        const nextPre = aggPre.length > 0 ? (preHooks.length > 0 ? aggPre.concat(preHooks) : aggPre.slice()) : preHooks.slice()
        const nextPost = aggPost.length > 0 ? (postHooks.length > 0 ? postHooks.concat(aggPost) : aggPost.slice()) : postHooks.slice()
        // Error handlers aggregate for locality LIFO (child-first). Put current level before existing agg.
        const nextOnPreErr = onPreErrorHooks.length > 0 ? onPreErrorHooks.concat(aggOnPreErr) : aggOnPreErr.slice()
        const nextOnPostErr = onPostErrorHooks.length > 0 ? onPostErrorHooks.concat(aggOnPostErr) : aggOnPostErr.slice()
        const nextOnHandlerErr = onHandlerErrorHooks.length > 0 ? onHandlerErrorHooks.concat(aggOnHandlerErr) : aggOnHandlerErr.slice()
        const nextOnErr = onErrorHooks.length > 0 ? onErrorHooks.concat(aggOnErr) : aggOnErr.slice()

        if (!hasChildren && !hasHandler) {
          const err = new Error('handler is required when no children are provided')
          err.code = ROUTER_ROUTE_HANDLER_REQUIRED
          throw err
        }
        if (hasChildren && hasHandler) {
          const err = new Error('handler is forbidden when children are provided')
          err.code = ROUTER_ROUTE_HANDLER_FORBIDDEN
          throw err
        }

        if (hasChildren) {
          // Validate and expand subroutes; only additive — may not override parent values
          for (const idx in children) {
            const child = children[idx]
            if (!Array.isArray(child) || child.length < 1) {
              const err = new Error('child route must be an array: [values, config]')
              err.code = ROUTER_CHILDREN_SHAPE_INVALID
              err.meta = { index: Number(idx) }
              throw err
            }
            const [childValuesRaw, childConfigRaw] = child
            const childValues = (childValuesRaw && typeof childValuesRaw === 'object') ? childValuesRaw : {}
            const childConfig = childConfigRaw || {}

            // Validate tokens in child
            for (const k of Object.keys(childValues)) {
              if (!tokens.includes(k)) {
                const err = new Error(`Unknown token in child route: ${k}`)
                err.code = ROUTER_TOKEN_UNKNOWN
                err.meta = { token: k }
                throw err
              }
            }

            // Enforce additive-only: cannot override parent values with a different value
            for (const k of Object.keys(vals)) {
              if (childValues[k] !== undefined && String(childValues[k]) !== String(vals[k])) {
                const err = new Error(`Child route overrides parent token: ${k}`)
                err.code = ROUTER_SUBROUTE_OVERRIDE
                err.meta = { token: k, parent: String(vals[k]), child: String(childValues[k]) }
                throw err
              }
            }

            // Combine values (parent precedence) and recurse with aggregated hooks
            const combinedValues = { ...childValues, ...vals }
            defineRoute(combinedValues, childConfig, nextPre, nextPost, nextOnPreErr, nextOnPostErr, nextOnHandlerErr, nextOnErr)
          }
        } else if (hasHandler) {
          node.$leaf = true
          node.$handler = cfg.handler
          if (nextPre.length > 0) node.$pre = nextPre
          if (nextPost.length > 0) node.$post = nextPost
          if (nextOnPreErr.length > 0) node.$onPreError = nextOnPreErr
          if (nextOnPostErr.length > 0) node.$onPostError = nextOnPostErr
          if (nextOnHandlerErr.length > 0) node.$onHandlerError = nextOnHandlerErr
          if (nextOnErr.length > 0) node.$onError = nextOnErr
        }

        routes.push({ values: { ...vals }, config: cfg })
      }

      defineRoute(values, routeConfig, [], [], [], [], [], [])
      return api
    },

    // Registers a default (fallback) handler invoked only when no routes match
    default(routeConfig = {}) {
      const hasChildren = Array.isArray(routeConfig?.children) && routeConfig.children.length > 0
      const hasHandler = typeof routeConfig?.handler === 'function'

      if (!hasHandler) {
        const err = new Error('handler is required for default route')
        err.code = ROUTER_ROUTE_HANDLER_REQUIRED
        throw err
      }
      if (hasChildren) {
        const err = new Error('handler is forbidden when children are provided')
        err.code = ROUTER_ROUTE_HANDLER_FORBIDDEN
        throw err
      }

      // Attach as a leaf on the root; score=0 so any specific match wins
      trie.$leaf = true
      trie.$handler = routeConfig.handler
      // Normalize and store hooks
      const preHooks = Array.isArray(routeConfig?.pre) ? routeConfig.pre.filter(fn => typeof fn === 'function') : []
      const postHooks = Array.isArray(routeConfig?.post) ? routeConfig.post.filter(fn => typeof fn === 'function') : []
      // Normalize error hooks on default
      const onPreErrorHooks = Array.isArray(routeConfig?.onPreError) ? routeConfig.onPreError.filter(fn => typeof fn === 'function') : (typeof routeConfig?.onPreError === 'function' ? [routeConfig.onPreError] : [])
      const onPostErrorHooks = Array.isArray(routeConfig?.onPostError) ? routeConfig.onPostError.filter(fn => typeof fn === 'function') : (typeof routeConfig?.onPostError === 'function' ? [routeConfig.onPostError] : [])
      const onHandlerErrorHooks = Array.isArray(routeConfig?.onHandlerError) ? routeConfig.onHandlerError.filter(fn => typeof fn === 'function') : (typeof routeConfig?.onHandlerError === 'function' ? [routeConfig.onHandlerError] : [])
      const onErrorHooks = Array.isArray(routeConfig?.onError) ? routeConfig.onError.filter(fn => typeof fn === 'function') : (typeof routeConfig?.onError === 'function' ? [routeConfig.onError] : [])
      if (preHooks.length > 0) trie.$pre = preHooks
      if (postHooks.length > 0) trie.$post = postHooks
      if (onPreErrorHooks.length > 0) trie.$onPreError = onPreErrorHooks
      if (onPostErrorHooks.length > 0) trie.$onPostError = onPostErrorHooks
      if (onHandlerErrorHooks.length > 0) trie.$onHandlerError = onHandlerErrorHooks
      if (onErrorHooks.length > 0) trie.$onError = onErrorHooks

      routes.push({ values: {}, config: routeConfig, default: true })
      return api
    },

    prettyTrie() {
      const out = []
      const indent = (n) => '  '.repeat(n)
      const emit = (node, startIndex, level) => {
        // Print root default leaf, if present, once at top level
        if (startIndex === 0 && level === 0 && typeof node.$handler === 'function') {
          const fn = node.$handler
          const fnName = typeof fn === 'function' && fn.name ? fn.name : ''
          const leafLabel = fnName ? ` [leaf:${fnName}]` : ' [leaf]'
          out.push(`default${leafLabel}`)
        }
        for (let i = startIndex; i < tokens.length; i++) {
          const t = tokens[i]
          const bucket = node[t]
          if (!bucket) continue
          const vals = Object.keys(bucket).sort()
          for (const val of vals) {
            const child = bucket[val]
            const fn = child && child.$handler
            const fnName = typeof fn === 'function' && fn.name ? fn.name : ''
            // Determine if this node has any lower-token children
            let hasLower = false
            for (let j = i + 1; j < tokens.length && !hasLower; j++) {
              const lowerBucket = child && child[tokens[j]]
              if (lowerBucket && Object.keys(lowerBucket).length > 0) hasLower = true
            }
            // Only print nodes that are leaves or have lower descendants
            if (fn || hasLower) {
              const leafLabel = fn ? (fnName ? ` [leaf:${fnName}]` : ' [leaf]') : ''
              out.push(`${indent(level)}${t}=${val}${leafLabel}`)
            }
            emit(child, i + 1, level + 1)
          }
        }
      }
      emit(trie, 0, 0)
      return out.join('\n')
    },

    async request(arg = {}) {
      const { subject, message } = (arg && typeof arg === 'object') ? arg : {}
      if (typeof subject !== 'string') {
        const err = new Error('subject must be a dot-separated string')
        err.code = ROUTER_SUBJECT_REQUIRED
        throw err
      }
      const parts = subject.split('.')
      const params = {}
      // Map available parts to defined tokens; ignore extras, leave missing as undefined
      const len = Math.min(tokens.length, parts.length)
      for (let i = 0; i < len; i++) params[tokens[i]] = parts[i]
      for (let i = len; i < tokens.length; i++) params[tokens[i]] = undefined
      // Build execution-time info object (router-owned) and contexts
      const info = { subject, params, tokens: tokens.slice() }
      const ctx = routerContext
      const rootCtx = routerContext

      // Depth-first search to find best matching leaf by score (# of tokens matched)
      const best = { score: -1, handler: null, pre: [], post: [], onPreErr: [], onPostErr: [], onHandlerErr: [], onErr: [] }
      const collectBest = (node, startIndex, matchedCount) => {
        if (!node) return
        if (typeof node.$handler === 'function') {
          if (matchedCount > best.score) {
            best.score = matchedCount
            best.handler = node.$handler
            best.pre = Array.isArray(node.$pre) ? node.$pre : []
            best.post = Array.isArray(node.$post) ? node.$post : []
            best.onPreErr = Array.isArray(node.$onPreError) ? node.$onPreError : []
            best.onPostErr = Array.isArray(node.$onPostError) ? node.$onPostError : []
            best.onHandlerErr = Array.isArray(node.$onHandlerError) ? node.$onHandlerError : []
            best.onErr = Array.isArray(node.$onError) ? node.$onError : []
          }
        }
        for (let i = startIndex; i < tokens.length; i++) {
          const t = tokens[i]
          const bucket = node[t]
          if (!bucket) continue
          const val = String(params[t])
          if (Object.prototype.hasOwnProperty.call(bucket, val)) {
            collectBest(bucket[val], i + 1, matchedCount + 1)
          }
        }
      }
      collectBest(trie, 0, 0)

      // Execute only the highest-scoring leaf if present
      if (typeof best.handler === 'function') {
        // Initialize shared scope for this pipeline execution
        const scope = {}

        // Helper to merge object return values into scope
        const mergeIntoScope = (val) => {
          if (val && typeof val === 'object') Object.assign(scope, val)
        }

        // Helper to run error handlers chain: specific first (LIFO by scope), then generic; cascade only on rethrow
        const runErrorHandlers = async ({ stage, index, failingFn, error }) => {
          const specific = stage === 'pre' ? best.onPreErr : (stage === 'post' ? best.onPostErr : best.onHandlerErr)
          const generic = best.onErr
          const chain = []
          if (Array.isArray(specific) && specific.length > 0) chain.push(...specific)
          if (Array.isArray(generic) && generic.length > 0) chain.push(...generic)
          // Router-level fallback error handler, last
          if (typeof onError === 'function') chain.push(async (args) => onError(args))
          let lastError = error
          for (const eh of chain) {
            try {
              const r = await eh({ error: lastError, stage, index, fn: failingFn, rootCtx, info, message, scope })
              if (r && typeof r === 'object') Object.assign(scope, r)
              scope.error = lastError
              return true
            } catch (e) {
              lastError = e || lastError
              continue
            }
          }
          // nobody handled
          throw lastError
        }

        // Run pre hooks in order (supports async)
        for (let i = 0; i < best.pre.length; i++) {
          const fn = best.pre[i]
          try {
            const r = await fn({ rootCtx, info, message, scope })
            mergeIntoScope(r)
          } catch (error) {
            const handled = await runErrorHandlers({ stage: 'pre', index: i, failingFn: fn, error })
            if (handled) return Object.freeze({ ctx, info, scope })
          }
        }
        // Run handler (supports async)
        let res
        try {
          res = await best.handler({ rootCtx, info, message, scope })
          mergeIntoScope(res)
          // Record handler's return value on scope.result
          scope.result = res
        } catch (error) {
          const handled = await runErrorHandlers({ stage: 'handler', failingFn: best.handler, error })
          if (handled) return Object.freeze({ ctx, info, scope })
        }
        // Run post hooks in order (supports async)
        for (let i = 0; i < best.post.length; i++) {
          const fn = best.post[i]
          try {
            const r = await fn({ rootCtx, info, message, scope })
            mergeIntoScope(r)
          } catch (error) {
            const handled = await runErrorHandlers({ stage: 'post', index: i, failingFn: fn, error })
            if (handled) return Object.freeze({ ctx, info, scope })
          }
        }

        return Object.freeze({ ctx, info, scope })
      }

      return Object.freeze({ ctx, info })
    },

    explain(subject) {
      if (typeof subject !== 'string') {
        const err = new Error('subject must be a dot-separated string')
        err.code = ROUTER_SUBJECT_REQUIRED
        throw err
      }
      const parts = subject.split('.')
      const params = {}
      const len = Math.min(tokens.length, parts.length)
      for (let i = 0; i < len; i++) params[tokens[i]] = parts[i]
      for (let i = len; i < tokens.length; i++) params[tokens[i]] = undefined

      const matches = []
      const fnName = (fn) => (typeof fn === 'function' && fn.name ? fn.name : 'handler')

      const traverse = (node, startIndex, matchedCount, matchedValues) => {
        if (!node) return
        if (typeof node.$handler === 'function') {
          const pre = Array.isArray(node.$pre) ? node.$pre.slice() : []
          const post = Array.isArray(node.$post) ? node.$post.slice() : []
          matches.push({
            score: matchedCount,
            values: { ...matchedValues },
            handler: node.$handler,
            handlerName: fnName(node.$handler),
            pre,
            preNames: pre.map(fnName),
            post,
            postNames: post.map(fnName),
            kind: matchedCount === 0 ? 'default' : 'route',
          })
        }
        for (let i = startIndex; i < tokens.length; i++) {
          const t = tokens[i]
          const bucket = node[t]
          if (!bucket) continue
          const val = String(params[t])
          if (Object.prototype.hasOwnProperty.call(bucket, val)) {
            traverse(bucket[val], i + 1, matchedCount + 1, { ...matchedValues, [t]: val })
          }
        }
      }
      traverse(trie, 0, 0, {})

      // Determine best and competing (lower-score only)
      let best = null
      for (const m of matches) if (!best || m.score > best.score) best = m
      const competing = best ? matches.filter(m => m !== best && m.score < best.score).sort((a, b) => b.score - a.score) : []

      const info = {
        subject,
        params,
        tokens: tokens.slice(),
        summary: {
          matchedLeaves: matches.length,
          bestScore: best ? best.score : -1,
          hasDefault: typeof trie.$handler === 'function',
        },
        best: best || null,
        competing,
        allMatches: matches.sort((a, b) => b.score - a.score),
      }

      return Object.freeze(info)
    },
  }

  return api
}

export default router
