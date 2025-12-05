import { parseSubject } from './subject.js'
import { s } from './symbols.js'

export async function handleRequest(arg = {}, state) {
  const { subject, message } = (arg && typeof arg === 'object') ? arg : {}
  const tokens = state.tokens
  const trie = state.trie
  const hooks = state.hooks
  const isFn = (fn) => typeof fn === 'function'
  const normalizeHandlers = (val) => Array.isArray(val)
    ? val.filter(isFn)
    : (isFn(val) ? [val] : [])

  const { params, extParts } = parseSubject(subject, tokens)
  const baseLen = tokens.length
  const info = { subject, params, tokens: tokens.slice() }
  const ctx = state.context
  const rootCtx = state.context

  const getFnName = (fn) => {
    try { return typeof fn === 'function' ? (fn.name || 'anonymous') : undefined }
    catch (e) { return undefined }
  }
  const setHookInfo = (stage, index, fn) => {
    info.stage = stage
    info.index = index
    info.fn = getFnName(fn)
  }

  const best = { score: -1, handlers: [], decode: [], pre: [], post: [], onDecodeErr: [], onPreErr: [], onPostErr: [], onHandlerErr: [], onErr: [], paramsExt: {}, extSeq: [] }
  const collectBest = (node, baseStartIndex, matchedCount, extSeq, extIdx, paramsExt) => {
    if (!node) return
    const handlers = normalizeHandlers(node.$handlers ?? node.$handler)
    if (handlers.length > 0) {
      if (matchedCount > best.score) {
        best.score = matchedCount
        best.handlers = handlers
        best.decode = Array.isArray(node.$decode) ? node.$decode : []
        best.pre = Array.isArray(node.$pre) ? node.$pre : []
        best.post = Array.isArray(node.$post) ? node.$post : []
        best.onDecodeErr = Array.isArray(node.$onDecodeError) ? node.$onDecodeError : []
        best.onPreErr = Array.isArray(node.$onPreError) ? node.$onPreError : []
        best.onPostErr = Array.isArray(node.$onPostError) ? node.$onPostError : []
        best.onHandlerErr = Array.isArray(node.$onHandlerError) ? node.$onHandlerError : []
        best.onErr = Array.isArray(node.$onError) ? node.$onError : []
        best.paramsExt = paramsExt ? { ...paramsExt } : {}
        const seqHere = (Array.isArray(node.$tokensExt) && node.$tokensExt.length > 0)
          ? (extSeq && extSeq.length > 0 ? extSeq.concat(node.$tokensExt) : node.$tokensExt.slice())
          : (extSeq || [])
        best.extSeq = seqHere
      }
    }
    for (let i = baseStartIndex; i < baseLen; i++) {
      const t = tokens[i]
      const bucket = node[t]
      if (!bucket) continue
      const val = String(params[t])
      if (Object.prototype.hasOwnProperty.call(bucket, val)) {
        collectBest(bucket[val], i + 1, matchedCount + 1, extSeq, extIdx, paramsExt)
      }
    }
    if (baseStartIndex >= baseLen) {
      const seq = Array.isArray(node.$tokensExt) && node.$tokensExt.length > 0
        ? (extSeq && extSeq.length > 0 ? extSeq.concat(node.$tokensExt) : node.$tokensExt.slice())
        : (extSeq || [])
      if (seq.length > 0) {
        const nextIdx = extIdx >>> 0
        if (nextIdx < seq.length) {
          const t = seq[nextIdx]
          const v = extParts[nextIdx]
          const bucket = node[t]
          if (bucket && Object.prototype.hasOwnProperty.call(bucket, String(v))) {
            const child = bucket[String(v)]
            const nextParamsExt = { ...(paramsExt || {}) }
            if (v !== undefined) nextParamsExt[t] = String(v)
            collectBest(child, baseLen, matchedCount + 1, seq, nextIdx + 1, nextParamsExt)
          }
        }
      }
    }
  }
  collectBest(trie, 0, 0, [], 0, {})

  if (best.handlers.length > 0) {
    const extSeq = Array.isArray(best.extSeq) ? best.extSeq : []
    if (extSeq.length > 0) {
      info.tokens = info.tokens.concat(extSeq)
      for (let i = 0; i < extSeq.length; i++) {
        const t = extSeq[i]
        const v = extParts[i]
        info.params[t] = v === undefined ? undefined : String(v)
      }
    }

    const scope = {}
    const ac = new AbortController()
    scope[s.scope.ac] = ac

    const mergeIntoScope = (val) => {
      if (val && typeof val === 'object') Object.assign(scope, val)
    }

    const runErrorHandlers = async ({ stage, index, failingFn, error }) => {
      const specific = stage === 'decode'
        ? best.onDecodeErr
        : (stage === 'pre' ? best.onPreErr : (stage === 'post' ? best.onPostErr : best.onHandlerErr))
      const generic = best.onErr
      const chain = []
      if (Array.isArray(specific) && specific.length > 0) chain.push(...specific)
      if (Array.isArray(generic) && generic.length > 0) chain.push(...generic)
      if (typeof hooks.onError === 'function') chain.push(async (args) => {
        const safeArgs = args && typeof args === 'object'
          ? { ...args, fn: args.fn !== undefined ? String(args.fn) : args.fn }
          : args
        return hooks.onError(safeArgs)
      })
      setHookInfo(stage, index, failingFn)
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
      throw lastError
    }

    let afterRan = false
    const runAfterHook = async ({ stage, index, fn, error } = {}) => {
      if (afterRan) return
      afterRan = true
      if (typeof hooks.after !== 'function') return
      setHookInfo('after', 0, hooks.after)
      try {
        const r = await hooks.after({
          stage: 'after',
          index: 0,
          fn: hooks.after,
          exitStage: stage,
          exitIndex: index,
          exitFn: fn,
          error,
          rootCtx,
          info,
          message,
          scope
        })
        mergeIntoScope(r)
      } catch (err) {
        const handled = await runErrorHandlers({ stage: 'after', index: 0, failingFn: hooks.after, error: err })
        if (!handled) throw err
      }
    }

    const finalize = async (meta = {}) => {
      await runAfterHook(meta)
      return Object.freeze({ ctx, info, scope })
    }

    const runAbortHandler = async ({ stage, index, failingFn }) => {
      setHookInfo(stage, index, failingFn)
      if (typeof hooks.onAbort === 'function') {
        const r = await hooks.onAbort({
          reason: ac.signal?.reason, signal: ac.signal, stage, index, fn: failingFn,
          rootCtx, info, message, scope
        })
        if (r && typeof r === 'object') Object.assign(scope, r)
      }
      return await finalize({ stage, index, fn: failingFn, error: ac.signal?.reason })
    }

    const runBeforeHook = async () => {
      if (typeof hooks.before !== 'function') return { done: false }
      setHookInfo('before', 0, hooks.before)
      if (ac.signal?.aborted) return { done: true, result: await runAbortHandler({ stage: 'before', index: 0, failingFn: hooks.before }) }
      try {
        const r = await hooks.before({ stage: 'before', index: 0, fn: hooks.before, rootCtx, info, message, scope })
        mergeIntoScope(r)
      } catch (error) {
        const handled = await runErrorHandlers({ stage: 'before', index: 0, failingFn: hooks.before, error })
        if (handled) return { done: true, result: await finalize({ stage: 'before', index: 0, fn: hooks.before, error }) }
        throw error
      }
      if (ac.signal?.aborted) return { done: true, result: await runAbortHandler({ stage: 'before', index: 0, failingFn: hooks.before }) }
      return { done: false }
    }

    const runBeforeEachHook = async ({ stage, index, fn }) => {
      if (typeof hooks.beforeEach !== 'function') return false
      try {
        const r = await hooks.beforeEach({ stage, index, fn, rootCtx, info, message, scope })
        mergeIntoScope(r)
      } catch (error) {
        const handled = await runErrorHandlers({ stage, index, failingFn: hooks.beforeEach, error })
        if (handled) return true
      }
      return false
    }

    const runAfterEachHook = async ({ stage, index, fn, error }) => {
      if (typeof hooks.afterEach !== 'function' || ac.signal?.aborted) return false
      try {
        const r = await hooks.afterEach({ stage, index, fn, error, rootCtx, info, message, scope })
        mergeIntoScope(r)
      } catch (err) {
        const handled = await runErrorHandlers({ stage, index, failingFn: hooks.afterEach, error: err })
        if (handled) return true
      }
      return false
    }

    const executeStageHook = async ({ stage, index, fn, recordResult = false }) => {
      setHookInfo(stage, index, fn)
      if (ac.signal?.aborted) return { done: true, result: await runAbortHandler({ stage, index, failingFn: fn }) }

      const handledBefore = await runBeforeEachHook({ stage, index, fn })
      if (handledBefore) return { done: true, result: await finalize({ stage, index, fn }) }

      if (ac.signal?.aborted) return { done: true, result: await runAbortHandler({ stage, index, failingFn: hooks.beforeEach || fn }) }

      let hookError = null
      try {
        const r = await fn({ rootCtx, info, message, scope })
        mergeIntoScope(r)
        if (recordResult) scope[s.scope.result] = r
      } catch (error) {
        hookError = error
      }

      const handledAfter = await runAfterEachHook({ stage, index, fn, error: hookError })
      if (handledAfter) return { done: true, result: await finalize({ stage, index, fn, error: hookError }) }

      if (hookError) {
        const handled = await runErrorHandlers({ stage, index, failingFn: fn, error: hookError })
        if (handled) return { done: true, result: await finalize({ stage, index, fn, error: hookError }) }
      }

      if (ac.signal?.aborted) return { done: true, result: await runAbortHandler({ stage, index, failingFn: fn }) }

      return { done: false }
    }

    if (best.paramsExt && typeof best.paramsExt === 'object') Object.assign(params, best.paramsExt)

    try {
      const { done: beforeDone, result: beforeResult } = await runBeforeHook()
      if (beforeDone) return beforeResult

      for (let i = 0; i < best.decode.length; i++) {
        const { done, result } = await executeStageHook({ stage: 'decode', index: i, fn: best.decode[i] })
        if (done) return result
      }

      for (let i = 0; i < best.pre.length; i++) {
        const { done, result } = await executeStageHook({ stage: 'pre', index: i, fn: best.pre[i] })
        if (done) return result
      }

      for (let i = 0; i < best.handlers.length; i++) {
        const { done, result } = await executeStageHook({
          stage: 'handler',
          index: i,
          fn: best.handlers[i],
          recordResult: true,
        })
        if (done) return result
      }

      for (let i = 0; i < best.post.length; i++) {
        const { done, result } = await executeStageHook({ stage: 'post', index: i, fn: best.post[i] })
        if (done) return result
      }

      return await finalize({ stage: 'after', index: 0, fn: hooks.after })
    } catch (error) {
      await runAfterHook({ stage: info.stage, index: info.index, fn: info.fn, error })
      throw error
    } finally {
      await runAfterHook({ stage: info.stage, index: info.index, fn: info.fn })
    }
  }

  return Object.freeze({ ctx, info })
}
