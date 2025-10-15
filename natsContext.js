import { jetstream, jetstreamManager } from '@nats-io/jetstream'
import { Kvm } from '@nats-io/kv'
import { connect } from '@nats-io/transport-node'
import assert from 'node:assert'

const allConnections = []

export const createNatsContext = (config) => {
  const connectionTemplateObject = {
    connection: null,
    jetstream: null,
    jetstreamManager: null,
    Kvm: null,
    bucket: {},
  }
  return new Proxy(connectionTemplateObject, {
    get(_target, prop, thisProxy) {
      switch (prop) {
        case "connection":
          return async () => {
            if (_target.connection)
              return _target.connection
            _target.connection = await connect(config)
            allConnections.push({ connection: _target.connection })
            return _target.connection;
          };
        case "jetstream":
          return async () => {
            _target.jetstream ||= jetstream(await thisProxy.connection());
            return _target.jetstream;
          };
        case "jetstreamManager":
          return async () => {
            _target.jetstreamManager ||= await jetstreamManager(await thisProxy.connection());
            return _target.jetstreamManager;
          };
        case "Kvm":
          return async () => {
            _target.Kvm ||= new Kvm(await thisProxy.connection());
            return _target.Kvm;
          };
        case 'bucket':
          return async (name) => {
            assert(typeof name === 'string' && name.length > 0, 'name must be a non-empty string');
            const kvm = await thisProxy.Kvm();
            _target.bucket[name] ||= await kvm.create(name);
            return _target.bucket[name]
          }
        case 'close':
          return async () => _target.connection.close()
        case "publish":
          return async (k, v) => thisProxy.jetstream().then(js => js.publish(k, v))
        default:
          return undefined;
      }
    },
  })
}
