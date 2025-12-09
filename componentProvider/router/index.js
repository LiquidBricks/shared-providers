import router from "@liquid-bricks/shared-providers/subject/router";
import { Codes } from '../codes.js'
import { path as computeResultPath, spec as computeResultSpec } from './routes/compute_result.js'

export function createExecutionRouter({
  natsContext,
  diagnostics,
  components,
}) {
  return router({
    tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
    context: { natsContext, diagnostics, components },
  })
    .route(computeResultPath, computeResultSpec)
    .default({
      handler: ({ message, rootCtx: { diagnostics } }) => {
        diagnostics.warn(false, Codes.PRECONDITION_INVALID, 'No handler for subject', { subject: message?.subject })
        try { message?.ack?.() } catch (_) { /* ignore */ }
      }
    })
    .error(({ error, message, rootCtx: { diagnostics } }) => {
      diagnostics.warn(false, Codes.PRECONDITION_INVALID, 'component provider router error', { error, subject: message?.subject })
      try { message?.ack?.() } catch (_) { /* ignore */ }
      return { status: 'errored' }
    })
    .abort(({ message, rootCtx: { diagnostics } }) => {
      diagnostics.debug('component provider router aborted', { subject: message?.subject })
      try { message?.ack?.() } catch (_) { /* ignore */ }
      return { status: 'aborted' }
    })
}
