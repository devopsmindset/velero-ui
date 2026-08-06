import { inject, onUnmounted, ref } from 'vue';
import type { Socket } from 'socket.io-client';
import type {
  RollbackCompleteEvent,
  RollbackProgressEvent,
} from '@velero-ui/shared-types';

export const useRollbackProgress = () => {
  const socket = inject('socketIo') as { io: Socket };
  const steps = ref<RollbackProgressEvent[]>([]);
  const isComplete = ref(false);
  const result = ref<RollbackCompleteEvent | null>(null);

  const onProgress = (event: RollbackProgressEvent) => {
    steps.value.push(event);
  };

  const onComplete = (data: RollbackCompleteEvent) => {
    isComplete.value = true;
    result.value = data;
  };

  const start = (backupName: string, namespace: string) => {
    steps.value = [];
    isComplete.value = false;
    result.value = null;

    socket.io.on('rollback:progress', onProgress);
    socket.io.on('rollback:complete', onComplete);
    socket.io.emit('rollback:start', { backupName, namespace });
  };

  const cleanup = () => {
    socket.io.off('rollback:progress', onProgress);
    socket.io.off('rollback:complete', onComplete);
  };

  onUnmounted(cleanup);

  return { start, cleanup, steps, isComplete, result };
};
