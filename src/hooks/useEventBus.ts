import { useEffect, useCallback } from 'react';
import { eventBus, EventMap, EventName } from '@/lib/eventBus';

export function useEventBus<T extends EventName>(
  event: T,
  callback: (data: EventMap[T]) => void,
  deps: any[] = []
) {
  useEffect(() => {
    const unsubscribe = eventBus.on(event, callback);
    return unsubscribe;
  }, [event, ...deps]);
}

export function useEventEmitter() {
  const emit = useCallback(<T extends EventName>(event: T, data: EventMap[T]) => {
    eventBus.emit(event, data);
  }, []);

  return { emit };
}

export { eventBus };
