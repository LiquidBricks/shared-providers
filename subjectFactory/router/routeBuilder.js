import {
  ROUTER_TOKEN_UNKNOWN,
  ROUTER_ROUTE_HANDLER_REQUIRED,
  ROUTER_ROUTE_HANDLER_FORBIDDEN,
  ROUTER_SUBROUTE_OVERRIDE,
  ROUTER_CHILDREN_SHAPE_INVALID
} from '../../codes.js'

const isFn = (fn) => typeof fn === 'function'

const createHookBundle = () => ({
  decode: [],
  pre: [],
  post: [],
  onDecodeErr: [],
  onPreErr: [],
  onPostErr: [],
  onHandlerErr: [],
  onErr: [],
})

const isPlainObject = (val) => val && typeof val === 'object' && !Array.isArray(val)

const mergeHookResults = (results) => {
  let merged
  let last
  for (const res of results) {
    if (res !== undefined) last = res
    if (res && typeof res === 'object') {
      if (!merged) merged = {}
      Object.assign(merged, res)
    }
  }
  return merged !== undefined ? merged : last
}

const runHookSequence = async (fns, args) => {
  if (!Array.isArray(fns) || fns.length === 0) return undefined
  const res = []
  for (const fn of fns) res.push(await fn(args))
  return mergeHookResults(res)
}

const asHookList = (val, allowSingle = false) => {
  if (Array.isArray(val)) {
    const list = []
    for (const v of val) list.push(...asHookList(v, true))
    return list
  }

  if (isPlainObject(val)) {
    const branches = []
    for (const key of Object.keys(val)) {
      const branch = asHookList(val[key], true)
      if (branch.length > 0) branches.push(branch)
    }
    if (branches.length === 0) return []
    if (branches.length === 1) return branches[0]
    const runParallel = async (args) => {
      const results = await Promise.all(branches.map(branch => runHookSequence(branch, args)))
      return mergeHookResults(results)
    }
    return [runParallel]
  }

  return (allowSingle && isFn(val)) ? [val] : []
}

const asHandlerList = (val) => asHookList(val, true)

const collectHooks = (cfg = {}) => ({
  decode: asHookList(cfg?.decode, true),
  pre: asHookList(cfg?.pre, true),
  post: asHookList(cfg?.post, true),
  onDecodeErr: asHookList(cfg?.onDecodeError, true),
  onPreErr: asHookList(cfg?.onPreError, true),
  onPostErr: asHookList(cfg?.onPostError, true),
  onHandlerErr: asHookList(cfg?.onHandlerError, true),
  onErr: asHookList(cfg?.onError, true),
})

const mergeHooks = (parent, current, order = 'parent-first') => {
  const parentArr = Array.isArray(parent) ? parent : []
  const currentArr = Array.isArray(current) ? current : []
  return order === 'child-first'
    ? currentArr.concat(parentArr)
    : parentArr.concat(currentArr)
}

const aggregateHooks = (agg, hooks) => ({
  decode: mergeHooks(agg.decode, hooks.decode, 'parent-first'),
  pre: mergeHooks(agg.pre, hooks.pre, 'parent-first'),
  post: mergeHooks(agg.post, hooks.post, 'child-first'),
  onDecodeErr: mergeHooks(agg.onDecodeErr, hooks.onDecodeErr, 'child-first'),
  onPreErr: mergeHooks(agg.onPreErr, hooks.onPreErr, 'child-first'),
  onPostErr: mergeHooks(agg.onPostErr, hooks.onPostErr, 'child-first'),
  onHandlerErr: mergeHooks(agg.onHandlerErr, hooks.onHandlerErr, 'child-first'),
  onErr: mergeHooks(agg.onErr, hooks.onErr, 'child-first'),
})

const normalizeValues = (vals) => (vals && typeof vals === 'object') ? vals : {}

const routerError = (message, code, meta) => {
  const err = new Error(message)
  err.code = code
  if (meta !== undefined) err.meta = meta
  return err
}

const assertKnownTokens = (values, allowedTokens, errBuilder) => {
  for (const token of Object.keys(values)) {
    if (!allowedTokens.includes(token)) throw errBuilder(token)
  }
}

const ensureNoOverrides = (parentValues, childValues) => {
  for (const k of Object.keys(parentValues)) {
    if (childValues[k] !== undefined && String(childValues[k]) !== String(parentValues[k])) {
      throw routerError(
        `Child route overrides parent token: ${k}`,
        ROUTER_SUBROUTE_OVERRIDE,
        { token: k, parent: String(parentValues[k]), child: String(childValues[k]) }
      )
    }
  }
}

const resolveNode = (trie, tokens, vals) => {
  let node = trie
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (vals[t] === undefined) continue
    const v = String(vals[t])
    if (!node[t]) node[t] = {}
    if (!node[t][v]) node[t][v] = {}
    node = node[t][v]
  }
  return node
}

const extendTokens = (node, activeTokens, cfg = {}) => {
  if (!Array.isArray(cfg?.tokens) || cfg.tokens.length === 0) return activeTokens

  const ext = cfg.tokens.filter(t => typeof t === 'string')
  for (const t of ext) {
    if (activeTokens.includes(t)) {
      throw routerError(`Duplicate token in extension: ${t}`, ROUTER_TOKEN_UNKNOWN, { token: t })
    }
  }
  if (!node.$tokensExt) node.$tokensExt = []
  for (const t of ext) {
    if (!node.$tokensExt.includes(t)) node.$tokensExt.push(t)
  }
  return activeTokens.concat(ext)
}

const attachLeaf = (node, handlers, hooks) => {
  node.$leaf = true
  if (handlers.length > 0) {
    node.$handlers = handlers
    node.$handler = handlers[0]
  }
  if (hooks.decode.length > 0) node.$decode = hooks.decode
  if (hooks.pre.length > 0) node.$pre = hooks.pre
  if (hooks.post.length > 0) node.$post = hooks.post
  if (hooks.onDecodeErr.length > 0) node.$onDecodeError = hooks.onDecodeErr
  if (hooks.onPreErr.length > 0) node.$onPreError = hooks.onPreErr
  if (hooks.onPostErr.length > 0) node.$onPostError = hooks.onPostErr
  if (hooks.onHandlerErr.length > 0) node.$onHandlerError = hooks.onHandlerErr
  if (hooks.onErr.length > 0) node.$onError = hooks.onErr
}

export function registerRoute(state, values = {}, routeConfig = {}) {
  const tokens = state.tokens
  const trie = state.trie
  const routes = state.routes

  const defineRoute = (
    vals = {},
    cfg = {},
    agg = createHookBundle(),
    activeTokens = tokens.slice()
  ) => {
    const normalizedVals = normalizeValues(vals)
    assertKnownTokens(normalizedVals, activeTokens, (token) =>
      routerError(`Unknown token in route: ${token}`, ROUTER_TOKEN_UNKNOWN, { token })
    )

    const node = resolveNode(trie, activeTokens, normalizedVals)
    const children = Array.isArray(cfg?.children) ? cfg.children : undefined
    const hasChildren = Array.isArray(children) && children.length > 0
    const handlers = asHandlerList(cfg?.handler)
    const hasHandler = handlers.length > 0
    const hooks = collectHooks(cfg)
    const nextAgg = aggregateHooks(agg, hooks)
    const extendedTokens = extendTokens(node, activeTokens, cfg)

    if (!hasChildren && !hasHandler) {
      throw routerError('handler is required when no children are provided', ROUTER_ROUTE_HANDLER_REQUIRED)
    }
    if (hasChildren && hasHandler) {
      throw routerError('handler is forbidden when children are provided', ROUTER_ROUTE_HANDLER_FORBIDDEN)
    }

    if (hasChildren) {
      children.forEach((child, idx) => {
        if (!Array.isArray(child) || child.length < 1) {
          throw routerError('child route must be an array: [values, config]', ROUTER_CHILDREN_SHAPE_INVALID, { index: Number(idx) })
        }

        const [childValuesRaw, childConfigRaw] = child
        const childValues = normalizeValues(childValuesRaw)
        const childConfig = childConfigRaw || {}

        assertKnownTokens(childValues, extendedTokens, (token) =>
          routerError(`Unknown token in child route: ${token}`, ROUTER_TOKEN_UNKNOWN, { token })
        )
        ensureNoOverrides(normalizedVals, childValues)

        const combinedValues = { ...childValues, ...normalizedVals }
        defineRoute(combinedValues, childConfig, nextAgg, extendedTokens)
      })
    } else {
      attachLeaf(node, handlers, nextAgg)
    }

    routes.push({ values: { ...normalizedVals }, config: cfg })
  }

  defineRoute(values, routeConfig, createHookBundle(), tokens.slice())
}

export function registerDefault(state, routeConfig = {}) {
  const trie = state.trie
  const routes = state.routes

  const hasChildren = Array.isArray(routeConfig?.children) && routeConfig.children.length > 0
  const handlers = asHandlerList(routeConfig?.handler)
  const hasHandler = handlers.length > 0

  if (!hasHandler) {
    throw routerError('handler is required for default route', ROUTER_ROUTE_HANDLER_REQUIRED)
  }
  if (hasChildren) {
    throw routerError('handler is forbidden when children are provided', ROUTER_ROUTE_HANDLER_FORBIDDEN)
  }

  trie.$leaf = true
  trie.$handlers = handlers
  trie.$handler = handlers[0]
  const hooks = collectHooks(routeConfig)
  if (hooks.decode.length > 0) trie.$decode = hooks.decode
  if (hooks.pre.length > 0) trie.$pre = hooks.pre
  if (hooks.post.length > 0) trie.$post = hooks.post
  if (hooks.onDecodeErr.length > 0) trie.$onDecodeError = hooks.onDecodeErr
  if (hooks.onPreErr.length > 0) trie.$onPreError = hooks.onPreErr
  if (hooks.onPostErr.length > 0) trie.$onPostError = hooks.onPostErr
  if (hooks.onHandlerErr.length > 0) trie.$onHandlerError = hooks.onHandlerErr
  if (hooks.onErr.length > 0) trie.$onError = hooks.onErr

  routes.push({ values: {}, config: routeConfig, default: true })
}
