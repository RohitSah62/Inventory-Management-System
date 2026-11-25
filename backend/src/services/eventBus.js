import { EventEmitter } from 'node:events';

export function createEventBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);

  return {
    publish(type, data) {
      emitter.emit('message', {
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    },
    subscribe(listener) {
      emitter.on('message', listener);
      return () => emitter.off('message', listener);
    },
  };
}

export const eventBus = createEventBus();
