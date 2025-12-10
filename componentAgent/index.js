import WebSocket from 'ws'
import { Codes } from './codes.js'
import { getComponents } from './componentOperations.js';
import { s } from '../componentBuilder/help.js';
import { create as createSubject } from '../subjectFactory/create/basic.js';
import { createExecutionRouter } from './router/index.js';

/**
 * Create a WebSocket agent that wires up the common lifecycle events.
 * Handlers receive the socket plus event-specific data so callers can react or clean up.
 */
export function createComponentAgent({
  ipAddress,
  port,
  protocols,
  wsOptions,
  directories,
  diagnostics: d,
} = {}) {
  let eventRouter;
  const messageQueue = [];
  let isProcessingQueue = false;
  const diagnostics = d?.child ? d.child({ agentName: 'componentAgent' }) : d;
  if (!diagnostics) {
    throw new Error('diagnostics is required to start the component agent');
  }

  diagnostics.require(
    ipAddress,
    Codes.PRECONDITION_REQUIRED,
    'ipAddress is required to start the component agent',
    { field: 'ipAddress' },
  );
  diagnostics.require(port, Codes.PRECONDITION_REQUIRED, 'port is required to start the component agent', { field: 'port' });
  diagnostics.require(directories, Codes.PRECONDITION_REQUIRED, 'directories is required', { field: 'directories' });
  diagnostics.require(Array.isArray(directories), Codes.PRECONDITION_INVALID, 'directories must be an array', { field: 'directories' });

  const componentAgentEndpoint = `ws://${ipAddress}:${port}/componentAgent`

  let socket;
  let reconnectTimer;
  let reconnectAttempt = 0;
  const backoff = {
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    factor: 2,
  };

  const computeReconnectDelay = () => {
    const delay = backoff.initialDelayMs * (backoff.factor ** reconnectAttempt);
    return Math.min(delay, backoff.maxDelayMs);
  };

  const publish = (subject, data) => {
    const payload = JSON.stringify({ subject, data });
    socket.send(payload);
  };
  const processQueue = async () => {
    if (!eventRouter || isProcessingQueue) {
      return;
    }

    isProcessingQueue = true;
    try {
      while (messageQueue.length > 0) {
        const payload = messageQueue.shift();
        try {
          if (payload.subject)
            await eventRouter.request({ subject: payload.subject, message: payload });
        } catch (error) {
          diagnostics.warn(false, Codes.AGENT_SOCKET_ERROR, 'Failed to process queued component message', {
            error,
            subject: payload?.subject,
          });
        }
      }
    } finally {
      isProcessingQueue = false;
    }
  };

  const handleOpen = () => {
    diagnostics.info('Component agent connected', { endpoint: componentAgentEndpoint });
    void (async () => {
      const components = await getComponents(directories, diagnostics);
      diagnostics.require(
        components.size > 0,
        Codes.PRECONDITION_REQUIRED,
        'No components found in directories: ' + directories.join(', '),
        { directories },
      );

      const registrationSubject = createSubject()
        .env('prod')
        .ns('component-service')
        .context('component-agent')
        .entity('component')
        .channel('cmd')
        .action('register')
        .version('v1')
        .build();

      for (const [, comp] of components) {
        const registration = await comp[s.INTERNALS].registration();
        publish(registrationSubject, registration);
      }

      const router = createExecutionRouter({
        publish, diagnostics, components,
      });
      eventRouter = router;
      await processQueue();
    })().catch((error) => {
      diagnostics.warn(false, Codes.AGENT_REGISTRATION_FAILED, 'Component agent registration error', { error });
    });
  };

  const handleMessage = async (raw) => {
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      diagnostics.warn(false, Codes.PRECONDITION_INVALID,
        'componentDispatcher received invalid JSON', {
        raw,
        error: error?.message ?? String(error),
      });
      return;
    }

    messageQueue.push(parsed);
    await processQueue();
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) return;

    const delay = computeReconnectDelay();
    diagnostics.info('Scheduling component agent reconnect', {
      attempt: reconnectAttempt + 1,
      delayMs: delay,
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempt += 1;
      connect();
    }, delay);
  };

  const handleClose = (code, reason) => {
    const normalizedReason = typeof reason === 'string' ? reason : reason?.toString();
    diagnostics.info('Component agent closed', { code, reason: normalizedReason });
    scheduleReconnect();
  };

  const handleError = (error) => {
    diagnostics.warn(false, Codes.AGENT_SOCKET_ERROR, 'Component agent error', { error });
    scheduleReconnect();
  };

  const connect = () => {
    socket = new WebSocket(componentAgentEndpoint, protocols, wsOptions);

    socket.on('open', () => {
      reconnectAttempt = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      handleOpen();
    });
    socket.on('message', handleMessage);
    socket.on('close', handleClose);
    socket.on('error', handleError);
  };

  connect();

  return socket;
}
